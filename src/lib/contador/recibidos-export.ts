// ============================================================================
// COMPRAS CON FACTURA DEL MES — el listado exportable para el libro de IVA compras (PURO).
// ============================================================================
//
// Una fila por comprobante, con el IVA abierto por alícuota. Las notas de crédito van en
// negativo (restan). Formato argentino (`;`, coma decimal) y a salvo de fórmulas: csv-ar.ts.

import { BOM, filaCsv, pesosCsv } from "@/lib/libros/csv-ar";
import {
  ALICUOTAS_RECIBIDAS,
  creditoFiscalDelRecibido,
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
      "IVA sin desglose (suma)",
      "IVA a revisar (no suma)",
      "IVA crédito fiscal",
      "Otros tributos",
      "Total",
      "A revisar",
    ),
  ];
  // Por fila, lo que suma: IVA por alícuota + «IVA sin desglose (suma)» = «IVA crédito fiscal». Lo
  // marcado va entero a «IVA a revisar (no suma)», tenga o no desglose: es lo que dice la pantalla.
  for (const f of filas) {
    const s = esNotaDeCreditoRecibida(f.tipo) ? -1 : 1;
    const $ = (n: number) => pesosCsv(s * n);
    const marcada = f.aRevisar != null;
    const linea = (id: number) => (marcada ? undefined : f.desglose?.find((l) => l.alicuotaId === id));
    const conIva = discriminaIva(f.tipo);
    const sinDesglose = conIva && !marcada && f.desglose == null ? f.iva : 0;
    const aRevisar = conIva && marcada ? f.iva : 0;
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
        $(sinDesglose),
        $(aRevisar),
        // La regla única (QA vuelta 5: acá sumaba la fila «a revisar» y la pantalla no). Ya trae el signo.
        pesosCsv(creditoFiscalDelRecibido(f)),
        $(f.otrosTributos),
        $(f.total),
        f.aRevisar ?? "",
      ),
    );
  }
  return BOM + lineas.join("\r\n") + "\r\n";
}
