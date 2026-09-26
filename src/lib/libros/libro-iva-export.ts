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

import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { alicuotaCsv, filaCsv, pesosCsv } from "./csv-ar";
import { bordesDelMes, diaLegible, etiquetaDelMes, type MesKey } from "./fecha-fiscal";
import { muestraPosicionIva, type LibroIva } from "./libro-iva";
import { avisoDelLibroFacturaAFuera } from "@/lib/fiscal/regimen-factura-a";

/**
 * «Negocio A (punto de venta 3) y Negocio B (punto de venta 4)»: los locales del mismo CUIT que suma el
 * libro, o null si es uno solo. La misma lista en el CSV, el paquete y la pantalla (AvisosDelLibro). PURA.
 */
export function listaDeLocalesDelLibro(negocios: LibroIva["negocios"]): string | null {
  if (!negocios || negocios.length < 2) return null;
  return negocios.map((n) => `${n.nombre} (punto de venta ${n.puntoVenta ?? "sin cargar"})`).join(" y ");
}

/** Por qué las facturas de prueba van aparte. El mismo texto en el CSV y en la pantalla. */
export const EXPLICACION_FACTURAS_DE_PRUEBA = "CAE simulado del modo prueba: no se declaran ni cuentan para los topes";

export const TITULO_DESPUES_DEL_CONGELADO =
  "AUTORIZADOS POR ARCA DESPUÉS DEL CONGELADO (tienen fecha de este mes y no están en los totales: para sumarlos, reabrí el mes y volvé a congelar)";

/** Las líneas del libro, para usarlas sueltas (el paquete del mes las incluye). PURA. */
export function lineasLibroIva(libro: LibroIva): string[] {
  const { comprobantes, ventasSinComprobante, compras, resumen } = libro;
  const L: string[] = [];
  const facturaAFuera = avisoDelLibroFacturaAFuera(libro.facturaAFueraDelSistema);
  if (facturaAFuera) {
    L.push(filaCsv(facturaAFuera));
    L.push("");
  }
  const locales = listaDeLocalesDelLibro(libro.negocios);
  if (locales) {
    // Un CUIT con varios locales: el libro los suma (QA vuelta 6). Sin locales, la hoja no cambia.
    L.push(filaCsv("Locales del mismo CUIT que suma este libro", locales));
    L.push("");
  }

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
  const despues = libro.comprobantesDespuesDelCongelado ?? [];
  if (despues.length > 0) {
    // El FINAL es la foto del congelado (refutador, vuelta 4): lo que ARCA autorizó después, a la vista y sin sumar.
    L.push(filaCsv(TITULO_DESPUES_DEL_CONGELADO));
    L.push(filaCsv("Fecha", "Tipo", "Número", "Cliente", "Documento", "IVA", "Total"));
    for (const c of despues) L.push(filaCsv(c.fecha, c.tipo, c.numero, c.cliente, c.doc, pesosCsv(c.iva), pesosCsv(c.total)));
    L.push("");
  }
  const dePrueba = libro.comprobantesDePrueba ?? [];
  if (dePrueba.length > 0) {
    // QA vuelta 6: con CAE simulado entraban como reales. Aparte, a la vista y sin sumar.
    L.push(filaCsv(`FACTURAS DE PRUEBA (${EXPLICACION_FACTURAS_DE_PRUEBA})`));
    L.push(filaCsv("Fecha", "Tipo", "Número", "Cliente", "Documento", "Total"));
    for (const c of dePrueba) L.push(filaCsv(c.fecha, c.tipo, c.numero, c.cliente, c.doc, pesosCsv(c.total)));
    L.push("");
  }

  L.push(filaCsv("VENTAS SIN COMPROBANTE (control: no se declaran ni llevan IVA calculado)"));
  L.push(filaCsv("Fecha", "Tipo", "Referencia", "Cliente", "Total"));
  for (const v of ventasSinComprobante) L.push(filaCsv(v.fecha, v.tipo, v.numero, v.cliente, pesosCsv(v.total)));
  L.push(filaCsv("Subtotal sin comprobante", "", "", "", pesosCsv(resumen.sinComprobanteTotal)));
  L.push("");

  L.push(filaCsv("COMPRAS (control: sin la factura del proveedor no dan crédito fiscal)"));
  if (resumen.comprasConFacturaCount > 0 && muestraPosicionIva(resumen.condicion)) {
    // Un inscripto con facturas de proveedor cargadas (Mis Comprobantes Recibidos): neto gravado,
    // IVA crédito fiscal y total por renglón. Sin ninguna (CH hoy), la hoja sale igual que siempre.
    L.push(filaCsv("Fecha", "Proveedor", "Documento", "Número", "Neto gravado", "IVA crédito fiscal", "Percepciones y otros tributos", "Total"));
    for (const c of compras) {
      const conFactura = c.creditoIva !== undefined;
      L.push(
        filaCsv(
          c.fecha, c.proveedor, c.doc, c.numero,
          c.aRevisar ? "a revisar" : conFactura && c.netoGravado !== undefined ? pesosCsv(c.netoGravado) : "",
          c.aRevisar ? `a revisar, no suma: ${c.aRevisar}` : conFactura ? pesosCsv(c.creditoIva ?? 0) : "sin factura",
          c.otrosTributos !== undefined ? pesosCsv(c.otrosTributos) : "",
          pesosCsv(c.total),
        ),
      );
    }
    const neto = sumarAlCentavo(compras.map((c) => (c.creditoIva !== undefined && !c.aRevisar ? (c.netoGravado ?? 0) : 0)));
    L.push(filaCsv("Subtotal compras", "", "", "", pesosCsv(neto), pesosCsv(resumen.ivaCredito), pesosCsv(resumen.comprasOtrosTributos), pesosCsv(resumen.comprasTotal)));
  } else if (resumen.comprasConFacturaCount > 0) {
    L.push(filaCsv("Fecha", "Proveedor", "Documento", "Número", "Percepciones y otros tributos", "Total"));
    for (const c of compras) {
      L.push(filaCsv(c.fecha, c.proveedor, c.doc, c.numero, c.otrosTributos !== undefined ? pesosCsv(c.otrosTributos) : "", pesosCsv(c.total)));
    }
    L.push(filaCsv("Subtotal compras", "", "", "", pesosCsv(resumen.comprasOtrosTributos), pesosCsv(resumen.comprasTotal)));
    // Con facturas cargadas y sin ser inscripto, el renglón dice por qué no está el IVA.
    L.push(filaCsv("Nota", notaComprasSinCredito(resumen.condicion)));
  } else {
    L.push(filaCsv("Fecha", "Proveedor", "Documento", "Número", "Total"));
    for (const c of compras) L.push(filaCsv(c.fecha, c.proveedor, c.doc, c.numero, pesosCsv(c.total)));
    L.push(filaCsv("Subtotal compras", "", "", "", pesosCsv(resumen.comprasTotal)));
    // Sin facturas de proveedor (CH hoy) no se agrega nada: la hoja queda letra por letra como siempre.
  }
  L.push("");

  L.push(filaCsv("RESUMEN"));
  if (muestraPosicionIva(resumen.condicion)) {
    L.push(filaCsv("IVA débito (comprobantes emitidos)", pesosCsv(resumen.ivaDebito)));
    L.push(filaCsv("IVA crédito (facturas de proveedor)", pesosCsv(resumen.ivaCredito)));
    L.push(filaCsv(resumen.ivaSaldo >= 0 ? "Saldo IVA a pagar" : "Saldo IVA a favor", pesosCsv(Math.abs(resumen.ivaSaldo))));
    const n = resumen.comprasConFacturaCount;
    L.push(
      filaCsv(
        "Nota",
        n === 0
          ? "El crédito fiscal va en 0: las compras se cargan sin la factura del proveedor y sin ella no hay crédito. Sumá el crédito de las facturas de compra que tengas."
          : `El crédito fiscal sale del IVA de ${n === 1 ? "la factura de proveedor cargada" : `las ${n} facturas de proveedor cargadas`}, por la fecha de cada comprobante (la nota de crédito resta). Las compras cargadas sin factura no dan crédito.`,
      ),
    );
  } else if (resumen.condicion === "monotributo") {
    L.push(filaCsv("Condición", "Emite Factura C (monotributo): no liquida IVA."));
  } else {
    L.push(filaCsv("Condición", "No hay comprobantes con CAE: no se puede calcular la posición de IVA."));
  }
  if (resumen.comprasConFacturaCount > 0) {
    // QA vuelta 6, bloqueante 3: el paquete no traía las percepciones que la pantalla sí mostraba.
    L.push(filaCsv("Percepciones y otros tributos (facturas de proveedor)", pesosCsv(resumen.comprasOtrosTributos)));
    L.push(
      filaCsv(
        "Nota",
        "Es la columna «Otros tributos» de cada comprobante recibido: percepciones de IVA, de Ingresos Brutos y otros tributos, juntos como los trae ARCA. Para imputarlos hay que ver cada comprobante.",
      ),
    );
  }
  if (resumen.dePruebaCount > 0) {
    L.push(filaCsv("Facturas de prueba", `${resumen.dePruebaCount} con CAE simulado: no se declaran y no suman al débito.`));
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

/** Por qué las facturas de proveedor no dan crédito fiscal a quien no es inscripto. PURA. */
function notaComprasSinCredito(condicion: LibroIva["resumen"]["condicion"]): string {
  return condicion === "monotributo"
    ? "Un monotributista no computa crédito fiscal: el IVA de las facturas A de sus proveedores es parte del costo, y cada compra va por el total."
    : "Todavía no hay comprobantes con CAE: no se sabe si el negocio es responsable inscripto, así que el IVA de las facturas de proveedor no se toma como crédito fiscal. Cada compra va por el total.";
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
