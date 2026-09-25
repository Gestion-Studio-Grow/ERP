// ============================================================================
// LÍMITES DEL NEGOCIO — el plan más las excepciones de la consola. Puro.
// ============================================================================
//
// `limitesDelNegocio` combina dos cosas, sin leer la base:
//   · los topes del plan del negocio (`Tenant.plan`, ./catalogo.ts);
//   · las EXCEPCIONES por negocio ("este PyME tiene 8 locales"), que viven en AuditLog sin tabla
//     nueva, con el mismo patrón que los interruptores (src/cambios/interruptores.ts:9-20):
//       entity "LimiteDelPlan", entityId = id del límite,
//       action "limite.ajustar" (changes = { plan, valor }) | "limite.quitar-ajuste" (changes = { plan }),
//       actor "operator:<nombre>", channel "operador".
//     Cada excepción es de un límite Y de un plan (`changes.plan`): manda la última fila VÁLIDA de
//     cada par (límite, plan). Una fila que no sea de un operador por el canal del operador no
//     cuenta, aunque sea más nueva: una fila forjada desde la app de un negocio no le sube el tope
//     a nadie.
//     Para el negocio sólo cuentan las del plan que tiene hoy. Las de otro plan no cuentan, no se
//     pisan con lo que se haga en este plan y se informan en `excepcionesDeOtroPlan`, así una
//     excepción vieja nunca regala nada en silencio. Si el negocio vuelve a ese plan, vuelven a
//     valer: por eso la consola que cambia el plan (R2-F4) tiene que cerrar las vigentes del plan
//     anterior con "limite.quitar-ajuste" (o decidir conservarlas, a la vista).
//
// SIN PLAN = COMO HOY. Un negocio sin un plan del catálogo (`Tenant.plan` nulo, vacío o con texto
// viejo) no tiene ningún tope nuevo: cada punto de alta se comporta como hoy (por ejemplo, las
// facturas automáticas siguen con su tope de reglas.ts:34). CH (`beauty-spa`) queda SIEMPRE sin
// plan, diga lo que diga su columna, hasta que el dueño dé el OK sacándolo de
// REQUIEREN_OK_DEL_DUENIO (tenants/[id]/apps-del-negocio.ts:87): es el único cliente en producción.
//
// NUNCA SE FRENA UNA VENTA: los comprobantes del mes sólo avisan (al 80 % y al 100 %). Facturar es
// obligación legal y un bloqueo en la caja es un callejón sin salida (E2 §7.2.4). Sólo frenan las
// ALTAS de usuarios, locales, cuentas bancarias y clientes de la cartera (`decidirAlta`).
//
// Quién escribe las excepciones: SÓLO la consola del operador (R2-F4), con `filaDeExcepcionDeLimite`.
// `audit()` todavía no rechaza esta entidad (src/lib/audit-core.ts:45 sólo reserva "Interruptor"):
// hasta que lo haga, lo que protege es la lectura (canal y actor del operador), que `audit()` no
// puede escribir.
//
// Client-safe: sin Prisma ni nada de servidor. Importa `requiereOkDelDuenio` de la ficha del negocio
// (la ÚNICA lista de negocios que requieren el OK del dueño, no una copia) y eso arrastra el registro
// de apps; pesa, pero no rompe la guardia del bundle del navegador.

import { requiereOkDelDuenio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import { CANAL_INTERRUPTOR, PREFIJO_ACTOR_OPERADOR, operadorDeActor } from "@/cambios/interruptores";
import { esPlanId, LIMITE_IDS, PLAN_IDS, planPorId, type LimiteId, type PlanId, type Tope } from "./catalogo";

// ── Qué es cada límite ──────────────────────────────────────────────────────

export interface LimiteMeta {
  id: LimiteId;
  /** Cómo se llama en "Tu plan" y en la consola. */
  nombre: string;
  /** Para armar los textos: "1 local", "3 locales", "sumar otro". */
  unidad: { uno: string; varios: string; genero: "f" | "m" };
  /** ¿Frena un alta al llegar al tope? Los que no frenan sólo avisan. */
  bloquea: boolean;
  /** Cómo se cuenta el uso. Guía para quien lo aplica (R3-F3); no decide nada. */
  comoSeCuenta: string;
}

export const LIMITES: Readonly<Record<LimiteId, LimiteMeta>> = {
  usuarios: {
    id: "usuarios",
    nombre: "Personas con usuario",
    unidad: { uno: "persona con usuario", varios: "personas con usuario", genero: "f" },
    bloquea: true,
    comoSeCuenta: "Usuarios activos del negocio (createUser, src/lib/user-actions.ts). El contador del estudio no cuenta: entra por su consola.",
  },
  locales: {
    id: "locales",
    nombre: "Locales",
    unidad: { uno: "local", varios: "locales", genero: "m" },
    bloquea: true,
    comoSeCuenta: "El propio negocio más los locales vinculados a su red (Mis locales). Sin red, es 1.",
  },
  comprobantesMes: {
    id: "comprobantesMes",
    nombre: "Comprobantes por mes",
    unidad: { uno: "comprobante", varios: "comprobantes", genero: "m" },
    bloquea: false,
    comoSeCuenta: "Comprobantes emitidos en el mes calendario. Nunca frena una venta ni una factura: avisa al 80 % y al 100 %.",
  },
  cuentasBancarias: {
    id: "cuentasBancarias",
    nombre: "Cuentas bancarias",
    unidad: { uno: "cuenta bancaria", varios: "cuentas bancarias", genero: "f" },
    bloquea: true,
    comoSeCuenta: "Cuentas de banco distintas de las que el negocio sube extractos. Mercado Pago no cuenta.",
  },
  clientesCartera: {
    id: "clientesCartera",
    nombre: "Clientes en la cartera",
    unidad: { uno: "cliente en la cartera", varios: "clientes en la cartera", genero: "m" },
    bloquea: true,
    comoSeCuenta: "Clientes de la cartera del estudio que no están de baja (CarteraCliente).",
  },
  facturasAutomaticasMes: {
    id: "facturasAutomaticasMes",
    nombre: "Facturas automáticas por mes",
    unidad: { uno: "factura automática", varios: "facturas automáticas", genero: "f" },
    bloquea: false,
    comoSeCuenta:
      "Facturas emitidas solas desde el extracto en el mes. Es el tope de reglas.ts cuando la columna del negocio está vacía: al llegar, frena sólo lo automático y la factura a mano sigue.",
  },
};

/** Los límites que frenan un alta. Los demás sólo avisan. */
export type LimiteQueBloquea = "usuarios" | "locales" | "cuentasBancarias" | "clientesCartera";

/** Tope más alto que acepta una excepción. Más que esto es un error de tipeo, no un negocio. */
export const TOPE_MAXIMO = 1_000_000;

// ── Las filas de AuditLog ────────────────────────────────────────────────────

export const ENTIDAD_LIMITE = "LimiteDelPlan";
export const ACCION_AJUSTAR = "limite.ajustar";
export const ACCION_QUITAR_AJUSTE = "limite.quitar-ajuste";

/**
 * ¿Es la entidad de las excepciones? Normaliza mayúsculas y espacios, como
 * `entidadReservadaDeLaConsola`. Para que `audit()` la rechace (src/lib/audit-core.ts).
 */
export function entidadReservadaDelPlan(entity: string): boolean {
  return entity.trim().toLowerCase() === ENTIDAD_LIMITE.toLowerCase();
}

/** Lo que hace falta de una fila de AuditLog para leer una excepción. */
export interface FilaDeLimite {
  id: string;
  entity: string;
  entityId: string | null;
  action: string;
  actor: string;
  channel: string | null;
  /** `AuditLog.changes` tal cual (Json). Se valida acá: nunca se confía en su forma. */
  changes: unknown;
  createdAt: Date;
}

function esLimiteId(x: unknown): x is LimiteId {
  return typeof x === "string" && (LIMITE_IDS as readonly string[]).includes(x);
}

function esTopeValido(x: unknown): x is Tope {
  return x === null || (typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= TOPE_MAXIMO);
}

type Excepcion =
  | { accion: "ajustar"; limite: LimiteId; plan: PlanId; valor: Tope; quien: string; cuando: Date }
  | { accion: "quitar"; limite: LimiteId; plan: PlanId; quien: string; cuando: Date };

/** La excepción que dice la fila, o `null` si la fila no es una excepción válida de la consola. */
function leerExcepcion(f: FilaDeLimite): Excepcion | null {
  if (f.entity !== ENTIDAD_LIMITE || !esLimiteId(f.entityId)) return null;
  if (f.channel !== CANAL_INTERRUPTOR) return null;
  const quien = operadorDeActor(f.actor);
  if (!quien) return null;
  if (!(f.createdAt instanceof Date) || Number.isNaN(f.createdAt.getTime())) return null;
  const c = f.changes;
  if (typeof c !== "object" || c === null || Array.isArray(c)) return null;
  const plan = (c as { plan?: unknown }).plan;
  if (!esPlanId(plan)) return null;
  if (f.action === ACCION_QUITAR_AJUSTE) {
    return { accion: "quitar", limite: f.entityId, plan, quien, cuando: f.createdAt };
  }
  if (f.action !== ACCION_AJUSTAR || !("valor" in c)) return null;
  const valor = (c as { valor?: unknown }).valor;
  if (!esTopeValido(valor)) return null;
  return { accion: "ajustar", limite: f.entityId, plan, valor, quien, cuando: f.createdAt };
}

/** ¿La fila es una excepción de límite escrita por la consola? */
export function esFilaDeLimiteValida(f: FilaDeLimite): boolean {
  return leerExcepcion(f) !== null;
}

/**
 * El filtro de la consulta (el panel y la consola usan el mismo). Se vuelve a validar cada fila en
 * `limitesDelNegocio`: la consulta acota, la decisión no confía en ella.
 */
export function filtroDeExcepcionesValidas(tenantId: string) {
  return {
    tenantId,
    entity: ENTIDAD_LIMITE,
    entityId: { in: [...LIMITE_IDS] as string[] },
    action: { in: [ACCION_AJUSTAR, ACCION_QUITAR_AJUSTE] },
    channel: CANAL_INTERRUPTOR,
    actor: { startsWith: PREFIJO_ACTOR_OPERADOR },
  };
}

export interface NuevaFilaDeLimite {
  tenantId: string;
  actor: string;
  action: string;
  entity: string;
  entityId: LimiteId;
  channel: string;
  changes: { plan: PlanId; valor?: Tope };
}

/**
 * La fila de AuditLog de una excepción. La escribe SÓLO la action de la consola (R2-F4).
 * `valor` ausente = quitar el ajuste (vuelve el tope del plan); `null` = sin tope.
 */
export function filaDeExcepcionDeLimite(p: {
  tenantId: string;
  operador: string;
  plan: PlanId;
  limite: LimiteId;
  valor?: Tope;
}): NuevaFilaDeLimite {
  const operador = p.operador.trim();
  if (!operador) throw new Error("filaDeExcepcionDeLimite: falta el nombre del operador.");
  if (p.valor !== undefined && !esTopeValido(p.valor)) {
    throw new Error(`filaDeExcepcionDeLimite: tope inválido (${String(p.valor)}). Tiene que ser un entero entre 0 y ${TOPE_MAXIMO}, o sin tope.`);
  }
  const quitar = p.valor === undefined;
  return {
    tenantId: p.tenantId,
    actor: `${PREFIJO_ACTOR_OPERADOR}${operador}`,
    action: quitar ? ACCION_QUITAR_AJUSTE : ACCION_AJUSTAR,
    entity: ENTIDAD_LIMITE,
    entityId: p.limite,
    channel: CANAL_INTERRUPTOR,
    changes: quitar ? { plan: p.plan } : { plan: p.plan, valor: p.valor as Tope },
  };
}

// ── Los límites del negocio ─────────────────────────────────────────────────

export interface TopeEfectivo {
  /** El tope que vale: un número, o `null` = sin tope (con origen "sin-plan": no se aplica nada nuevo). */
  valor: Tope;
  /**
   * "plan": el del plan. "excepcion": lo ajustó GSG para este negocio. "sin-plan": el negocio no
   * tiene plan del catálogo y no se le aplica ningún tope nuevo (se comporta como hoy).
   */
  origen: "plan" | "excepcion" | "sin-plan";
  /** El tope del plan, para mostrar "tu plan trae 3, GSG te dio 8". `null` sin plan. */
  delPlan: Tope;
  /** Operador de la excepción que manda, o `null`. */
  quien: string | null;
  cuando: Date | null;
}

export type MotivoSinPlan = "sin-plan" | "plan-desconocido" | "requiere-ok-del-duenio";

/** Una excepción vigente de otro plan: no cuenta hoy y vuelve a valer si el negocio vuelve a ese plan. */
export interface ExcepcionDeOtroPlan {
  limite: LimiteId;
  plan: PlanId;
  valor: Tope;
  quien: string;
  cuando: Date;
}

export interface LimitesDelNegocio {
  /** El plan que vale, o `null` si no se le aplica ninguno. */
  plan: PlanId | null;
  /** Por qué no hay plan, o `null` si lo hay. */
  motivoSinPlan: MotivoSinPlan | null;
  topes: Readonly<Record<LimiteId, TopeEfectivo>>;
  /**
   * Excepciones vigentes (la última de su límite y su plan es un ajuste) fijadas con otro plan. No
   * cuentan; la consola las muestra para cerrarlas. Ordenadas por límite y por plan.
   */
  excepcionesDeOtroPlan: ExcepcionDeOtroPlan[];
}

function sinPlan(motivo: MotivoSinPlan): LimitesDelNegocio {
  const topes = Object.fromEntries(
    LIMITE_IDS.map((id) => [id, { valor: null, origen: "sin-plan", delPlan: null, quien: null, cuando: null }]),
  ) as Record<LimiteId, TopeEfectivo>;
  return { plan: null, motivoSinPlan: motivo, topes, excepcionesDeOtroPlan: [] };
}

/**
 * Los topes que valen para este negocio. PURA: recibe `slug` y `plan` de la fila `Tenant` y las
 * filas de AuditLog del negocio (idealmente ya filtradas con `filtroDeExcepcionesValidas`).
 */
export function limitesDelNegocio(
  t: { slug: string | null; plan: string | null },
  filas: readonly FilaDeLimite[],
): LimitesDelNegocio {
  if (requiereOkDelDuenio(t.slug)) return sinPlan("requiere-ok-del-duenio");
  if (t.plan === null || t.plan.trim() === "") return sinPlan("sin-plan");
  if (!esPlanId(t.plan)) return sinPlan("plan-desconocido");

  const plan = t.plan;
  const base = planPorId(plan).limites;
  const topes = Object.fromEntries(
    LIMITE_IDS.map((id) => [id, { valor: base[id], origen: "plan", delPlan: base[id], quien: null, cuando: null }]),
  ) as Record<LimiteId, TopeEfectivo>;

  // La última fila válida de cada (límite, plan), por `createdAt` y a igual hora por id, como los
  // interruptores. Lo que se hace con un plan no toca las excepciones de otro.
  const validas = filas
    .map((f) => ({ f, e: leerExcepcion(f) }))
    .filter((x): x is { f: FilaDeLimite; e: Excepcion } => x.e !== null)
    .sort(
      (a, b) =>
        b.e.cuando.getTime() - a.e.cuando.getTime() || (a.f.id < b.f.id ? 1 : a.f.id > b.f.id ? -1 : 0),
    );
  const ultima = new Map<string, Excepcion>();
  for (const { e } of validas) {
    const clave = `${e.limite}|${e.plan}`;
    if (!ultima.has(clave)) ultima.set(clave, e);
  }
  const deOtroPlan: ExcepcionDeOtroPlan[] = [];
  for (const e of ultima.values()) {
    if (e.accion === "quitar") continue;
    if (e.plan !== plan) {
      deOtroPlan.push({ limite: e.limite, plan: e.plan, valor: e.valor, quien: e.quien, cuando: e.cuando });
      continue;
    }
    topes[e.limite] = { valor: e.valor, origen: "excepcion", delPlan: base[e.limite], quien: e.quien, cuando: e.cuando };
  }
  deOtroPlan.sort(
    (a, b) =>
      LIMITE_IDS.indexOf(a.limite) - LIMITE_IDS.indexOf(b.limite) || PLAN_IDS.indexOf(a.plan) - PLAN_IDS.indexOf(b.plan),
  );
  return { plan, motivoSinPlan: null, topes, excepcionesDeOtroPlan: deOtroPlan };
}

// ── El uso contra el tope ───────────────────────────────────────────────────

export type NivelDeUso = "sin-tope" | "holgado" | "cerca" | "completo" | "pasado";

export interface UsoDelLimite {
  usados: number;
  tope: Tope;
  /** Cuántos quedan antes del tope (0 si ya llegó o se pasó), o `null` sin tope. */
  quedan: number | null;
  /** "cerca" desde el 80 % del tope; "completo" en el tope; "pasado" por encima. */
  nivel: NivelDeUso;
}

function usoValido(usados: number): boolean {
  return Number.isInteger(usados) && usados >= 0;
}

/** Cómo va el uso contra el tope. `usados` tiene que ser un entero ≥ 0 (tira si no: es un error de quien cuenta). */
export function evaluarUso(tope: Tope, usados: number): UsoDelLimite {
  if (!usoValido(usados)) throw new Error(`evaluarUso: "usados" tiene que ser un entero ≥ 0 (llegó ${String(usados)}).`);
  if (tope === null) return { usados, tope, quedan: null, nivel: "sin-tope" };
  const quedan = Math.max(tope - usados, 0);
  // 80 % en enteros (5·usados ≥ 4·tope) para no depender de redondeos.
  const nivel: NivelDeUso =
    usados > tope ? "pasado" : usados === tope ? "completo" : usados * 5 >= tope * 4 ? "cerca" : "holgado";
  return { usados, tope, quedan, nivel };
}

export type DecisionDeAlta = { ok: true } | { ok: false; motivo: string };

export const NO_SE_PUDO_CONTAR =
  "No pudimos contar cuántos tenés cargados ahora. Recargá la página y probá de nuevo.";

/**
 * ¿Se puede sumar uno más? Sólo para los límites que frenan un alta. Sin tope (o sin plan), sí.
 * Si `usados` no es un número válido, no: mejor frenar con un porqué que dejar pasar a ciegas.
 * Un límite que sólo avisa (comprobantes) nunca frena, aunque alguien lo pida por acá.
 */
export function decidirAlta(limites: LimitesDelNegocio, id: LimiteQueBloquea, usados: number): DecisionDeAlta {
  const meta = LIMITES[id];
  if (!meta.bloquea) return { ok: true };
  const tope = limites.topes[id].valor;
  if (tope === null) return { ok: true };
  if (!usoValido(usados)) return { ok: false, motivo: NO_SE_PUDO_CONTAR };
  if (usados < tope) return { ok: true };
  const otro = meta.unidad.genero === "f" ? "otra" : "otro";
  const incluye =
    tope === 0
      ? `Tu plan no incluye ${meta.unidad.varios}.`
      : `Tu plan incluye hasta ${tope} ${tope === 1 ? meta.unidad.uno : meta.unidad.varios}.`;
  const sumar = tope === 0 ? (meta.unidad.genero === "f" ? "Para sumarlas" : "Para sumarlos") : `Para sumar ${otro}`;
  return { ok: false, motivo: `${incluye} ${sumar}, escribinos a Gestión Studio Grow y lo ampliamos.` };
}
