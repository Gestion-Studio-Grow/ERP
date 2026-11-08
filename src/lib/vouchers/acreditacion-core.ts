// ============================================================================
// VOUCHERS · EL PAGO DE LA ADMINISTRACIÓN EN LA CAJA Y SU ACREDITACIÓN EN MERCADO PAGO. PURO.
// ============================================================================
//
// Regla del dueño (08/11/2026, textual): «el pago entra en la caja y se concilia cuando entra la
// plata en Mercado Pago, que lo tomamos como si fuera una cuenta bancaria.»
//
//   · Cuando la administración paga (conciliación de una liquidación o pago a cuenta), el pago es un
//     COBRO DE CUENTA CORRIENTE: un INGRESO del libro de caja, con el mismo patrón que el ERP ya usa
//     para cobrar un fiado (`decidirAsiento` + marca `cuenta-corriente:` de settlement/asiento-libro.ts).
//     La marca es `cuenta-corriente:voucher-pago:<pagoId>`: el libro lo clasifica como «Cobro de
//     cuenta corriente» y no deja borrarlo a mano (`motivoParaNoBorrar`).
//   · El medio: Mercado Pago es la cuenta bancaria del negocio. Todo lo que no es efectivo
//     (transferencia, cheque, otro) entra a la columna Mercado Pago (`MERCADOPAGO` → `MP`) y queda
//     «pendiente de acreditación» hasta que se confirma que la plata entró en MP. El efectivo entra al
//     cajón y no espera acreditación.
//   · La confirmación engancha el movimiento de MP que ya trae el ERP (`MovimientoImportado` de una
//     importación con origen `mercadopago`, mercadopago-auto.ts) por monto + fecha + referencia. Si no
//     hay uno (o hay varios y ninguno se distingue por la referencia), la persona confirma a mano.
//   · El sobrante del pago queda a favor de la administración, como hasta ahora: no se toca acá.

import { cuentaCorrienteMarker, CUENTA_CORRIENTE_ACTOR_PREFIX } from "@/lib/settlement/asiento-libro";
import { esDiaReal, sumarDias, type MedioPagoAdministracion } from "./liquidacion-core";

/** Rastro (AuditLog) de la acreditación confirmada de un pago: entity `VoucherPagoAdministracion`. */
export const ACCION_ACREDITADO_MP = "voucher.pago.acreditado-mp";

const PREFIJO_PAGO = "voucher-pago:";

/** La marca del ingreso de caja de un pago de la administración (`CashMovement.createdBy`). */
export function marcaDelPagoEnCaja(pagoId: string): string {
  return cuentaCorrienteMarker(`${PREFIJO_PAGO}${pagoId}`);
}

/** El id del pago si esta fila del libro es el ingreso de un pago de la administración; si no, null. */
export function pagoDelIngreso(createdBy: string | null | undefined): string | null {
  const s = String(createdBy ?? "");
  const p = `${CUENTA_CORRIENTE_ACTOR_PREFIX}${PREFIJO_PAGO}`;
  return s.startsWith(p) && s.length > p.length ? s.slice(p.length) : null;
}

/** El medio del cobro (vocabulario `PaymentMethod`) con el que el pago entra al libro de caja. */
export function medioDeCajaDelPago(medio: MedioPagoAdministracion | string): "EFECTIVO" | "MERCADOPAGO" {
  return medio === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
}

/** ¿Este pago espera que se confirme su acreditación en Mercado Pago? (todo menos el efectivo). */
export function esperaAcreditacion(medio: MedioPagoAdministracion | string): boolean {
  return medioDeCajaDelPago(medio) === "MERCADOPAGO";
}

/** Ventana del movimiento de MP: desde el día anterior al pago (fecha mal tipeada) hasta 10 días después. */
export const DIAS_ANTES = 1;
export const DIAS_PARA_ACREDITAR = 10;

/** Un movimiento acreditado de Mercado Pago (`MovimientoImportado`, fecha AAAAMMDD). */
export type MovimientoMp = {
  id: string;
  /** AAAAMMDD, como lo guarda el pipeline del extracto. */
  fecha: string;
  montoCentavos: number;
  descripcion: string;
  referencia: string | null;
  contraparte: string | null;
};

export type PagoParaAcreditar = { fecha: string; montoCentavos: number; referencia: string | null };

const aAAAAMMDD = (dia: string) => dia.replace(/-/g, "");

/** La ventana de fechas (AAAAMMDD, inclusiva) en la que se busca el movimiento de MP de un pago. */
export function ventanaDeAcreditacion(fechaPago: string): { desde: string; hasta: string } | null {
  if (!esDiaReal(fechaPago)) return null;
  return { desde: aAAAAMMDD(sumarDias(fechaPago, -DIAS_ANTES)), hasta: aAAAAMMDD(sumarDias(fechaPago, DIAS_PARA_ACREDITAR)) };
}

const normal = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Los movimientos de MP que pueden ser la acreditación de este pago: mismo monto al centavo, dentro
 * de la ventana y no enganchados ya a otro pago (`usados`). Si el pago tiene referencia y alguno la
 * menciona (en la referencia, la descripción o la contraparte), quedan sólo esos. Por fecha. PURA.
 */
export function candidatosDeAcreditacion(pago: PagoParaAcreditar, movimientos: readonly MovimientoMp[], usados: ReadonlySet<string>): MovimientoMp[] {
  const v = ventanaDeAcreditacion(pago.fecha);
  if (!v || pago.montoCentavos <= 0) return [];
  const posibles = movimientos
    .filter((m) => !usados.has(m.id) && m.montoCentavos === pago.montoCentavos && m.fecha >= v.desde && m.fecha <= v.hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  const ref = normal(pago.referencia);
  if (ref.length >= 3) {
    const conRef = posibles.filter((m) => [m.referencia, m.descripcion, m.contraparte].some((x) => normal(x).includes(ref)));
    if (conRef.length > 0) return conRef;
  }
  return posibles;
}

export type EleccionDeAcreditacion =
  | { ok: true; via: "mp"; movimientoId: string }
  | { ok: true; via: "manual"; motivo: "sin-movimiento" | "varios-posibles" }
  | { ok: false; error: string };

/**
 * Qué movimiento de MP se engancha. Con uno elegido, tiene que estar entre los candidatos. Sin elegir:
 * uno solo → ese; ninguno o varios indistinguibles → confirmación a mano (la persona vio la plata en
 * MP; no se adivina cuál de varios). PURA.
 */
export function eleccionDeAcreditacion(candidatos: readonly MovimientoMp[], elegido?: string | null): EleccionDeAcreditacion {
  const e = elegido?.trim();
  if (e) {
    return candidatos.some((m) => m.id === e)
      ? { ok: true, via: "mp", movimientoId: e }
      : { ok: false, error: "Ese movimiento de Mercado Pago no corresponde a este pago (otro monto, otra fecha o ya está enganchado a otro pago)." };
  }
  if (candidatos.length === 1) return { ok: true, via: "mp", movimientoId: candidatos[0].id };
  return { ok: true, via: "manual", motivo: candidatos.length === 0 ? "sin-movimiento" : "varios-posibles" };
}

/** Estado de acreditación de un pago, para la pantalla. */
export type EstadoAcreditacion =
  | { estado: "no-aplica" }
  | { estado: "pendiente"; candidatos: number; candidato: MovimientoMp | null }
  | { estado: "acreditado"; via: "mp" | "manual"; movimientoId: string | null; dia: string };

/** Lo que guarda el AuditLog de la acreditación, leído sin confiar en su forma. PURA. */
export function leerAcreditacion(changes: unknown): { via: "mp" | "manual"; movimientoId: string | null; pagoId: string | null } {
  const c = (changes && typeof changes === "object" ? changes : {}) as Record<string, unknown>;
  const movimientoId = typeof c.movimientoId === "string" && c.movimientoId ? c.movimientoId : null;
  return { via: c.via === "mp" && movimientoId ? "mp" : "manual", movimientoId, pagoId: typeof c.pagoId === "string" ? c.pagoId : null };
}

/** El detalle del ingreso en el libro de caja. PURA. */
export function detalleDelIngreso(p: { liquidacion?: { desde: string; hasta: string } | null; referencia: string | null; medio: string }): string {
  const fecha = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const que = p.liquidacion
    ? `Vouchers: pago de la administración, liquidación del ${fecha(p.liquidacion.desde)} al ${fecha(p.liquidacion.hasta)}`
    : "Vouchers: pago a cuenta de la administración";
  const ref = p.referencia?.trim() ? ` · ${p.referencia.trim()}` : "";
  return `${que}${ref}${esperaAcreditacion(p.medio) ? " · a acreditar en Mercado Pago" : ""}`;
}
