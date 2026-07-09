// ============================================================================
// LIBRO IVA estructurado (Ventas + Compras) — capa VERDE de ADR-060 D7. PURO.
// ============================================================================
//
// "Libros / Exportar al contador" (J58), naming HONESTO (ADR-060 D7, ajuste 4 S5):
// NUNCA "Contabilidad" (prometería asientos que no existen). Es el Libro IVA con los
// campos que usa el contador/ARCA (tipo de comprobante, CUIT/doc, neto, alícuota, IVA,
// total), NO un CSV plano (que subvende).
//
// ⚠️ Capa VERDE = CERO schema nuevo. Deriva 100% de lo que YA existe:
//   - VENTAS: `Invoice` (comprobante ARCA, fiscalmente EXACTO) + `Order` (retail/mostrador)
//     + `Payment`/`Appointment` (servicios). Cubre los DOS caminos de venta (ajuste 5 S5:
//     que el libro no quede "ciego a la mitad").
//   - COMPRAS: `StockPurchase` (kind COMPRA).
// Las ventas/compras SIN comprobante fiscal se derivan al 21% (precio AR IVA-incluido):
//   neto = total / 1.21, iva = total − neto. Se marcan `fuente:"estimado"` (transparencia:
//   el contador ve qué es comprobante fiscal y qué es una estimación). El libro mayor formal
//   (`JournalEntry`) y el enlace Invoice→origen (dedupe exacto) son RESERVA/§C (ADR-060 D7/D10).

import { round2 } from "@/lib/round";

/** Alícuota general de IVA en AR (fracción). Las ventas/compras sin comprobante se estiman acá. */
export const IVA_ALICUOTA_GENERAL = 0.21;

/** De dónde sale la fila: comprobante fiscal real (Invoice) o estimación derivada del bruto. */
export type LibroIvaFuente = "comprobante" | "estimado";

export interface VentaRow {
  /** Fecha en ISO corto "YYYY-MM-DD" (ordena cronológicamente como string). */
  fecha: string;
  /** "Factura A/B/C" | "Ticket / consumidor final" | "Nota de crédito"… */
  tipo: string;
  /** N° de comprobante (o código de pedido/pago si no hay comprobante fiscal). */
  numero: string;
  cliente: string;
  /** "CUIT 30-…" / "DNI …" / "Consumidor final". */
  doc: string;
  neto: number;
  /** Alícuota como fracción (0.21, 0.105…). */
  alicuota: number;
  iva: number;
  total: number;
  fuente: LibroIvaFuente;
}

export interface CompraRow {
  fecha: string;
  proveedor: string;
  /** CUIT si se pudo determinar, si no "—". */
  doc: string;
  numero: string;
  neto: number;
  alicuota: number;
  iva: number;
  total: number;
  fuente: LibroIvaFuente;
}

export interface LibroIvaResumen {
  ventasNeto: number;
  ventasIva: number;
  ventasTotal: number;
  ventasCount: number;
  comprasNeto: number;
  comprasIva: number;
  comprasTotal: number;
  comprasCount: number;
  /** IVA débito fiscal = IVA de ventas. */
  ivaDebito: number;
  /** IVA crédito fiscal = IVA de compras. */
  ivaCredito: number;
  /** Saldo = débito − crédito. Positivo = a pagar; negativo = saldo a favor. */
  ivaSaldo: number;
  /** Cuántas filas son estimadas (sin comprobante fiscal) — para la nota de transparencia. */
  ventasEstimadas: number;
  comprasEstimadas: number;
}

export interface LibroIva {
  ventas: VentaRow[];
  compras: CompraRow[];
  resumen: LibroIvaResumen;
}

// ---------------------------------------------------------------------------
// Helpers de fecha (sin dependencias).
// ---------------------------------------------------------------------------

/** "AAAAMMDD" (formato fiscal de `Invoice.fecha`) → "YYYY-MM-DD". Si no matchea, se devuelve tal cual. */
export function fiscalDateToIso(aaaammdd: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(aaaammdd.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : aaaammdd;
}

/** `Date` → "YYYY-MM-DD" (UTC, estable para agrupar por día). */
export function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Derivación de IVA (precio AR IVA-incluido) — la aritmética verde.
// ---------------------------------------------------------------------------

/** Descompone un total IVA-incluido en { neto, iva } a la alícuota dada. PURA, redondeo único. */
export function deriveIvaFromGross(
  total: number,
  alicuota: number = IVA_ALICUOTA_GENERAL,
): { neto: number; iva: number } {
  const neto = round2(total / (1 + alicuota));
  const iva = round2(total - neto);
  return { neto, iva };
}

// ---------------------------------------------------------------------------
// Constructores de fila.
// ---------------------------------------------------------------------------

const TIPO_COMPROBANTE_LABEL: Record<number, string> = {
  1: "Factura A",
  6: "Factura B",
  11: "Factura C",
  3: "Nota de crédito A",
  8: "Nota de crédito B",
  13: "Nota de crédito C",
};

function docLabel(docTipo: number, docNro: string): string {
  if (docTipo === 80) return `CUIT ${docNro}`;
  if (docTipo === 96) return `DNI ${docNro}`;
  return "Consumidor final";
}

/** Fila de venta desde un comprobante fiscal real (`Invoice` AUTORIZADO). Montos EXACTOS. */
export function ventaFromInvoice(inv: {
  fecha: string; // AAAAMMDD
  tipoComprobante: number | null;
  puntoVenta: number;
  numero?: number | null;
  docTipo: number;
  docNro: string;
  neto: number;
  iva: number;
  total: number;
}): VentaRow {
  const tipo = (inv.tipoComprobante != null && TIPO_COMPROBANTE_LABEL[inv.tipoComprobante]) || "Comprobante";
  const pv = String(inv.puntoVenta).padStart(5, "0");
  const nro = inv.numero != null ? String(inv.numero).padStart(8, "0") : "—";
  const alicuota = inv.neto > 0 ? round2(inv.iva / inv.neto) : IVA_ALICUOTA_GENERAL;
  return {
    fecha: fiscalDateToIso(inv.fecha),
    tipo,
    numero: `${pv}-${nro}`,
    cliente: docLabel(inv.docTipo, inv.docNro) === "Consumidor final" ? "Consumidor final" : inv.docNro,
    doc: docLabel(inv.docTipo, inv.docNro),
    neto: round2(inv.neto),
    alicuota,
    iva: round2(inv.iva),
    total: round2(inv.total),
    fuente: "comprobante",
  };
}

/** Fila de venta sin comprobante fiscal (retail `Order` o servicio `Payment`). Estimada al 21%. */
export function ventaFromGross(input: {
  fecha: string; // YYYY-MM-DD
  tipo: string;
  numero: string;
  cliente: string;
  total: number;
}): VentaRow {
  const { neto, iva } = deriveIvaFromGross(input.total);
  return {
    fecha: input.fecha,
    tipo: input.tipo,
    numero: input.numero,
    cliente: input.cliente || "Consumidor final",
    doc: "Consumidor final",
    neto,
    alicuota: IVA_ALICUOTA_GENERAL,
    iva,
    total: round2(input.total),
    fuente: "estimado",
  };
}

/** Fila de compra desde una `StockPurchase` (kind COMPRA). Estimada al 21% (sin factura con IVA). */
export function compraFromPurchase(input: {
  fecha: string; // YYYY-MM-DD
  proveedor: string | null;
  cuit?: string | null;
  numero: string;
  total: number;
}): CompraRow {
  const { neto, iva } = deriveIvaFromGross(input.total);
  return {
    fecha: input.fecha,
    proveedor: input.proveedor?.trim() || "Proveedor sin identificar",
    doc: input.cuit?.trim() ? `CUIT ${input.cuit.trim()}` : "—",
    numero: input.numero,
    neto,
    alicuota: IVA_ALICUOTA_GENERAL,
    iva,
    total: round2(input.total),
    fuente: "estimado",
  };
}

// ---------------------------------------------------------------------------
// Resumen (IVA débito / crédito / saldo).
// ---------------------------------------------------------------------------

/** Arma el resumen fiscal a partir de las filas ya construidas. PURA. */
export function summarizeLibroIva(ventas: readonly VentaRow[], compras: readonly CompraRow[]): LibroIvaResumen {
  const ventasNeto = round2(ventas.reduce((s, r) => s + r.neto, 0));
  const ventasIva = round2(ventas.reduce((s, r) => s + r.iva, 0));
  const ventasTotal = round2(ventas.reduce((s, r) => s + r.total, 0));
  const comprasNeto = round2(compras.reduce((s, r) => s + r.neto, 0));
  const comprasIva = round2(compras.reduce((s, r) => s + r.iva, 0));
  const comprasTotal = round2(compras.reduce((s, r) => s + r.total, 0));
  return {
    ventasNeto,
    ventasIva,
    ventasTotal,
    ventasCount: ventas.length,
    comprasNeto,
    comprasIva,
    comprasTotal,
    comprasCount: compras.length,
    ivaDebito: ventasIva,
    ivaCredito: comprasIva,
    ivaSaldo: round2(ventasIva - comprasIva),
    ventasEstimadas: ventas.filter((r) => r.fuente === "estimado").length,
    comprasEstimadas: compras.filter((r) => r.fuente === "estimado").length,
  };
}

/** Ensambla el Libro IVA: ordena ventas y compras por fecha ascendente y calcula el resumen. */
export function buildLibroIva(ventas: VentaRow[], compras: CompraRow[]): LibroIva {
  const byFecha = <T extends { fecha: string }>(a: T, b: T) => a.fecha.localeCompare(b.fecha);
  const v = [...ventas].sort(byFecha);
  const c = [...compras].sort(byFecha);
  return { ventas: v, compras: c, resumen: summarizeLibroIva(v, c) };
}
