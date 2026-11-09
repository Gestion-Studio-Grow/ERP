// ============================================================================
// AVISOS DE LA SEÑA POR MERCADO PAGO · lo que el aviso de MP no pudo resolver solo
// ============================================================================
//
// El aviso de MP de un turno (senia-mp.ts) deja una fila de AuditLog cuando hace falta una persona:
//   · `senia_parcial_mp`             → pagó menos que la seña;
//   · `senia_mp_devuelta_sin_anular` → MP devolvió la plata pero el cobro no se pudo anular (factura
//                                      emitida o día cerrado): el cobro sigue en la caja;
//   · `senia_mp_no_registrada`       → entró la plata pero no se pudo asentar (caja cerrada u otro).
// Acá se leen esas filas (PURO: sin base, sirve en el navegador) para que la agenda las muestre.
// Cuándo deja de mostrarse cada una lo decide la agenda con el turno a la vista (agenda-core.ts).

import { redondearAlCentavo } from "@/lib/dinero/redondeo";
export const ACCION_SENIA_PARCIAL_MP = "senia_parcial_mp";
export const ACCION_SENIA_MP_NO_REGISTRADA = "senia_mp_no_registrada";
export const ACCION_SENIA_MP_DEVUELTA_SIN_ANULAR = "senia_mp_devuelta_sin_anular";

/** La nota del cobro de ESTE pago: es la capa de idempotencia que no depende de la migración. */
export function notaSeniaMP(paymentId: string): string {
  return `Seña por Mercado Pago · pago ${paymentId}`;
}

export const ACCIONES_AVISO_MP = [ACCION_SENIA_PARCIAL_MP, ACCION_SENIA_MP_DEVUELTA_SIN_ANULAR, ACCION_SENIA_MP_NO_REGISTRADA] as const;

export type AvisoMP =
  | { tipo: "parcial"; pagado: number; senia: number }
  | { tipo: "devuelta-sin-anular"; cobroId: string | null }
  | { tipo: "no-registrada"; pagoId: string | null; monto: number | null; cajaCerrada: boolean };

export type FilaAvisoMP = { entityId: string; action: string; changes: unknown; createdAt: Date | string };

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const str = (x: unknown): string | null => (typeof x === "string" && x.length > 0 ? x : null);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

/** Una fila de AuditLog → el aviso que muestra la agenda (null si no es de estas). PURA. */
export function avisoMPDeFila(f: Pick<FilaAvisoMP, "action" | "changes">): AvisoMP | null {
  const c = obj(f.changes);
  switch (f.action) {
    case ACCION_SENIA_PARCIAL_MP: {
      const senia = num(c.senia);
      const falta = num(c.seniaQueFalta);
      if (senia === null || falta === null) return null;
      return { tipo: "parcial", pagado: Math.max(0, redondearAlCentavo(senia - falta)), senia };
    }
    case ACCION_SENIA_MP_DEVUELTA_SIN_ANULAR:
      return { tipo: "devuelta-sin-anular", cobroId: str(c.cobroId) };
    case ACCION_SENIA_MP_NO_REGISTRADA: {
      const pago = obj(c.pagoMP);
      const motivo = str(c.motivo) ?? "";
      return { tipo: "no-registrada", pagoId: str(pago.id), monto: num(pago.monto), cajaCerrada: /cerrad/i.test(motivo) };
    }
    default:
      return null;
  }
}

/** Turno → sus avisos, el MÁS RECIENTE de cada tipo (en orden de llegada). PURA. */
export function avisosMPPorTurno(filas: readonly FilaAvisoMP[]): Record<string, AvisoMP[]> {
  const ultimo = new Map<string, { t: number; aviso: AvisoMP }>();
  for (const f of filas) {
    const aviso = avisoMPDeFila(f);
    if (!aviso) continue;
    const t = new Date(f.createdAt).getTime();
    const k = `${f.entityId}\u0000${aviso.tipo}`;
    const prev = ultimo.get(k);
    if (!prev || t >= prev.t) ultimo.set(k, { t, aviso });
  }
  const out: Record<string, { t: number; aviso: AvisoMP }[]> = {};
  for (const [k, v] of ultimo) (out[k.split("\u0000")[0]] ??= []).push(v);
  return Object.fromEntries(Object.entries(out).map(([id, xs]) => [id, xs.sort((a, b) => a.t - b.t).map((x) => x.aviso)]));
}
