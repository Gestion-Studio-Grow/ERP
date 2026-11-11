// PROFETURNOS · Prueba gratis + abono mensual (T2): el estado del plan, PURO (sin I/O ni imports de
// servidor). Lo usan el panel («Mi plan» y la traba de las mutaciones), el turnero público y el
// webhook de Mercado Pago (cuánto se extiende la vigencia).
//
// Fechas: «AAAA-MM-DD» del huso del negocio (Buenos Aires). `vigenciaHasta` es INCLUSIVA (el último
// día pago). La prueba cubre `DIAS_PRUEBA` días corridos desde el día del alta (el del alta cuenta).
//
// REGLA DE ORO: el negocio SIN fila `profeturnos.alta` (altas manuales, el profe de referencia) es
// «libre»: nunca se lo traba, haya o no filas de plan.

import { centavosDe } from "@/lib/dinero/redondeo";
import { DIAS_ARREPENTIMIENTO, DIAS_PRUEBA } from "./planes";

export type EstadoPlan = "prueba" | "activo" | "vencido" | "libre";

/** Qué dice la última fila `profeturnos.plan`: un pago («mensual»), una baja, o un corte (arrepentimiento). */
export type PlanDeLaFila = "mensual" | "baja" | "vencido";

export interface EntradaPlan {
  /** Día del alta (fila `profeturnos.alta`). null = alta manual → «libre». */
  altaEn: string | null;
  /** Último día pago (inclusive), de la última fila `profeturnos.plan`. */
  vigenciaHasta: string | null;
  /** Lo que dice esa misma fila. «vencido» corta todo (arrepentimiento) aunque quede prueba. */
  plan?: PlanDeLaFila | null;
  hoy: string;
}

export interface EstadoDelPlan {
  estado: EstadoPlan;
  /** Días que quedan contando hoy (prueba o abono). null en «libre» y en «vencido». */
  diasRestantes: number | null;
  /** Último día habilitado (inclusive). null en «libre». */
  hasta: string | null;
  /** El profe pidió la baja: no se renueva, pero lo pago sigue hasta `hasta`. */
  baja: boolean;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

export function esFecha(s: unknown): s is string {
  if (typeof s !== "string" || !FECHA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function aMs(s: string): number {
  return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
}

function deMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** a − b en días. */
export function diasEntre(a: string, b: string): number {
  return Math.round((aMs(a) - aMs(b)) / DIA_MS);
}

export function sumarDias(s: string, n: number): string {
  return deMs(aMs(s) + n * DIA_MS);
}

/** +1 mes calendario; si el día no existe en el mes siguiente, el último del mes (31/01 → 28/02). */
export function sumarUnMes(s: string): string {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7)); // 1..12
  const d = Number(s.slice(8, 10));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const ultimo = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return deMs(Date.UTC(ny, nm - 1, Math.min(d, ultimo)));
}

/** Último día de la prueba gratis (inclusive). */
export function ultimoDiaDePrueba(altaEn: string): string {
  return sumarDias(altaEn, DIAS_PRUEBA - 1);
}

const mayor = (a: string | null, b: string | null): string | null => (a === null ? b : b === null ? a : a >= b ? a : b);

/**
 * Hasta qué día está habilitado HOY el negocio (prueba o abono), sin mirar si ya pasó. null = nada
 * (libre, o cortado por arrepentimiento).
 */
export function vigenciaEfectiva(e: Omit<EntradaPlan, "hoy">): string | null {
  if (e.altaEn === null || !esFecha(e.altaEn)) return null;
  if (e.plan === "vencido") return null;
  const pago = esFecha(e.vigenciaHasta) ? e.vigenciaHasta : null;
  return mayor(pago, ultimoDiaDePrueba(e.altaEn));
}

export function estadoDelPlan(e: EntradaPlan): EstadoDelPlan {
  const baja = e.plan === "baja";
  if (e.altaEn === null || !esFecha(e.altaEn)) return { estado: "libre", diasRestantes: null, hasta: null, baja: false };
  if (e.plan === "vencido") return { estado: "vencido", diasRestantes: null, hasta: null, baja };
  const finPrueba = ultimoDiaDePrueba(e.altaEn);
  const pago = esFecha(e.vigenciaHasta) ? e.vigenciaHasta : null;
  if (pago !== null && e.hoy <= pago && pago >= finPrueba) {
    return { estado: "activo", diasRestantes: diasEntre(pago, e.hoy) + 1, hasta: pago, baja };
  }
  if (e.hoy <= finPrueba) {
    // Si pagó durante la prueba, la vigencia paga arranca después: «hasta» dice el último día habilitado.
    return { estado: "prueba", diasRestantes: diasEntre(finPrueba, e.hoy) + 1, hasta: mayor(pago, finPrueba), baja };
  }
  return { estado: "vencido", diasRestantes: null, hasta: mayor(pago, finPrueba), baja };
}

/**
 * La vigencia nueva tras un pago aprobado: un mes más desde lo que sea más tarde, hoy o el último día
 * habilitado (no se pierden días de prueba ni de abono por pagar antes). Tras un arrepentimiento (corte),
 * arranca de hoy.
 */
export function vigenciaTrasUnPago(e: Omit<EntradaPlan, "plan"> & { plan?: PlanDeLaFila | null }): string {
  const actual = vigenciaEfectiva(e);
  const base = actual !== null && actual >= e.hoy ? actual : e.hoy;
  return sumarUnMes(base);
}

/** ¿El pago de `fechaPago` todavía está dentro del plazo de arrepentimiento? (10 días corridos.) */
export function dentroDelArrepentimiento(fechaPago: string, hoy: string): boolean {
  const d = diasEntre(hoy, fechaPago);
  return d >= 0 && d <= DIAS_ARREPENTIMIENTO;
}

/** La fila de plan que deja un trámite: qué plan y hasta cuándo (null = sin abono). */
export interface FilaNueva {
  plan: PlanDeLaFila;
  vigenciaHasta: string | null;
}

/**
 * BAJA: no renueva y conserva lo pagado. Nunca deja el plan MEJOR de lo que estaba: si un
 * arrepentimiento ya lo cortó («vencido»), sigue cortado (una «baja» sin vigencia revive la prueba).
 */
export function filaTrasLaBaja(actual: { plan: PlanDeLaFila | null; vigenciaHasta: string | null }): FilaNueva {
  if (actual.plan === "vencido") return { plan: "vencido", vigenciaHasta: null };
  return { plan: "baja", vigenciaHasta: esFecha(actual.vigenciaHasta) ? actual.vigenciaHasta : null };
}

/**
 * ARREPENTIMIENTO: se devuelven sólo los pagos dentro del plazo; los de antes no se devuelven y sus
 * días se conservan. La vigencia vuelve a la que dejó el pago CONSERVADO más reciente (cada fila
 * `profeturnos.pago` guarda la vigencia que produjo). Si no queda vigencia (ningún pago conservado, o
 * ya pasó), «vencido»: corta también lo que quede de prueba, como siempre.
 *
 * `pagos`: del más nuevo al más viejo. `devueltos`: los que se devuelven ahora y los ya marcados.
 */
export function filaTrasElArrepentimiento(
  pagos: readonly { id: string; vigenciaHasta: unknown }[],
  devueltos: ReadonlySet<string>,
  actual: { plan: PlanDeLaFila | null },
  hoy: string,
): FilaNueva {
  const conservado = pagos.find((p) => !devueltos.has(p.id));
  const v = conservado && esFecha(conservado.vigenciaHasta) ? conservado.vigenciaHasta : null;
  if (v === null || v < hoy) return { plan: "vencido", vigenciaHasta: null };
  return { plan: actual.plan === "baja" ? "baja" : "mensual", vigenciaHasta: v };
}

// ─── Referencia externa del cobro: `pt:<tenantId>:mensual:<nonce>` ────────────────────────────────

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function referenciaDelCobro(tenantId: string, nonce: string): string {
  if (!ID.test(tenantId) || !ID.test(nonce)) throw new Error("referencia de cobro inválida");
  return `pt:${tenantId}:mensual:${nonce}`;
}

/** El negocio de una referencia, o null si no tiene EXACTAMENTE la forma esperada. */
export function tenantDeLaReferencia(ref: unknown): string | null {
  if (typeof ref !== "string") return null;
  const p = ref.split(":");
  if (p.length !== 4 || p[0] !== "pt" || p[2] !== "mensual" || !ID.test(p[1]) || !ID.test(p[3])) return null;
  return p[1];
}

// ─── El pago, re-leído de la API de MP: qué se exige para extender ─────────────────────────────────

export interface PagoLeido {
  id: string;
  status: string | null;
  currency: string | null;
  monto: number | null;
  referencia: string | null;
}

export type MotivoPagoRechazado = "no-aprobado" | "moneda" | "monto" | "referencia";

/** PURA: el pago sirve si está aprobado, en ARS, por el precio exacto y con una referencia nuestra. */
export function validarPago(p: PagoLeido, precio: number): { ok: true; tenantId: string } | { ok: false; motivo: MotivoPagoRechazado } {
  if (p.status !== "approved") return { ok: false, motivo: "no-aprobado" };
  if (p.currency !== "ARS") return { ok: false, motivo: "moneda" };
  if (typeof p.monto !== "number" || !Number.isFinite(p.monto) || centavosDe(p.monto) !== centavosDe(precio)) {
    return { ok: false, motivo: "monto" };
  }
  const tenantId = tenantDeLaReferencia(p.referencia);
  if (!tenantId) return { ok: false, motivo: "referencia" };
  return { ok: true, tenantId };
}

/** Mensaje de la traba del panel. */
export const MENSAJE_VENCIDO =
  "Tu prueba gratis o tu abono de ProfeTurnos terminó. Podés ver todo, pero para agendar o confirmar clases renová en «Mi plan» (Clases → Ajustes → Mi plan).";

/** Lo que ve el alumno en el turnero de un profe con el plan vencido. */
export const MENSAJE_TURNERO_VENCIDO = "El profe está renovando su cuenta. Mientras tanto, escribile por WhatsApp para pedir tu clase.";

export const RUTA_MI_PLAN = "/admin/clases/plan";
