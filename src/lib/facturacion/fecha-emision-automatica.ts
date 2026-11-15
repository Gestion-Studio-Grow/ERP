/**
 * GSG-FACT-011 · H4 + H5 · La fecha, la ventana de ARCA y el concepto de la emisión AUTOMÁTICA
 * (lote del extracto y aviso/sincronización de Mercado Pago).
 *
 *   · H4 · ARCA exige fechas correlativas por punto de venta y tipo: un comprobante no puede llevar
 *     fecha anterior al último emitido. El lote fechaba con la fecha del movimiento y, si ese día ya
 *     había salido una manual con la fecha de hoy, ARCA lo rechazaba. Fecha = máx(cobro, última
 *     factura no rechazada del mismo punto de venta y tipo), leída DENTRO de la transacción de la
 *     factura y bajo el candado del cupo (`facturita-cupo`), que toman todas las emisiones.
 *     Si el cobro cae fuera de la ventana de ARCA (5 días productos, 10 servicios:
 *     `ventanaDeFechaArca`), no se emite: va a revisión con motivo.
 *   · H5 · El concepto ya no es fijo en 1: el del movimiento, si no el del negocio, si no 1. Con
 *     servicios (2 o 3), período = mes del cobro y vencimiento = máx(cobro, factura).
 *
 * REGLAS PROVISIONALES A CONFIRMAR con la contadora: (a) se fecha con la última factura del punto
 * de venta y no con la fecha del cobro; (b) la ventana se cuenta desde el COBRO hasta hoy, aunque la
 * fecha del comprobante termine siendo posterior; (c) el período de servicio es el mes calendario
 * del cobro y el vencimiento el mayor entre cobro y factura.
 */

import type { CreateInvoiceInput, InvoiceTx } from "@/lib/invoice-core";
import { ventanaDeFechaArca } from "@/lib/facturita-core";
import { diaLegible, diasDelMes, restarDiasFiscal } from "@/lib/libros/fecha-fiscal";

export type ConceptoArca = 1 | 2 | 3;

const esConcepto = (c: unknown): c is ConceptoArca => c === 1 || c === 2 || c === 3;

/** H5 · El primer concepto válido de ARCA de la lista (movimiento, negocio…); si ninguno, productos. */
export function conceptoDeLaEmision(...candidatos: (number | null | undefined)[]): ConceptoArca {
  for (const c of candidatos) if (esConcepto(c)) return c;
  return 1;
}

const mayor = (a: string, b: string) => (a >= b ? a : b);

/** H5 · Período (mes calendario del cobro) y vencimiento, sólo con servicios. Fechas AAAAMMDD. */
export function fechasDeServicio(
  concepto: number,
  fechaCobro: string,
  fechaFactura: string,
): Pick<CreateInvoiceInput, "servicioDesde" | "servicioHasta" | "vencimientoPago"> {
  if (concepto !== 2 && concepto !== 3) return {};
  const aaaamm = fechaCobro.slice(0, 6);
  const ultimoDia = String(diasDelMes(`${aaaamm.slice(0, 4)}-${aaaamm.slice(4, 6)}`)).padStart(2, "0");
  return { servicioDesde: `${aaaamm}01`, servicioHasta: `${aaaamm}${ultimoDia}`, vencimientoPago: mayor(fechaCobro, fechaFactura) };
}

/** H4 · La fecha del comprobante: la del cobro, salvo que ya haya una factura posterior en el punto de venta. */
export function fechaDelComprobante(fechaCobro: string, ultimaFactura: string | null): string {
  return ultimaFactura ? mayor(fechaCobro, ultimaFactura) : fechaCobro;
}

/** H4 · `null` si el cobro está dentro de la ventana de ARCA; si no, el motivo para la revisión. */
export function motivoFueraDeVentanaArca(fechaCobro: string, hoy: string, concepto: number): string | null {
  // R5 · Un cobro con fecha posterior a hoy (reloj inyectado) no sale solo: un dato raro del
  // extracto o del pago no se convierte en una factura con fecha futura.
  if (fechaCobro > hoy) {
    return (
      `El cobro tiene fecha posterior a hoy (${diaLegible(`${fechaCobro.slice(0, 4)}-${fechaCobro.slice(4, 6)}-${fechaCobro.slice(6, 8)}`)}): ` +
      `no se emitió solo. Revisá la fecha del movimiento y emitila a mano si corresponde.`
    );
  }
  const dias = ventanaDeFechaArca(concepto);
  if (fechaCobro >= restarDiasFiscal(hoy, dias)) return null;
  const que = concepto === 1 ? "productos" : "servicios";
  return (
    `El cobro es del ${diaLegible(`${fechaCobro.slice(0, 4)}-${fechaCobro.slice(4, 6)}-${fechaCobro.slice(6, 8)}`)} y ARCA acepta facturas de ${que} con hasta ${dias} días de atraso: ` +
    `no se emitió solo. Emitila a mano con la fecha que corresponda o consultalo con tu contador.`
  );
}

/**
 * R8 · Tolerancia (en días) entre la fecha de un movimiento de banco y la del pago de Mercado Pago
 * de su referencia para tomarlos como el mismo cobro: la ventana más ancha de ARCA (servicios), que
 * cubre la acreditación unos días después y la factura de MP corrida hacia adelante (H4).
 */
export const DIAS_TOLERANCIA_PAGO_MP = 10;

const diaUTC = (aaaammdd: string) => Date.UTC(Number(aaaammdd.slice(0, 4)), Number(aaaammdd.slice(4, 6)) - 1, Number(aaaammdd.slice(6, 8)));

/**
 * R8 · ¿Un movimiento de un extracto que NO es de Mercado Pago (o que no se reconoció como tal) es
 * el pago de MP cuyo id trae en la referencia? Sólo con el MISMO importe (al centavo) y fechas a no
 * más de `DIAS_TOLERANCIA_PAGO_MP` días. Una referencia de banco que choca con un id de pago por
 * casualidad no ata dos cobros distintos; un export de MP mal reconocido no factura dos veces.
 */
export function mismoCobroQueElPagoMP(
  mov: { importe: number; fecha: string },
  pago: { importe: number; fecha: string },
): boolean {
  if (Math.round(Math.abs(mov.importe) * 100) !== Math.round(Math.abs(pago.importe) * 100)) return false;
  if (!/^\d{8}$/.test(mov.fecha) || !/^\d{8}$/.test(pago.fecha)) return false;
  return Math.abs(diaUTC(mov.fecha) - diaUTC(pago.fecha)) <= DIAS_TOLERANCIA_PAGO_MP * 86_400_000;
}

/** El tipo de factura a consumidor final según el emisor: C (11) monotributo/exento, B (6) inscripto. */
export function tipoFacturaAConsumidorFinal(condicionIva: string | null | undefined): number | null {
  if (condicionIva === "MONOTRIBUTO" || condicionIva === "EXENTO") return 11;
  if (condicionIva === "RESPONSABLE_INSCRIPTO") return 6;
  return null;
}

/**
 * H4 · La fecha de la última factura (no nota de crédito) no rechazada del punto de venta y tipo.
 * Las pendientes todavía no tienen tipo (lo escribe la autorización): cuentan igual (conservador,
 * la fecha sólo puede ir hacia adelante). Llamar con el candado del cupo tomado.
 */
export async function ultimaFechaDelPuntoDeVentaEnTx(
  tx: InvoiceTx,
  tenantId: string,
  puntoVenta: number,
  tipo: number | null,
): Promise<string | null> {
  const f = await tx.invoice.findFirst({
    where: {
      tenantId,
      puntoVenta,
      status: { not: "REJECTED" },
      comprobanteAsociadoId: null,
      ...(tipo != null ? { OR: [{ tipoComprobante: tipo }, { tipoComprobante: null }] } : {}),
    },
    orderBy: { fecha: "desc" },
    select: { fecha: true },
  });
  return f?.fecha ?? null;
}

/**
 * H4 + H5 · El ajuste del comprobante para `facturarCobros(…, { ajustarComprobante })`: corre dentro
 * de la transacción de la factura, con el candado del cupo tomado. Pone la fecha correlativa y, con
 * servicios, el período y el vencimiento.
 */
export function ajustarFechaAutomatica(fechaCobro: string): (tx: InvoiceTx, input: CreateInvoiceInput) => Promise<CreateInvoiceInput> {
  return async (tx, input) => {
    const ultima = await ultimaFechaDelPuntoDeVentaEnTx(
      tx,
      input.tenantId,
      input.emisor.puntoVenta,
      tipoFacturaAConsumidorFinal(input.emisor.condicionIva),
    );
    const fecha = fechaDelComprobante(fechaCobro, ultima);
    return { ...input, fecha, ...fechasDeServicio(input.concepto, fechaCobro, fecha) };
  };
}
