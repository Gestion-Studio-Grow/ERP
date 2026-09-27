// ============================================================================
// VARIOS MEDIOS DE PAGO EN UNA VENTA — "pago $10.000 con Mercado Pago y el resto en efectivo".
// ============================================================================
//
// LA REGLA:
//   · Lo que no es efectivo se cobra EXACTO: no hay vuelto de Mercado Pago ni de una
//     transferencia. Si esos pagos suman más que el total, es un error de tipeo.
//   · El efectivo paga lo que falta y puede venir de más: la diferencia es el VUELTO, que sale
//     del cajón. Al libro va lo que se queda (lo que faltaba), no lo que entregó el cliente.
//   · Sin efectivo, los pagos tienen que sumar exacto el total.
//   · Un medio aparece una sola vez (dos renglones de Mercado Pago se suman).
//
// Devuelve los ASIENTOS: lo que entra al libro por cada medio, que suma EXACTO el total. Con
// un solo asiento la venta es la de siempre (un medio); con dos o más, es un pago mixto.
//
// PURO, en centavos enteros. Lo usan la caja (para mostrar el vuelto y habilitar "Cobrar") y la
// acción del servidor (que no confía en lo que calculó la pantalla).

import { centavosDe } from "@/lib/dinero/redondeo";
import { fmtMoneyARS } from "@/components/ui/format";
import { etiquetaDeMedio, leerMedioDeCobro, type MedioDeCobro } from "@/lib/caja/medio-cobro";

export interface PagoIngresado {
  medio: MedioDeCobro;
  /** Lo que se cobra por ese medio. En efectivo, lo que ENTREGÓ el cliente. */
  monto: number;
}

export interface AsientoDePago {
  medio: MedioDeCobro;
  /** Lo que entra al libro por este medio. */
  monto: number;
}

export type RepartoDePagos =
  | { ok: true; asientos: AsientoDePago[]; vuelto: number; mixto: boolean }
  | { ok: false; error: string; falta?: number };

/** Máximo de medios en una venta: más es, casi seguro, un error de la pantalla. */
export const MAX_PAGOS = 4;

export function repartirPagos(total: number, pagos: readonly PagoIngresado[]): RepartoDePagos {
  const totalC = centavosDe(total);
  if (!(totalC > 0)) return { ok: false, error: "La venta no tiene importe para cobrar." };
  if (pagos.length === 0) return { ok: false, error: "Elegí cómo paga el cliente." };
  if (pagos.length > MAX_PAGOS) return { ok: false, error: `Hasta ${MAX_PAGOS} medios de pago por venta.` };

  const porMedio = new Map<MedioDeCobro, number>();
  for (const p of pagos) {
    const medio = leerMedioDeCobro(p.medio);
    if (!medio) return { ok: false, error: "Hay un medio de pago que no se reconoce: elegilo de nuevo." };
    const c = centavosDe(p.monto);
    if (!Number.isFinite(p.monto) || !(c > 0)) return { ok: false, error: `Poné cuánto paga con ${etiquetaDeMedio(medio)}.` };
    if (centavosDe(p.monto) / 100 !== p.monto) return { ok: false, error: "Los importes van con centavos como mucho." };
    porMedio.set(medio, (porMedio.get(medio) ?? 0) + c);
  }

  const efectivo = porMedio.get("EFECTIVO") ?? 0;
  const otros = [...porMedio.entries()].filter(([m]) => m !== "EFECTIVO");
  const sumaOtros = otros.reduce((s, [, c]) => s + c, 0);
  if (sumaOtros > totalC) {
    return { ok: false, error: `Lo que no es efectivo suma ${fmtMoneyARS(sumaOtros / 100)} y la venta es de ${fmtMoneyARS(total)}: con tarjeta, Mercado Pago o transferencia no hay vuelto.` };
  }
  const falta = totalC - sumaOtros;
  if (efectivo < falta) {
    return { ok: false, error: `Faltan ${fmtMoneyARS((falta - efectivo) / 100)} para completar el pago.`, falta: (falta - efectivo) / 100 };
  }
  if (efectivo > 0 && falta === 0) {
    return { ok: false, error: "Con lo que pagó por otros medios ya está cubierto: sacá el efectivo." };
  }

  const asientos: AsientoDePago[] = [];
  if (falta > 0) asientos.push({ medio: "EFECTIVO", monto: falta / 100 });
  for (const [medio, c] of otros) asientos.push({ medio, monto: c / 100 });
  return { ok: true, asientos, vuelto: (efectivo - falta) / 100, mixto: asientos.length > 1 };
}

/** El pago en palabras, para el ticket: "Efectivo $4.000 + Mercado Pago $10.000". */
export function textoDelPago(asientos: readonly AsientoDePago[]): string {
  return asientos.map((a) => `${etiquetaDeMedio(a.medio)} ${fmtMoneyARS(a.monto)}`).join(" + ");
}

const ORDEN_MEDIOS: readonly MedioDeCobro[] = ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"];

/**
 * El medio PRINCIPAL de un pago: el de más plata; en empate, el primero de Efectivo, Mercado
 * Pago, Transferencia. Es el que lleva la venta (`Order.paymentMethod`) para que siga contando
 * como venta cobrada con medio; el detalle queda en sus cobros. PURA.
 */
export function medioPrincipal(asientos: readonly AsientoDePago[]): MedioDeCobro | null {
  let mejor: AsientoDePago | null = null;
  for (const a of asientos) {
    if (
      !mejor ||
      centavosDe(a.monto) > centavosDe(mejor.monto) ||
      (centavosDe(a.monto) === centavosDe(mejor.monto) && ORDEN_MEDIOS.indexOf(a.medio) < ORDEN_MEDIOS.indexOf(mejor.medio))
    ) {
      mejor = a;
    }
  }
  return mejor?.medio ?? null;
}
