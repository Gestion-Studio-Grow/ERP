// ============================================================================
// COMPRAS CON FACTURA DEL MES — el listado exportable para el libro de IVA compras (PURO).
// ============================================================================
//
// Una fila por comprobante, con el IVA abierto por alícuota. Las notas de crédito van en
// negativo (restan). Formato argentino (`;`, coma decimal) y a salvo de fórmulas: csv-ar.ts.

import { BOM, filaCsv, pesosCsv } from "@/lib/libros/csv-ar";
import {
  ALICUOTAS_RECIBIDAS,
  discriminaIva,
  esNotaDeCreditoRecibida,
  nombreDelTipo,
  type LineaIvaRecibida,
} from "./recibidos-formato";

export interface FilaExportable {
  fecha: string; // AAAAMMDD
  tipo: number;
  puntoVenta: number;
  numero: number;
  cuitEmisor: string;
  emisor: string;
  neto: number;
  noGravado: number;
  exento: number;
  iva: number;
  otrosTributos: number;
  total: number;
  desglose: LineaIvaRecibida[] | null;
  aRevisar: string | null;
}

const fechaAr = (f: string) => (/^\d{8}$/.test(f) ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : f);

export function csvComprasConFactura(filas: readonly FilaExportable[]): string {
  const alicuotas = ALICUOTAS_RECIBIDAS.filter((a) => a.porcentaje > 0);
  const lineas = [
    filaCsv(
      "Fecha",
      "Comprobante",
      "Punto de venta",
      "Número",
      "CUIT del emisor",
      "Emisor",
      "Neto gravado",
      "No gravado",
      "Exento",
      ...alicuotas.flatMap((a) => [`Neto ${a.etiqueta}`, `IVA ${a.etiqueta}`]),
      "IVA sin alícuota (a revisar)",
      "IVA crédito fiscal",
      "Otros tributos",
      "Total",
      "A revisar",
    ),
  ];
  for (const f of filas) {
    const s = esNotaDeCreditoRecibida(f.tipo) ? -1 : 1;
    const $ = (n: number) => pesosCsv(s * n);
    const linea = (id: number) => f.desglose?.find((l) => l.alicuotaId === id);
    const sinAlicuota = discriminaIva(f.tipo) && f.desglose == null ? f.iva : 0;
    lineas.push(
      filaCsv(
        fechaAr(f.fecha),
        nombreDelTipo(f.tipo),
        String(f.puntoVenta).padStart(5, "0"),
        String(f.numero).padStart(8, "0"),
        f.cuitEmisor,
        f.emisor,
        $(f.neto),
        $(f.noGravado),
        $(f.exento),
        ...alicuotas.flatMap((a) => [$(linea(a.id)?.base ?? 0), $(linea(a.id)?.importe ?? 0)]),
        $(sinAlicuota),
        $(f.iva),
        $(f.otrosTributos),
        $(f.total),
        f.aRevisar ?? "",
      ),
    );
  }
  return BOM + lineas.join("\r\n") + "\r\n";
}
