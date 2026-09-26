// ============================================================================
// COMPROBANTES RECIBIDOS — lectura del archivo «Mis Comprobantes Recibidos» de ARCA (PURO).
// ============================================================================
//
// La contadora baja de ARCA (servicio «Mis Comprobantes», solapa Recibidos) el archivo de un
// cliente y lo sube acá. Este módulo sólo LEE: recibe la matriz de celdas (CSV o Excel ya
// abiertos por los parsers de src/plugins/bancos/parser) y devuelve los comprobantes listos
// para guardar, los rechazados con su motivo y el resumen. No toca la base ni el stock.
//
// Formato (fuente, verificada el 26/09/2026):
//   · ARCA, «Mis Comprobantes» — exportación CSV/Excel de Emitidos y Recibidos. Columnas del
//     diseño clásico: Fecha, Tipo, Punto de Venta, Número Desde, Número Hasta, Cód.
//     Autorización, Tipo Doc. Emisor, Nro. Doc. Emisor, Denominación Emisor, Tipo Cambio,
//     Moneda, Imp. Neto Gravado, Imp. Neto No Gravado, Imp. Op. Exentas, IVA, Imp. Total.
//   · ARCA actualizó el diseño en 2025: neto e IVA ABIERTOS POR ALÍCUOTA («Imp. Neto Gravado
//     IVA 21%», «IVA 21%», …, «Total IVA», «Otros Tributos») y, en algunas descargas, punto de
//     venta y número en una sola columna («00003-00001234»). Referencias:
//       https://www.delrincon.ar/post/arca-actualiz%C3%B3-el-dise%C3%B1o-de-mis-comprobantes
//       https://ayuda.colppy.com/es/articles/3181130-importar-tus-facturas-desde-mis-comprobantes-recibidos-arca
//       https://sites.google.com/sos-contador.com.ar/ayuda/menu-inicio/importar-datos/desde-arca/Importacion-Mis-Comprobantes-Emitidos-y-Recibidos
//   Se aceptan los dos diseños: las columnas se reconocen por NOMBRE (sin tildes, puntos ni
//   mayúsculas), no por posición, y la fila de títulos se busca en las primeras filas (el Excel
//   trae arriba un renglón «Mis Comprobantes Recibidos - CUIT …»).
//
// PROVISIONAL A CONFIRMAR con un archivo real en dólares: los importes de un comprobante en
// moneda extranjera vienen en ESA moneda y se pasan a pesos con la columna «Tipo Cambio».
//
// Reglas:
//   · la clave de un comprobante es CUIT del emisor + tipo + punto de venta + número (la misma
//     del índice único de la base, StockPurchase_factura_proveedor_key);
//   · sólo A y M discriminan IVA para quien recibe: B y C no dan crédito fiscal;
//   · si el IVA de un A/M no se puede asignar a una alícuota oficial con certeza, el
//     comprobante entra MARCADO «a revisar» (no se inventa la alícuota);
//   · las notas de crédito restan en el resumen;
//   · la plata se redondea sólo con src/lib/dinero.

import { leerImporte } from "@/lib/dinero/leer";
import { redondearAlCentavo, sumarAlCentavo } from "@/lib/dinero/redondeo";
import { cuitValido, normalizarCuit } from "@/lib/cuit";

/** Una celda cruda (igual que el parser de extractos: CSV da string, Excel tipa más). */
export type CeldaRecibida = string | number | boolean | Date | null;

// ---------------------------------------------------------------------------
// Catálogo: tipos de comprobante y alícuotas (códigos oficiales de ARCA).
// ---------------------------------------------------------------------------

type Letra = "A" | "B" | "C" | "M";

type Clase =
  | "factura"
  | "nota de débito"
  | "nota de crédito"
  | "recibo"
  | "nota de venta al contado"
  | "liquidación"
  | "liquidación de servicios públicos clase"
  | "cuenta de venta y líquido producto"
  | "tique factura"
  | "tique nota de débito"
  | "tique nota de crédito";

// Tabla de tipos de comprobante de ARCA (la de «Mis Comprobantes» y del Libro IVA Digital,
// «Tablas del sistema»: https://www.afip.gob.ar/iva/documentos/Libro-IVA-Digital-Tablas-del-Sistema.pdf).
// Todo comprobante de letra A o M discrimina el IVA y da crédito fiscal a quien lo recibe, sea
// factura, recibo, liquidación o tique: por eso están 4, 5, 17, 54, 60, 63, 81, 112, 115, 118…
// Un tipo que no esté acá se rechaza con un motivo que NO dice que «no va a compras».
const TIPOS: Record<number, { letra: Letra; clase: Clase; mipyme?: true }> = {
  1: { letra: "A", clase: "factura" },
  2: { letra: "A", clase: "nota de débito" },
  3: { letra: "A", clase: "nota de crédito" },
  4: { letra: "A", clase: "recibo" },
  5: { letra: "A", clase: "nota de venta al contado" },
  6: { letra: "B", clase: "factura" },
  7: { letra: "B", clase: "nota de débito" },
  8: { letra: "B", clase: "nota de crédito" },
  9: { letra: "B", clase: "recibo" },
  10: { letra: "B", clase: "nota de venta al contado" },
  11: { letra: "C", clase: "factura" },
  12: { letra: "C", clase: "nota de débito" },
  13: { letra: "C", clase: "nota de crédito" },
  15: { letra: "C", clase: "recibo" },
  16: { letra: "C", clase: "nota de venta al contado" },
  17: { letra: "A", clase: "liquidación de servicios públicos clase" },
  18: { letra: "B", clase: "liquidación de servicios públicos clase" },
  51: { letra: "M", clase: "factura" },
  52: { letra: "M", clase: "nota de débito" },
  53: { letra: "M", clase: "nota de crédito" },
  54: { letra: "M", clase: "recibo" },
  60: { letra: "A", clase: "cuenta de venta y líquido producto" },
  61: { letra: "B", clase: "cuenta de venta y líquido producto" },
  63: { letra: "A", clase: "liquidación" },
  64: { letra: "B", clase: "liquidación" },
  81: { letra: "A", clase: "tique factura" },
  82: { letra: "B", clase: "tique factura" },
  111: { letra: "C", clase: "tique factura" },
  112: { letra: "A", clase: "tique nota de crédito" },
  113: { letra: "B", clase: "tique nota de crédito" },
  114: { letra: "C", clase: "tique nota de crédito" },
  115: { letra: "A", clase: "tique nota de débito" },
  116: { letra: "B", clase: "tique nota de débito" },
  117: { letra: "C", clase: "tique nota de débito" },
  118: { letra: "M", clase: "tique factura" },
  119: { letra: "M", clase: "tique nota de crédito" },
  120: { letra: "M", clase: "tique nota de débito" },
  201: { letra: "A", clase: "factura", mipyme: true },
  202: { letra: "A", clase: "nota de débito", mipyme: true },
  203: { letra: "A", clase: "nota de crédito", mipyme: true },
  206: { letra: "B", clase: "factura", mipyme: true },
  207: { letra: "B", clase: "nota de débito", mipyme: true },
  208: { letra: "B", clase: "nota de crédito", mipyme: true },
  211: { letra: "C", clase: "factura", mipyme: true },
  212: { letra: "C", clase: "nota de débito", mipyme: true },
  213: { letra: "C", clase: "nota de crédito", mipyme: true },
};

/** «Factura A», «Nota de crédito B», «Factura de crédito MiPyME A». */
export function nombreDelTipo(tipo: number): string {
  const t = TIPOS[tipo];
  if (!t) return `Comprobante tipo ${tipo}`;
  const clase = t.clase.charAt(0).toUpperCase() + t.clase.slice(1);
  if (t.mipyme) return t.clase === "factura" ? `Factura de crédito MiPyME ${t.letra}` : `${clase} MiPyME ${t.letra}`;
  return `${clase} ${t.letra}`;
}

/** ¿Resta? Las notas de crédito, también las de tique. */
export function esNotaDeCreditoRecibida(tipo: number): boolean {
  const clase = TIPOS[tipo]?.clase;
  return clase === "nota de crédito" || clase === "tique nota de crédito";
}

/** ¿Da crédito fiscal a quien lo recibe? Sólo A y M discriminan el IVA. */
export function discriminaIva(tipo: number): boolean {
  const l = TIPOS[tipo]?.letra;
  return l === "A" || l === "M";
}

/** Alícuotas oficiales: código ARCA (AlicuotaIvaId) y porcentaje. */
export const ALICUOTAS_RECIBIDAS: readonly { id: number; porcentaje: number; etiqueta: string }[] = [
  { id: 3, porcentaje: 0, etiqueta: "0%" },
  { id: 9, porcentaje: 2.5, etiqueta: "2,5%" },
  { id: 8, porcentaje: 5, etiqueta: "5%" },
  { id: 4, porcentaje: 10.5, etiqueta: "10,5%" },
  { id: 5, porcentaje: 21, etiqueta: "21%" },
  { id: 6, porcentaje: 27, etiqueta: "27%" },
];

export function etiquetaAlicuota(id: number): string {
  return ALICUOTAS_RECIBIDAS.find((a) => a.id === id)?.etiqueta ?? "alícuota desconocida";
}

// ---------------------------------------------------------------------------
// Resultado de la lectura.
// ---------------------------------------------------------------------------

/** Una línea del desglose de IVA, con la forma de Invoice.ivaDesglose. */
export interface LineaIvaRecibida {
  alicuotaId: number;
  base: number;
  importe: number;
}

/** Un comprobante leído, con los importes YA EN PESOS. */
export interface ComprobanteRecibido {
  /** Fila del archivo (1 = la primera de la planilla), para que la contadora la ubique. */
  fila: number;
  /** Fecha del comprobante (fecha fiscal), AAAAMMDD. */
  fecha: string;
  tipo: number;
  puntoVenta: number;
  numero: number;
  cuitEmisor: string;
  emisor: string;
  codAutorizacion: string | null;
  /** «PES» para pesos; si no, el código que trae el archivo («DOL», «060», …). */
  moneda: string;
  /** 1 para pesos. */
  cotizacion: number;
  neto: number;
  noGravado: number;
  exento: number;
  /** IVA que computa como crédito fiscal (0 en B y C). */
  iva: number;
  otrosTributos: number;
  total: number;
  /** Desglose por alícuota; null cuando está «a revisar» (no se inventa). */
  desglose: LineaIvaRecibida[] | null;
  /** Por qué hay que mirarlo antes de cerrar el libro; null si está bien. */
  aRevisar: string | null;
}

export interface RechazoRecibido {
  fila: number;
  /** Lo que identifica al comprobante en la planilla, si se pudo leer. */
  comprobante: string | null;
  motivo: string;
}

export type LecturaRecibidos =
  | { ok: false; error: string }
  | {
      ok: true;
      /** El CUIT que el archivo dice en su encabezado, si lo trae (para no cargarlo a otro cliente). */
      cuitDelArchivo: string | null;
      /** «clasico» (neto e IVA en una columna) o «por-alicuota» (diseño 2025). */
      diseno: "clasico" | "por-alicuota";
      comprobantes: ComprobanteRecibido[];
      /** Filas que no entran por un error del archivo (el detalle dice cuál). */
      rechazos: RechazoRecibido[];
      /**
       * Filas que repiten un comprobante que ya está más arriba en el MISMO archivo: no son errores, el
       * comprobante se toma una sola vez (QA vuelta 7: el aviso las contaba «con errores»).
       */
      repetidos: RechazoRecibido[];
    };

export function claveRecibido(c: { cuitEmisor: string; tipo: number; puntoVenta: number; numero: number }): string {
  return `${c.cuitEmisor}|${c.tipo}|${c.puntoVenta}|${c.numero}`;
}

/** «Factura A 00003-00001234», como lo escribe la contadora. */
export function rotuloRecibido(c: { tipo: number; puntoVenta: number; numero: number }): string {
  return `${nombreDelTipo(c.tipo)} ${String(c.puntoVenta).padStart(5, "0")}-${String(c.numero).padStart(8, "0")}`;
}

// ---------------------------------------------------------------------------
// Encabezados.
// ---------------------------------------------------------------------------

/** «Imp. Neto Gravado IVA 10,5%» → «imp neto gravado iva 10,5%». */
export function normalizarTitulo(v: CeldaRecibida): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Campo =
  | "fecha"
  | "tipo"
  | "puntoVenta"
  | "numeroDesde"
  | "numeroHasta"
  | "codAutorizacion"
  | "tipoDoc"
  | "nroDoc"
  | "denominacion"
  | "tipoCambio"
  | "moneda"
  | "netoGravado"
  | "netoGravadoTotal"
  | "noGravado"
  | "exento"
  | "otrosTributos"
  | "iva"
  | "totalIva"
  | "total";

const SINONIMOS: Record<Campo, readonly string[]> = {
  fecha: ["fecha", "fecha de emision", "fecha emision"],
  tipo: ["tipo", "tipo de comprobante", "tipo comprobante"],
  puntoVenta: ["punto de venta", "pto venta", "pto de venta"],
  numeroDesde: ["numero desde", "numero", "nro desde", "numero de comprobante"],
  numeroHasta: ["numero hasta", "nro hasta"],
  codAutorizacion: ["cod autorizacion", "codigo de autorizacion", "cae"],
  tipoDoc: ["tipo doc emisor", "tipo doc vendedor", "tipo de documento emisor"],
  nroDoc: ["nro doc emisor", "nro doc vendedor", "numero de documento emisor", "cuit emisor"],
  denominacion: ["denominacion emisor", "denominacion vendedor", "razon social emisor"],
  tipoCambio: ["tipo cambio", "tipo de cambio"],
  moneda: ["moneda"],
  netoGravado: ["imp neto gravado", "neto gravado"],
  netoGravadoTotal: ["imp neto gravado total", "neto gravado total"],
  noGravado: ["imp neto no gravado", "neto no gravado", "imp no gravado"],
  exento: ["imp op exentas", "op exentas", "imp exento"],
  otrosTributos: ["otros tributos", "imp otros tributos"],
  iva: ["iva", "imp iva"],
  totalIva: ["total iva", "imp total iva"],
  total: ["imp total", "importe total", "total"],
};

const RE_NETO_ALICUOTA = /^(?:imp )?neto gravado iva (\d+(?:[.,]\d+)?) ?%$/;
const RE_IVA_ALICUOTA = /^(?:imp )?iva (\d+(?:[.,]\d+)?) ?%$/;

interface Columnas {
  campos: Partial<Record<Campo, number>>;
  /** Por alicuotaId: columna del neto y del IVA de esa alícuota (diseño 2025). */
  porAlicuota: Map<number, { neto?: number; iva?: number }>;
}

function alicuotaPorPorcentaje(texto: string): number | null {
  const p = Number(texto.replace(",", "."));
  return ALICUOTAS_RECIBIDAS.find((a) => a.porcentaje === p)?.id ?? null;
}

function mapearColumnas(fila: readonly CeldaRecibida[]): Columnas {
  const campos: Partial<Record<Campo, number>> = {};
  const porAlicuota = new Map<number, { neto?: number; iva?: number }>();
  fila.forEach((celda, i) => {
    const t = normalizarTitulo(celda);
    if (!t) return;
    const neto = RE_NETO_ALICUOTA.exec(t);
    const iva = neto ? null : RE_IVA_ALICUOTA.exec(t);
    const m = neto ?? iva;
    if (m) {
      const id = alicuotaPorPorcentaje(m[1]);
      if (id != null) {
        const e = porAlicuota.get(id) ?? {};
        if (neto) e.neto = i;
        else e.iva = i;
        porAlicuota.set(id, e);
      }
      return;
    }
    for (const campo of Object.keys(SINONIMOS) as Campo[]) {
      if (campos[campo] == null && SINONIMOS[campo].includes(t)) {
        campos[campo] = i;
        return;
      }
    }
  });
  return { campos, porAlicuota };
}

/** Lo mínimo para reconocer el archivo: sin esto no es «Mis Comprobantes Recibidos». */
const CAMPOS_OBLIGATORIOS: readonly Campo[] = ["fecha", "tipo", "numeroDesde", "nroDoc", "total"];

function esFilaDeTitulos(c: Columnas): boolean {
  return CAMPOS_OBLIGATORIOS.every((k) => c.campos[k] != null);
}

// ---------------------------------------------------------------------------
// Celdas.
// ---------------------------------------------------------------------------

function texto(v: CeldaRecibida | undefined): string {
  if (v == null) return "";
  if (v instanceof Date) return "";
  return String(v).trim();
}

type Importe = { ok: true; valor: number } | { ok: false };

/** Un importe del archivo. Vacío es 0; el signo lo da el tipo, así que se toma el valor absoluto. */
function importe(v: CeldaRecibida | undefined): Importe {
  if (v == null || v === "") return { ok: true, valor: 0 };
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, valor: redondearAlCentavo(Math.abs(v)) } : { ok: false };
  if (typeof v !== "string") return { ok: false };
  const s = v.trim().replace(/^-/, "").replace(/^\((.*)\)$/, "$1");
  const l = leerImporte(s);
  if (l.estado === "vacio") return { ok: true, valor: 0 };
  if (l.estado === "invalida") return { ok: false };
  return { ok: true, valor: redondearAlCentavo(l.valor) };
}

/** La cotización se lee con todos sus decimales (ARCA manda hasta 6): no es un importe. */
function cotizacion(v: CeldaRecibida | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v).trim();
  // «1.050,25» → 1050.25 ; «1050.25» → 1050.25 ; «1,000000» → 1
  const limpio = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fechaFiscal(v: CeldaRecibida | undefined): string | null {
  let a: number, m: number, d: number;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // SheetJS arma la fecha en la hora local del servidor: se leen los campos locales.
    a = v.getFullYear();
    m = v.getMonth() + 1;
    d = v.getDate();
  } else {
    const s = texto(v);
    let r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (r) {
      d = Number(r[1]);
      m = Number(r[2]);
      a = Number(r[3]);
    } else if ((r = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) {
      a = Number(r[1]);
      m = Number(r[2]);
      d = Number(r[3]);
    } else if ((r = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) {
      a = Number(r[1]);
      m = Number(r[2]);
      d = Number(r[3]);
    } else return null;
  }
  const f = new Date(Date.UTC(a, m - 1, d));
  if (a < 2000 || a > 2100 || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${a}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

const NOMBRES_DE_TIPO: readonly [RegExp, number][] = [
  [/^factura de credito (electronica )?mipyme \(?fce\)? ?a$/, 201],
  [/^factura de credito (electronica )?mipyme \(?fce\)? ?b$/, 206],
  [/^factura de credito (electronica )?mipyme \(?fce\)? ?c$/, 211],
  [/^factura a$/, 1],
  [/^nota de debito a$/, 2],
  [/^nota de credito a$/, 3],
  [/^factura b$/, 6],
  [/^nota de debito b$/, 7],
  [/^nota de credito b$/, 8],
  [/^factura c$/, 11],
  [/^nota de debito c$/, 12],
  [/^nota de credito c$/, 13],
  [/^factura m$/, 51],
  [/^nota de debito m$/, 52],
  [/^nota de credito m$/, 53],
  [/^recibo a$/, 4],
  [/^nota de venta al contado a$/, 5],
  [/^recibo b$/, 9],
  [/^nota de venta al contado b$/, 10],
  [/^recibo c$/, 15],
  [/^nota de venta al contado c$/, 16],
  [/^liquidacion de servicios publicos clase a$/, 17],
  [/^liquidacion de servicios publicos clase b$/, 18],
  [/^recibo m$/, 54],
  [/^cuenta de venta y liquido producto a$/, 60],
  [/^cuenta de venta y liquido producto b$/, 61],
  [/^liquidacion a$/, 63],
  [/^liquidacion b$/, 64],
  [/^tique factura a$/, 81],
  [/^tique factura b$/, 82],
  [/^tique factura c$/, 111],
  [/^tique nota de credito a$/, 112],
  [/^tique nota de credito b$/, 113],
  [/^tique nota de credito c$/, 114],
  [/^tique nota de debito a$/, 115],
  [/^tique nota de debito b$/, 116],
  [/^tique nota de debito c$/, 117],
  [/^tique factura m$/, 118],
  [/^tique nota de credito m$/, 119],
  [/^tique nota de debito m$/, 120],
];

/** «1 - Factura A», «001», 1, «Factura A» → 1. */
function tipoDeComprobante(v: CeldaRecibida | undefined): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  const s = texto(v);
  const r = /^0*(\d{1,3})\b/.exec(s);
  if (r) return Number(r[1]);
  const n = normalizarTitulo(s);
  return NOMBRES_DE_TIPO.find(([re]) => re.test(n))?.[1] ?? null;
}

function entero(v: CeldaRecibida | undefined): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  const s = texto(v);
  return /^\d{1,9}$/.test(s) ? Number(s) : null;
}

function monedaDe(v: CeldaRecibida | undefined): string {
  const s = texto(v).toUpperCase();
  if (s === "" || s === "$" || s === "PES" || s === "ARS" || s === "PESOS") return "PES";
  return s;
}

const CUIT_EN_TEXTO = /\b(\d{2})-?(\d{8})-?(\d)\b/;

// ---------------------------------------------------------------------------
// Alícuotas: asignación sin inventar.
// ---------------------------------------------------------------------------

/** Diferencia tolerada entre el IVA calculado y el informado (redondeo de ARCA por línea). */
const TOLERANCIA_IVA = 0.02;
/** Diferencia tolerada entre la suma de los importes y el total. */
const TOLERANCIA_TOTAL = 0.05;

function ivaEsperado(base: number, alicuotaId: number): number {
  const p = ALICUOTAS_RECIBIDAS.find((a) => a.id === alicuotaId)!.porcentaje;
  return redondearAlCentavo((base * p) / 100);
}

/** La alícuota vigente más alta (27 %) y la de 0 %: los bordes de lo que una mezcla puede dar. */
const ALICUOTA_MAS_ALTA = ALICUOTAS_RECIBIDAS.reduce((a, b) => (b.porcentaje > a.porcentaje ? b : a));
const ALICUOTA_CERO = ALICUOTAS_RECIBIDAS.find((a) => a.porcentaje === 0)!;

/** «15», «15,75»: el IVA como porcentaje del neto, para el motivo (no es plata). */
const porcentajeDelNeto = (iva: number, neto: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format((iva / neto) * 100);

/**
 * Diseño clásico: un neto gravado y un IVA, sin el desglose por alícuota. PURA.
 *   · Si UNA alícuota vigente cierra exacto, ése es el desglose. Con IVA cero, la que cierra es 0 %.
 *   · Si ninguna cierra sola, queda «a revisar»: no suma al crédito hasta que la contadora mire el
 *     comprobante y lo marque revisado (revisarRecibido; ahí suma, sin desglose). Puede ser una
 *     factura con varias alícuotas (21 % + 10,5 % da cualquier cosa entre 10,5 y 21 %), pero con un
 *     neto y un IVA sueltos no hay forma de distinguirla de un IVA mal informado (QA vuelta 5: un
 *     15 % entraba al crédito del paquete FINAL), y el Libro IVA Digital pide el IVA por alícuota.
 *     Reemplaza la regla del refutador 26/09 («la mezcla suma sola»): su objeción era que marcarla
 *     la dejaba afuera del crédito sin forma de corregirlo, y hoy la corrección existe.
 *   · Con más IVA que el 27 % del neto, o IVA sin neto gravado, ninguna mezcla lo explica: se dice así.
 */
function alicuotaDeduciendo(neto: number, iva: number): { desglose: LineaIvaRecibida[] | null; aRevisar: string | null } {
  if (neto === 0 && iva === 0) return { desglose: [], aRevisar: null };
  if (neto === 0) {
    return { desglose: null, aRevisar: "Tiene IVA pero no tiene neto gravado: revisá el comprobante." };
  }
  if (iva === 0) return { desglose: [{ alicuotaId: ALICUOTA_CERO.id, base: neto, importe: 0 }], aRevisar: null };
  const candidatas = ALICUOTAS_RECIBIDAS.filter(
    (a) => a.porcentaje > 0 && Math.abs(ivaEsperado(neto, a.id) - iva) <= TOLERANCIA_IVA,
  );
  if (candidatas.length === 1) {
    return { desglose: [{ alicuotaId: candidatas[0].id, base: neto, importe: iva }], aRevisar: null };
  }
  if (iva > ivaEsperado(neto, ALICUOTA_MAS_ALTA.id) + TOLERANCIA_IVA) {
    return {
      desglose: null,
      aRevisar: `El IVA es más del ${ALICUOTA_MAS_ALTA.etiqueta.replace("%", " %")} del neto gravado: ninguna alícuota vigente lo explica. Revisá el comprobante.`,
    };
  }
  if (neto > 0 && iva > 0) {
    return {
      desglose: null,
      aRevisar:
        `El IVA es el ${porcentajeDelNeto(iva, neto)} % del neto gravado y ninguna alícuota sola da eso. ` +
        "El archivo clásico de ARCA no separa el IVA por alícuota: si es una factura con varias, marcala revisada y suma al crédito.",
    };
  }
  return { desglose: null, aRevisar: "El IVA no cierra con el neto gravado: revisá el comprobante." };
}

// ---------------------------------------------------------------------------
// La lectura.
// ---------------------------------------------------------------------------

/** Tope de comprobantes por archivo: un mes de un cliente grande entra holgado. */
export const MAXIMO_DE_FILAS = 20_000;
/** Cuántas filas de arriba se miran buscando los títulos. */
const FILAS_DE_ENCABEZADO = 10;

export function leerRecibidos(matriz: readonly (readonly CeldaRecibida[])[]): LecturaRecibidos {
  let inicio = -1;
  let columnas: Columnas | null = null;
  let cuitDelArchivo: string | null = null;
  for (let i = 0; i < Math.min(FILAS_DE_ENCABEZADO, matriz.length); i++) {
    const c = mapearColumnas(matriz[i]);
    if (esFilaDeTitulos(c)) {
      inicio = i;
      columnas = c;
      break;
    }
    // Renglón de título del Excel: «Mis Comprobantes Recibidos - CUIT 20123456786».
    for (const celda of matriz[i]) {
      const m = CUIT_EN_TEXTO.exec(texto(celda));
      if (m && cuitDelArchivo == null && /cuit/i.test(texto(celda))) cuitDelArchivo = `${m[1]}${m[2]}${m[3]}`;
    }
  }
  if (!columnas) {
    return {
      ok: false,
      error:
        "Este archivo no parece «Mis Comprobantes Recibidos» de ARCA: no encontramos las columnas Fecha, Tipo, " +
        "Número, Nro. Doc. Emisor e Imp. Total. Bajalo de nuevo desde ARCA, sin editarlo.",
    };
  }
  const filas = matriz.slice(inicio + 1);
  if (filas.length > MAXIMO_DE_FILAS) {
    return {
      ok: false,
      error: `El archivo trae ${filas.length} comprobantes y el tope es ${MAXIMO_DE_FILAS}. Bajalo de ARCA por mes y subilo de a uno.`,
    };
  }

  const { campos, porAlicuota } = columnas;
  const diseno: "clasico" | "por-alicuota" = porAlicuota.size > 0 ? "por-alicuota" : "clasico";
  const comprobantes: ComprobanteRecibido[] = [];
  const rechazos: RechazoRecibido[] = [];
  const repetidos: RechazoRecibido[] = [];
  const vistas = new Map<string, number>();

  filas.forEach((fila, k) => {
    const nFila = inicio + k + 2; // 1-based, contando la fila de títulos
    if (fila.every((c) => c == null || texto(c) === "")) return;
    const celda = (campo: Campo) => (campos[campo] == null ? undefined : fila[campos[campo]!]);
    const rechazar = (motivo: string, comprobante: string | null = null) => rechazos.push({ fila: nFila, comprobante, motivo });

    // Fila de totales que algunas planillas agregan al pie: sin tipo ni número, no es un comprobante.
    const tipo = tipoDeComprobante(celda("tipo"));
    let puntoVenta = entero(celda("puntoVenta"));
    let numero = entero(celda("numeroDesde"));
    const combinado = /^(\d{1,5})-(\d{1,8})$/.exec(texto(celda("numeroDesde")));
    if (combinado) {
      puntoVenta = Number(combinado[1]);
      numero = Number(combinado[2]);
    }
    const hasta = campos.numeroHasta == null ? numero : entero(celda("numeroHasta"));

    if (tipo == null) return rechazar("No se entiende el tipo de comprobante.");
    if (!TIPOS[tipo]) {
      return rechazar(
        `${nombreDelTipo(tipo)}: este sistema todavía no importa ese tipo de comprobante, así que no se cargó. ` +
          "Si da crédito fiscal, sumalo aparte al preparar el Libro IVA Digital y avisale a Soporte GSG para que lo agreguemos.",
      );
    }
    if (puntoVenta == null || puntoVenta < 1 || puntoVenta > 99_999) return rechazar("Falta el punto de venta o no es un número.");
    if (numero == null || numero < 1) return rechazar("Falta el número del comprobante o no es un número.");
    const rotulo = rotuloRecibido({ tipo, puntoVenta, numero });
    if (hasta != null && hasta !== numero) {
      return rechazar("Trae un rango de números (Desde y Hasta distintos): en compras va un comprobante por renglón.", rotulo);
    }
    const fecha = fechaFiscal(celda("fecha"));
    if (!fecha) return rechazar("La fecha no es válida (se espera dd/mm/aaaa).", rotulo);

    const tipoDoc = entero(celda("tipoDoc"));
    if (campos.tipoDoc != null && tipoDoc !== 80) return rechazar("El emisor no está identificado con CUIT.", rotulo);
    const cuitEmisor = normalizarCuit(texto(celda("nroDoc")) || String(celda("nroDoc") ?? ""));
    if (!cuitValido(cuitEmisor)) return rechazar("El CUIT del emisor no es válido.", rotulo);

    const moneda = monedaDe(celda("moneda"));
    const tc = moneda === "PES" ? 1 : cotizacion(celda("tipoCambio"));
    if (tc == null) return rechazar(`Está en moneda extranjera (${moneda}) y no trae el tipo de cambio.`, rotulo);

    // Importes en la moneda del comprobante.
    const leer = (campo: Campo): number | null => {
      const r = importe(celda(campo));
      return r.ok ? r.valor : null;
    };
    const total = leer("total");
    const noGravado = leer("noGravado");
    const exento = leer("exento");
    const otrosInformados = leer("otrosTributos");
    if (total == null || noGravado == null || exento == null || otrosInformados == null) {
      return rechazar("Hay un importe que no es un número.", rotulo);
    }
    if (total === 0) return rechazar("El total es cero.", rotulo);

    let neto: number;
    let iva: number;
    let desglose: LineaIvaRecibida[] | null;
    let aRevisar: string | null = null;

    if (diseno === "por-alicuota") {
      const lineas: LineaIvaRecibida[] = [];
      for (const [alicuotaId, col] of porAlicuota) {
        const b = importe(col.neto == null ? null : fila[col.neto]);
        const m = importe(col.iva == null ? null : fila[col.iva]);
        if (!b.ok || !m.ok) return rechazar("Hay un importe que no es un número.", rotulo);
        if (b.valor !== 0 || m.valor !== 0) lineas.push({ alicuotaId, base: b.valor, importe: m.valor });
      }
      lineas.sort((x, y) => x.alicuotaId - y.alicuotaId);
      const netoTotal = campos.netoGravadoTotal != null ? leer("netoGravadoTotal") : null;
      const ivaTotal = campos.totalIva != null ? leer("totalIva") : null;
      neto = netoTotal ?? sumarAlCentavo(lineas.map((l) => l.base));
      iva = ivaTotal ?? sumarAlCentavo(lineas.map((l) => l.importe));
      desglose = lineas;
      const mala = lineas.find((l) => Math.abs(ivaEsperado(l.base, l.alicuotaId) - l.importe) > TOLERANCIA_IVA);
      if (mala) {
        aRevisar = `El IVA ${etiquetaAlicuota(mala.alicuotaId)} no cierra con su neto: revisá el comprobante.`;
        desglose = null;
      } else if (
        Math.abs(sumarAlCentavo(lineas.map((l) => l.importe)) - iva) > TOLERANCIA_IVA ||
        Math.abs(sumarAlCentavo(lineas.map((l) => l.base)) - neto) > TOLERANCIA_IVA
      ) {
        aRevisar = "El IVA por alícuota no suma el total de IVA del comprobante: revisá el comprobante.";
        desglose = null;
      }
    } else {
      const n = leer(campos.netoGravadoTotal != null ? "netoGravadoTotal" : "netoGravado");
      const v = leer(campos.totalIva != null ? "totalIva" : "iva");
      if (n == null || v == null) return rechazar("Hay un importe que no es un número.", rotulo);
      neto = n;
      iva = v;
      desglose = null;
    }

    // Lo que no está en neto, IVA, no gravado ni exento: percepciones y otros tributos.
    let otrosTributos = otrosInformados;
    if (!discriminaIva(tipo)) {
      // B y C: el IVA va dentro del precio y no es crédito fiscal. Se guarda lo que dice ARCA.
      iva = 0;
      desglose = [];
      aRevisar = null;
    } else {
      if (diseno === "clasico") {
        const d = alicuotaDeduciendo(neto, iva);
        desglose = d.desglose;
        aRevisar = d.aRevisar;
        if (campos.otrosTributos == null) {
          const resto = redondearAlCentavo(total - neto - noGravado - exento - iva);
          if (resto > TOLERANCIA_TOTAL) otrosTributos = resto;
        }
      }
      const suma = sumarAlCentavo([neto, noGravado, exento, iva, otrosTributos]);
      if (aRevisar == null && Math.abs(suma - total) > TOLERANCIA_TOTAL) {
        aRevisar = "Neto, IVA, no gravado, exento y otros tributos no suman el total: revisá el comprobante.";
      }
    }

    const clave = claveRecibido({ cuitEmisor, tipo, puntoVenta, numero });
    const previa = vistas.get(clave);
    if (previa != null) {
      repetidos.push({ fila: nFila, comprobante: rotulo, motivo: `Está repetido en el archivo (ya aparece en la fila ${previa}): se toma una sola vez.` });
      return;
    }
    vistas.set(clave, nFila);

    // A pesos, con la regla única de redondeo.
    const aPesos = (x: number) => (tc === 1 ? x : redondearAlCentavo(x * tc));
    comprobantes.push({
      fila: nFila,
      fecha,
      tipo,
      puntoVenta,
      numero,
      cuitEmisor,
      emisor: texto(celda("denominacion")) || "Emisor sin nombre en el archivo",
      codAutorizacion: texto(celda("codAutorizacion")) || null,
      moneda,
      cotizacion: tc,
      neto: aPesos(neto),
      noGravado: aPesos(noGravado),
      exento: aPesos(exento),
      iva: aPesos(iva),
      otrosTributos: aPesos(otrosTributos),
      total: aPesos(total),
      desglose: desglose?.map((l) => ({ alicuotaId: l.alicuotaId, base: aPesos(l.base), importe: aPesos(l.importe) })) ?? null,
      aRevisar,
    });
  });

  return { ok: true, cuitDelArchivo, diseno, comprobantes, rechazos, repetidos };
}

// ---------------------------------------------------------------------------
// Resumen (las notas de crédito restan).
// ---------------------------------------------------------------------------

export interface ResumenRecibidos {
  cantidad: number;
  notasDeCredito: number;
  aRevisar: number;
  sinCreditoFiscal: number;
  neto: number;
  noGravado: number;
  exento: number;
  otrosTributos: number;
  iva: number;
  /** IVA crédito fiscal por alícuota: lo que suma y tiene desglose. */
  ivaPorAlicuota: { alicuotaId: number; etiqueta: string; base: number; importe: number }[];
  /** IVA que SUMA al crédito sin desglose por alícuota (los «a revisar» que la contadora revisó). */
  ivaSinAlicuota: number;
  /** IVA de los comprobantes «a revisar»: NO suma al crédito hasta que se revisen. */
  ivaARevisar: number;
  /** El crédito fiscal del mes: la suma de `creditoFiscalDelRecibido` (lo mismo que el archivo y el Libro IVA). */
  creditoFiscal: number;
  total: number;
}

type ParaResumir = Pick<
  ComprobanteRecibido,
  "tipo" | "neto" | "noGravado" | "exento" | "otrosTributos" | "iva" | "total" | "desglose" | "aRevisar"
>;

/**
 * Lo que un comprobante recibido suma al crédito fiscal del mes, con su signo (la nota de crédito
 * resta). Sólo A y M discriminan IVA; «a revisar» suma 0 hasta que la contadora lo revise. PURA.
 * Es la ÚNICA regla: la usan la pantalla (resumirRecibidos), el archivo para el libro de IVA compras
 * (recibidos-export.ts) y el Libro IVA y el paquete del negocio (recibidos-libro.ts). QA vuelta 5:
 * el archivo sumaba la fila marcada y la pantalla no.
 */
export function creditoFiscalDelRecibido(c: { tipo: number; iva: number; aRevisar: string | null }): number {
  if (c.aRevisar != null || c.iva === 0 || !discriminaIva(c.tipo)) return 0;
  return esNotaDeCreditoRecibida(c.tipo) ? -c.iva : c.iva;
}

export function resumirRecibidos(lista: readonly ParaResumir[]): ResumenRecibidos {
  const s = (c: ParaResumir) => (esNotaDeCreditoRecibida(c.tipo) ? -1 : 1);
  const sumar = (f: (c: ParaResumir) => number) => sumarAlCentavo(lista.map((c) => s(c) * f(c)));
  const porAlicuota = new Map<number, { base: number[]; importe: number[] }>();
  const sinAlicuota: number[] = [];
  const aRevisar: number[] = [];
  for (const c of lista) {
    if (!discriminaIva(c.tipo)) continue;
    // Marcado: afuera del crédito, tenga o no desglose (un total que no cierra conserva sus líneas).
    if (c.aRevisar != null) {
      aRevisar.push(s(c) * c.iva);
      continue;
    }
    if (c.desglose == null) {
      sinAlicuota.push(s(c) * c.iva);
      continue;
    }
    for (const l of c.desglose) {
      const e = porAlicuota.get(l.alicuotaId) ?? { base: [], importe: [] };
      e.base.push(s(c) * l.base);
      e.importe.push(s(c) * l.importe);
      porAlicuota.set(l.alicuotaId, e);
    }
  }
  return {
    cantidad: lista.length,
    notasDeCredito: lista.filter((c) => esNotaDeCreditoRecibida(c.tipo)).length,
    aRevisar: lista.filter((c) => c.aRevisar != null).length,
    sinCreditoFiscal: lista.filter((c) => !discriminaIva(c.tipo)).length,
    neto: sumar((c) => c.neto),
    noGravado: sumar((c) => c.noGravado),
    exento: sumar((c) => c.exento),
    otrosTributos: sumar((c) => c.otrosTributos),
    iva: sumar((c) => c.iva),
    ivaPorAlicuota: ALICUOTAS_RECIBIDAS.filter((a) => porAlicuota.has(a.id)).map((a) => ({
      alicuotaId: a.id,
      etiqueta: a.etiqueta,
      base: sumarAlCentavo(porAlicuota.get(a.id)!.base),
      importe: sumarAlCentavo(porAlicuota.get(a.id)!.importe),
    })),
    ivaSinAlicuota: sumarAlCentavo(sinAlicuota),
    ivaARevisar: sumarAlCentavo(aRevisar),
    creditoFiscal: sumarAlCentavo(lista.map(creditoFiscalDelRecibido)),
    total: sumar((c) => c.total),
  };
}

/** Rótulo de la marca «a revisar» dentro de `notes` de la compra (sin columna propia hasta M1). */
export const NOTA_A_REVISAR = "A revisar:";

/** La marca «a revisar» de una compra, leída de sus notas; null si no tiene. PURA. */
export function aRevisarDeNotas(notes: string | null): string | null {
  if (!notes) return null;
  const i = notes.indexOf(NOTA_A_REVISAR);
  return i === -1 ? null : notes.slice(i + NOTA_A_REVISAR.length).trim();
}

/** Lo que queda en `notes` después de que la contadora revisó el comprobante (revisarRecibido). */
export const NOTA_REVISADO = "Revisado por";

/**
 * Las notas de una compra «a revisar» ya revisada: la marca se reemplaza por quién y cuándo la revisó,
 * con lo que decía (para la auditoría). Sin la marca, el Libro IVA la cuenta. PURA.
 */
export function notasRevisadas(notes: string, por: string, fecha: string): string {
  const i = notes.indexOf(NOTA_A_REVISAR);
  if (i === -1) return notes;
  const sinMarca = (s: string) => s.split(NOTA_A_REVISAR).join("").replace(/\s+/g, " ").trim();
  const motivo = sinMarca(notes.slice(i + NOTA_A_REVISAR.length));
  const quien = sinMarca(por).slice(0, 80) || "el estudio";
  return `${notes.slice(0, i).trimEnd()} ${NOTA_REVISADO} ${quien} el ${fecha}: su IVA suma al crédito fiscal (estaba marcado: ${motivo})`.trim();
}
