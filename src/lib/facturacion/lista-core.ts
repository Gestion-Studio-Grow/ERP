// ============================================================================
// LISTA DE COMPROBANTES — las reglas puras (filtros de la URL, buscador, CSV).
// ============================================================================
//
// La lista de Facturación leía los últimos 100 comprobantes sin filtros ni páginas, y contaba
// autorizadas y rechazadas sobre esos 100 (facturacion-actions.ts, `take: 100`). Un comercio que
// emite miles por mes no encontraba nada. Acá vive lo que decide QUÉ se busca; la consulta a la
// base está en `lista.server.ts` y la pantalla en facturacion/ComprobantesArca.tsx.
//
// Reglas:
//   · El período por defecto es el MES en curso (hora del negocio). Si hay algo escrito en el
//     buscador y el período no vino en la URL, se busca en TODOS los meses: quien busca una
//     factura por número o por CUIT casi nunca sabe de qué mes era.
//   · Los filtros viven en la URL: se comparten, se recargan y el botón «atrás» funciona.
//   · 50 por página. Los totales son del filtro entero, no de la página (los calcula la base).
//   · Las notas de crédito RESTAN: en el total, en su renglón y en el CSV van en negativo, con la
//     misma regla que el Libro IVA (`esNotaDeCredito`, libro-iva.ts:93). Una factura de $10.000
//     anulada con su nota de crédito suma $0, no $20.000.
//
// PURO: sin base ni framework. Lo prueba lista-core.test.ts.

import { leerImporte } from "@/lib/dinero/leer";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { pesosCsv } from "@/lib/libros/csv-ar";
import { TipoComprobante } from "@/plugins/arca/domain/catalogos";

export const POR_PAGINA = 50;
/** Tope del CSV: un mes de un comercio grande entra de sobra; más que eso, se acota el período. */
export const TOPE_CSV = 20_000;

export type EstadoFiltro = "todos" | "atencion" | "pendiente" | "rechazada" | "autorizada";
export type TipoFiltro = "todos" | "A" | "B" | "C" | "NC";

export interface FiltrosComprobantes {
  estado: EstadoFiltro;
  tipo: TipoFiltro;
  /** Punto de venta, o null = todos. */
  puntoVenta: number | null;
  /** AAAA-MM-DD inclusive, o null = sin límite (sólo cuando se busca sin período explícito). */
  desde: string | null;
  hasta: string | null;
  /** Texto del buscador, ya recortado ("" = sin búsqueda). */
  q: string;
  pagina: number;
}

export const ESTADOS: readonly { valor: EstadoFiltro; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "atencion", etiqueta: "Necesitan atención" },
  { valor: "pendiente", etiqueta: "Pendientes de autorizar" },
  { valor: "rechazada", etiqueta: "Rechazados por ARCA" },
  { valor: "autorizada", etiqueta: "Autorizados" },
];

export const TIPOS: readonly { valor: TipoFiltro; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos los tipos" },
  { valor: "A", etiqueta: "Factura A" },
  { valor: "B", etiqueta: "Factura B" },
  { valor: "C", etiqueta: "Factura C" },
  { valor: "NC", etiqueta: "Notas de crédito" },
];

/** Estados de la base que entran en cada filtro de estado. */
export function estadosDelFiltro(e: EstadoFiltro): ("PENDING" | "AUTHORIZED" | "REJECTED")[] | null {
  switch (e) {
    case "atencion":
      return ["PENDING", "REJECTED"];
    case "pendiente":
      return ["PENDING"];
    case "rechazada":
      return ["REJECTED"];
    case "autorizada":
      return ["AUTHORIZED"];
    default:
      return null;
  }
}

/**
 * Las notas de crédito (códigos de ARCA 3, 8 y 13): el filtro «Notas de crédito» y lo que RESTA en
 * los totales. Es la regla del Libro IVA (`esNotaDeCredito`); lista-core.test.ts las compara.
 */
export const TIPOS_NOTA_DE_CREDITO: readonly number[] = [
  TipoComprobante.NotaCreditoA,
  TipoComprobante.NotaCreditoB,
  TipoComprobante.NotaCreditoC,
];

/** Códigos de ARCA (WSFEv1) de cada filtro de tipo. Factura A = 1, B = 6, C = 11; NC = 3, 8, 13. */
export function tiposDelFiltro(t: TipoFiltro): number[] | null {
  switch (t) {
    case "A":
      return [1];
    case "B":
      return [6];
    case "C":
      return [11];
    case "NC":
      return [...TIPOS_NOTA_DE_CREDITO];
    default:
      return null;
  }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(s: string | undefined): string | null {
  if (!s || !FECHA.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** Primer y último día del mes de `hoy` (AAAA-MM-DD). */
export function mesDe(hoy: string): { desde: string; hasta: string } {
  const [a, m] = hoy.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

type Sp = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lee los filtros de la URL. Lo inválido cae al valor por defecto, nunca rompe la pantalla. */
export function leerFiltros(sp: Sp, hoy: string): FiltrosComprobantes {
  const q = (uno(sp.q) ?? "").trim().slice(0, 80);
  const estadoRaw = uno(sp.estado);
  const estado = ESTADOS.some((e) => e.valor === estadoRaw) ? (estadoRaw as EstadoFiltro) : "todos";
  const tipoRaw = uno(sp.tipo);
  const tipo = TIPOS.some((t) => t.valor === tipoRaw) ? (tipoRaw as TipoFiltro) : "todos";
  const pvRaw = Number(uno(sp.pv));
  const puntoVenta = Number.isInteger(pvRaw) && pvRaw > 0 && pvRaw < 100_000 ? pvRaw : null;
  let desde = fechaValida(uno(sp.desde));
  let hasta = fechaValida(uno(sp.hasta));
  if (!desde && !hasta && !q) ({ desde, hasta } = mesDe(hoy));
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const pagRaw = Number(uno(sp.pagina));
  const pagina = Number.isInteger(pagRaw) && pagRaw > 1 ? Math.min(pagRaw, 100_000) : 1;
  return { estado, tipo, puntoVenta, desde, hasta, q, pagina };
}

/** La URL de la lista con estos filtros (sin los valores por defecto, para que quede corta). */
export function urlDeLista(base: string, f: FiltrosComprobantes, cambios: Partial<FiltrosComprobantes> = {}): string {
  const g = { ...f, ...cambios };
  const p = new URLSearchParams();
  if (g.q) p.set("q", g.q);
  if (g.estado !== "todos") p.set("estado", g.estado);
  if (g.tipo !== "todos") p.set("tipo", g.tipo);
  if (g.puntoVenta) p.set("pv", String(g.puntoVenta));
  if (g.desde) p.set("desde", g.desde);
  if (g.hasta) p.set("hasta", g.hasta);
  if (g.pagina > 1) p.set("pagina", String(g.pagina));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** Lo que se puede buscar con lo escrito. Cada parte no nula suma una forma de encontrar. */
export interface Busqueda {
  /** Nombre o razón social del receptor (contiene, sin distinguir mayúsculas). */
  texto: string | null;
  /** Documento del receptor (CUIT/CUIL/DNI) que EMPIEZA con estos dígitos. */
  documento: string | null;
  /** Número de comprobante exacto (y, si se escribió «0001-00000123», también el punto de venta). */
  numero: number | null;
  puntoVenta: number | null;
  /** Total exacto, en pesos. */
  importe: number | null;
}

export function interpretarBusqueda(q: string): Busqueda {
  const vacio: Busqueda = { texto: null, documento: null, numero: null, puntoVenta: null, importe: null };
  const s = q.trim();
  if (!s) return vacio;
  // «0001-00000123» o «1-123»: punto de venta y número.
  const pvNum = /^(\d{1,5})-(\d{1,8})$/.exec(s);
  if (pvNum) return { ...vacio, puntoVenta: Number(pvNum[1]), numero: Number(pvNum[2]) };
  const sinSignos = s.replace(/^\$\s*/, "");
  const soloDigitos = s.replace(/[\s.\-]/g, "");
  const tieneLetras = /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(s);
  if (tieneLetras) return { ...vacio, texto: s };
  const importe = leerImporte(sinSignos);
  const out: Busqueda = { ...vacio };
  if (importe.estado === "ok" && importe.valor > 0) out.importe = importe.valor;
  if (/^\d+$/.test(soloDigitos)) {
    // Un número de comprobante tiene hasta 8 cifras; un documento, de 7 a 11.
    if (soloDigitos.length <= 8) out.numero = Number(soloDigitos);
    if (soloDigitos.length >= 6) out.documento = soloDigitos;
  }
  return out;
}

/** Escapa los comodines de LIKE (%, _ y la barra) para buscar el texto tal cual. */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ── Buscar sin tildes ────────────────────────────────────────────────────────
// En el celular casi nadie escribe tildes: «monica perez» tiene que encontrar a «Mónica Pérez».
// Sin la extensión `unaccent` (sumarla es una migración), la base saca las tildes letra por letra
// con `translate(lower(…), CON_TILDE, SIN_TILDE)` y lo escrito se compara igual (`textoComparable`).
// Las mayúsculas con tilde van en la tabla por si `lower` no las baja (depende de la configuración
// regional de la base). La usan la lista de comprobantes y la de clientes: una sola tabla.
const SIN_TILDE_MINUSCULAS = "aaaaaeeeeiiiiooooouuuunc";
export const CON_TILDE = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
export const SIN_TILDE = SIN_TILDE_MINUSCULAS + SIN_TILDE_MINUSCULAS;

/** Lo escrito como lo compara la base: en minúsculas y sin tildes. */
export function textoComparable(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Un LIKE barato que deja pasar TODO lo que la comparación sin tildes encontraría (y algo más):
 * cada letra que en la base puede venir con tilde (a, e, i, o, u, n, c) pasa a ser «cualquier
 * letra» (`_`). La base lo mira primero y sólo les saca las tildes (`translate`, lo caro) a los
 * nombres que pasan: con 50.000 comprobantes, sacárselas a todos pasaba el presupuesto.
 */
export function patronAmplio(texto: string): string {
  return escaparLike(textoComparable(texto)).replace(/[aeiounc]/g, "_");
}

// ── La vista que abre Facturación ────────────────────────────────────────────

export type VistaDeFacturacion = "comprobantes" | "cobrar-con-link";

/** Parámetros de la URL que son de la lista de comprobantes (un filtro, una búsqueda, una página). */
const PARAMETROS_DE_LA_LISTA = ["q", "estado", "tipo", "pv", "desde", "hasta", "pagina"] as const;

/**
 * Qué pestaña abre Facturación. La que se pidió manda; una búsqueda, un filtro o una página de la
 * lista abren la lista. Sin nada pedido: la lista, si el negocio tiene comprobantes; si no tiene
 * ninguno (CH, con ARCA apagado), «Cobrar con link», que es lo que abría antes: una lista vacía
 * no es el trabajo del día.
 */
export function vistaDeFacturacion(sp: Sp, hayComprobantes: boolean): VistaDeFacturacion {
  const vista = uno(sp.vista);
  if (vista === "cobrar-con-link" || vista === "comprobantes") return vista;
  if (PARAMETROS_DE_LA_LISTA.some((p) => uno(sp[p]) !== undefined)) return "comprobantes";
  return hayComprobantes ? "comprobantes" : "cobrar-con-link";
}

// ── Lo que se muestra ────────────────────────────────────────────────────────

export type EstadoComprobante = "PENDING" | "AUTHORIZED" | "REJECTED";

export interface RenglonComprobante {
  id: string;
  fecha: string; // AAAAMMDD (fecha del comprobante)
  tipoComprobante: number | null;
  puntoVenta: number;
  numero: number | null;
  status: EstadoComprobante;
  /** Con signo: la nota de crédito, en negativo (resta, como en el Libro IVA). */
  total: number;
  docTipo: number;
  docNro: string;
  receptor: string | null;
  cae: string | null;
  rechazoMotivo: string | null;
}

export interface TotalPorEstado {
  cantidad: number;
  /** Suma de los totales CON SIGNO (las notas de crédito restan), en la base con numeric: exacta al centavo. */
  importe: number;
}

export interface TotalesDelFiltro {
  cantidad: number;
  porEstado: Record<EstadoComprobante, TotalPorEstado>;
}

export interface PaginaDeComprobantes {
  renglones: RenglonComprobante[];
  totales: TotalesDelFiltro;
  pagina: number;
  paginas: number;
}

export function totalesVacios(): TotalesDelFiltro {
  const cero = () => ({ cantidad: 0, importe: 0 });
  return { cantidad: 0, porEstado: { PENDING: cero(), AUTHORIZED: cero(), REJECTED: cero() } };
}

/** ¿Es una nota de crédito (resta)? */
export function esNotaDeCreditoTipo(tipo: number | null): boolean {
  return tipo !== null && TIPOS_NOTA_DE_CREDITO.includes(tipo);
}

/**
 * Lo facturado con signo, al centavo: las notas de crédito restan. Recibe la suma de cada tipo de
 * comprobante (un GROUP BY en la base). Una factura de $10.000 anulada con su nota suma $0.
 */
export function facturadoConSigno(porTipo: readonly { tipoComprobante: number | null; total: number }[]): number {
  return sumarAlCentavo(porTipo.map((g) => (esNotaDeCreditoTipo(g.tipoComprobante) ? -g.total : g.total)));
}

/** Cuántas páginas de 50 hay para esa cantidad (al menos una, para que «1 de 1» se lea). */
export function paginasPara(cantidad: number): number {
  return Math.max(1, Math.ceil(cantidad / POR_PAGINA));
}

const LETRA: Readonly<Record<number, string>> = {
  1: "Factura A", 2: "Nota de débito A", 3: "Nota de crédito A",
  6: "Factura B", 7: "Nota de débito B", 8: "Nota de crédito B",
  11: "Factura C", 12: "Nota de débito C", 13: "Nota de crédito C",
};

/** «Factura B», «Nota de crédito A»… Sin tipo todavía (pendiente): «Sin autorizar». */
export function nombreDeTipo(tipo: number | null): string {
  if (tipo === null) return "Sin autorizar";
  return LETRA[tipo] ?? `Tipo ${tipo}`;
}

/** Quién recibe: el nombre si lo hay; si no, el documento; consumidor final sin identificar. */
export function nombreDelReceptor(r: Pick<RenglonComprobante, "receptor" | "docTipo" | "docNro">): string {
  if (r.receptor?.trim()) return r.receptor.trim();
  if (r.docTipo === 99 || !r.docNro || r.docNro === "0") return "Consumidor final";
  return `${r.docTipo === 80 ? "CUIT" : r.docTipo === 96 ? "DNI" : "Doc."} ${r.docNro}`;
}

const ESTADO_CSV: Readonly<Record<EstadoComprobante, string>> = {
  PENDING: "Pendiente de autorizar",
  AUTHORIZED: "Autorizado",
  REJECTED: "Rechazado",
};

export const CABECERA_CSV = [
  "Fecha", "Tipo", "Punto de venta", "Número", "Receptor", "Documento", "Estado ante ARCA", "CAE",
  "Total (las notas de crédito, en negativo)", "Motivo del rechazo",
] as const;

/** Los campos de un renglón del CSV, en el orden de `CABECERA_CSV`. El total, con signo y coma decimal (Excel en castellano). */
export function camposCsv(r: RenglonComprobante): (string | number)[] {
  const f = r.fecha;
  return [
    f.length === 8 ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : f,
    nombreDeTipo(r.tipoComprobante),
    r.puntoVenta,
    r.numero ?? "",
    nombreDelReceptor(r),
    r.docTipo === 99 ? "" : r.docNro,
    ESTADO_CSV[r.status],
    r.cae ?? "",
    pesosCsv(r.total),
    r.rechazoMotivo ?? "",
  ];
}
