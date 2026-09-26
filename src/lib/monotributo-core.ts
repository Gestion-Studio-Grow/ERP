// Monitor de monotributo de la cartera (frente C3) — DOMINIO PURO, sin base ni framework.
//
// Para cada cliente monotributista del estudio: lo facturado en el sistema en los últimos 12
// meses (móviles), contra el tope de ingresos brutos de su categoría y el de la siguiente, con un
// semáforo y la próxima recategorización. Todo entra por parámetro (el día de hoy también): el
// recolector (src/lib/monotributo-actions.ts) trae los hechos y esto decide.
//
// Qué NO mira este monitor, a propósito: la categoría del monotributo se define por el MAYOR de
// cuatro parámetros (ingresos brutos, superficie afectada, energía eléctrica consumida y alquileres
// devengados) y, para venta de cosas muebles, por el precio unitario máximo. El sistema sólo conoce
// lo facturado; el resto lo sabe la contadora. Por eso la pantalla dice "por ingresos".

import { centavosDe, sumarAlCentavo } from "@/lib/dinero/redondeo";
import { TipoComprobante } from "@/plugins/arca/domain/catalogos";

// ── Tabla vigente del régimen simplificado ───────────────────────────────────

export const LETRAS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;
export type LetraCategoria = (typeof LETRAS)[number];

export interface TablaMonotributo {
  /** Primer y último día de vigencia (AAAA-MM-DD). */
  vigenciaDesde: string;
  vigenciaHasta: string;
  /** De dónde salen los números, dicho para que la contadora lo pueda contrastar. */
  fuente: string;
  /**
   * `false` = los importes se tomaron de publicaciones que citan a ARCA, no del cuadro oficial
   * descargado: se muestran como "provisional a confirmar" hasta que alguien los coteje.
   */
  verificadaContraArca: boolean;
  /** Tope ANUAL de ingresos brutos de cada categoría, en pesos con centavos ("hasta", inclusive). */
  topes: Readonly<Record<LetraCategoria, number>>;
}

/**
 * Categorías vigentes de agosto de 2026 a enero de 2027 (actualización semestral por IPC, +16,85 %
 * sobre la tabla de agosto de 2025). Relevada el 26/09/2026 de iProfesional, Perfil, fiscal.com.ar
 * y canal26 (julio de 2026), que reproducen el cuadro de ARCA. Control hecho el 26/09/2026: las 11
 * letras guardan el mismo factor (1,335477) sobre el cuadro oficial de agosto de 2025, o sea que no
 * hay un tope mal tipeado. PROVISIONAL A CONFIRMAR contra el cuadro oficial (el sitio de ARCA no
 * fue accesible desde el entorno): https://www.afip.gob.ar/monotributo/categorias.asp
 */
export const TABLA_VIGENTE: TablaMonotributo = {
  vigenciaDesde: "2026-08-01",
  vigenciaHasta: "2027-01-31",
  fuente:
    "Cuadro de categorías de ARCA de agosto de 2026, tomado de la prensa especializada el 26/09/2026",
  verificadaContraArca: false,
  topes: {
    A: 12_009_410.45,
    B: 17_595_182.74,
    C: 24_670_494.31,
    D: 30_628_651.43,
    E: 36_028_231.33,
    F: 45_151_659.41,
    G: 53_995_798.87,
    H: 81_924_660.37,
    I: 91_699_761.9,
    J: 105_012_519.2,
    K: 126_610_838.75,
  },
};

/**
 * Los cuadros de categorías cargados, del más viejo al más nuevo. Cada semestre ARCA publica uno
 * nuevo (vigente desde el 1 de febrero o el 1 de agosto): se agrega acá, sin borrar el anterior.
 */
export const CUADROS_MONOTRIBUTO: readonly TablaMonotributo[] = [TABLA_VIGENTE];

/** El cuadro que cubre el día (`null` si ninguno cargado lo cubre). */
export function cuadroVigenteEn(
  dia: string,
  cuadros: readonly TablaMonotributo[] = CUADROS_MONOTRIBUTO,
): TablaMonotributo | null {
  return cuadros.find((c) => dia >= c.vigenciaDesde && dia <= c.vigenciaHasta) ?? null;
}

/**
 * El cuadro con el que se mide HOY el semáforo: el vigente; si ninguno cargado cubre el día, el
 * más nuevo (y la pantalla avisa que puede estar desactualizado, ver `tablaVigenteEn`).
 */
export function cuadroParaHoy(
  hoy: string,
  cuadros: readonly TablaMonotributo[] = CUADROS_MONOTRIBUTO,
): TablaMonotributo {
  const vigente = cuadroVigenteEn(hoy, cuadros);
  if (vigente) return vigente;
  const masNuevo = [...cuadros].sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1))[0];
  if (!masNuevo) throw new Error("No hay ningún cuadro de categorías del monotributo cargado.");
  return masNuevo;
}

/** "Cerca" del tope: desde el 80 % de lo que permite la categoría (política, no ley). */
export const UMBRAL_CERCA_DEL_TOPE = 0.8;

export function esLetraCategoria(valor: unknown): valor is LetraCategoria {
  return typeof valor === "string" && (LETRAS as readonly string[]).includes(valor);
}

/** La categoría que sigue, o `null` si es la K (la última). */
export function categoriaSiguiente(letra: LetraCategoria): LetraCategoria | null {
  const i = LETRAS.indexOf(letra);
  return i < LETRAS.length - 1 ? LETRAS[i + 1] : null;
}

/** La categoría más baja cuyo tope alcanza para esos ingresos; `null` si superan la K. */
export function categoriaPorIngresos(ingresos: number, tabla: TablaMonotributo): LetraCategoria | null {
  const c = centavosDe(ingresos);
  for (const letra of LETRAS) {
    if (c <= centavosDe(tabla.topes[letra])) return letra;
  }
  return null;
}

// ── Días (AAAA-MM-DD, calendario argentino, sin horas) ───────────────────────

function partes(dia: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) throw new RangeError(`No es un día AAAA-MM-DD: ${dia}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function dia(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function diasDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Los 12 meses MÓVILES que terminan hoy: desde el día siguiente al mismo día del año pasado
 * hasta hoy, los dos inclusive. Hoy 26/09/2026 → del 27/09/2025 al 26/09/2026. Un 29 de febrero
 * se toma como 28 del año anterior (→ empieza el 1 de marzo).
 */
export function ventanaDoceMeses(hoy: string): { desde: string; hasta: string } {
  const [y, m, d] = partes(hoy);
  const dAnterior = Math.min(d, diasDelMes(y - 1, m));
  const siguiente = new Date(Date.UTC(y - 1, m - 1, dAnterior + 1));
  return {
    desde: dia(siguiente.getUTCFullYear(), siguiente.getUTCMonth() + 1, siguiente.getUTCDate()),
    hasta: hoy,
  };
}

/** Fecha de comprobante (AAAAMMDD, la de `Invoice.fecha`) a AAAA-MM-DD. */
export function fechaComprobanteADia(fecha: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(fecha);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ── Ingresos brutos de los últimos 12 meses ──────────────────────────────────

/** Lo mínimo de un comprobante emitido que hace falta para sumar ingresos. */
export interface ComprobanteEmitido {
  /** `Invoice.status`: sólo cuenta lo que ARCA autorizó (con CAE). */
  estado: "PENDING" | "AUTHORIZED" | "REJECTED";
  tipoComprobante: number | null;
  /** AAAAMMDD, la fecha del comprobante (no la de carga). */
  fecha: string;
  neto: number;
  total: number;
}

const SUMAN = new Set<number>([
  TipoComprobante.FacturaA,
  TipoComprobante.NotaDebitoA,
  TipoComprobante.FacturaB,
  TipoComprobante.NotaDebitoB,
  TipoComprobante.FacturaC,
  TipoComprobante.NotaDebitoC,
]);
const RESTAN = new Set<number>([
  TipoComprobante.NotaCreditoA,
  TipoComprobante.NotaCreditoB,
  TipoComprobante.NotaCreditoC,
]);
/** En A y B el IVA es del fisco, no un ingreso: cuenta el neto. En C no hay IVA: cuenta el total. */
const DISCRIMINAN_IVA = new Set<number>([
  TipoComprobante.FacturaA,
  TipoComprobante.NotaDebitoA,
  TipoComprobante.NotaCreditoA,
  TipoComprobante.FacturaB,
  TipoComprobante.NotaDebitoB,
  TipoComprobante.NotaCreditoB,
]);

export interface IngresosDoceMeses {
  desde: string;
  hasta: string;
  /** Facturas y notas de débito menos notas de crédito, al centavo. */
  ingresos: number;
  comprobantes: number;
  notasDeCredito: number;
}

/**
 * Ingresos brutos facturados en el sistema en la ventana de 12 meses móviles. Cuentan sólo los
 * comprobantes autorizados por ARCA con fecha dentro de la ventana; las notas de crédito restan.
 */
export function ingresosDoceMeses(comprobantes: readonly ComprobanteEmitido[], hoy: string): IngresosDoceMeses {
  const { desde, hasta } = ventanaDoceMeses(hoy);
  const importes: number[] = [];
  let cuenta = 0;
  let notas = 0;
  for (const c of comprobantes) {
    if (c.estado !== "AUTHORIZED" || c.tipoComprobante == null) continue;
    const d = fechaComprobanteADia(c.fecha);
    if (!d || d < desde || d > hasta) continue;
    const base = DISCRIMINAN_IVA.has(c.tipoComprobante) ? c.neto : c.total;
    if (SUMAN.has(c.tipoComprobante)) {
      importes.push(base);
      cuenta++;
    } else if (RESTAN.has(c.tipoComprobante)) {
      importes.push(-base);
      cuenta++;
      notas++;
    }
  }
  return { desde, hasta, ingresos: sumarAlCentavo(importes), comprobantes: cuenta, notasDeCredito: notas };
}

// ── Recategorización ─────────────────────────────────────────────────────────

export interface Recategorizacion {
  mes: "febrero" | "agosto";
  anio: number;
  /** Último día del semestre que se mira (AAAA-MM-DD): 31/12 para febrero, 30/06 para agosto. */
  cierreDelPeriodo: string;
  /** Último día para presentarla (AAAA-MM-DD): el 5 de febrero o el 5 de agosto. */
  vence: string;
  /** El semestre ya cerró y todavía no venció: es momento de recategorizar. */
  enCurso: boolean;
}

/** Día del mes en que vence la recategorización semestral. */
export const DIA_VENCIMIENTO_RECATEGORIZACION = 5;

/**
 * La recategorización es semestral y se presenta hasta el 5 de febrero (con los 12 meses cerrados
 * al 31/12) y hasta el 5 de agosto (con los 12 meses cerrados al 30/06). Fuente: ayuda del
 * monotributo de ARCA, "Recategorización" (afip.gob.ar/monotributo/ayuda/recategorizacion.asp),
 * consultada el 26/09/2026. Si ARCA prorroga un vencimiento, acá no se ve: se muestra el general.
 */
export function proximaRecategorizacion(hoy: string): Recategorizacion {
  const [y] = partes(hoy);
  const d = DIA_VENCIMIENTO_RECATEGORIZACION;
  const febrero = (anio: number, enCurso: boolean): Recategorizacion => ({
    mes: "febrero", anio, cierreDelPeriodo: dia(anio - 1, 12, 31), vence: dia(anio, 2, d), enCurso,
  });
  const agosto = (enCurso: boolean): Recategorizacion => ({
    mes: "agosto", anio: y, cierreDelPeriodo: dia(y, 6, 30), vence: dia(y, 8, d), enCurso,
  });
  if (hoy <= dia(y, 2, d)) return febrero(y, true);
  if (hoy <= dia(y, 6, 30)) return agosto(false);
  if (hoy <= dia(y, 8, d)) return agosto(true);
  return febrero(y + 1, false);
}

/**
 * La recategorización NO se hace con el cuadro que se va: la de febrero usa el cuadro vigente
 * desde el 1 de febrero y la de agosto, el vigente desde el 1 de agosto (los topes nuevos,
 * actualizados por IPC, que ARCA publica antes de abrir la recategorización). Este es el primer
 * día de ese cuadro.
 */
export function inicioDelCuadroDeLaRecategorizacion(rec: Recategorizacion): string {
  return dia(rec.anio, rec.mes === "febrero" ? 2 : 8, 1);
}

/** El cuadro con el que ARCA recategoriza en esa ventana; `null` si todavía no se cargó. */
export function cuadroDeLaRecategorizacion(
  rec: Recategorizacion,
  cuadros: readonly TablaMonotributo[] = CUADROS_MONOTRIBUTO,
): TablaMonotributo | null {
  const desde = inicioDelCuadroDeLaRecategorizacion(rec);
  return cuadros.find((c) => c.vigenciaDesde === desde) ?? null;
}

// ── Evaluación de un cliente ─────────────────────────────────────────────────

export type Semaforo = "sin_categoria" | "bien" | "cerca" | "excedido";

export interface HechosMonotributo {
  clienteTenantId: string;
  alias: string;
  /** Lo que cargó la contadora; `null` = no se cargó (NUNCA se asume la A). */
  categoria: LetraCategoria | null;
  comprobantes: readonly ComprobanteEmitido[];
}

export interface FilaMonotributo {
  clienteTenantId: string;
  alias: string;
  categoria: LetraCategoria | null;
  semaforo: Semaforo;
  ingresos: IngresosDoceMeses;
  /** Tope de su categoría y de la siguiente (`null` si no hay categoría o si es la K). */
  topePropio: number | null;
  siguiente: { letra: LetraCategoria; tope: number } | null;
  /** Lo facturado sobre el tope propio (0,82 = 82 %). `null` sin categoría. */
  proporcion: number | null;
  /** La categoría que alcanza para lo facturado; `null` si supera la K. */
  corresponde: LetraCategoria | null;
  /**
   * Sólo mientras la recategorización está en curso: lo facturado en los 12 meses cerrados al
   * fin del semestre (lo que ARCA mira para recategorizar), y la letra que eso pide.
   */
  alCierre: CierreSemestre | null;
  titulo: string;
  detalle: string;
  accion: string;
}

export interface CierreSemestre {
  /** Último día del semestre (AAAA-MM-DD). */
  hasta: string;
  /** Día límite para presentar la recategorización (AAAA-MM-DD). */
  vence: string;
  ingresos: number;
  /**
   * La letra que pide lo facturado al cierre con el cuadro de la recategorización. `null` si
   * supera la K o si ese cuadro todavía no está cargado (ver `cuadroFaltante`).
   */
  corresponde: LetraCategoria | null;
  /** El cuadro de esta recategorización no está cargado: no se da letra, queda "a revisar". */
  cuadroFaltante: boolean;
  /** Primer día del cuadro con el que se recategoriza (AAAA-MM-DD). */
  cuadroDesde: string;
  /** Hay categoría cargada y lo facturado al cierre pide otra letra (más alta o más baja). */
  cambia: boolean;
  /** Lo que se le dice a la contadora. */
  texto: string;
}

function diaLegible(d: string): string {
  const [y, m, dd] = partes(d);
  return `${String(dd).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/**
 * Desde qué día hay que leer comprobantes para evaluar hoy: los 12 meses móviles y, si la
 * recategorización está en curso, también los 12 meses cerrados al fin del semestre.
 */
export function ventanaDeLectura(hoy: string): { desde: string; hasta: string } {
  const rec = proximaRecategorizacion(hoy);
  const movil = ventanaDoceMeses(hoy);
  if (!rec.enCurso) return movil;
  const cierre = ventanaDoceMeses(rec.cierreDelPeriodo);
  return { desde: cierre.desde < movil.desde ? cierre.desde : movil.desde, hasta: hoy };
}

function alCierreDelSemestre(
  h: HechosMonotributo,
  hoy: string,
  cuadros: readonly TablaMonotributo[],
): CierreSemestre | null {
  const rec = proximaRecategorizacion(hoy);
  if (!rec.enCurso) return null;
  const { ingresos } = ingresosDoceMeses(h.comprobantes, rec.cierreDelPeriodo);
  const cuadroDesde = inicioDelCuadroDeLaRecategorizacion(rec);
  const tabla = cuadroDeLaRecategorizacion(rec, cuadros);
  const vence = diaLegible(rec.vence);
  if (!tabla) {
    return {
      hasta: rec.cierreDelPeriodo,
      vence: rec.vence,
      ingresos,
      corresponde: null,
      cuadroFaltante: true,
      cuadroDesde,
      cambia: false,
      texto:
        `Al ${diaLegible(rec.cierreDelPeriodo)} facturó ${pesos(ingresos)} en 12 meses. ` +
        `A revisar: falta cargar el cuadro de categorías de ${rec.mes} de ${rec.anio}, que es con el que ` +
        `ARCA recategoriza. Con el cuadro anterior la letra puede salir mal. Vence el ${vence}.`,
    };
  }
  const corresponde = categoriaPorIngresos(ingresos, tabla);
  const cambia = h.categoria != null && corresponde !== h.categoria;
  const inicio = `Al ${diaLegible(rec.cierreDelPeriodo)} facturó ${pesos(ingresos)} en 12 meses:`;
  const texto =
    corresponde == null
      ? `${inicio} supera el tope de la K. Revisalo antes del ${vence}.`
      : h.categoria == null
        ? `${inicio} por ingresos le corresponde la ${corresponde}.`
        : cambia
          ? `${inicio} por ingresos le corresponde la ${corresponde}. Recategorizalo antes del ${vence}.`
          : `${inicio} por ingresos sigue en la ${h.categoria}.`;
  return {
    hasta: rec.cierreDelPeriodo,
    vence: rec.vence,
    ingresos,
    corresponde,
    cuadroFaltante: false,
    cuadroDesde,
    cambia,
    texto,
  };
}

function pesos(importe: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(importe);
}

/**
 * `cuadros`: los cuadros de categorías cargados. El semáforo del día se mide contra el vigente hoy;
 * la recategorización en curso, contra el cuadro que empieza el 1 del mes en que vence.
 */
export function evaluarMonotributo(
  h: HechosMonotributo,
  hoy: string,
  cuadros: readonly TablaMonotributo[] = CUADROS_MONOTRIBUTO,
): FilaMonotributo {
  const tabla = cuadroParaHoy(hoy, cuadros);
  const ingresos = ingresosDoceMeses(h.comprobantes, hoy);
  const corresponde = categoriaPorIngresos(ingresos.ingresos, tabla);
  const alCierre = alCierreDelSemestre(h, hoy, cuadros);
  const base = {
    clienteTenantId: h.clienteTenantId,
    alias: h.alias,
    categoria: h.categoria,
    ingresos,
    corresponde,
    alCierre,
  };
  const facturado = `Facturó ${pesos(ingresos.ingresos)} en los últimos 12 meses.`;

  if (h.categoria == null) {
    return {
      ...base,
      semaforo: "sin_categoria",
      topePropio: null,
      siguiente: null,
      proporcion: null,
      titulo: "Cargá la categoría",
      detalle: `${facturado} Sin la categoría no se puede comparar contra ningún tope.`,
      accion: "Elegí la categoría en la que está inscripto hoy.",
    };
  }

  const topePropio = tabla.topes[h.categoria];
  const letraSig = categoriaSiguiente(h.categoria);
  const siguiente = letraSig ? { letra: letraSig, tope: tabla.topes[letraSig] } : null;
  const proporcion = topePropio > 0 ? ingresos.ingresos / topePropio : null;
  const comun = { ...base, topePropio, siguiente, proporcion };

  if (centavosDe(ingresos.ingresos) > centavosDe(topePropio)) {
    if (corresponde == null) {
      return {
        ...comun,
        semaforo: "excedido",
        titulo: "Supera el tope de la K",
        detalle: `${facturado} El tope de la K es ${pesos(tabla.topes.K)}.`,
        accion: "Por ingresos corresponde la exclusión del monotributo: revisá el pase a responsable inscripto.",
      };
    }
    return {
      ...comun,
      semaforo: "excedido",
      titulo: `Superó el tope de la ${h.categoria}`,
      detalle: `${facturado} El tope de la ${h.categoria} es ${pesos(topePropio)}.`,
      // En plena recategorización la letra la da lo facturado al cierre del semestre con el cuadro
      // nuevo (`alCierre`), no los 12 meses de hoy contra el cuadro que se va.
      accion: alCierre
        ? "Para recategorizar vale lo facturado al cierre del semestre, con el cuadro nuevo: mirá abajo."
        : `Por ingresos le corresponde la ${corresponde}: recategorizalo en la próxima ventana.`,
    };
  }

  const margen = sumarAlCentavo([topePropio, -ingresos.ingresos]);
  const cerca = proporcion != null && proporcion >= UMBRAL_CERCA_DEL_TOPE;
  return {
    ...comun,
    semaforo: cerca ? "cerca" : "bien",
    titulo: cerca ? `Cerca del tope de la ${h.categoria}` : `Dentro de la ${h.categoria}`,
    detalle: `${facturado} Le quedan ${pesos(margen)} hasta el tope de la ${h.categoria}.`,
    accion: cerca
      ? siguiente
        ? `Si sigue a este ritmo pasa a la ${siguiente.letra} (tope ${pesos(siguiente.tope)}).`
        : "Es la última categoría: arriba de este tope sale del monotributo."
      : "Nada que hacer por ahora.",
  };
}

const ORDEN: Record<Semaforo, number> = { excedido: 0, sin_categoria: 1, cerca: 2, bien: 3 };

/**
 * Lo más urgente arriba; a igual semáforo, primero quien tiene que recategorizarse en la
 * ventana en curso y después el que más cerca está de su tope.
 */
export function ordenarMonotributo(filas: readonly FilaMonotributo[]): FilaMonotributo[] {
  const recategoriza = (f: FilaMonotributo) => (f.alCierre?.cambia ? 0 : 1);
  return [...filas].sort(
    (a, b) =>
      ORDEN[a.semaforo] - ORDEN[b.semaforo] ||
      recategoriza(a) - recategoriza(b) ||
      (b.proporcion ?? 0) - (a.proporcion ?? 0) ||
      a.alias.localeCompare(b.alias, "es"),
  );
}

/** ¿La tabla cubre el día de hoy? Si no, la pantalla avisa que puede estar desactualizada. */
export function tablaVigenteEn(hoy: string, tabla: TablaMonotributo = cuadroParaHoy(hoy)): boolean {
  return hoy >= tabla.vigenciaDesde && hoy <= tabla.vigenciaHasta;
}
