// ============================================================================
// FLAGS POR NEGOCIO DE LA SUITE DE FACTURACIÓN — núcleo PURO (sin Prisma, sin servidor).
// ============================================================================
//
// QUÉ RESUELVE. La suite de facturación (facturación automática, lote mensual, Facturita como app
// instalable, ARCA en producción) se larga NEGOCIO POR NEGOCIO, no a todos juntos. Este núcleo
// contesta una sola pregunta: «¿esta funcionalidad está prendida para ESTE negocio?». Todo flag
// arranca APAGADO; prenderlo es un acto explícito por negocio y apagarlo no toca datos.
//
// POR QUÉ NO ES UN MÓDULO NI (TODAVÍA) UN INTERRUPTOR.
//   · Un módulo (`Tenant.modules`, ADR-054) es lo que se VENDE: instala funcionalidad. Estos flags
//     son el LARGADO gradual de algo que el negocio ya tiene contratado (ej.: tiene `arca`, pero el
//     paso a ARCA real se prende cuando su certificado productivo está cargado y la venta cerró).
//   · El mecanismo de la casa para prender algo por negocio sin deploy son los interruptores de la
//     consola (`src/cambios/interruptores.ts`, estado en AuditLog). Ese catálogo NO es de este frente
//     (lo editan otras células); sumarle estas cuatro entradas es el destino natural y queda pedido
//     en docs/release/GATE-plataforma.md §Pendientes. Para no esperar, el núcleo NO depende de dónde
//     vive el estado: recibe el conjunto de flags encendidos del negocio (`encendidos`) desde
//     cualquier fuente. Hoy la fuente es la variable `FACTURACION_FLAGS` (adaptador `desdeEnv` de
//     abajo); mañana es la lectura de interruptores, sin cambiar a los que consultan.
//
// DOBLE LLAVE. Un flag por negocio nunca alcanza solo: los que hablan con ARCA exigen además la
// llave GLOBAL de plataforma (`ARCA_INVOICING_ENABLED=true`), y `arca.produccion` exige
// `ARCA_MODO=real`. Así un negocio prendido no emite si la plataforma está apagada (kill-switch
// global, el que se baja en un incidente: docs/runbooks/facturacion/incidentes.md).
//
// SIN COMODÍN. La variable de deploy `APPS_INICIO` se retiró justamente porque su "*" podía prender
// a CH sin su OK (src/modules/flags.ts). Acá un "*" o un slug vacío es un ERROR de configuración: se
// ignora y se informa (health lo cuenta, sin nombrar negocios).
//
// PURA: el entorno y los encendidos entran por parámetro. Se testea sin DB y sin process.env.

/** Los flags de la suite. El orden es el del catálogo (dependencias primero). */
export const FLAGS_FACTURACION = [
  "facturacion.automatica",
  "facturacion.lote-mensual",
  "facturita.pwa",
  "arca.produccion",
] as const;

export type FlagFacturacion = (typeof FLAGS_FACTURACION)[number];

export interface DefinicionFlag {
  id: FlagFacturacion;
  /** Qué cambia en el negocio, en criollo, para la consola y los runbooks. */
  queCambia: string;
  /** Flags del MISMO negocio que tienen que estar prendidos antes. */
  requiere: readonly FlagFacturacion[];
  /** ¿Exige la llave global `ARCA_INVOICING_ENABLED=true`? */
  requiereFacturacionGlobal: boolean;
  /** ¿Exige `ARCA_MODO=real` en la plataforma? */
  requiereArcaReal: boolean;
}

export const CATALOGO_FLAGS: Readonly<Record<FlagFacturacion, DefinicionFlag>> = {
  "facturacion.automatica": {
    id: "facturacion.automatica",
    queCambia: "Las ventas cobradas se facturan solas en ARCA, sin que nadie toque «Emitir».",
    requiere: [],
    requiereFacturacionGlobal: true,
    requiereArcaReal: false,
  },
  "facturacion.lote-mensual": {
    id: "facturacion.lote-mensual",
    queCambia: "A fin de mes se arma y se emite el lote de facturas pendientes del negocio.",
    requiere: ["facturacion.automatica"],
    requiereFacturacionGlobal: true,
    requiereArcaReal: false,
  },
  "facturita.pwa": {
    id: "facturita.pwa",
    queCambia: "Facturita se puede instalar en el celular como app (manifiesto + ícono).",
    requiere: [],
    requiereFacturacionGlobal: false,
    requiereArcaReal: false,
  },
  "arca.produccion": {
    id: "arca.produccion",
    queCambia: "Las facturas del negocio salen con validez fiscal (ARCA real), no de prueba.",
    requiere: [],
    requiereFacturacionGlobal: true,
    requiereArcaReal: true,
  },
};

export function esFlagFacturacion(v: unknown): v is FlagFacturacion {
  return typeof v === "string" && (FLAGS_FACTURACION as readonly string[]).includes(v);
}

type Env = Record<string, string | undefined>;

// ── La fuente de hoy: FACTURACION_FLAGS ──────────────────────────────────────────────────────

/** Nombre de la variable de entorno que, por ahora, guarda qué negocio tiene qué flag. */
export const VARIABLE_FLAGS = "FACTURACION_FLAGS";

/** Un problema de configuración. Sin valores sensibles: sólo el fragmento que no se entendió. */
export interface ErrorDeConfig {
  fragmento: string;
  motivo: "flag-desconocido" | "comodin-prohibido" | "sin-negocios" | "slug-invalido" | "formato";
}

export interface ConfigFlags {
  /** slug del negocio → flags encendidos para él. */
  porNegocio: ReadonlyMap<string, ReadonlySet<FlagFacturacion>>;
  errores: readonly ErrorDeConfig[];
}

// Un slug de negocio: minúsculas, dígitos y guiones (igual que `Tenant.slug`/`subdomain`).
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Lee `FACTURACION_FLAGS`. Formato: `flag=slug1,slug2;otroFlag=slug3`. Espacios y saltos de línea
 * se toleran. Lo que no se entiende se ignora (queda APAGADO) y se informa en `errores`: un error de
 * tipeo nunca prende nada. PURA.
 *
 *   FACTURACION_FLAGS="facturacion.automatica=chestetica,magra; facturita.pwa=facturita"
 */
export function leerConfigFlags(env: Env = process.env): ConfigFlags {
  const crudo = (env[VARIABLE_FLAGS] ?? "").trim();
  const porNegocio = new Map<string, Set<FlagFacturacion>>();
  const errores: ErrorDeConfig[] = [];
  if (crudo === "") return { porNegocio, errores };

  for (const parte of crudo.split(/[;\n]/)) {
    const fragmento = parte.trim();
    if (fragmento === "") continue;
    const igual = fragmento.indexOf("=");
    if (igual <= 0) {
      errores.push({ fragmento, motivo: "formato" });
      continue;
    }
    const flag = fragmento.slice(0, igual).trim();
    if (!esFlagFacturacion(flag)) {
      errores.push({ fragmento: flag, motivo: "flag-desconocido" });
      continue;
    }
    const slugs = fragmento
      .slice(igual + 1)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s !== "");
    if (slugs.length === 0) {
      errores.push({ fragmento: flag, motivo: "sin-negocios" });
      continue;
    }
    for (const slug of slugs) {
      if (slug === "*" || slug.includes("*")) {
        errores.push({ fragmento: `${flag}=${slug}`, motivo: "comodin-prohibido" });
        continue;
      }
      if (!SLUG.test(slug)) {
        errores.push({ fragmento: `${flag}=${slug}`, motivo: "slug-invalido" });
        continue;
      }
      const set = porNegocio.get(slug) ?? new Set<FlagFacturacion>();
      set.add(flag);
      porNegocio.set(slug, set);
    }
  }
  return { porNegocio, errores };
}

/** Los flags encendidos de un negocio según la config (vacío si no figura). PURA. */
export function encendidosDe(config: ConfigFlags, slug: string): ReadonlySet<FlagFacturacion> {
  return config.porNegocio.get(slug.trim().toLowerCase()) ?? new Set();
}

// ── La decisión ──────────────────────────────────────────────────────────────────────────────

export type MotivoApagado =
  | "no-encendido-para-el-negocio"
  | "falta-requisito"
  | "facturacion-global-apagada"
  | "arca-no-esta-en-real";

export type Decision =
  | { activo: true }
  | { activo: false; motivo: MotivoApagado; detalle?: FlagFacturacion };

function facturacionGlobal(env: Env): boolean {
  // Mismo criterio exacto que `isInvoicingEnabled()` (src/lib/fiscal.ts): sólo "true".
  return env.ARCA_INVOICING_ENABLED === "true";
}

function arcaReal(env: Env): boolean {
  // Mismo criterio exacto que `modoDesdeEnv()` del plugin ARCA: sólo "real".
  return env.ARCA_MODO === "real";
}

/**
 * ¿Está activo `flag` para un negocio cuyos flags encendidos son `encendidos`? Devuelve el motivo
 * cuando no, para que soporte y los runbooks puedan decir POR QUÉ. PURA.
 */
export function decidirFlag(
  flag: FlagFacturacion,
  encendidos: ReadonlySet<FlagFacturacion>,
  env: Env = process.env,
  visitados: ReadonlySet<FlagFacturacion> = new Set(),
): Decision {
  const def = CATALOGO_FLAGS[flag];
  if (!encendidos.has(flag)) return { activo: false, motivo: "no-encendido-para-el-negocio" };
  if (def.requiereFacturacionGlobal && !facturacionGlobal(env)) {
    return { activo: false, motivo: "facturacion-global-apagada" };
  }
  if (def.requiereArcaReal && !arcaReal(env)) return { activo: false, motivo: "arca-no-esta-en-real" };
  const camino = new Set(visitados).add(flag);
  for (const req of def.requiere) {
    if (camino.has(req)) return { activo: false, motivo: "falta-requisito", detalle: req };
    if (!decidirFlag(req, encendidos, env, camino).activo) {
      return { activo: false, motivo: "falta-requisito", detalle: req };
    }
  }
  return { activo: true };
}

/**
 * La puerta para los que consultan: «¿`flag` está activo para el negocio `slug`?». Lee la fuente de
 * hoy (`FACTURACION_FLAGS`) y las llaves globales del mismo `env`. Default: APAGADO. PURA.
 */
export function flagActivo(flag: FlagFacturacion, slug: string, env: Env = process.env): boolean {
  return decidirFlag(flag, encendidosDe(leerConfigFlags(env), slug), env).activo;
}

// ── Lo que se puede mostrar sin nombrar negocios (health / reporte de release) ──────────────

export interface ResumenFlags {
  /** Cuántos negocios tienen cada flag encendido en la config (no si está ACTIVO: eso depende
   *  además de las llaves globales). */
  negociosPorFlag: Record<FlagFacturacion, number>;
  /** Cuántos fragmentos de la variable no se entendieron (y por eso quedaron apagados). */
  erroresDeConfig: number;
}

/** Resumen agregado, sin slugs: apto para `/api/health`. PURA. */
export function resumirFlags(env: Env = process.env): ResumenFlags {
  const config = leerConfigFlags(env);
  const negociosPorFlag = Object.fromEntries(FLAGS_FACTURACION.map((f) => [f, 0])) as Record<
    FlagFacturacion,
    number
  >;
  for (const flags of config.porNegocio.values()) for (const f of flags) negociosPorFlag[f] += 1;
  return { negociosPorFlag, erroresDeConfig: config.errores.length };
}
