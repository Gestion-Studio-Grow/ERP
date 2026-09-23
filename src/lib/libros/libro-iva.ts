// ============================================================================
// LIBRO IVA del MES — lo que se declara, separado de lo que sólo sirve de control. PURO.
// ============================================================================
//
// "Libros / Exportar al contador" (ADR-060 D7). Nunca "Contabilidad": no hay asientos. Es el
// Libro IVA con los campos que usa el contador (tipo de comprobante, CUIT/doc, neto,
// alícuota, IVA, total), armado desde lo que YA existe, sin schema nuevo.
//
// Tres bloques, y sólo el primero es fiscal:
//   1. COMPROBANTES EMITIDOS — `Invoice` con CAE. Es lo que va a la declaración. Las
//      alícuotas salen del desglose que se guardó al emitir (`Invoice.ivaDesglose`), no de
//      dividir IVA por neto (que redondeaba y no distingue 10,5% de 21% en una factura con
//      las dos). Las notas de crédito restan.
//   2. VENTAS SIN COMPROBANTE — pedidos y turnos cobrados que no tienen factura con CAE.
//      Son CONTROL: le dicen a la contadora qué se vendió sin facturar. No llevan IVA
//      calculado: antes se "estimaban al 21%" y se sumaban al débito, mezclando lo que se
//      declara con una suposición.
//   3. COMPRAS — las compras de mercadería registradas. Hoy ninguna trae la factura del
//      proveedor con el IVA discriminado (no hay dónde cargarla sin migrar), y sin
//      comprobante no hay crédito fiscal. Antes se estimaban al 21% y ENTRABAN al crédito:
//      el "saldo a pagar" salía más chico que el real, y la dueña presupuestaba con eso.
//
// Y la posición de IVA (débito − crédito) sólo se muestra a un Responsable Inscripto. Un
// monotributista emite Factura C, que no discrimina IVA: mostrarle "IVA débito" es un dato
// que no le corresponde. La condición no tiene columna todavía (fiscal.ts), así que se
// deduce de lo que emitió: con alguna A o B es inscripto; sólo C, monotributo.

import { round2 } from "@/lib/round";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { PORCENTAJE_IVA, TipoComprobante } from "@/plugins/arca/domain/catalogos";
import { bordesDelMes, type MesKey } from "./fecha-fiscal";

// ---------------------------------------------------------------------------
// Fechas.
// ---------------------------------------------------------------------------

/** "AAAAMMDD" (formato fiscal de `Invoice.fecha`) → "YYYY-MM-DD". Si no matchea, se devuelve tal cual. */
export function fiscalDateToIso(aaaammdd: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(aaaammdd.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : aaaammdd;
}

/**
 * `Date` → "YYYY-MM-DD" en el DÍA DE NEGOCIO, que es con lo que se declara.
 *
 * Decía `d.toISOString().slice(0, 10)`, o sea el día UTC: todo lo cobrado entre las 21:00 y
 * las 23:59 hora local se asentaba con la fecha del día siguiente. Todos los llamadores le
 * pasan instantes reales (`createdAt`), nunca un día anclado a medianoche UTC.
 */
export function dateToIso(d: Date): string {
  return dateStrInBusinessTz(d);
}

// ---------------------------------------------------------------------------
// Tipos de comprobante.
// ---------------------------------------------------------------------------

const TIPO_LABEL: Record<number, string> = {
  [TipoComprobante.FacturaA]: "Factura A",
  [TipoComprobante.NotaDebitoA]: "Nota de débito A",
  [TipoComprobante.NotaCreditoA]: "Nota de crédito A",
  [TipoComprobante.FacturaB]: "Factura B",
  [TipoComprobante.NotaDebitoB]: "Nota de débito B",
  [TipoComprobante.NotaCreditoB]: "Nota de crédito B",
  [TipoComprobante.FacturaC]: "Factura C",
  [TipoComprobante.NotaDebitoC]: "Nota de débito C",
  [TipoComprobante.NotaCreditoC]: "Nota de crédito C",
};

const NOTAS_DE_CREDITO = new Set<number>([
  TipoComprobante.NotaCreditoA,
  TipoComprobante.NotaCreditoB,
  TipoComprobante.NotaCreditoC,
]);

/** Tipos que discriminan IVA (A y B): los de un Responsable Inscripto. */
export const TIPOS_QUE_DISCRIMINAN_IVA: readonly number[] = [
  TipoComprobante.FacturaA,
  TipoComprobante.NotaDebitoA,
  TipoComprobante.NotaCreditoA,
  TipoComprobante.FacturaB,
  TipoComprobante.NotaDebitoB,
  TipoComprobante.NotaCreditoB,
];

const DE_MONOTRIBUTO = new Set<number>([
  TipoComprobante.FacturaC,
  TipoComprobante.NotaDebitoC,
  TipoComprobante.NotaCreditoC,
]);

/** ¿El tipo resta (nota de crédito)? */
export function esNotaDeCredito(tipo: number | null | undefined): boolean {
  return tipo != null && NOTAS_DE_CREDITO.has(tipo);
}

// ---------------------------------------------------------------------------
// Condición del emisor, deducida de lo que emitió.
// ---------------------------------------------------------------------------

/**
 * `responsable-inscripto`: emitió alguna A o B (discrimina IVA).
 * `monotributo`: sólo C.
 * `sin-comprobantes`: no emitió nada con CAE; no se puede afirmar ninguna de las dos.
 */
export type CondicionLibro = "responsable-inscripto" | "monotributo" | "sin-comprobantes";

/** Deduce la condición de los tipos emitidos (de cualquier período). PURA. */
export function condicionPorTipos(tipos: readonly (number | null | undefined)[]): CondicionLibro {
  if (tipos.some((t) => t != null && TIPOS_QUE_DISCRIMINAN_IVA.includes(t))) return "responsable-inscripto";
  if (tipos.some((t) => t != null && DE_MONOTRIBUTO.has(t))) return "monotributo";
  return "sin-comprobantes";
}

/**
 * ¿El Libro IVA se le oculta a este negocio? Sí a un monotributista: emite Factura C, que no
 * discrimina IVA, y un libro de débitos y créditos no le corresponde. Lo que sí le sirve (lo
 * facturado y lo vendido sin comprobante) va en el paquete del Cierre del mes. Con
 * "sin-comprobantes" NO se oculta: todavía no se sabe qué es. PURA.
 */
export function libroOcultoPara(condicion: CondicionLibro): boolean {
  return condicion === "monotributo";
}

// ---------------------------------------------------------------------------
// Los comprobantes del mes: UN `where`, el de la pantalla, el del número del botón y el del
// paquete. Objeto plano, sin Prisma de valor.
// ---------------------------------------------------------------------------

/** Los comprobantes con CAE cuya fecha fiscal (AAAAMMDD) cae en el mes. PURA. */
export function whereComprobantesDelMes(tenantId: string, mes: MesKey) {
  const { fiscal } = bordesDelMes(mes);
  return { tenantId, status: "AUTHORIZED" as const, fecha: { gte: fiscal.gte, lt: fiscal.lt } };
}

/**
 * El número del botón del Libro IVA, desde el IVA de los comprobantes del mes agrupados por
 * tipo (una consulta con `whereComprobantesDelMes`). Misma cuenta que el resumen de la
 * pantalla: el IVA con signo (las notas de crédito restan) y el crédito en 0. PURA.
 *   · alguna A o B → responsable inscripto: el saldo del mes;
 *   · sólo C → monotributo: sin número (`null`), como la pantalla, que no le muestra IVA;
 *   · nada → no hay de dónde sacar un número: `sinComprobantes`, que el botón muestra como
 *     '—' con el motivo. La pantalla dice lo mismo ("—" en el saldo).
 */
export function saldoIvaDesdeGrupos(
  grupos: readonly { tipoComprobante: number | null; iva: number }[],
): { condicion: "responsable-inscripto"; saldo: number } | { condicion: "monotributo" } | { condicion: "sin-comprobantes" } {
  const condicion = condicionPorTipos(grupos.map((g) => g.tipoComprobante));
  if (condicion !== "responsable-inscripto") return { condicion };
  const saldo = round2(grupos.reduce((s, g) => s + (esNotaDeCredito(g.tipoComprobante) ? -g.iva : g.iva), 0));
  return { condicion, saldo };
}

// ---------------------------------------------------------------------------
// Filas.
// ---------------------------------------------------------------------------

/** Una alícuota de un comprobante: la fracción (0,21; 0,105…), su base y su IVA. */
export interface LineaAlicuota {
  alicuota: number;
  base: number;
  importe: number;
}

/** Un comprobante con CAE. Los montos van con SIGNO: una nota de crédito resta. */
export interface ComprobanteRow {
  /** Identifica la fila en la tabla (el id del comprobante). */
  clave: string;
  fecha: string; // YYYY-MM-DD
  tipo: string;
  numero: string;
  cliente: string;
  doc: string;
  neto: number;
  iva: number;
  total: number;
  alicuotas: LineaAlicuota[];
  /** La venta que lo originó se anuló y no hay nota de crédito que la compense. */
  anuladaSinNotaDeCredito: boolean;
}

/** Una venta cobrada sin comprobante con CAE. CONTROL: no lleva IVA. */
export interface VentaSinComprobanteRow {
  /**
   * Identifica la fila: "pedido:<id>" o "cobro:<id>". Hace falta porque nada visible es único:
   * dos turnos del mismo servicio, el mismo día y al mismo precio se ven iguales.
   */
  clave: string;
  fecha: string;
  tipo: string;
  numero: string;
  cliente: string;
  total: number;
}

/** Una compra registrada. Sin la factura del proveedor, no da crédito fiscal. */
export interface CompraRow {
  /** Identifica la fila: "compra:<id>" (dos compras pueden traer el mismo número de orden). */
  clave: string;
  fecha: string;
  proveedor: string;
  doc: string;
  numero: string;
  total: number;
}

function docLabel(docTipo: number, docNro: string): string {
  if (docTipo === 80) return `CUIT ${docNro}`;
  if (docTipo === 86) return `CUIL ${docNro}`;
  if (docTipo === 96) return `DNI ${docNro}`;
  return "Consumidor final";
}

/**
 * Las alícuotas del desglose que se guardó al emitir (`Invoice.ivaDesglose`, `SubtotalIva[]`
 * = { alicuotaId, base, importe }). Si no hay desglose (comprobantes previos a guardarlo) o
 * viene roto, UNA línea con el total: la alícuota se deduce de IVA/neto sólo en ese caso y se
 * lleva a la alícuota oficial más cercana, para no inventar un 20,98%.
 */
export function alicuotasDelDesglose(
  desglose: unknown,
  respaldo: { neto: number; iva: number },
): LineaAlicuota[] {
  if (Array.isArray(desglose) && desglose.length > 0) {
    const lineas: LineaAlicuota[] = [];
    for (const d of desglose) {
      const id = Number((d as { alicuotaId?: unknown })?.alicuotaId);
      const pct = (PORCENTAJE_IVA as Record<number, number | undefined>)[id];
      const base = Number((d as { base?: unknown })?.base);
      const importe = Number((d as { importe?: unknown })?.importe);
      if (pct === undefined || !Number.isFinite(base) || !Number.isFinite(importe)) return [unaLinea(respaldo)];
      lineas.push({ alicuota: pct, base: round2(base), importe: round2(importe) });
    }
    return lineas;
  }
  return [unaLinea(respaldo)];
}

function unaLinea({ neto, iva }: { neto: number; iva: number }): LineaAlicuota {
  const oficiales = Object.values(PORCENTAJE_IVA);
  const bruta = neto > 0 ? iva / neto : 0;
  const alicuota = oficiales.reduce((mejor, p) => (Math.abs(p - bruta) < Math.abs(mejor - bruta) ? p : mejor), 0);
  return { alicuota, base: round2(neto), importe: round2(iva) };
}

/** Fila desde un `Invoice` AUTORIZADO. Montos exactos, con signo si es nota de crédito. PURA. */
export function comprobanteDesdeInvoice(inv: {
  /** El id del comprobante: la clave de la fila. Sin él, tipo + número (únicos con CAE). */
  id?: string;
  fecha: string; // AAAAMMDD
  tipoComprobante: number | null;
  puntoVenta: number;
  numero?: number | null;
  docTipo: number;
  docNro: string;
  neto: number;
  iva: number;
  total: number;
  ivaDesglose?: unknown;
  /** El pedido o el turno de origen está anulado. */
  origenAnulado?: boolean;
}): ComprobanteRow {
  const signo = esNotaDeCredito(inv.tipoComprobante) ? -1 : 1;
  const tipo = (inv.tipoComprobante != null && TIPO_LABEL[inv.tipoComprobante]) || "Comprobante";
  const pv = String(inv.puntoVenta).padStart(5, "0");
  const nro = inv.numero != null ? String(inv.numero).padStart(8, "0") : "—";
  const doc = docLabel(inv.docTipo, inv.docNro);
  return {
    clave: inv.id ?? `${tipo}-${pv}-${nro}`,
    fecha: fiscalDateToIso(inv.fecha),
    tipo,
    numero: `${pv}-${nro}`,
    cliente: doc === "Consumidor final" ? "Consumidor final" : inv.docNro,
    doc,
    neto: round2(signo * inv.neto),
    iva: round2(signo * inv.iva),
    total: round2(signo * inv.total),
    alicuotas: alicuotasDelDesglose(inv.ivaDesglose, { neto: inv.neto, iva: inv.iva }).map((l) => ({
      alicuota: l.alicuota,
      base: round2(signo * l.base),
      importe: round2(signo * l.importe),
    })),
    // Una nota de crédito nunca es "anulada sin nota de crédito": ES la nota.
    anuladaSinNotaDeCredito: signo === 1 && inv.origenAnulado === true,
  };
}

// ---------------------------------------------------------------------------
// Resumen.
// ---------------------------------------------------------------------------

export interface TotalAlicuota {
  alicuota: number;
  neto: number;
  iva: number;
}

export interface LibroIvaResumen {
  condicion: CondicionLibro;
  comprobantesCount: number;
  comprobantesNeto: number;
  comprobantesTotal: number;
  /** Neto e IVA por alícuota, de mayor a menor alícuota. */
  porAlicuota: TotalAlicuota[];
  /** IVA débito: el IVA de los comprobantes (una C no discrimina: su IVA es 0). */
  ivaDebito: number;
  /**
   * IVA crédito: 0 mientras no se carguen facturas de proveedor con el IVA discriminado. No
   * es un olvido: sin comprobante, la compra no da crédito (y estimarla lo inventaba).
   */
  ivaCredito: number;
  /** Débito − crédito. Positivo = a pagar. */
  ivaSaldo: number;
  sinComprobanteCount: number;
  sinComprobanteTotal: number;
  comprasCount: number;
  comprasTotal: number;
  /** Comprobantes con CAE cuya venta se anuló, sin nota de crédito. */
  anuladasSinNotaDeCredito: number;
}

export interface LibroIva {
  comprobantes: ComprobanteRow[];
  ventasSinComprobante: VentaSinComprobanteRow[];
  compras: CompraRow[];
  resumen: LibroIvaResumen;
}

/** Arma el resumen. PURA. */
export function resumirLibroIva(
  comprobantes: readonly ComprobanteRow[],
  ventasSinComprobante: readonly VentaSinComprobanteRow[],
  compras: readonly CompraRow[],
  condicion: CondicionLibro,
): LibroIvaResumen {
  const suma = <T>(xs: readonly T[], f: (x: T) => number) => round2(xs.reduce((s, x) => s + f(x), 0));
  const porAlicuota = new Map<number, TotalAlicuota>();
  for (const c of comprobantes) {
    for (const l of c.alicuotas) {
      const t = porAlicuota.get(l.alicuota) ?? { alicuota: l.alicuota, neto: 0, iva: 0 };
      t.neto = round2(t.neto + l.base);
      t.iva = round2(t.iva + l.importe);
      porAlicuota.set(l.alicuota, t);
    }
  }
  const ivaDebito = suma(comprobantes, (c) => c.iva);
  const ivaCredito = 0;
  return {
    condicion,
    comprobantesCount: comprobantes.length,
    comprobantesNeto: suma(comprobantes, (c) => c.neto),
    comprobantesTotal: suma(comprobantes, (c) => c.total),
    porAlicuota: [...porAlicuota.values()].sort((a, b) => b.alicuota - a.alicuota),
    ivaDebito,
    ivaCredito,
    ivaSaldo: round2(ivaDebito - ivaCredito),
    sinComprobanteCount: ventasSinComprobante.length,
    sinComprobanteTotal: suma(ventasSinComprobante, (v) => v.total),
    comprasCount: compras.length,
    comprasTotal: suma(compras, (c) => c.total),
    anuladasSinNotaDeCredito: comprobantes.filter((c) => c.anuladaSinNotaDeCredito).length,
  };
}

/** ¿Se muestra la posición de IVA? Sólo a un Responsable Inscripto. PURA. */
export function muestraPosicionIva(condicion: CondicionLibro): boolean {
  return condicion === "responsable-inscripto";
}

/** Ensambla el libro: cada bloque por fecha ascendente, más el resumen. PURA. */
export function armarLibroIva(input: {
  comprobantes: ComprobanteRow[];
  ventasSinComprobante: VentaSinComprobanteRow[];
  compras: CompraRow[];
  condicion: CondicionLibro;
}): LibroIva {
  const porFecha = <T extends { fecha: string; numero: string }>(a: T, b: T) =>
    a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero);
  const comprobantes = [...input.comprobantes].sort(porFecha);
  const ventasSinComprobante = [...input.ventasSinComprobante].sort(porFecha);
  const compras = [...input.compras].sort(porFecha);
  return {
    comprobantes,
    ventasSinComprobante,
    compras,
    resumen: resumirLibroIva(comprobantes, ventasSinComprobante, compras, input.condicion),
  };
}

// ---------------------------------------------------------------------------
// Ventas anuladas con comprobante y sin nota de crédito (alarma de facturación y paso del
// cierre del mes). Un solo `where`, así el número del botón y el de la pantalla coinciden.
// ---------------------------------------------------------------------------

/**
 * Comprobantes con CAE cuya venta de origen (pedido o turno) quedó anulada. Hoy no existe la
 * nota de crédito en el sistema (y el índice 1 comprobante por venta impide asociarle una),
 * así que TODA venta anulada con factura queda con el débito fiscal y el ingreso del
 * monotributo inflados hasta que la nota se emita por fuera, en ARCA.
 *
 * `fecha`: el filtro de período sobre `Invoice.fecha` (AAAAMMDD) o sobre `createdAt`, según
 * quién pregunte (el cierre del mes va por fecha fiscal; el botón de Facturación, por mes de
 * emisión). Objeto plano, sin Prisma de valor.
 */
export function whereAnuladasConFactura(
  tenantId: string,
  periodo:
    | { fecha: { gte: string; lt: string } }
    | { createdAt: { gte: Date; lt: Date } },
) {
  return {
    tenantId,
    ...periodo,
    status: "AUTHORIZED" as const,
    // Sin filtro por tipo: una nota de crédito no puede colgar del mismo pedido o turno
    // (índice 1 comprobante por venta), así que acá sólo caen facturas.
    OR: [{ order: { status: "CANCELLED" as const } }, { appointment: { status: "CANCELLED" as const } }],
  };
}
