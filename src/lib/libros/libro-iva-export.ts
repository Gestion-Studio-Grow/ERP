// ============================================================================
// Export ESTRUCTURADO del Libro IVA del mes para el contador (ADR-060 D7). PURO.
// ============================================================================
//
// No es un volcado plano: tiene la estructura del libro. Tres bloques con su subtotal
// (comprobantes emitidos, ventas sin comprobante y compras) y un RESUMEN. Los dos bloques
// de control dicen en su título que no se declaran, para que nadie los sume al débito.
// La posición de IVA sale sólo para un Responsable Inscripto (`muestraPosicionIva`).
//
// Devuelve el texto SIN BOM: la ruta HTTP lo antepone (`BOM`, csv-ar.ts). Líneas con CRLF,
// igual que el paquete del mes y el libro de caja.

import { alicuotaCsv, filaCsv, pesosCsv } from "./csv-ar";
import { bordesDelMes, diaLegible, etiquetaDelMes, type MesKey } from "./fecha-fiscal";
import { muestraPosicionIva, type LibroIva } from "./libro-iva";

/** Las líneas del libro, para usarlas sueltas (el paquete del mes las incluye). PURA. */
export function lineasLibroIva(libro: LibroIva): string[] {
  const { comprobantes, ventasSinComprobante, compras, resumen } = libro;
  const L: string[] = [];

  L.push(filaCsv("COMPROBANTES EMITIDOS (con CAE: es lo que se declara)"));
  L.push(filaCsv("Fecha", "Tipo", "Número", "Cliente", "Documento", "Neto", "Alícuotas", "IVA", "Total", "Observación"));
  for (const c of comprobantes) {
    L.push(
      filaCsv(
        c.fecha,
        c.tipo,
        c.numero,
        c.cliente,
        c.doc,
        pesosCsv(c.neto),
        c.alicuotas.map((a) => alicuotaCsv(a.alicuota)).join(" y "),
        pesosCsv(c.iva),
        pesosCsv(c.total),
        c.anuladaSinNotaDeCredito ? "Venta anulada: falta la nota de crédito" : "",
      ),
    );
  }
  L.push(filaCsv("Subtotal comprobantes", "", "", "", "", pesosCsv(resumen.comprobantesNeto), "", pesosCsv(resumen.ivaDebito), pesosCsv(resumen.comprobantesTotal), ""));
  if (resumen.porAlicuota.length > 0) {
    L.push("");
    L.push(filaCsv("IVA POR ALÍCUOTA"));
    L.push(filaCsv("Alícuota", "Neto", "IVA"));
    for (const a of resumen.porAlicuota) L.push(filaCsv(alicuotaCsv(a.alicuota), pesosCsv(a.neto), pesosCsv(a.iva)));
  }
  L.push("");

  L.push(filaCsv("VENTAS SIN COMPROBANTE (control: no se declaran ni llevan IVA calculado)"));
  L.push(filaCsv("Fecha", "Tipo", "Referencia", "Cliente", "Total"));
  for (const v of ventasSinComprobante) L.push(filaCsv(v.fecha, v.tipo, v.numero, v.cliente, pesosCsv(v.total)));
  L.push(filaCsv("Subtotal sin comprobante", "", "", "", pesosCsv(resumen.sinComprobanteTotal)));
  L.push("");

  L.push(filaCsv("COMPRAS (control: sin la factura del proveedor no dan crédito fiscal)"));
  L.push(filaCsv("Fecha", "Proveedor", "Documento", "Número", "Total"));
  for (const c of compras) L.push(filaCsv(c.fecha, c.proveedor, c.doc, c.numero, pesosCsv(c.total)));
  L.push(filaCsv("Subtotal compras", "", "", "", pesosCsv(resumen.comprasTotal)));
  L.push("");

  L.push(filaCsv("RESUMEN"));
  if (muestraPosicionIva(resumen.condicion)) {
    L.push(filaCsv("IVA débito (comprobantes emitidos)", pesosCsv(resumen.ivaDebito)));
    L.push(filaCsv("IVA crédito (facturas de proveedor)", pesosCsv(resumen.ivaCredito)));
    L.push(filaCsv(resumen.ivaSaldo >= 0 ? "Saldo IVA a pagar" : "Saldo IVA a favor", pesosCsv(Math.abs(resumen.ivaSaldo))));
    L.push(
      filaCsv(
        "Nota",
        "El crédito fiscal va en 0: las compras se cargan sin la factura del proveedor y sin ella no hay crédito. Sumá el crédito de las facturas de compra que tengas.",
      ),
    );
  } else if (resumen.condicion === "monotributo") {
    L.push(filaCsv("Condición", "Emite Factura C (monotributo): no liquida IVA."));
  } else {
    L.push(filaCsv("Condición", "No hay comprobantes con CAE: no se puede calcular la posición de IVA."));
  }
  if (resumen.anuladasSinNotaDeCredito > 0) {
    L.push(
      filaCsv(
        "Atención",
        `${resumen.anuladasSinNotaDeCredito} ${resumen.anuladasSinNotaDeCredito === 1 ? "venta anulada tiene" : "ventas anuladas tienen"} factura con CAE y ninguna nota de crédito: el débito del mes está inflado hasta que se emita.`,
      ),
    );
  }
  return L;
}

/**
 * El archivo del Libro IVA del mes, con su encabezado. `negocio` es el nombre que se ve en
 * la primera línea. PURA.
 */
export function armarExportLibroIva(libro: LibroIva, meta: { mes: MesKey; negocio?: string }): string {
  const b = bordesDelMes(meta.mes);
  const titulo = filaCsv(
    "Libro IVA",
    meta.negocio ?? "",
    `${etiquetaDelMes(meta.mes)} (del ${diaLegible(b.primerDia)} al ${diaLegible(b.ultimoDia)})`,
  );
  return [titulo, "", ...lineasLibroIva(libro)].join("\r\n") + "\r\n";
}
