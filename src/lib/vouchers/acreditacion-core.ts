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
//   · El medio decide a dónde va la plata (corrección del 08/11, cert 5): EFECTIVO → el cajón (no
//     espera acreditación); TRANSFERENCIA (transferencia o Mercado Pago) → columna Mercado Pago
//     (`MERCADOPAGO` → `MP`), «pendiente de acreditación»; CHEQUE → «valores a depositar»: NO entra a
//     ninguna columna hasta que se confirma el depósito, y recién ahí entra a Mercado Pago; OTRO →
//     obliga a elegir si entró al cajón o a Mercado Pago (la elección queda en el método del ingreso).
//   · La confirmación engancha el movimiento de MP que ya trae el ERP (`MovimientoImportado` de una
//     importación con origen `mercadopago`) por monto + fecha + referencia, SÓLO si ese movimiento no
//     está descartado (copia de una re-importación), no está facturado (`emitida` o con `invoiceId`) y
//     no está enganchado a otro pago. Al engancharlo pasa a `no_facturable` en la misma transacción
//     (sale de la facturación automática: es plata de vouchers, no una venta). Si no hay uno (o hay
//     varios y ninguno se distingue por la referencia), la persona confirma a mano.
//   · El sobrante del pago queda a favor de la administración, como hasta ahora: no se toca acá.

import { cuentaCorrienteMarker, CUENTA_CORRIENTE_ACTOR_PREFIX } from "@/lib/settlement/asiento-libro";
import { esDiaReal, sumarDias, type MedioPagoAdministracion } from "./liquidacion-core";

/** Rastro (AuditLog) de la acreditación confirmada de un pago: entity `VoucherPagoAdministracion`. */
export const ACCION_ACREDITADO_MP = "voucher.pago.acreditado-mp";

const PREFIJO_PAGO = "voucher-pago:";

/**
 * Rastro (AuditLog) de un cheque de la administración que el banco rechazó: entity
 * `VoucherPagoAdministracion`. El pago vuelve a deuda en la cuenta (débito «Cheque rechazado») y, si
 * ya se había depositado, la caja lleva un contramovimiento (EGRESO por Mercado Pago).
 */
export const ACCION_CHEQUE_RECHAZADO = "voucher.pago.cheque-rechazado";

/** Prefijo distinto del ingreso (`voucher-pago-rechazo:` no empieza con `voucher-pago:`): `pagoDelIngreso` no lo confunde. */
const PREFIJO_RECHAZO = "voucher-pago-rechazo:";

/** La marca del contramovimiento de caja de un cheque rechazado después del depósito (`CashMovement.createdBy`). */
export function marcaDelRechazoEnCaja(pagoId: string): string {
  return cuentaCorrienteMarker(`${PREFIJO_RECHAZO}${pagoId}`);
}

export const MOTIVO_MINIMO_RECHAZO = 5;
export const MOTIVO_MAXIMO_RECHAZO = 200;

/** El motivo del rechazo del cheque, normalizado, o el error para mostrar. PURA. */
export function leerMotivoDeRechazo(raw: unknown): { ok: true; motivo: string } | { ok: false; error: string } {
  const motivo = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (motivo.length < MOTIVO_MINIMO_RECHAZO) {
    return { ok: false, error: "Escribí por qué rebotó el cheque (al menos 5 letras): queda en el registro." };
  }
  if (motivo.length > MOTIVO_MAXIMO_RECHAZO) return { ok: false, error: "El motivo es muy largo (hasta 200 letras)." };
  return { ok: true, motivo };
}

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

/**
 * A dónde va la plata de un pago: el cajón, la columna Mercado Pago (espera acreditación) o «valores a
 * depositar» (un cheque: fuera de toda columna hasta que se confirma el depósito).
 */
export type DestinoDelPago = "CAJON" | "MP" | "A_DEPOSITAR";

/** Dónde dice la persona que entró un pago de medio «otro» (o, leído, el método de su ingreso de caja). */
export type ColumnaDeOtro = "EFECTIVO" | "MP";

export function esColumnaDeOtro(v: unknown): v is ColumnaDeOtro {
  return v === "EFECTIVO" || v === "MP";
}

export const OTRO_SIN_COLUMNA = "Con «otro» medio, elegí si la plata entró al cajón (efectivo) o a Mercado Pago.";

/**
 * El destino de un pago según su medio. `otroA` sólo cuenta para OTRO: sin elegirlo, `null` (no se
 * adivina). Para leer un OTRO ya registrado, `otroA` es el método de su ingreso de caja. PURA.
 */
export function destinoDelPago(medio: MedioPagoAdministracion | string, otroA?: string | null): DestinoDelPago | null {
  switch (medio) {
    case "EFECTIVO":
      return "CAJON";
    case "TRANSFERENCIA":
      return "MP";
    case "CHEQUE":
      return "A_DEPOSITAR";
    case "OTRO":
      return otroA === "EFECTIVO" ? "CAJON" : otroA === "MP" ? "MP" : null;
    default:
      return null;
  }
}

/**
 * El medio (vocabulario `PaymentMethod`) con el que el pago entra HOY al libro de caja, o `null` si no
 * entra todavía (cheque: entra a Mercado Pago recién cuando se confirma el depósito). PURA.
 */
export function medioDeCajaDelDestino(destino: DestinoDelPago): "EFECTIVO" | "MERCADOPAGO" | null {
  return destino === "CAJON" ? "EFECTIVO" : destino === "MP" ? "MERCADOPAGO" : null;
}

/** ¿Este destino espera una confirmación? (Mercado Pago: la acreditación; cheque: el depósito). */
export function esperaAcreditacion(destino: DestinoDelPago | null): boolean {
  return destino === "MP" || destino === "A_DEPOSITAR";
}

/** Ventana del movimiento de MP: desde el día anterior al pago (fecha mal tipeada) hasta 10 días después. */
export const DIAS_ANTES = 1;
export const DIAS_PARA_ACREDITAR = 10;
/** Un cheque se deposita después de recibido (al día: hasta 30 días + el clearing): ventana más larga. */
export const DIAS_PARA_DEPOSITAR_CHEQUE = 45;

/** Un movimiento acreditado de Mercado Pago (`MovimientoImportado`, fecha AAAAMMDD). */
export type MovimientoMp = {
  id: string;
  /** AAAAMMDD, como lo guarda el pipeline del extracto. */
  fecha: string;
  montoCentavos: number;
  descripcion: string;
  referencia: string | null;
  contraparte: string | null;
  /** `EstadoPropuestaMovimiento`. Ausente = ya filtrado por la consulta. */
  estadoPropuesta?: string;
  invoiceId?: string | null;
  motivoRevision?: string | null;
};

/**
 * Estados del movimiento de MP que se pueden enganchar: ni `descartado` (copia de una re-importación:
 * la plata ya está en otro movimiento) ni `emitida` (ya se facturó como venta).
 */
export const ESTADOS_ENGANCHABLES = ["auto", "revision", "no_facturable"] as const;

/** La marca que deja en `motivoRevision` el movimiento de MP enganchado a un pago. */
export const MARCA_ENGANCHE = "(voucher-pago:";
export function motivoDelEnganche(pagoId: string): string {
  return `Vouchers: acreditación del pago de la administración ${MARCA_ENGANCHE}${pagoId}).`;
}

/**
 * La marca que deja en `motivoRevision` la persona que aprobó como VENTA un movimiento que estaba en
 * revisión por un pago de la administración pendiente (`motivoDeAcreditacionPendiente`): la emisión ya
 * no lo frena y la acreditación nunca lo engancha.
 */
export const MARCA_VENTA_CONFIRMADA = "(venta-confirmada)";
export function motivoDeVentaConfirmada(): string {
  return `Vouchers: una persona confirmó que es una venta, no plata de la administración ${MARCA_VENTA_CONFIRMADA}.`;
}
export function esVentaConfirmada(motivoRevision: string | null | undefined): boolean {
  return String(motivoRevision ?? "").includes(MARCA_VENTA_CONFIRMADA);
}

/** ¿Este movimiento de MP puede ser la acreditación de un pago? PURA. */
export function esEnganchable(m: Pick<MovimientoMp, "estadoPropuesta" | "invoiceId" | "motivoRevision">): boolean {
  if (m.estadoPropuesta !== undefined && !(ESTADOS_ENGANCHABLES as readonly string[]).includes(m.estadoPropuesta)) return false;
  if (m.invoiceId) return false;
  if (esVentaConfirmada(m.motivoRevision)) return false;
  return !String(m.motivoRevision ?? "").includes(MARCA_ENGANCHE);
}

export type PagoParaAcreditar = { fecha: string; montoCentavos: number; referencia: string | null; destino?: DestinoDelPago | null };

const aAAAAMMDD = (dia: string) => dia.replace(/-/g, "");

/** La ventana de fechas (AAAAMMDD, inclusiva) en la que se busca el movimiento de MP de un pago. */
export function ventanaDeAcreditacion(fechaPago: string, destino?: DestinoDelPago | null): { desde: string; hasta: string } | null {
  if (!esDiaReal(fechaPago)) return null;
  const dias = destino === "A_DEPOSITAR" ? DIAS_PARA_DEPOSITAR_CHEQUE : DIAS_PARA_ACREDITAR;
  return { desde: aAAAAMMDD(sumarDias(fechaPago, -DIAS_ANTES)), hasta: aAAAAMMDD(sumarDias(fechaPago, dias)) };
}

const normal = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Los movimientos de MP que pueden ser la acreditación de este pago: mismo monto al centavo, dentro
 * de la ventana, enganchables (`esEnganchable`: ni descartados ni facturados) y no enganchados ya a
 * otro pago (`usados`). Si el pago tiene referencia y alguno la
 * menciona (en la referencia, la descripción o la contraparte), quedan sólo esos. Por fecha. PURA.
 */
export function candidatosDeAcreditacion(pago: PagoParaAcreditar, movimientos: readonly MovimientoMp[], usados: ReadonlySet<string>): MovimientoMp[] {
  const v = ventanaDeAcreditacion(pago.fecha, pago.destino);
  if (!v || pago.montoCentavos <= 0) return [];
  const posibles = movimientos
    .filter((m) => !usados.has(m.id) && esEnganchable(m) && m.montoCentavos === pago.montoCentavos && m.fecha >= v.desde && m.fecha <= v.hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  const ref = normal(pago.referencia);
  if (ref.length >= 3) {
    const conRef = posibles.filter((m) => [m.referencia, m.descripcion, m.contraparte].some((x) => normal(x).includes(ref)));
    if (conRef.length > 0) return conRef;
  }
  return posibles;
}

/**
 * Las fechas de pago (AAAA-MM-DD, inclusivas) cuya ventana de acreditación puede incluir un movimiento
 * de MP de este día (AAAAMMDD): la inversa de `ventanaDeAcreditacion` para destino Mercado Pago (10
 * días). Sirve también para el día de confirmación de un pago acreditado a mano (sin movimiento),
 * cheques incluidos: su ventana corre desde ese día. Un cheque PENDIENTE no frena la emisión (entra a
 * MP recién cuando una persona confirma el depósito); confirmado a mano, sí. Sirve para buscar los
 * pagos de un crédito (`pagoPendienteDelCreditoMp`); el chequeo fino lo hace
 * `candidatosDeAcreditacion`. `null` si la fecha no es un día real. PURA.
 */
export function fechasDePagoDelMovimiento(fechaMovimiento: string): { desde: string; hasta: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(fechaMovimiento ?? ""));
  if (!m) return null;
  const dia = `${m[1]}-${m[2]}-${m[3]}`;
  if (!esDiaReal(dia)) return null;
  return { desde: sumarDias(dia, -DIAS_PARA_ACREDITAR), hasta: sumarDias(dia, DIAS_ANTES) };
}

/** El comienzo del motivo de `motivoDeAcreditacionPendiente` (para reconocerlo al aprobar). */
export const PREFIJO_ACREDITACION_PENDIENTE = "Vouchers: puede ser la plata del pago de la administración ";

/**
 * El motivo con que un crédito de MP que puede ser la acreditación de un pago pendiente de la
 * administración sale de la facturación automática (pasa a «revision»): la plata de vouchers no se
 * factura (decisión del dueño). NO lleva `MARCA_ENGANCHE`: sigue enganchable (`esEnganchable`).
 */
export function motivoDeAcreditacionPendiente(pagoId: string): string {
  return `${PREFIJO_ACREDITACION_PENDIENTE}${pagoId}, pendiente de acreditación: no se factura sola. Si es esa plata, confirmá la acreditación en Vouchers; si es una venta, aprobala: queda confirmada como venta y la acreditación ya no la toma.`;
}

/** ¿Está en revisión por un pago de la administración pendiente? PURA. */
export function esPorAcreditacionPendiente(motivoRevision: string | null | undefined): boolean {
  return String(motivoRevision ?? "").startsWith(PREFIJO_ACREDITACION_PENDIENTE);
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
  | { estado: "pendiente"; destino: "MP" | "A_DEPOSITAR"; candidatos: number; candidato: MovimientoMp | null }
  | { estado: "acreditado"; via: "mp" | "manual"; movimientoId: string | null; dia: string; cheque: boolean }
  | { estado: "rechazado"; depositado: boolean; motivo: string; dia: string };

/** Lo que guarda el AuditLog de la acreditación, leído sin confiar en su forma. PURA. */
export function leerAcreditacion(changes: unknown): { via: "mp" | "manual"; movimientoId: string | null; pagoId: string | null } {
  const c = (changes && typeof changes === "object" ? changes : {}) as Record<string, unknown>;
  const movimientoId = typeof c.movimientoId === "string" && c.movimientoId ? c.movimientoId : null;
  return { via: c.via === "mp" && movimientoId ? "mp" : "manual", movimientoId, pagoId: typeof c.pagoId === "string" ? c.pagoId : null };
}

/** El detalle del ingreso en el libro de caja. PURA. */
export function detalleDelIngreso(p: { liquidacion?: { desde: string; hasta: string } | null; referencia: string | null; destino: DestinoDelPago }): string {
  const fecha = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const que = p.liquidacion
    ? `Vouchers: pago de la administración, liquidación del ${fecha(p.liquidacion.desde)} al ${fecha(p.liquidacion.hasta)}`
    : "Vouchers: pago a cuenta de la administración";
  const ref = p.referencia?.trim() ? ` · ${p.referencia.trim()}` : "";
  const cola = p.destino === "MP" ? " · a acreditar en Mercado Pago" : p.destino === "A_DEPOSITAR" ? " · cheque depositado en Mercado Pago" : "";
  return `${que}${ref}${cola}`;
}
