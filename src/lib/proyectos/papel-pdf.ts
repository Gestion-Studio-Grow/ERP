// Los papeles de una productora como PDF de verdad, generados en el servidor: cotización, constancia de cobro y recibo de
// liquidación. Sin costos, como la planilla. Ninguno es un comprobante fiscal: esos salen de Facturación.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

const ANCHO = 595.28;
const ALTO = 841.89;
const MARGEN = 48;
const COLOR_MARCA = rgb(0, 0.286, 0.835);
const GRIS = rgb(0.4, 0.4, 0.4);
const NEGRO = rgb(0.1, 0.1, 0.1);
const LINEA = rgb(0.85, 0.85, 0.85);

/** Helvetica sólo sabe WinAnsi: un carácter fuera de ahí haría fallar todo el PDF por un emoji en un detalle. */
export const textoImprimible = (t: string): string =>
  t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/\s+/g, " ").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?").trim();

export const plataPdf = (n: number, moneda: string): string =>
  `${moneda === "ARS" ? "$" : `${moneda} `} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function cortarEnLineas(texto: string, medir: (t: string) => number, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of textoImprimible(texto).split(" ")) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (medir(prueba) <= ancho || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

class Hoja {
  private pagina!: PDFPage;
  private y = 0;
  constructor(private doc: PDFDocument, private normal: PDFFont, private negrita: PDFFont) {
    this.nueva();
  }
  private nueva() {
    this.pagina = this.doc.addPage([ANCHO, ALTO]);
    this.y = ALTO - MARGEN;
  }
  private lugar(alto: number) {
    if (this.y - alto < MARGEN) this.nueva();
  }
  parrafo(texto: string, o: { tam?: number; negrita?: boolean; color?: ReturnType<typeof rgb>; despues?: number } = {}) {
    const tam = o.tam ?? 10;
    const fuente = o.negrita ? this.negrita : this.normal;
    for (const linea of cortarEnLineas(texto, (t) => fuente.widthOfTextAtSize(t, tam), ANCHO - MARGEN * 2)) {
      this.lugar(tam * 1.4);
      this.pagina.drawText(linea, { x: MARGEN, y: this.y - tam, size: tam, font: fuente, color: o.color ?? NEGRO });
      this.y -= tam * 1.4;
    }
    this.y -= o.despues ?? 0;
  }
  raya() {
    this.lugar(10);
    this.pagina.drawLine({ start: { x: MARGEN, y: this.y - 3 }, end: { x: ANCHO - MARGEN, y: this.y - 3 }, thickness: 0.6, color: LINEA });
    this.y -= 9;
  }
  /** Detalle a la izquierda, que corta si no entra; cantidad e importe alineados a la derecha. */
  fila(d: { detalle: string; cantidad?: string; importe?: string; negrita?: boolean; tam?: number }) {
    const tam = d.tam ?? 10;
    const fuente = d.negrita ? this.negrita : this.normal;
    const anchoDetalle = ANCHO - MARGEN * 2 - 170;
    const lineas = cortarEnLineas(d.detalle, (t) => fuente.widthOfTextAtSize(t, tam), anchoDetalle);
    this.lugar(lineas.length * tam * 1.35 + 2);
    const alto = this.y - tam;
    const derecha = (t: string, xFin: number) => this.pagina.drawText(textoImprimible(t), { x: xFin - fuente.widthOfTextAtSize(textoImprimible(t), tam), y: alto, size: tam, font: fuente, color: NEGRO });
    if (d.cantidad) derecha(d.cantidad, ANCHO - MARGEN - 110);
    if (d.importe) derecha(d.importe, ANCHO - MARGEN);
    for (const linea of lineas) {
      this.pagina.drawText(linea, { x: MARGEN, y: this.y - tam, size: tam, font: fuente, color: NEGRO });
      this.y -= tam * 1.35;
    }
    this.y -= 2;
  }
  espacio(n: number) {
    this.y -= n;
  }
}

async function armar(titulo: string, dibujar: (h: Hoja) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(textoImprimible(titulo));
  doc.setProducer("Gestión Studio Grow");
  doc.setCreator("Gestión Studio Grow");
  dibujar(new Hoja(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold)));
  return doc.save();
}

export interface CotizacionPdf {
  proyecto: { nombre: string; lugar: string | null; ciudad: string | null; client: { name: string } };
  fechaEvento: string | null;
  negocio: { nombre: string };
  codigo: string;
  moneda: string;
  version: number;
  condiciones: string | null;
  grupos: readonly { rubro: string; subtotal: number; lineas: readonly { descripcion: string; cantidad: number | null; importe: number }[] }[];
  neto: number;
  ivaPct: number;
  iva: number;
  total: number;
}

export function pdfDeCotizacion(d: CotizacionPdf): Promise<Uint8Array> {
  return armar(`Cotización ${d.codigo}`, (h) => {
    h.parrafo(d.negocio.nombre, { tam: 16, negrita: true, color: COLOR_MARCA });
    h.parrafo(`Cotización ${d.codigo} - Versión ${d.version}`, { color: GRIS, despues: 8 });
    h.parrafo(d.proyecto.nombre, { tam: 13, negrita: true });
    h.parrafo([d.proyecto.client.name, d.proyecto.lugar, d.proyecto.ciudad, d.fechaEvento].filter(Boolean).join(" - "), { color: GRIS, despues: 8 });
    h.raya();
    h.fila({ detalle: "Detalle", cantidad: "Cantidad", importe: `Importe (${d.moneda})`, negrita: true, tam: 9 });
    for (const g of d.grupos) {
      h.raya();
      h.fila({ detalle: g.rubro, importe: plataPdf(g.subtotal, d.moneda), negrita: true });
      for (const l of g.lineas) h.fila({ detalle: l.descripcion, cantidad: l.cantidad === null ? "" : l.cantidad.toLocaleString("es-AR"), importe: plataPdf(l.importe, d.moneda) });
    }
    h.raya();
    h.fila({ detalle: "Neto", importe: plataPdf(d.neto, d.moneda) });
    if (d.ivaPct) h.fila({ detalle: `IVA ${d.ivaPct}%`, importe: plataPdf(d.iva, d.moneda) });
    h.fila({ detalle: "Total", importe: plataPdf(d.total, d.moneda), negrita: true, tam: 12 });
    if (d.condiciones) {
      h.espacio(10);
      h.parrafo("Condiciones", { negrita: true });
      for (const parrafo of d.condiciones.split("\n")) if (parrafo.trim()) h.parrafo(parrafo);
    }
    h.espacio(12);
    h.parrafo("Esta cotización no es un comprobante fiscal.", { tam: 8, color: GRIS });
  });
}

export interface ConstanciaPdf {
  negocio: string;
  numero: string;
  fecha: string;
  cliente: string;
  proyecto: string;
  concepto: string;
  monto: number;
  moneda: string;
  medio: string | null;
  factura: string | null;
}

export function pdfDeConstancia(d: ConstanciaPdf): Promise<Uint8Array> {
  return armar(`Constancia de cobro ${d.numero}`, (h) => {
    h.parrafo(d.negocio, { tam: 16, negrita: true, color: COLOR_MARCA });
    h.parrafo(`Constancia de cobro ${d.numero}`, { color: GRIS, despues: 8 });
    h.raya();
    h.fila({ detalle: "Fecha", importe: d.fecha });
    h.fila({ detalle: "Cliente", importe: d.cliente });
    h.fila({ detalle: "Proyecto", importe: d.proyecto });
    h.fila({ detalle: "Concepto", importe: d.concepto });
    if (d.medio) h.fila({ detalle: "Medio", importe: d.medio });
    if (d.factura) h.fila({ detalle: "Factura", importe: d.factura });
    h.raya();
    h.fila({ detalle: "Recibimos", importe: plataPdf(d.monto, d.moneda), negrita: true, tam: 12 });
    h.espacio(14);
    h.parrafo("Esta constancia no es un comprobante fiscal: la factura sale aparte.", { tam: 8, color: GRIS });
  });
}

export interface LiquidacionPdf {
  negocio: string;
  periodo: string;
  estado: string;
  persona: string;
  puesto: string | null;
  facturaA: string | null;
  base: number;
  extras: readonly { nombre: string; monto: number }[];
  total: number;
}

export function pdfDeLiquidacion(d: LiquidacionPdf): Promise<Uint8Array> {
  return armar(`Recibo de liquidación ${d.periodo}`, (h) => {
    h.parrafo(d.negocio, { tam: 16, negrita: true, color: COLOR_MARCA });
    h.parrafo(`Recibo de liquidación - ${d.periodo}`, { color: GRIS });
    h.parrafo(d.estado, { color: GRIS, despues: 8 });
    h.raya();
    h.fila({ detalle: "Persona", importe: d.persona });
    if (d.puesto) h.fila({ detalle: "Puesto", importe: d.puesto });
    h.fila({ detalle: "Factura a", importe: d.facturaA || "-" });
    h.raya();
    h.fila({ detalle: "Sueldo base", importe: plataPdf(d.base, "ARS") });
    for (const e of d.extras) h.fila({ detalle: e.nombre, importe: plataPdf(e.monto, "ARS") });
    h.raya();
    h.fila({ detalle: "Total", importe: plataPdf(d.total, "ARS"), negrita: true, tam: 12 });
  });
}
