// ============================================================================
// COMPROBANTE IMPRESO (R3-F1) — el ÚNICO generador del PDF de un comprobante.
// ============================================================================
//
// Lo usan la vista imprimible de Facturación (src/app/admin/(dashboard)/facturacion/
// comprobante/[id]) y, más adelante, la consola del contador: una sola representación
// impresa, así dos salidas no pueden contradecirse.
//
// Regla fiscal (fail-closed): si falta un dato que el comprobante impreso tiene que llevar,
// NO hay PDF. `faltantesDelComprobante` dice qué falta y cómo seguir; la pantalla lo muestra
// tal cual. Un comprobante sin CAE (pendiente o rechazado) no se imprime nunca.
//
// Qué lleva (RG 1415 Anexo II · RG 4291 · QR de la RG 4892 · Ley 27.743 y RG 5614/2024):
//   emisor (razón social, domicilio, condición frente al IVA, CUIT, Ingresos Brutos, inicio de
//   actividades), letra y código, punto de venta y número, fecha, receptor, detalle, totales,
//   CAE con su vencimiento y el QR con la URL de `urlQrAfip` (src/plugins/arca/domain/qr-afip.ts).
//   En los B, abajo a la izquierda, la leyenda del Régimen de Transparencia Fiscal al Consumidor
//   con el IVA contenido y los otros impuestos nacionales indirectos. En los A, en el mismo lugar,
//   las leyendas que decide el motor fiscal (`leyendasDeLaA`: la de la RG 5003/2021 al monotributista).
//   Si ARCA lo autorizó en su ambiente de prueba, cada hoja dice que no tiene validez fiscal
//   (`ambienteDelComprobante`).
//
// Plata: los importes llegan calculados (Invoice guarda Decimal(14,2)); acá sólo se escriben.
// El paso a centavos es `centavosDe` (src/lib/dinero/redondeo.ts), la única regla de redondeo.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { toBuffer } from "qrcode";
import { urlQrAfip } from "@/plugins/arca/domain/qr-afip";
import { centavosDe, redondearAlCentavo, sumarAlCentavo } from "@/lib/dinero/redondeo";
import {
  CONDICION_IVA_RECEPTOR_ID,
  RECEPTORES_ADMITIDOS,
  decidirComprobante,
  type Leyenda,
  type Naturaleza,
} from "@/lib/fiscal/decidir-comprobante";
import { emiteConValidezFiscal, type ModoArca } from "@/lib/monitor-core";

export type EstadoComprobante = "PENDING" | "AUTHORIZED" | "REJECTED";
export type CondicionIva = "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO" | "CONSUMIDOR_FINAL";

export interface EmisorImpreso {
  razonSocial: string | null;
  /** 11 dígitos, sin guiones. */
  cuit: string | null;
  condicionIva: string | null;
  domicilio: string | null;
  /** AAAAMMDD. */
  inicioActividades: string | null;
  iibb: string | null;
}

export interface ReceptorImpreso {
  /** Catálogo de ARCA: 80 CUIT, 86 CUIL, 96 DNI, 99 consumidor final sin identificar. */
  docTipo: number;
  docNro: string;
  nombre: string | null;
  condicionIva: string | null;
  domicilio: string | null;
}

export interface RenglonImpreso {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

/** Una alícuota del desglose de IVA (catálogo de ARCA: 5 = 21 %, 4 = 10,5 %…). */
export interface AlicuotaImpresa {
  alicuotaId: number;
  base: number;
  importe: number;
}

export interface ComprobanteAsociadoImpreso {
  tipoComprobante: number | null;
  puntoVenta: number;
  numero: number | null;
}

export interface DatosComprobanteImpreso {
  estado: EstadoComprobante;
  /** Catálogo de ARCA (1 factura A, 6 factura B, 11 factura C…). */
  tipoComprobante: number | null;
  puntoVenta: number;
  numero: number | null;
  /** AAAAMMDD. */
  fecha: string;
  /** 1 productos, 2 servicios, 3 productos y servicios. */
  concepto: number;
  cae: string | null;
  /** AAAAMMDD. */
  caeVencimiento: string | null;
  neto: number;
  iva: number;
  total: number;
  ivaDesglose: readonly AlicuotaImpresa[];
  /** Otros impuestos nacionales indirectos contenidos en el precio (Ley 27.743). Hoy el sistema no emite ninguno. */
  otrosImpuestosNacionales: number;
  renglones: readonly RenglonImpreso[];
  emisor: EmisorImpreso;
  receptor: ReceptorImpreso;
  comprobanteAsociado: ComprobanteAsociadoImpreso | null;
  /**
   * Ambiente de ARCA en que se autorizó (`ambienteDelComprobante`): "real" es una factura;
   * "prueba" no tiene validez fiscal y cada hoja lo dice; `null` = no se sabe, y no se imprime.
   */
  ambiente: AmbienteArca | null;
}

export type AmbienteArca = "real" | "prueba";

/** Una leyenda del motor fiscal que va impresa con su texto. */
export type LeyendaImpresa = Leyenda & { texto: string };

/** Un dato que falta: `campo` para el código, `mensaje` para la persona (qué falta y cómo seguir). */
export interface Faltante {
  campo: string;
  mensaje: string;
}

export type ResultadoPdf =
  | { ok: true; pdf: Uint8Array; urlQr: string; nombreArchivo: string }
  | { ok: false; faltantes: Faltante[] };

// ── Catálogos ────────────────────────────────────────────────────────────────

export interface TipoImpreso {
  letra: "A" | "B" | "C";
  nombre: string;
}

const TIPOS: Readonly<Record<number, TipoImpreso>> = {
  1: { letra: "A", nombre: "FACTURA" },
  2: { letra: "A", nombre: "NOTA DE DÉBITO" },
  3: { letra: "A", nombre: "NOTA DE CRÉDITO" },
  6: { letra: "B", nombre: "FACTURA" },
  7: { letra: "B", nombre: "NOTA DE DÉBITO" },
  8: { letra: "B", nombre: "NOTA DE CRÉDITO" },
  11: { letra: "C", nombre: "FACTURA" },
  12: { letra: "C", nombre: "NOTA DE DÉBITO" },
  13: { letra: "C", nombre: "NOTA DE CRÉDITO" },
};

/** Letra y nombre de un tipo de comprobante que este generador sabe imprimir; `null` si no. */
export function tipoImpreso(tipo: number | null): TipoImpreso | null {
  return tipo === null ? null : (TIPOS[tipo] ?? null);
}

const NOMBRE_CONDICION: Readonly<Record<CondicionIva, string>> = {
  RESPONSABLE_INSCRIPTO: "IVA Responsable Inscripto",
  MONOTRIBUTO: "Responsable Monotributo",
  EXENTO: "IVA Sujeto Exento",
  CONSUMIDOR_FINAL: "Consumidor Final",
};

/** La condición si es una de las que el comprobante sabe escribir; `null` si falta o no se reconoce. */
export function condicionConocida(valor: string | null): CondicionIva | null {
  return valor !== null && valor in NOMBRE_CONDICION ? (valor as CondicionIva) : null;
}
const condicion = condicionConocida;

/** Condición del receptor: la cargada, o consumidor final si se identificó con DNI o no se identificó. */
export function condicionDelReceptor(r: ReceptorImpreso): CondicionIva | null {
  return condicion(r.condicionIva) ?? (r.docTipo === 96 || r.docTipo === 99 ? "CONSUMIDOR_FINAL" : null);
}

export function nombreDeCondicion(c: CondicionIva): string {
  return NOMBRE_CONDICION[c];
}

const NOMBRE_DOC: Readonly<Record<number, string>> = { 80: "CUIT", 86: "CUIL", 87: "CDI", 94: "Pasaporte", 96: "DNI" };

const ALICUOTAS: Readonly<Record<number, string>> = { 3: "0 %", 9: "2,5 %", 8: "5 %", 4: "10,5 %", 5: "21 %", 6: "27 %" };

/** "21 %" para la alícuota 5 del catálogo de ARCA; `null` si no se reconoce. */
export function nombreDeAlicuota(alicuotaId: number): string | null {
  return ALICUOTAS[alicuotaId] ?? null;
}

const CONCEPTOS: Readonly<Record<number, string>> = { 1: "Productos", 2: "Servicios", 3: "Productos y servicios" };

// ── Formatos ─────────────────────────────────────────────────────────────────

function esFecha(s: string | null): s is string {
  if (s === null || !/^\d{8}$/.test(s)) return false;
  const a = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** `AAAAMMDD` → `dd/mm/aaaa`. */
export function fechaImpresa(aaaammdd: string): string {
  return `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}`;
}

/** Punto de venta y número como van impresos: `00001-00000012`. */
export function numeroImpreso(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(5, "0")}-${String(numero).padStart(8, "0")}`;
}

/** `$ 1.210,50`. El redondeo al centavo es el de src/lib/dinero. */
export function pesosImpresos(importe: number): string {
  const c = centavosDe(importe);
  const abs = Math.abs(c);
  const enteros = String(Math.trunc(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${c < 0 ? "-" : ""}$ ${enteros},${String(abs % 100).padStart(2, "0")}`;
}

export function cantidadImpresa(cantidad: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(cantidad);
}

function cuitImpreso(cuit: string): string {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

/** 11 dígitos y dígito verificador (módulo 11). Si el resto da 10, ARCA usa prefijos especiales: no se juzga. */
export function cuitValido(cuit: string | null): cuit is string {
  if (cuit === null || !/^\d{11}$/.test(cuit)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(cuit[i]), 0);
  const r = 11 - (suma % 11);
  if (r === 10) return true;
  return (r === 11 ? 0 : r) === Number(cuit[10]);
}

function vacio(s: string | null): boolean {
  return s === null || s.trim() === "";
}

function documentoDelReceptor(r: ReceptorImpreso): string {
  if (r.docTipo === 99) return "Consumidor final sin identificar";
  const nombre = NOMBRE_DOC[r.docTipo] ?? `Documento (código ${r.docTipo})`;
  return `${nombre}: ${r.docTipo === 80 || r.docTipo === 86 ? cuitImpreso(r.docNro) : r.docNro}`;
}

function comprobanteAsociadoImpreso(a: ComprobanteAsociadoImpreso): string {
  const t = tipoImpreso(a.tipoComprobante);
  const nombre = t ? `${t.nombre.charAt(0)}${t.nombre.slice(1).toLowerCase()} ${t.letra}` : "Comprobante";
  return `${nombre} ${a.numero === null ? "sin número" : numeroImpreso(a.puntoVenta, a.numero)}`;
}

// ── Qué falta ────────────────────────────────────────────────────────────────

const DONDE_EMISOR = "Cargalo en los datos fiscales del negocio y volvé a abrir el comprobante.";

/**
 * Todo lo que impide imprimir el comprobante. Vacío = se puede generar el PDF.
 * Mira el estado (sólo lo autorizado), la identidad fiscal del comprobante, los datos del
 * emisor, los del receptor que su letra exige y que la letra siga cuadrando con el emisor.
 */
export function faltantesDelComprobante(d: DatosComprobanteImpreso): Faltante[] {
  const f: Faltante[] = [];
  const falta = (campo: string, mensaje: string) => f.push({ campo, mensaje });

  if (d.estado === "REJECTED") {
    falta("estado", "ARCA rechazó este comprobante: no es una factura válida y no se puede imprimir. Revisá el motivo en Facturación y emití uno nuevo.");
    return f;
  }
  if (d.estado !== "AUTHORIZED" || vacio(d.cae)) {
    falta("cae", "Este comprobante todavía no tiene la autorización de ARCA (el CAE). Cuando ARCA lo autorice lo vas a poder descargar.");
    return f;
  }
  const tipo = tipoImpreso(d.tipoComprobante);
  if (!tipo) falta("tipoComprobante", "Este tipo de comprobante todavía no se puede imprimir desde el sistema. Descargalo desde el sitio de ARCA.");
  if (d.numero === null || d.numero <= 0) falta("numero", "El comprobante no tiene número asignado por ARCA. Esperá a que termine la autorización.");
  if (!Number.isInteger(d.puntoVenta) || d.puntoVenta <= 0) falta("puntoVenta", "El comprobante no tiene punto de venta.");
  if (d.cae !== null && !/^\d{14}$/.test(d.cae)) falta("cae", "El CAE guardado no tiene los 14 números que da ARCA. Avisá a soporte antes de entregar este comprobante.");
  if (!esFecha(d.caeVencimiento)) falta("caeVencimiento", "Falta la fecha de vencimiento del CAE. Avisá a soporte antes de entregar este comprobante.");
  if (!esFecha(d.fecha)) falta("fecha", "La fecha del comprobante no es válida. Avisá a soporte antes de entregar este comprobante.");
  if (![d.neto, d.iva, d.total, d.otrosImpuestosNacionales].every(Number.isFinite)) falta("importes", "Los importes del comprobante no se pueden leer. Avisá a soporte.");
  if (d.ambiente === null) falta("ambiente", "Este comprobante se autorizó antes de que el negocio cambiara entre el modo de prueba y el real de ARCA, y el sistema no guarda en cuál de los dos se autorizó. Buscalo en «Mis Comprobantes» de ARCA: si está, descargalo de ahí; si no está, fue de prueba y no tiene validez fiscal.");

  const e = d.emisor;
  if (vacio(e.razonSocial)) falta("emisor.razonSocial", `Falta la razón social del negocio (el nombre que figura en ARCA). ${DONDE_EMISOR}`);
  if (vacio(e.cuit)) falta("emisor.cuit", `Falta el CUIT del negocio. ${DONDE_EMISOR}`);
  else if (!cuitValido(e.cuit)) falta("emisor.cuit", `El CUIT del negocio no es válido: revisá los 11 números. ${DONDE_EMISOR}`);
  const condEmisor = condicion(e.condicionIva);
  if (!condEmisor || condEmisor === "CONSUMIDOR_FINAL") falta("emisor.condicionIva", `Falta la condición del negocio frente al IVA (responsable inscripto, monotributo o exento). ${DONDE_EMISOR}`);
  if (vacio(e.domicilio)) falta("emisor.domicilio", `Falta el domicilio comercial del negocio. ${DONDE_EMISOR}`);
  if (!esFecha(e.inicioActividades)) falta("emisor.inicioActividades", `Falta la fecha de inicio de actividades del negocio. ${DONDE_EMISOR}`);
  if (vacio(e.iibb)) falta("emisor.iibb", `Falta el número de Ingresos Brutos del negocio (o "Exento" o "Convenio Multilateral"). ${DONDE_EMISOR}`);

  // La letra salió de la condición del negocio al emitir. Si hoy no cuadra, la condición cambió
  // después: reimprimirlo con la condición de hoy sería mostrar un dato falso.
  if (tipo && condEmisor && condEmisor !== "CONSUMIDOR_FINAL") {
    const cuadra = tipo.letra === "C" ? condEmisor !== "RESPONSABLE_INSCRIPTO" : condEmisor === "RESPONSABLE_INSCRIPTO";
    if (!cuadra) falta("emisor.condicionIva", `Este comprobante es ${tipo.letra} y la condición del negocio cargada hoy es "${NOMBRE_CONDICION[condEmisor]}": no cuadran. Si la condición cambió después de emitirlo, pedí la copia a ARCA; si está mal cargada, corregila.`);
  }

  const r = d.receptor;
  const docValido = r.docTipo === 99 || (r.docTipo === 80 || r.docTipo === 86 ? cuitValido(r.docNro) : /^\d{6,11}$/.test(r.docNro));
  if (!docValido) falta("receptor.docNro", "El documento del cliente no es válido. Corregilo en la ficha del cliente.");
  if (r.docTipo !== 99 && vacio(r.nombre)) falta("receptor.nombre", "Falta el nombre o la razón social del cliente. Cargalo en su ficha.");
  const condReceptor = condicionDelReceptor(r);
  if (!condReceptor) falta("receptor.condicionIva", "Falta la condición del cliente frente al IVA. Cargala en su ficha.");
  // La letra salió de la condición del cliente al emitir, y esa condición se informó a ARCA
  // (RG 5616). Si la de hoy no la admite, cambió después: reimprimirla mostraría una combinación
  // que ARCA no autoriza. Invoice no guarda la condición informada (pendiente, con migración).
  else if (tipo && !RECEPTORES_ADMITIDOS[tipo.letra].has(CONDICION_IVA_RECEPTOR_ID[condReceptor])) {
    falta("receptor.condicionIva", `Este comprobante es ${tipo.letra} y el cliente figura hoy como "${NOMBRE_CONDICION[condReceptor]}": no cuadran. Si su condición cambió después de emitirlo, pedí la copia a ARCA; si está mal cargada, corregila en su ficha.`);
  }
  if (tipo?.letra === "A") {
    if (r.docTipo !== 80) falta("receptor.docTipo", "Un comprobante A necesita el CUIT del cliente. Cargalo en su ficha.");
    if (vacio(r.domicilio)) falta("receptor.domicilio", "Un comprobante A necesita el domicilio del cliente. Cargalo en su ficha.");
    if (d.ivaDesglose.length === 0) falta("ivaDesglose", "Falta el detalle del IVA por alícuota, que el comprobante A tiene que mostrar. Avisá a soporte.");
    if (d.ivaDesglose.some((a) => !(a.alicuotaId in ALICUOTAS))) falta("ivaDesglose", "Hay una alícuota de IVA que el sistema no reconoce. Avisá a soporte.");
    // El detalle de la A va sin IVA, renglón por renglón (`detalleSinIva`).
    if (d.ivaDesglose.length > 1) falta("renglones", "Este comprobante A tiene más de una alícuota de IVA y el sistema no guarda cuál lleva cada renglón, así que no puede mostrar el precio sin IVA de cada uno. Descargalo desde el sitio de ARCA y avisá a soporte.");
    else if (d.ivaDesglose.length === 1 && centavosDe(d.ivaDesglose[0].base) !== centavosDe(d.neto)) falta("importes", "El neto del comprobante A no coincide con la base del IVA. Avisá a soporte antes de entregarlo.");
    if (d.renglones.length === 0) falta("renglones", "El comprobante no tiene detalle. Avisá a soporte.");
  }
  // Las leyendas de la A las decide el motor fiscal; si no llega a una A, no se sabe cuáles van.
  if (f.length === 0 && tipo?.letra === "A" && leyendasDeLaA(d) === null) {
    falta("leyendas", "El sistema no pudo confirmar qué leyendas lleva este comprobante A. Descargalo desde el sitio de ARCA y avisá a soporte.");
  }
  return f;
}

// ── Ambiente de ARCA y leyendas ──────────────────────────────────────────────

/**
 * En qué ambiente de ARCA se autorizó un comprobante. Invoice no lo guarda (pendiente, con
 * migración), así que se deduce: vale el de hoy (`emiteConValidezFiscal`, src/lib/monitor-core.ts:
 * ARCA real en la plataforma Y el negocio fuera de prueba) sólo si el negocio no cambió de
 * ambiente desde que se autorizó. Si cambió después, o en el mismo instante, no se sabe: `null`.
 */
export function ambienteDelComprobante(a: {
  arcaHomologacion: boolean;
  modoArca: ModoArca;
  autorizadoEn: Date;
  ultimoCambioDeAmbiente: Date | null;
}): AmbienteArca | null {
  if (a.ultimoCambioDeAmbiente && a.autorizadoEn.getTime() <= a.ultimoCambioDeAmbiente.getTime()) return null;
  return emiteConValidezFiscal(a.arcaHomologacion, a.modoArca) ? "real" : "prueba";
}

const NATURALEZA: Readonly<Record<number, Naturaleza>> = { 1: "productos", 2: "servicios", 3: "productos_y_servicios" };

/**
 * Las leyendas con texto de un comprobante A según el motor fiscal (`decidirComprobante`, donde
 * vive la regla: la de la RG 5003/2021 al monotributista), para no copiarla: se le pregunta qué A
 * emitiría al mismo cliente, en la misma fecha y por el mismo total. Van fijos datos que el
 * sistema ya resolvió al emitir: A común (la A con leyenda y la M se emiten desde ARCA), sin
 * Factura de Crédito MiPyME (este generador no la imprime) y como factura (la leyenda es de la
 * clase A, sea factura o nota). `null` si el motor no llega a una A: no se imprime.
 */
export function leyendasDeLaA(d: DatosComprobanteImpreso): LeyendaImpresa[] | null {
  const decision = decidirComprobante(
    { condicionIva: d.emisor.condicionIva, cuit: d.emisor.cuit, regimenFacturaA: "A", esMiPyme: false },
    { condicionIva: condicionDelReceptor(d.receptor), docTipo: d.receptor.docTipo, docNro: d.receptor.docNro, esGranEmpresa: false },
    { clase: "factura", fecha: d.fecha, fechaDeEnvio: d.fecha, importeTotal: d.total, naturaleza: NATURALEZA[d.concepto] ?? null },
  );
  if (decision.comprobante?.letra !== "A") return null;
  return decision.comprobante.leyendas.filter((l): l is LeyendaImpresa => l.texto !== null);
}

/** Un renglón de la A como se imprime: sin IVA y con la alícuota que lo grava. */
export interface RenglonSinIva {
  descripcion: string;
  cantidad: number;
  precioUnitarioSinIva: number;
  subtotalSinIva: number;
  alicuota: string;
}

/**
 * El detalle de un comprobante A, renglón por renglón sin IVA. No recalcula el impuesto: reparte
 * la base que autorizó ARCA en proporción al importe de cada renglón, y el último se lleva los
 * centavos del redondeo, así los subtotales suman justo el neto impreso en los totales.
 * Con más de una alícuota el comprobante no guarda cuál lleva cada renglón: devuelve `null`
 * (y `faltantesDelComprobante` no deja imprimir).
 */
export function detalleSinIva(d: DatosComprobanteImpreso): RenglonSinIva[] | null {
  if (d.ivaDesglose.length !== 1 || d.renglones.length === 0) return null;
  const { alicuotaId, base } = d.ivaDesglose[0];
  const alicuota = ALICUOTAS[alicuotaId];
  if (!alicuota) return null;
  const peso = sumarAlCentavo(d.renglones.map((r) => r.importe));
  let repartido = 0;
  return d.renglones.map((r, i) => {
    const ultimo = i === d.renglones.length - 1;
    const subtotalSinIva = ultimo ? redondearAlCentavo(base - repartido) : peso === 0 ? 0 : redondearAlCentavo((base * r.importe) / peso);
    repartido = redondearAlCentavo(repartido + subtotalSinIva);
    const precioUnitarioSinIva = r.cantidad > 0 ? redondearAlCentavo(subtotalSinIva / r.cantidad) : subtotalSinIva;
    return { descripcion: r.descripcion, cantidad: r.cantidad, precioUnitarioSinIva, subtotalSinIva, alicuota };
  });
}

// ── Dibujo ───────────────────────────────────────────────────────────────────

const ANCHO = 595.28; // A4 en puntos
const ALTO = 841.89;
const M = 36;
const W = ANCHO - 2 * M;
const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.35, 0.35, 0.35);
const ROJO = rgb(0.7, 0, 0);

interface Estilo {
  tam?: number;
  negrita?: boolean;
  color?: RGB;
  alinear?: "izq" | "der" | "centro";
}

class Lienzo {
  private readonly soportados: ReadonlySet<number>;
  constructor(
    private readonly pdf: PDFDocument,
    private readonly normal: PDFFont,
    private readonly negrita: PDFFont,
  ) {
    this.soportados = new Set(normal.getCharacterSet());
  }

  hoja(): PDFPage {
    return this.pdf.addPage([ANCHO, ALTO]);
  }

  /** Lo que la fuente estándar no puede escribir (emojis, etc.) sale como "?" en vez de romper el PDF. */
  sanear(s: string): string {
    return Array.from(s.replace(/\s+/g, " ").trim(), (ch) => (this.soportados.has(ch.codePointAt(0) ?? 0) ? ch : "?")).join("");
  }

  ancho(s: string, e: Estilo = {}): number {
    return (e.negrita ? this.negrita : this.normal).widthOfTextAtSize(this.sanear(s), e.tam ?? 9);
  }

  texto(p: PDFPage, s: string, x: number, y: number, e: Estilo = {}): void {
    const t = this.sanear(s);
    const tam = e.tam ?? 9;
    const font = e.negrita ? this.negrita : this.normal;
    const w = font.widthOfTextAtSize(t, tam);
    const x0 = e.alinear === "der" ? x - w : e.alinear === "centro" ? x - w / 2 : x;
    p.drawText(t, { x: x0, y, size: tam, font, color: e.color ?? NEGRO });
  }

  /** Parte un texto en renglones que entran en `ancho`. */
  partir(s: string, ancho: number, e: Estilo = {}): string[] {
    const renglones: string[] = [];
    let actual = "";
    for (const palabra of this.sanear(s).split(" ")) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (this.ancho(prueba, e) <= ancho) {
        actual = prueba;
        continue;
      }
      if (actual) renglones.push(actual);
      actual = palabra;
      while (this.ancho(actual, e) > ancho && actual.length > 1) {
        let corte = actual.length - 1;
        while (corte > 1 && this.ancho(actual.slice(0, corte), e) > ancho) corte--;
        renglones.push(actual.slice(0, corte));
        actual = actual.slice(corte);
      }
    }
    if (actual) renglones.push(actual);
    return renglones.length ? renglones : [""];
  }

  /** "Rótulo: valor" con el valor partido si no entra. Devuelve cuántos renglones usó. */
  par(p: PDFPage, rotulo: string, valor: string, x: number, y: number, ancho: number, tam = 8): number {
    // `sanear` recorta los espacios de las puntas: el que separa rótulo y valor se mide aparte.
    const r = `${rotulo}:`;
    const wr = this.ancho(r, { tam, negrita: true }) + this.normal.widthOfTextAtSize(" ", tam);
    this.texto(p, r, x, y, { tam, negrita: true });
    const partes = this.partir(valor, ancho - wr, { tam });
    partes.forEach((linea, i) => this.texto(p, linea, x + wr, y - i * (tam + 3), { tam }));
    return partes.length;
  }

  caja(p: PDFPage, x: number, y: number, w: number, h: number, relleno?: RGB): void {
    p.drawRectangle({ x, y, width: w, height: h, borderColor: NEGRO, borderWidth: 0.7, ...(relleno ? { color: relleno } : {}) });
  }
}

function nombreDeArchivo(tipo: TipoImpreso, pv: number, numero: number): string {
  const nombre = tipo.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
  return `${nombre}-${tipo.letra}-${numeroImpreso(pv, numero)}.pdf`;
}

/**
 * Genera el PDF del comprobante. Si falta algún dato obligatorio no genera nada y devuelve
 * la lista de faltantes (la misma de `faltantesDelComprobante`).
 */
export async function generarComprobantePdf(d: DatosComprobanteImpreso): Promise<ResultadoPdf> {
  const faltantes = faltantesDelComprobante(d);
  if (faltantes.length > 0) return { ok: false, faltantes };
  // Después de `faltantesDelComprobante` vacío, estos datos existen y son válidos.
  const tipo = tipoImpreso(d.tipoComprobante) as TipoImpreso;
  const numero = d.numero as number;
  const cae = d.cae as string;
  const cuit = d.emisor.cuit as string;
  const condEmisor = condicion(d.emisor.condicionIva) as CondicionIva;
  const condReceptor = condicionDelReceptor(d.receptor) as CondicionIva;

  const urlQr = urlQrAfip({
    fecha: d.fecha,
    cuit: Number(cuit),
    puntoVenta: d.puntoVenta,
    tipoComprobante: d.tipoComprobante as number,
    numero,
    importe: d.total,
    tipoDocReceptor: d.receptor.docTipo,
    nroDocReceptor: d.receptor.docTipo === 99 ? 0 : Number(d.receptor.docNro),
    cae,
  });
  const png = await toBuffer(urlQr, { type: "png", errorCorrectionLevel: "M", margin: 4, scale: 4 });

  const pdf = await PDFDocument.create();
  const titulo = `${tipo.nombre} ${tipo.letra} ${numeroImpreso(d.puntoVenta, numero)}`;
  pdf.setTitle(titulo);
  pdf.setAuthor(d.emisor.razonSocial as string);
  pdf.setSubject("Comprobante autorizado por ARCA");
  pdf.setCreator("Gestión Studio Grow");
  pdf.setProducer("Gestión Studio Grow");
  const lz = new Lienzo(pdf, await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold));
  const qr = await pdf.embedPng(png);

  const hojas: PDFPage[] = [];
  // En la A cada renglón va sin IVA y con su alícuota (`detalleSinIva`); en la B y la C, con el
  // precio final. Cada columna se alinea a la derecha en su borde.
  const esA = tipo.letra === "A";
  const DER = ANCHO - M - 8;
  const col = esA ? { cantidad: 290, precio: 385, alicuota: 435 } : { cantidad: 372, precio: 462, alicuota: 0 };
  const filas = esA
    ? (detalleSinIva(d) as RenglonSinIva[]).map((r) => ({ descripcion: r.descripcion, cantidad: r.cantidad, precio: r.precioUnitarioSinIva, alicuota: r.alicuota, subtotal: r.subtotalSinIva }))
    : d.renglones.map((r) => ({ descripcion: r.descripcion, cantidad: r.cantidad, precio: r.precioUnitario, alicuota: "", subtotal: r.importe }));
  const encabezadoDeTabla = (p: PDFPage, y: number) => {
    lz.caja(p, M, y, W, 18, rgb(0.92, 0.92, 0.92));
    lz.texto(p, "Descripción", M + 8, y + 6, { tam: 8, negrita: true });
    lz.texto(p, "Cantidad", col.cantidad, y + 6, { tam: 8, negrita: true, alinear: "der" });
    lz.texto(p, esA ? "Precio sin IVA" : "Precio unitario", col.precio, y + 6, { tam: 8, negrita: true, alinear: "der" });
    if (esA) lz.texto(p, "IVA", col.alicuota, y + 6, { tam: 8, negrita: true, alinear: "der" });
    lz.texto(p, esA ? "Subtotal sin IVA" : "Subtotal", DER, y + 6, { tam: 8, negrita: true, alinear: "der" });
  };

  // Hoja 1: encabezado completo.
  let p = lz.hoja();
  hojas.push(p);
  lz.caja(p, M, 690, W, 110);
  const cx = ANCHO / 2;
  // La letra en su recuadro, con el código adentro; la raya baja hasta el pie del encabezado.
  // Las dos columnas arrancan lejos del recuadro para no pisarlo.
  lz.caja(p, cx - 24, 744, 48, 56, rgb(1, 1, 1));
  lz.texto(p, tipo.letra, cx, 766, { tam: 28, negrita: true, alinear: "centro" });
  lz.texto(p, `COD. ${String(d.tipoComprobante).padStart(3, "0")}`, cx, 750, { tam: 7, negrita: true, alinear: "centro" });
  p.drawLine({ start: { x: cx, y: 690 }, end: { x: cx, y: 744 }, thickness: 0.7, color: NEGRO });

  const xi = M + 8;
  const anchoIzq = cx - 30 - xi;
  const nombreGrande = lz.partir(d.emisor.razonSocial as string, anchoIzq, { tam: 12, negrita: true }).slice(0, 2);
  nombreGrande.forEach((l, i) => lz.texto(p, l, xi, 780 - i * 14, { tam: 12, negrita: true }));
  let yi = 744;
  yi -= 11 * lz.par(p, "Razón social", d.emisor.razonSocial as string, xi, yi, anchoIzq);
  yi -= 11 * lz.par(p, "Domicilio comercial", d.emisor.domicilio as string, xi, yi, anchoIzq);
  lz.par(p, "Condición frente al IVA", NOMBRE_CONDICION[condEmisor], xi, Math.min(yi, 700), anchoIzq);

  const xd = cx + 32;
  const anchoDer = ANCHO - M - 8 - xd;
  lz.texto(p, tipo.nombre, xd, 778, { tam: 15, negrita: true });
  lz.texto(p, `Punto de venta: ${String(d.puntoVenta).padStart(5, "0")}`, xd, 756, { tam: 9, negrita: true });
  lz.texto(p, `Comp. nro: ${String(numero).padStart(8, "0")}`, ANCHO - M - 8, 756, { tam: 9, negrita: true, alinear: "der" });
  lz.par(p, "Fecha de emisión", fechaImpresa(d.fecha), xd, 742, anchoDer);
  lz.par(p, "CUIT", cuitImpreso(cuit), xd, 729, anchoDer);
  lz.par(p, "Ingresos Brutos", d.emisor.iibb as string, xd, 716, anchoDer);
  lz.par(p, "Fecha de inicio de actividades", fechaImpresa(d.emisor.inicioActividades as string), xd, 703, anchoDer);

  // Receptor.
  const r = d.receptor;
  lz.caja(p, M, 606, W, 78);
  lz.texto(p, documentoDelReceptor(r), xi, 670, { tam: 8, negrita: true });
  let yr = 657;
  yr -= 11 * lz.par(p, "Apellido y nombre / Razón social", vacio(r.nombre) ? "Consumidor final" : (r.nombre as string), xi, yr, anchoIzq + 30);
  yr -= 11 * lz.par(p, "Condición frente al IVA", NOMBRE_CONDICION[condReceptor], xi, yr, anchoIzq + 30);
  lz.par(p, "Domicilio", vacio(r.domicilio) ? "—" : (r.domicilio as string), xi, Math.max(yr, 614), anchoIzq + 30);
  lz.par(p, "Concepto", CONCEPTOS[d.concepto] ?? "—", xd, 670, anchoDer);
  if (d.comprobanteAsociado) lz.par(p, "Comprobante asociado", comprobanteAsociadoImpreso(d.comprobanteAsociado), xd, 657, anchoDer);

  // Detalle, con salto de hoja. La última hoja necesita lugar para totales, leyenda y QR.
  const PISO_INTERMEDIO = 60;
  const PISO_FINAL = 272;
  encabezadoDeTabla(p, 578);
  let y = 564;
  const anchoDescripcion = (esA ? col.cantidad - 45 : 300) - xi;
  const nuevaHoja = () => {
    p = lz.hoja();
    hojas.push(p);
    lz.texto(p, `${titulo} · ${d.emisor.razonSocial as string} (continuación)`, M, 806, { tam: 9, negrita: true });
    encabezadoDeTabla(p, 776);
    y = 762;
  };
  for (const fila of filas) {
    const lineas = lz.partir(fila.descripcion, anchoDescripcion, { tam: 8 });
    const alto = 11 * lineas.length + 4;
    if (y - alto < PISO_INTERMEDIO) nuevaHoja();
    lineas.forEach((l, i) => lz.texto(p, l, xi, y - i * 11, { tam: 8 }));
    lz.texto(p, cantidadImpresa(fila.cantidad), col.cantidad, y, { tam: 8, alinear: "der" });
    lz.texto(p, pesosImpresos(fila.precio), col.precio, y, { tam: 8, alinear: "der" });
    if (esA) lz.texto(p, fila.alicuota, col.alicuota, y, { tam: 8, alinear: "der" });
    lz.texto(p, pesosImpresos(fila.subtotal), DER, y, { tam: 8, alinear: "der" });
    y -= alto;
  }
  if (y < PISO_FINAL) nuevaHoja();

  // Totales (derecha).
  const totales: [string, string, boolean][] =
    tipo.letra === "A"
      ? [
          ["Importe neto gravado", pesosImpresos(d.neto), false],
          ...[...d.ivaDesglose]
            .sort((a, b) => a.alicuotaId - b.alicuotaId)
            .map((a): [string, string, boolean] => [`IVA ${ALICUOTAS[a.alicuotaId]}`, pesosImpresos(a.importe), false]),
          ["Importe total", pesosImpresos(d.total), true],
        ]
      : [
          ["Subtotal", pesosImpresos(d.total), false],
          ["Importe total", pesosImpresos(d.total), true],
        ];
  let yt = 250;
  for (const [rotulo, valor, fuerte] of totales) {
    lz.texto(p, `${rotulo}:`, 470, yt, { tam: fuerte ? 11 : 9, negrita: true, alinear: "der" });
    lz.texto(p, valor, ANCHO - M - 8, yt, { tam: fuerte ? 11 : 9, negrita: fuerte, alinear: "der" });
    yt -= fuerte ? 17 : 14;
  }

  // Ley 27.743 (RG 5614/2024): en los B, abajo a la izquierda, título y debajo cada dato.
  if (tipo.letra === "B") {
    lz.caja(p, M, 206, 282, 58);
    lz.texto(p, "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)", xi, 250, { tam: 8, negrita: true });
    lz.texto(p, `IVA Contenido: ${pesosImpresos(d.iva)}`, xi, 234, { tam: 8 });
    lz.texto(p, `Otros Impuestos Nacionales Indirectos: ${pesosImpresos(d.otrosImpuestosNacionales)}`, xi, 218, { tam: 8 });
  }
  // En los A, en el mismo lugar, las leyendas del motor fiscal (RG 5003/2021 al monotributista).
  if (tipo.letra === "A") {
    const lineas = (leyendasDeLaA(d) ?? []).flatMap((l) => lz.partir(l.texto, 266, { tam: 7.5 }));
    if (lineas.length > 0) {
      lz.caja(p, M, 254 - 10 * lineas.length, 282, 10 + 10 * lineas.length);
      lineas.forEach((linea, i) => lz.texto(p, linea, xi, 252 - 10 * i, { tam: 7.5 }));
    }
  }

  // Pie: QR, autorización y CAE.
  p.drawLine({ start: { x: M, y: 178 }, end: { x: ANCHO - M, y: 178 }, thickness: 0.7, color: NEGRO });
  p.drawImage(qr, { x: M, y: 56, width: 116, height: 116 });
  const valida = d.ambiente === "real";
  lz.texto(p, valida ? "Comprobante autorizado por ARCA" : "Autorizado en el modo de prueba de ARCA", M + 124, 150, { tam: 10, negrita: true });
  lz.texto(p, valida ? "Se puede verificar escaneando el código QR." : "No es una factura: no tiene validez fiscal.", M + 124, 136, { tam: 8, color: valida ? GRIS : ROJO });
  lz.texto(p, `CAE N°: ${cae}`, ANCHO - M - 8, 150, { tam: 10, negrita: true, alinear: "der" });
  lz.texto(p, `Fecha de vto. de CAE: ${fechaImpresa(d.caeVencimiento as string)}`, ANCHO - M - 8, 136, { tam: 9, alinear: "der" });

  // En todas las hojas: ORIGINAL, número de hoja y, en modo de prueba, la advertencia.
  hojas.forEach((h, i) => {
    if (h === hojas[0]) {
      lz.caja(h, M, 802, W, 18);
      lz.texto(h, "ORIGINAL", ANCHO / 2, 808, { tam: 10, negrita: true, alinear: "centro" });
    }
    lz.texto(h, `Hoja ${i + 1} de ${hojas.length}`, ANCHO / 2, 24, { tam: 8, color: GRIS, alinear: "centro" });
    if (!valida) {
      lz.texto(h, "MODO DE PRUEBA DE ARCA: ESTE COMPROBANTE NO TIENE VALIDEZ FISCAL", ANCHO / 2, 826, { tam: 9, negrita: true, color: ROJO, alinear: "centro" });
    }
  });

  return { ok: true, pdf: await pdf.save(), urlQr, nombreArchivo: nombreDeArchivo(tipo, d.puntoVenta, numero) };
}
