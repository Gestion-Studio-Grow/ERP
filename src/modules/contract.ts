// ============================================================================
// CONTRATO DE MÓDULO — el "objeto-maestro" del repositorio de plugins/módulos.
// ============================================================================
//
// Fundación de la arquitectura de módulos del ERP (ADR-054 · ADR-055 principio de
// variante). Formaliza —sin reemplazar— lo que ya existía disperso:
//   - `PluginManifest`  (src/plugins/arca/manifest.ts): eventos/comandos/config.
//   - `ModuleDef`+MODULES (src/lib/operator-config.ts): id/label/description/plugin.
//   - `Tenant.modules[]` (prisma): la lista de módulos activos POR TENANT.
//
// PRINCIPIO DE VARIANTE (ADR-055), argentinización del "material master + plant
// assignment" de SAP:
//   - OBJETO-MAESTRO = este `ModuleDescriptor`: la definición única del módulo en el
//     catálogo. Declara DÓNDE PUEDE aplicar (compatibilidad de rubro). Su ABM es la
//     curación del catálogo (src/modules/catalog.ts).
//   - ASIGNACIÓN     = `Tenant.modules[]`: QUÉ se activa por tenant, explícito y
//     DIFERENCIADO. Su ABM es la consola de operador. Nunca "todos con todo"
//     (antipatrón DX-6: una asignación uniforme hace que el producto mienta).
//
// CLAVE: COMPATIBILIDAD ≠ ASIGNACIÓN. Que un módulo sea compatible con un rubro
// (puede aplicar) no significa que se active para todos los tenants de ese rubro
// (la activación es deliberada, tenant por tenant). ARCA es compatible con "todos"
// los rubros, pero solo se activa en los tenants que facturan.
//
// Este archivo es DATO PURO + validación pura (sin Prisma, sin red, sin React):
// lo puede importar tanto el servidor como el cliente y los tests sin arrastrar
// infraestructura.

// ── Alias de tipos (nombres estables, criollos) ──────────────────────────────

/** Id estable del módulo: kebab-case en minúsculas (p.ej. "arca", "agenda"). */
export type ModuleId = string;

/** Versión semántica del módulo: "MAJOR.MINOR.PATCH" (p.ej. "1.0.0"). */
export type Semver = string;

/**
 * Naturaleza del módulo (ADR-002):
 *  - "capability": módulo NATIVO del Core (agenda, catálogo, clientes…). Vive en el
 *    monolito; su schema —si hace falta— es del Core, compartido y versionado.
 *  - "plugin": INTEGRACIÓN externa (ARCA, Mercado Pago…). No toca la DB ni el código
 *    interno del Core: se comunica solo por eventos (in) + comandos públicos (out).
 */
export type ModuleKind = "capability" | "plugin";

/** Nombre de evento de dominio del Core que un módulo consume (p.ej. "InvoiceCreated"). */
export type EventName = string;

/** Nombre de comando público del Core que un módulo invoca (p.ej. "RegisterFiscalDocument"). */
export type CommandName = string;

/**
 * Compatibilidad de rubro (variante): dónde PUEDE aplicar el módulo.
 *  - "todos": aplicable a cualquier rubro (p.ej. facturación) — compat amplia, NO
 *    activación automática (la asignación sigue siendo por tenant).
 *  - lista de rubros: aplicable solo a esos rubros/blueprints (ids de blueprint,
 *    p.ej. ["servicios", "carniceria"]).
 */
export type RubroCompat = "todos" | ModuleId[];

/**
 * Grupo de PROCESO para ordenar la tienda de módulos (ADR-089 §Decisión 3). Es un eje
 * DISTINTO de los 5 grupos de NAV (`src/modules/nav-groups.ts`): el grupo de tienda ordena
 * la vidriera `/admin/modulos` por proceso comercial (para evaluar el fit antes de instalar);
 * la nav agrupa PANTALLAS por área. Se pueden mapear, pero no son lo mismo.
 */
export type ModuleGroupId =
  | "facturacion-cobros"
  | "ventas-mostrador"
  | "agenda-turnos"
  | "clientes-fidelizacion"
  | "compras-stock"
  | "personal-comisiones";

/** Un "scope item": una pantalla o acción concreta que trae el módulo, en criollo. */
export interface ScopeItem {
  /** Qué hace, en lenguaje del comerciante: "Emitir factura A/B/C". */
  label: string;
  /** Ruta del backoffice que abre, si tiene pantalla propia (para deep-link/preview). */
  ruta?: string;
}

/** Un campo del schema de configuración por tenant. */
export interface ConfigFieldSchema {
  tipo: "string" | "number" | "boolean";
  descripcion: string;
  /** true ⇒ credencial/secreto: NUNCA al repo, entra por env/vault (ADR-041). */
  secreto?: boolean;
  /** true ⇒ obligatorio para poder activar el módulo en un tenant. */
  requerido?: boolean;
}

/** Dependencia de un módulo sobre otro (debe estar activo para que éste funcione). */
export interface ModuleDependency {
  id: ModuleId;
  /**
   * Rango semver aceptado del módulo dependido. Formato mínimo soportado por el
   * chequeo del catálogo: "*" (cualquiera) o "MAJOR.x"/"^MAJOR.MINOR" — compat por
   * MAJOR. Se mantiene simple a propósito (ADR-006: sin sobre-ingeniería).
   */
  rango?: string;
}

/**
 * Referencia declarativa a una migración aditiva propia del módulo. Es SOLO
 * metadata: el catálogo NUNCA aplica migraciones. La aplicación a la DB de
 * producción es Gate 2 (OK del dueño). Invariante: `aditiva: true` — el molde no
 * admite migraciones destructivas.
 */
export interface MigrationRef {
  /** Ruta de la carpeta de migración (p.ej. "prisma/migrations/20260708_add_x"). */
  carpeta: string;
  descripcion: string;
  aditiva: true;
}

/**
 * OBJETO-MAESTRO del módulo. Fuente de verdad de cómo se define, se enchufa y se
 * activa un módulo/plugin del ERP.
 */
export interface ModuleDescriptor {
  /** Id estable, kebab-case. Único en el catálogo. */
  id: ModuleId;
  /** Versión semántica del módulo. */
  version: Semver;
  /** Nombre legible (criollo, sin jerga) — se muestra en la consola de operador. */
  nombre: string;
  /** Qué hace, en una línea. */
  descripcion: string;
  /** Nativo del Core ("capability") o integración externa ("plugin"). */
  kind: ModuleKind;
  /**
   * Capability RBAC del Core que este módulo habilita (src/lib/capabilities.ts).
   * Ata el módulo al gating por rol del backoffice. Opcional (algunos plugins
   * corren en background sin pantalla propia).
   */
  capability?: string;
  /**
   * COMPATIBILIDAD de rubro (variante): dónde puede aplicar. No confundir con la
   * ASIGNACIÓN (qué activa cada tenant, en `Tenant.modules[]`).
   */
  rubros: RubroCompat;
  /** Módulos que deben estar activos para que éste funcione. */
  dependencias?: ModuleDependency[];
  /** Eventos de dominio del Core que consume (superficie in). Vacío = no escucha outbox. */
  consumeEventos?: EventName[];
  /** Comandos públicos del Core que invoca (superficie out). */
  llamaComandos?: CommandName[];
  /** Config por tenant. `secreto: true` ⇒ va por env/vault, nunca al repo. */
  configSchema?: Record<string, ConfigFieldSchema>;
  /** Migraciones aditivas propias (metadata; nunca se aplican desde el catálogo). */
  migraciones?: MigrationRef[];
  /**
   * Flag de rollout (reversible). Si está seteado, el cableado que consuma el
   * catálogo puede apagar el módulo por env sin tocar datos. La FUNDACIÓN entera
   * corre además detrás de `MODULE_REGISTRY_ENABLED` (src/modules/flags.ts).
   */
  flag?: string;

  // ── Metadata de TIENDA (ADR-089, aditiva/opcional — no altera la validación) ──
  //
  // Enriquece la vidriera `/admin/modulos` para que el implementador/cliente evalúe el
  // FIT antes de instalar. Todo opcional: los descriptores que no la traen siguen válidos
  // (caen a un grupo "otros" y sin scope/resumen/fit). No la mira `validarDescriptor`.

  /** Grupo de proceso en la tienda. Ausente = cae en "otros" (red de seguridad). */
  grupo?: ModuleGroupId;
  /** Pantallas/acciones concretas que trae — para evaluar el scope antes de instalar. */
  scopeItems?: ScopeItem[];
  /** "Para qué sirve", 1–2 líneas (más largo que `descripcion`, orientado a la decisión). */
  resumen?: string;
  /** "A quién le hace fit" — el criterio de decisión, en criollo. */
  fit?: string;
  /**
   * Productos donde el módulo viene INSTALADO de fábrica (núcleo). Declarativo y
   * PER-PRODUCTO: un módulo puede ser núcleo de Comerciante y opcional en otro (el núcleo
   * es del PRODUCTO, no del módulo — ADR-055). NO es un boolean. Se derivan de acá tanto el
   * default del alta (`nucleoParaProducto`) como el badge "Núcleo" de la tienda: única
   * fuente, sin doble verdad. Se mantiene decoupled de `Producto` (ids string) para que
   * `contract.ts` no arrastre dependencias. Ej.: arca → ["comerciante","pyme","contador"].
   */
  nucleoPara?: string[];
}

// ── Validación PURA del descriptor (fail-closed, sin dependencias) ────────────

/** Un problema detectado en un descriptor o en el catálogo. */
export interface ProblemaCatalogo {
  moduloId: ModuleId;
  /** "error" bloquea la construcción del catálogo; "aviso" solo se reporta. */
  severidad: "error" | "aviso";
  mensaje: string;
}

const RE_KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const RE_SEMVER = /^\d+\.\d+\.\d+$/;

/** El MAJOR de un semver "1.2.3" → 1. Devuelve null si no parsea. */
export function majorDe(version: Semver): number | null {
  const m = /^(\d+)\.\d+\.\d+$/.exec(version.trim());
  return m ? Number(m[1]) : null;
}

/**
 * ¿La `version` satisface el `rango` de una dependencia? Soporte mínimo, a
 * propósito (ADR-006, sin sobre-ingeniería):
 *   - undefined | "" | "*"      → cualquier versión.
 *   - "^MAJOR.MINOR" | "MAJOR.x" | "MAJOR" → mismo MAJOR (compat retro por MAJOR).
 *   - "MAJOR.MINOR.PATCH" exacto → igualdad estricta.
 * Cualquier otro formato se trata como "*" y se reporta como aviso aparte.
 */
export function versionSatisface(version: Semver, rango?: string): boolean {
  const r = (rango ?? "*").trim();
  if (r === "" || r === "*") return true;
  const major = majorDe(version);
  if (major === null) return false;
  // "^1.2" | "1.x" | "1"
  const porMajor = /^\^?(\d+)(?:\.(?:\d+|x))?(?:\.(?:\d+|x))?$/.exec(r);
  if (porMajor && (r.startsWith("^") || r.includes("x") || /^\d+$/.test(r))) {
    return Number(porMajor[1]) === major;
  }
  if (RE_SEMVER.test(r)) return r === version.trim();
  return true; // formato no reconocido → permisivo, se avisa en validarDescriptor
}

/**
 * Valida la forma de UN descriptor de manera aislada (sin mirar el resto del
 * catálogo). Los chequesos que necesitan el catálogo entero (ids duplicados, deps
 * presentes, ciclos) los hace el ModuleRegistry.
 */
export function validarDescriptor(d: ModuleDescriptor): ProblemaCatalogo[] {
  const problemas: ProblemaCatalogo[] = [];
  const err = (mensaje: string) =>
    problemas.push({ moduloId: d.id || "(sin id)", severidad: "error", mensaje });
  const aviso = (mensaje: string) =>
    problemas.push({ moduloId: d.id || "(sin id)", severidad: "aviso", mensaje });

  if (!d.id || !RE_KEBAB.test(d.id)) {
    err(`id inválido: "${d.id}". Debe ser kebab-case en minúsculas (p.ej. "arca").`);
  }
  if (!RE_SEMVER.test(d.version ?? "")) {
    err(`version inválida: "${d.version}". Debe ser semver "MAJOR.MINOR.PATCH".`);
  }
  if (!d.nombre?.trim()) err("nombre vacío.");
  if (!d.descripcion?.trim()) err("descripcion vacía.");
  if (d.kind !== "capability" && d.kind !== "plugin") {
    err(`kind inválido: "${d.kind}". Debe ser "capability" o "plugin".`);
  }

  // Compatibilidad de rubro.
  if (d.rubros !== "todos") {
    if (!Array.isArray(d.rubros) || d.rubros.length === 0) {
      err('rubros vacío. Usá "todos" o una lista no vacía de rubros.');
    } else {
      for (const r of d.rubros) {
        if (!r || !RE_KEBAB.test(r)) err(`rubro inválido en la lista: "${r}".`);
      }
    }
  }

  // Un plugin (integración) debería declarar su superficie (eventos y/o comandos).
  if (d.kind === "plugin") {
    const consume = d.consumeEventos?.length ?? 0;
    const llama = d.llamaComandos?.length ?? 0;
    if (consume === 0 && llama === 0) {
      aviso(
        "plugin sin superficie declarada (ni consumeEventos ni llamaComandos). " +
          "Un plugin se integra por eventos y/o comandos (ADR-002/006).",
      );
    }
  }

  // Dependencias: forma del rango.
  for (const dep of d.dependencias ?? []) {
    if (!dep.id || !RE_KEBAB.test(dep.id)) {
      err(`dependencia con id inválido: "${dep.id}".`);
    }
    if (dep.id === d.id) err("un módulo no puede depender de sí mismo.");
  }

  // Config: secretos y forma.
  for (const [clave, campo] of Object.entries(d.configSchema ?? {})) {
    if (!campo.descripcion?.trim()) aviso(`config "${clave}" sin descripción.`);
  }

  // Migraciones: invariante aditiva (el tipo ya lo fuerza, pero validamos por si
  // llega un objeto no tipado en runtime).
  for (const mig of d.migraciones ?? []) {
    if ((mig as MigrationRef).aditiva !== true) {
      err(`migración "${mig.carpeta}" no marcada como aditiva. Solo aditivas.`);
    }
  }

  return problemas;
}

// ── Adaptador de compatibilidad con el manifiesto legado (PluginManifest) ─────

/**
 * Forma LEGADA del manifiesto de plugin (la que vivía en src/plugins/arca/manifest.ts,
 * ADR-006). Se mantiene para no romper a quien la importa (arca/index, mercadopago).
 * A partir de ADR-054/055, el `ModuleDescriptor` es la fuente de verdad y esto es una
 * PROYECCIÓN derivada.
 */
export interface PluginManifest {
  key: string;
  nombre: string;
  descripcion: string;
  consumeEventos: string[];
  llamaComandos: string[];
  configSchema: Record<
    string,
    { tipo: "string" | "number" | "boolean"; secreto?: boolean; descripcion: string }
  >;
}

/**
 * Deriva el manifiesto legado desde el descriptor nuevo. Así el `ModuleDescriptor`
 * es la única fuente de verdad y `arcaManifest` (y cualquier consumidor viejo) se
 * proyecta desde él, sin duplicar datos.
 */
export function toLegacyPluginManifest(d: ModuleDescriptor): PluginManifest {
  const configSchema: PluginManifest["configSchema"] = {};
  for (const [clave, campo] of Object.entries(d.configSchema ?? {})) {
    configSchema[clave] = {
      tipo: campo.tipo,
      descripcion: campo.descripcion,
      ...(campo.secreto ? { secreto: true } : {}),
    };
  }
  return {
    key: d.id,
    nombre: d.nombre,
    descripcion: d.descripcion,
    consumeEventos: d.consumeEventos ?? [],
    llamaComandos: d.llamaComandos ?? [],
    configSchema,
  };
}
