// MIA-50 T05 · O30: el IVA crédito del mes para el contador. Aparte de comprobantes-core porque ese lo usa el navegador.
import { textoAlCentavo } from "@/lib/dinero/redondeo";
import { csvField } from "@/lib/report-csv";

/** Centavos → «1210,00» (coma decimal, sin separador de miles) para la planilla del contador. */
const importeCsv = (c: number): string => textoAlCentavo(c / 100).replace(".", ",");

/** IVA crédito del mes como CSV «;» (Excel es-AR): un renglón por comprobante y el total al final. */
export function csvIvaCredito(mes: string, renglones: readonly { fecha: Date; tipo: string; numero: string; proveedor: string; cuit: string | null; neto: number; iva: number }[]): string {
  const fila = (...xs: (string | number)[]) => xs.map(csvField).join(";");
  const fecha = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });
  const neto = renglones.reduce((s, r) => s + r.neto, 0);
  const iva = renglones.reduce((s, r) => s + r.iva, 0);
  return [
    fila("IVA crédito fiscal", mes),
    fila("Fecha", "Tipo", "Número", "Proveedor", "CUIT", "Neto gravado", "IVA"),
    ...renglones.map((r) => fila(fecha(r.fecha), r.tipo, r.numero, r.proveedor, r.cuit ?? "", importeCsv(r.neto), importeCsv(r.iva))),
    fila("Total", "", "", "", "", importeCsv(neto), importeCsv(iva)),
  ].join("\r\n") + "\r\n";
}
