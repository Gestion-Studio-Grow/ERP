/**
 * CORE del módulo CARTERA (producto Contador — ADR-025 §12, diseño validado por
 * el Challenger en ADR-045). Hace REAL el scaffold de `contador-panel.ts`: un
 * estudio contable (tenant) administra la facturación de N clientes (cada uno,
 * OTRO tenant), sobre una tabla de ASIGNACIÓN explícita `CarteraCliente`
 * (patrón variante, ADR-055).
 *
 * REGLAS DE AISLAMIENTO (no negociables):
 *  - El panel NUNCA evade RLS: los datos de cada cliente se leen SOLO vía
 *    `tenantTransaction(clienteTenantId)` / `runInTenantContext` (los cores de
 *    bancos-glue), y SIEMPRE después de verificar la pertenencia del cliente a
 *    la cartera del estudio actual (`exigirClienteDeCartera`).
 *  - Jamás `operatorPrisma` en este camino.
 *  - La tabla CarteraCliente usa `tenantId` = estudio (dueño de la fila) → la
 *    policy RLS data-driven la cubre sola (ver prisma/schema.prisma).
 *
 * Este archivo es la LÓGICA con puertos inyectables (testeable sin DB, mismo
 * molde que bancos-glue/provisioning); las Server Actions que la cablean a
 * Prisma/RLS viven en `cartera-actions.ts`.
 */

import { CAP_FACTURAS_MES_DEFAULT, cuitValido, normalizarCuit } from "@/plugins/bancos";
import { isValidEmail, suggestSlug } from "@/lib/provisioning/slug";

// ── Vocabulario (espejo del enum EstadoCarteraCliente del schema) ────────────

export type EstadoCartera = "activa" | "pausada" | "baja";

/** Id del módulo en el catálogo (ADR-054): la ASIGNACIÓN al tenant estudio es la llave del panel. */
export const MODULO_CARTERA = "cartera";

/** % del cap de facturas del mes desde el cual el cliente cuenta como "cerca del tope" (§12.3). */
export const UMBRAL_ALERTA_CAP = 0.8;

// ── Contratos del panel (el scaffold FilaCartera/ResumenCartera, hecho real) ──

/** Resumen fiscal de UN cliente (sale de los cores de bancos-glue, vía RLS). */
export interface ResumenFiscalCliente {
  facturasMes: number;
  capFacturasMes: number;
  montoFacturadoMes: number;
  pendientesRevision: number;
  /** Propuestas listas para "Emitir automáticas (N)". */
  listasParaEmitir: number;
  ultimaImportacion: { nombreArchivo: string; createdAt: string } | null;
}

/** Una fila de la cartera del contador (conserva el contrato del scaffold, ahora real). */
export interface FilaCartera extends ResumenFiscalCliente {
  carteraId: string;
  clienteTenantId: string;
  /** Nombre corto que usa el contador ("Kiosco de Marta"). */
  alias: string;
  /** Nombre real del negocio (Tenant.name). */
  nombre: string;
  slug: string;
  cuit: string | null;
  estado: EstadoCartera;
  /** % del cap consumido (0..1). ≥ UMBRAL_ALERTA_CAP ⇒ alerta. */
  pctCap: number;
  /** Config ARCA lista (CUIT cargado). Hoy siempre homologación (cert delegado GSG). */
  arcaConfigurado: boolean;
  arcaHomologacion: boolean;
  /** Subdominio del cliente si tiene URL propia (para "abrir su backoffice"). */
  subdomain: string | null;
}

/** KPIs de cabecera del panel (conserva el contrato del scaffold, ahora real). */
export interface ResumenCartera {
  /** Clientes activos (los pausados se cuentan aparte). */
  clientes: number;
  pausados: number;
  facturasMes: number;
  montoFacturadoMes: number;
  pendientesRevision: number;
  listasParaEmitir: number;
  /** Clientes con pctCap ≥ UMBRAL_ALERTA_CAP. */
  cercaDelTope: number;
}

// ── Puertos (los cablea cartera-actions; los tests inyectan fakes) ───────────

/** Fila cruda de CarteraCliente (lo que devuelve la DB del ESTUDIO). */
export interface FilaCarteraDb {
  id: string;
  clienteTenantId: string;
  alias: string;
  estado: EstadoCartera;
}

/** Metadata del tenant cliente (tabla Tenant, fuera de RLS — solo control). */
export interface ClienteInfo {
  nombre: string;
  slug: string;
  subdomain: string | null;
  arcaCuit: string | null;
  arcaHomologacion: boolean;
}

export interface CarteraPorts {
  /** Filas de la cartera del estudio (SIEMPRE filtradas por estudioTenantId; excluye `baja`). */
  filasDeCartera(estudioTenantId: string): Promise<FilaCarteraDb[]>;
  /** Metadata del tenant cliente. `null` si no existe (fila huérfana). */
  datosCliente(clienteTenantId: string): Promise<ClienteInfo | null>;
  /** Resumen fiscal del cliente — la implementación real corre vía tenantTransaction(clienteTenantId). */
  resumenFiscalCliente(clienteTenantId: string): Promise<ResumenFiscalCliente>;
}

// ── Armado del panel (PURO + puertos) ─────────────────────────────────────────

/** Combina fila + metadata + resumen fiscal en la fila que ve el contador. PURA. */
export function armarFilaCartera(
  fila: FilaCarteraDb,
  info: ClienteInfo,
  resumen: ResumenFiscalCliente,
): FilaCartera {
  const cap = resumen.capFacturasMes > 0 ? resumen.capFacturasMes : CAP_FACTURAS_MES_DEFAULT;
  return {
    carteraId: fila.id,
    clienteTenantId: fila.clienteTenantId,
    alias: fila.alias,
    estado: fila.estado,
    nombre: info.nombre,
    slug: info.slug,
    subdomain: info.subdomain,
    cuit: info.arcaCuit,
    arcaConfigurado: info.arcaCuit !== null && info.arcaCuit !== "",
    arcaHomologacion: info.arcaHomologacion,
    ...resumen,
    pctCap: resumen.facturasMes / cap,
  };
}

/** KPIs de cabecera a partir de las filas. PURA. */
export function resumirCartera(filas: FilaCartera[]): ResumenCartera {
  const suma = (f: (x: FilaCartera) => number) => filas.reduce((s, x) => s + f(x), 0);
  return {
    clientes: filas.filter((f) => f.estado === "activa").length,
    pausados: filas.filter((f) => f.estado === "pausada").length,
    facturasMes: suma((f) => f.facturasMes),
    montoFacturadoMes: suma((f) => f.montoFacturadoMes),
    pendientesRevision: suma((f) => f.pendientesRevision),
    listasParaEmitir: suma((f) => f.listasParaEmitir),
    cercaDelTope: filas.filter((f) => f.pctCap >= UMBRAL_ALERTA_CAP).length,
  };
}

/**
 * La cartera completa del estudio: filas (activas + pausadas) con su resumen
 * fiscal, agregadas EN MEMORIA (nunca una query cross-tenant). El único filtro
 * de entrada es `estudioTenantId`: un estudio JAMÁS ve la cartera de otro
 * (defensa doble: predicado explícito + RLS sobre CarteraCliente).
 */
export async function listarCarteraCore(
  ports: CarteraPorts,
  estudioTenantId: string,
): Promise<{ filas: FilaCartera[]; resumen: ResumenCartera }> {
  const filasDb = await ports.filasDeCartera(estudioTenantId);
  const filas: FilaCartera[] = [];
  // Secuencial a propósito: N es chico (cartera de un estudio) y cuida las
  // conexiones del pooler de Neon (plan free) — deuda anotada: paginar/paralelizar
  // con límite cuando una cartera supere ~50 clientes.
  for (const fila of filasDb) {
    const info = await ports.datosCliente(fila.clienteTenantId);
    if (!info) continue; // fila huérfana (tenant borrado): no rompe el panel
    const resumen = await ports.resumenFiscalCliente(fila.clienteTenantId);
    filas.push(armarFilaCartera(fila, info, resumen));
  }
  return { filas, resumen: resumirCartera(filas) };
}

// ── Pertenencia estricta estudio→cliente (la guarda de TODA acción) ───────────

export type ResultadoPertenencia =
  | { ok: true; fila: FilaCarteraDb }
  | { ok: false; error: string };

/**
 * Verifica que `clienteTenantId` pertenezca a la cartera del estudio actual.
 * `buscarFila` DEBE consultar por (estudioTenantId, clienteTenantId) — la
 * implementación real corre con el tenant del ESTUDIO (RLS incluida).
 *
 * - Fila inexistente o en `baja` → mismo error (no se filtra si el cliente
 *   existe en otra cartera: cero fuga de información).
 * - `pausada` solo pasa con `permitirPausada` (para poder reactivar).
 */
export async function exigirClienteDeCartera(
  buscarFila: (
    estudioTenantId: string,
    clienteTenantId: string,
  ) => Promise<FilaCarteraDb | null>,
  estudioTenantId: string,
  clienteTenantId: string,
  opts?: { permitirPausada?: boolean },
): Promise<ResultadoPertenencia> {
  const fila = await buscarFila(estudioTenantId, clienteTenantId);
  if (!fila || fila.estado === "baja") {
    return { ok: false, error: "Ese cliente no está en tu cartera." };
  }
  if (fila.estado === "pausada" && !opts?.permitirPausada) {
    return {
      ok: false,
      error: "Ese cliente está pausado en tu cartera: reactivalo para operar.",
    };
  }
  return { ok: true, fila };
}

// ── Alta de cliente: validación + slug seguro (PURO + lookup inyectado) ───────

export interface AltaClienteInput {
  nombre: string;
  cuit: string;
  email: string;
  /** Nombre corto para la cartera; default: el nombre. */
  alias?: string;
}

export type ValidacionAlta =
  | { ok: true; nombre: string; cuit: string; email: string; alias: string; slugBase: string }
  | { ok: false; error: string };

/** Valida y normaliza el alta. CUIT con dígito verificador (mismo criterio que bancos). PURA. */
export function validarAltaCliente(input: AltaClienteInput): ValidacionAlta {
  const nombre = input.nombre?.trim() ?? "";
  if (nombre.length < 2) {
    return { ok: false, error: "Poné el nombre del negocio (mínimo 2 caracteres)." };
  }
  const cuit = normalizarCuit(input.cuit ?? "");
  if (!cuitValido(cuit)) {
    return { ok: false, error: "El CUIT no es válido: revisá los 11 números." };
  }
  const email = (input.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { ok: false, error: "El email del cliente no es válido." };
  }
  const slugBase = suggestSlug(nombre);
  if (!slugBase) {
    return { ok: false, error: "No se pudo generar el nombre corto para la web: usá un nombre con letras o números." };
  }
  return { ok: true, nombre, cuit, email, alias: (input.alias?.trim() || nombre), slugBase };
}

export type ResolucionSlug =
  | { ok: true; slug: string; reusaExistente: boolean }
  | { ok: false; error: string };

/**
 * Resuelve el slug del tenant cliente SIN riesgo de "adjuntarse" al negocio de
 * otro: `provisionTenant` es idempotente POR SLUG, así que si el slug sugerido ya
 * pertenece a un tenant con OTRO CUIT no se reusa jamás — se prueba una variante
 * con la cola del CUIT y, si también está tomada por otro, se corta con error.
 * Mismo CUIT ⇒ re-alta idempotente del mismo negocio (reusaExistente).
 */
export async function resolverSlugCliente(
  slugBase: string,
  cuit: string,
  lookup: (slug: string) => Promise<{ arcaCuit: string | null } | null>,
): Promise<ResolucionSlug> {
  const candidatos = [slugBase, `${slugBase}-${cuit.slice(-4)}`];
  for (const slug of candidatos) {
    const existente = await lookup(slug);
    if (!existente) return { ok: true, slug, reusaExistente: false };
    if (existente.arcaCuit && normalizarCuit(existente.arcaCuit) === cuit) {
      return { ok: true, slug, reusaExistente: true };
    }
  }
  return {
    ok: false,
    error:
      "Ya existe otro negocio con ese nombre en la plataforma y no se pudo generar un nombre corto único para la web. Probá con un nombre más específico.",
  };
}

// ── Provisioning bajo RLS (reuso de provisionTenant SIN operatorPrisma) ──────

/**
 * Envuelve el cliente de transacción para que, APENAS `provisionTenant` crea/
 * encuentra la fila Tenant (su `tenant.upsert` es la primera escritura), se setee
 * `app.current_tenant_id` = ese id DENTRO de la misma transacción. Así el resto
 * del alta (OWNER, BusinessSettings) pasa las policies WITH CHECK de RLS con el
 * rol de la app (app_rls), sin bypass y sin operatorPrisma — el alta sigue siendo
 * atómica y reusa el core de ADR-019 tal cual.
 *
 * Por qué un Proxy y no tocar provisionTenant: el core de ADR-019 es compartido
 * (CLI, consola de operador); el contexto RLS es una necesidad EXCLUSIVA de este
 * camino (única superficie que provisiona con el rol de la app). PURA respecto de
 * Prisma: testeable con un tx fake.
 */
export function conGucTrasCrearTenant<T extends object>(tx: T): T {
  const raw = tx as unknown as {
    tenant: object;
    $executeRaw: (q: TemplateStringsArray, ...valores: unknown[]) => Promise<unknown>;
  };
  const bindOf = (target: object, prop: PropertyKey): unknown => {
    const v = (target as Record<PropertyKey, unknown>)[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
  };
  const tenantProxy = new Proxy(raw.tenant, {
    get(target, prop) {
      if (prop === "upsert") {
        const upsert = bindOf(target, prop) as (args: unknown) => Promise<{ id: string }>;
        return async (args: unknown) => {
          const tenant = await upsert(args);
          // set_config(..., true) = SET LOCAL parametrizable (pooling-safe, ADR-018).
          await raw.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`;
          return tenant;
        };
      }
      return bindOf(target, prop);
    },
  });
  return new Proxy(tx, {
    get(target, prop) {
      if (prop === "tenant") return tenantProxy;
      return bindOf(target, prop);
    },
  });
}

/** Lo único que `provisionTenant` usa del PrismaClient: `$transaction` interactiva. */
export interface ClienteTransaccional {
  $transaction<T>(fn: (tx: object) => Promise<T>): Promise<T>;
}

/**
 * Fachada de PrismaClient para pasarle a `provisionTenant` desde el panel del
 * contador: misma transacción, mismo todo-o-nada, pero con el GUC de RLS seteado
 * apenas existe el id del tenant nuevo (ver `conGucTrasCrearTenant`). Con
 * RLS_ENFORCEMENT off el set_config es inocuo → un solo camino de código.
 */
export function crearClienteProvisioning(base: ClienteTransaccional): ClienteTransaccional {
  return {
    $transaction: <T>(fn: (tx: object) => Promise<T>) =>
      base.$transaction((tx) => fn(conGucTrasCrearTenant(tx))),
  };
}
