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
  const dias = ventanaDeFechaArca(concepto);
  if (fechaCobro >= restarDiasFiscal(hoy, dias)) return null;
  const que = concepto === 1 ? "productos" : "servicios";
  return (
    `El cobro es del ${diaLegible(`${fechaCobro.slice(0, 4)}-${fechaCobro.slice(4, 6)}-${fechaCobro.slice(6, 8)}`)} y ARCA acepta facturas de ${que} con hasta ${dias} días de atraso: ` +
    `no se emitió solo. Emitila a mano con la fecha que corresponda o consultalo con tu contador.`
  );
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
