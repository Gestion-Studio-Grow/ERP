// ============================================================================
// Orden de pago (MIA-50 T05 · O33): agrupa pagos a UN proveedor y dice qué comprobantes (y cuotas) cancela. El pago
// parcial deja saldo. Quien cargó un comprobante de la orden no la aprueba. PURO: el saldo y las reglas; la base y la
// caja, `acciones-orden-pago.ts`.
// ============================================================================

import { textoAlCentavo } from "@/lib/dinero/redondeo";
import { MEDIO_LABEL, type MedioPago } from "./core";

export const SERIE_ORDEN_PAGO = "orden-pago";
export type EstadoOrden = "PENDIENTE" | "PAGADA" | "ANULADA";
export const ESTADO_ORDEN_LABEL: Record<EstadoOrden, string> = { PENDIENTE: "Para aprobar y pagar", PAGADA: "Pagada", ANULADA: "Anulada" };

/** «OP 00000012». PURA. */
export const numeroDeOrden = (n: number): string => `OP ${String(n).padStart(8, "0")}`;

export interface ComprobanteParaOrden {
  id: string;
  supplierId: string;
  totalCentavos: number;
  anulado: boolean;
  cargadoPorId: string;
  /** Lo que ya toman las órdenes vivas (pendientes o pagadas). */
  enOrdenesCentavos: number;
  /** Las cuotas enlazadas, con lo que ya toman las órdenes vivas por cada una. `pagada`: ya figura pagada (a mano o por
   *  otra orden), leída con el candado de la cuota. */
  cuotas: readonly { id: string; montoCentavos: number; enOrdenesCentavos: number; pagada?: boolean }[];
}

export interface LineaDeOrden {
  comprobanteId: string;
  cuotaId: string | null;
  importeCentavos: number;
}

/** Lo que falta pagar de un comprobante: el total menos lo que ya toman las órdenes vivas. Nunca negativo. PURA. */
export const saldoDe = (totalCentavos: number, enOrdenesCentavos: number): number => Math.max(0, totalCentavos - enOrdenesCentavos);

/** Valida la orden contra los comprobantes (leídos con candado en la misma transacción). `null` = se puede crear. PURA. */
export function errorDeOrden(supplierId: string, lineas: readonly LineaDeOrden[], comprobantes: ReadonlyMap<string, ComprobanteParaOrden>): string | null {
  if (!supplierId) return "Elegí el proveedor.";
  if (lineas.length === 0) return "Elegí al menos un comprobante para pagar.";
  const tomado = new Map<string, number>();
  const tomadoCuota = new Map<string, number>();
  for (const l of lineas) {
    const c = comprobantes.get(l.comprobanteId);
    if (!c) return "Uno de los comprobantes no existe.";
    if (c.supplierId !== supplierId) return "Una orden de pago es para un solo proveedor: hay un comprobante de otro.";
    if (c.anulado) return "Uno de los comprobantes está anulado.";
    if (!Number.isInteger(l.importeCentavos) || l.importeCentavos <= 0) return "Cada importe a pagar tiene que ser mayor que cero.";
    const nuevo = (tomado.get(c.id) ?? 0) + l.importeCentavos;
    if (nuevo > saldoDe(c.totalCentavos, c.enOrdenesCentavos)) return `El importe pasa lo que falta pagar del comprobante (${textoAlCentavo(saldoDe(c.totalCentavos, c.enOrdenesCentavos) / 100).replace(".", ",")}).`;
    tomado.set(c.id, nuevo);
    if (l.cuotaId) {
      const q = c.cuotas.find((x) => x.id === l.cuotaId);
      if (!q) return "Esa cuota no está enlazada a ese comprobante.";
      if (q.pagada) return "Esa cuota ya está pagada: no se paga otra vez con una orden.";
      const nuevaQ = (tomadoCuota.get(q.id) ?? 0) + l.importeCentavos;
      if (nuevaQ > Math.max(0, q.montoCentavos - q.enOrdenesCentavos)) return "El importe pasa lo que falta pagar de esa cuota.";
      tomadoCuota.set(q.id, nuevaQ);
    }
  }
  return null;
}

/** Separación de funciones: quien cargó un comprobante de la orden no la aprueba ni la paga. PURA. */
export function errorDeAprobacion(aprobadorId: string, cargadores: readonly string[]): string | null {
  if (cargadores.includes(aprobadorId)) return "Cargaste un comprobante de esta orden: la aprueba y la paga otra persona de Administración.";
  return null;
}

// ── MIA-199 (veedor P1 «Aurora», paso 6) ────────────────────────────────────────────────────────────────────────────

/** P6-1: el aviso al crear la orden dice la regla que el sistema aplica (`errorDeAprobacion`), no otra. PURA. */
export const avisoDeOrdenCreada = (numero: number): string =>
  `${numeroDeOrden(numero)} creada: la aprueba y la paga alguien de Administración que no haya cargado sus comprobantes.`;

/**
 * P6: lo que pide el pago de una orden. Por transferencia, cheque o Mercado Pago sale de una cuenta: si el negocio tiene
 * cuentas cargadas, hay que elegirla (si no, el libro baja y la cuenta no). En efectivo sale de la caja. La fecha del
 * pago es opcional (vacía = hoy), con formato AAAA-MM-DD y no posterior a hoy (en Argentina). PURA.
 */
export function errorDelPago(p: { medio: string; cuentaId: string | null; hayCuentas: boolean; fecha: string | null; hoy: string }): string | null {
  if (p.medio !== "EFECTIVO" && p.hayCuentas && !p.cuentaId) return "Elegí la cuenta de la que sale el pago.";
  if (p.fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha) || Number.isNaN(Date.parse(`${p.fecha}T00:00:00Z`))) return "La fecha del pago no se entiende: elegila en el calendario.";
    if (p.fecha > p.hoy) return "La fecha del pago no puede ser posterior a hoy.";
  }
  return null;
}

/** P6: «caja» sólo si el pago es en efectivo; si no, la cuenta (la elegida o «la que elijas»). PURA. */
export function textosDelPago(medio: string, cuenta: string | null): { sale: string; anular: string } {
  if (medio === "EFECTIVO") return { sale: "Sale de la caja, en efectivo.", anular: "Anular la orden (vuelve la plata a la caja)" };
  const etiqueta = MEDIO_LABEL[medio as MedioPago] ?? medio;
  return cuenta
    ? { sale: `Sale de la cuenta «${cuenta}», con ${etiqueta}.`, anular: `Anular la orden (vuelve la plata a «${cuenta}»)` }
    : { sale: `Sale de la cuenta que elijas, con ${etiqueta}.`, anular: "Anular la orden (se revierte el pago)" };
}
