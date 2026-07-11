/**
 * EL MAPEADOR AUTOMÁTICO — la joya del producto. Recibe la matriz cruda del
 * extracto (de CSV o XLSX, ver parsers) y detecta SOLO:
 *
 *   (a) dónde empieza la tabla real — los bancos meten 5-15 filas de basura
 *       arriba (logo, CBU, período, titular); se busca la fila de headers por
 *       diccionario de sinónimos;
 *   (b) qué columna es FECHA / DESCRIPCIÓN / DÉBITO / CRÉDITO (o IMPORTE único
 *       con signo) / SALDO (que se detecta solo para ignorarlo) — por headers
 *       Y por la FORMA de los datos (una columna que parsea como fecha en >80%
 *       de las filas ES la fecha, diga lo que diga el header);
 *   (c) una CONFIANZA 0-1 por columna y global. Si la global es < 0.8, el
 *       mapeo se devuelve igual pero marcado `requiereConfirmacion` para que
 *       la UI se lo muestre al usuario antes de seguir.
 *
 * Es DETERMINISTA (heurísticas + templates, costo cero). Para los casos
 * difíciles queda el port `MapeadorAsistido` (stub hoy): se enchufa IA SOLO
 * cuando la confianza no llega a 0.8 — regla de unit-economics del Lab: la IA
 * es el último recurso, no el camino feliz.
 */

import type { MovimientoBancario, OrigenMovimiento } from "../core-contract";
import type { Celda } from "../parser/xlsx";
import { buscarTemplate, normalizarHeaders, type ColumnasTemplate } from "./templates";
import { hashMovimiento, normalizarTexto, parsearFecha, parsearNumeroAR, redondear2 } from "./valores";

export type { Celda };

/** Umbral de confianza global: por debajo, la UI pide confirmación humana. */
export const CONFIANZA_MINIMA = 0.8;

/** Cómo viene el importe en el extracto. */
export type EsquemaImporte = "debito-credito" | "importe-unico";

export interface MapeoColumnas {
  /** Índice (0-based) de la fila de headers en la matriz cruda. */
  filaHeaders: number;
  columnas: ColumnasTemplate;
  esquemaImporte: EsquemaImporte;
  /** Confianza global 0-1 (el mínimo de las columnas esenciales). */
  confianza: number;
  /** Confianza por campo detectado, para que la UI resalte el dudoso. */
  confianzaPorColumna: Record<string, number>;
  /** Template que matcheó (confianza 1), si hubo. */
  templateId?: string;
  origen: OrigenMovimiento;
  /** confianza < CONFIANZA_MINIMA ⇒ la UI debe confirmar el mapeo con el usuario. */
  requiereConfirmacion: boolean;
}

// ── Diccionario de sinónimos AR (headers típicos de homebanking) ─────────────

const SINONIMOS: Record<string, string[]> = {
  fecha: ["fecha", "f. valor", "f.valor", "fecha valor", "fecha de operacion", "fecha operacion", "fecha mov.", "fecha movimiento"],
  descripcion: ["concepto", "descripcion", "detalle", "movimiento", "operacion", "leyenda", "detalle de la operacion"],
  debito: ["debito", "debitos", "debe", "egreso", "egresos", "importe debito"],
  credito: ["credito", "creditos", "haber", "ingreso", "ingresos", "importe credito"],
  // Nota: "Importe ($)" y similares matchean "importe" porque normalizarTexto
  // ya barre los símbolos decorativos ($, paréntesis).
  importe: ["importe", "monto", "importe en pesos", "valor"],
  saldo: ["saldo", "saldo en pesos", "balance", "saldo parcial"],
  referencia: ["referencia", "ref", "ref.", "comprobante", "nro. comprobante", "numero de comprobante", "id de la operacion", "nro. operacion", "origen"],
  contraparte: ["contraparte", "titular", "beneficiario", "ordenante", "de/para", "cuit contraparte", "cuit/cuil"],
};

/** ¿A qué campo corresponde este header (normalizado)? Null si no matchea ninguno. */
function campoDeHeader(header: string): keyof typeof SINONIMOS | null {
  for (const [campo, sinonimos] of Object.entries(SINONIMOS)) {
    if (sinonimos.includes(header)) return campo as keyof typeof SINONIMOS;
  }
  return null;
}

// ── Detección de la fila de headers ──────────────────────────────────────────

/** Hasta qué fila buscamos headers (los bancos meten 5-15 de basura; 25 da margen). */
const MAX_FILAS_BUSQUEDA_HEADER = 25;
/** Cuántas filas de datos se muestrean para el análisis de forma. */
const MAX_FILAS_MUESTREO = 200;

/**
 * Busca la fila de headers: la que más celdas con sinónimos conocidos tiene
 * (mínimo 2: con una sola palabra suelta no hay tabla). Empate → la primera.
 */
function detectarFilaHeaders(matriz: Celda[][]): number | null {
  let mejorFila: number | null = null;
  let mejorPuntaje = 1; // exige >= 2 matches
  const tope = Math.min(matriz.length, MAX_FILAS_BUSQUEDA_HEADER);
  for (let i = 0; i < tope; i++) {
    const headers = normalizarHeaders(matriz[i]);
    const puntaje = headers.filter((h) => h !== "" && campoDeHeader(h) !== null).length;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorFila = i;
    }
  }
  return mejorFila;
}

// ── Análisis de forma de las columnas ────────────────────────────────────────

interface FormaColumna {
  /** Proporción de celdas no vacías que parsean como fecha. */
  tasaFecha: number;
  /** Proporción de celdas no vacías que parsean como número. */
  tasaNumero: number;
  /** Entre las numéricas: ¿hay positivos y negativos? (señal de importe único con signo). */
  signosMixtos: boolean;
  /** Proporción de celdas no vacías sobre el total de filas de datos. */
  tasaLlenado: number;
  /** Proporción de celdas no vacías que son texto (ni fecha ni número). */
  tasaTexto: number;
}

/** Mide la forma de una columna sobre las filas de datos (muestreo). */
function medirColumna(filas: Celda[][], col: number): FormaColumna {
  let noVacias = 0;
  let fechas = 0;
  let numeros = 0;
  let positivos = 0;
  let negativos = 0;
  let textos = 0;
  for (const fila of filas) {
    const celda = fila[col];
    if (celda === null || celda === undefined || celda === "" || typeof celda === "boolean") continue;
    noVacias++;
    if (parsearFecha(celda) !== null) {
      fechas++;
      continue;
    }
    const n = typeof celda === "string" || typeof celda === "number" ? parsearNumeroAR(celda) : null;
    if (n !== null) {
      numeros++;
      if (n > 0) positivos++;
      if (n < 0) negativos++;
      continue;
    }
    textos++;
  }
  const div = Math.max(noVacias, 1);
  return {
    tasaFecha: fechas / div,
    tasaNumero: numeros / div,
    signosMixtos: positivos > 0 && negativos > 0,
    tasaLlenado: filas.length > 0 ? noVacias / filas.length : 0,
    tasaTexto: textos / div,
  };
}

// ── El mapeador ──────────────────────────────────────────────────────────────

/**
 * Mapea la matriz cruda a columnas del dominio. Devuelve null solo si la
 * matriz está vacía o no hay NADA reconocible como tabla (ni headers ni
 * columnas con forma de fecha+importe); en cualquier otro caso devuelve el
 * mejor esfuerzo con su confianza (la UI decide con `requiereConfirmacion`).
 */
export function mapearColumnas(matriz: Celda[][]): MapeoColumnas | null {
  if (matriz.length === 0) return null;

  // 1) Fila de headers por diccionario. Sin headers reconocibles, intentamos
  //    forma pura desde la fila 0 (extractos sin encabezado).
  const filaHeaders = detectarFilaHeaders(matriz);

  // 2) Template exacto: headers idénticos a una plantilla conocida → confianza 1.
  if (filaHeaders !== null) {
    const headers = normalizarHeaders(matriz[filaHeaders]);
    const template = buscarTemplate(headers);
    if (template) {
      const esquemaImporte: EsquemaImporte =
        template.columnas.importe !== undefined ? "importe-unico" : "debito-credito";
      const confianzaPorColumna: Record<string, number> = {};
      for (const campo of Object.keys(template.columnas)) confianzaPorColumna[campo] = 1;
      return {
        filaHeaders,
        columnas: template.columnas,
        esquemaImporte,
        confianza: 1,
        confianzaPorColumna,
        templateId: template.id,
        origen: template.origen,
        requiereConfirmacion: false,
      };
    }
  }

  // 3) Heurística: headers (si hay) + forma de los datos.
  const inicioDatos = filaHeaders !== null ? filaHeaders + 1 : 0;
  const filasDatos = matriz.slice(inicioDatos, inicioDatos + MAX_FILAS_MUESTREO);
  if (filasDatos.length === 0) return null;

  const anchos = filasDatos.map((f) => f.length);
  const ancho = Math.max(...anchos, filaHeaders !== null ? matriz[filaHeaders].length : 0);
  const formas: FormaColumna[] = [];
  for (let c = 0; c < ancho; c++) formas.push(medirColumna(filasDatos, c));

  // Campos que declaran los headers (si los hay).
  const porHeader = new Map<string, number>();
  if (filaHeaders !== null) {
    const headers = normalizarHeaders(matriz[filaHeaders]);
    headers.forEach((h, i) => {
      const campo = h === "" ? null : campoDeHeader(h);
      if (campo && !porHeader.has(campo)) porHeader.set(campo, i);
    });
  }

  const confianzaPorColumna: Record<string, number> = {};
  const columnas: Partial<ColumnasTemplate> = {};

  // — FECHA: header confirmado por forma > header solo > forma sola.
  const colFechaHeader = porHeader.get("fecha");
  if (colFechaHeader !== undefined) {
    const forma = formas[colFechaHeader];
    columnas.fecha = colFechaHeader;
    confianzaPorColumna.fecha = forma.tasaFecha >= 0.8 ? 1 : forma.tasaFecha >= 0.5 ? 0.85 : 0.5;
  } else {
    // Sin header: la columna que MÁS parsea como fecha (>80% = es la fecha).
    let mejor = -1;
    let mejorTasa = 0;
    formas.forEach((f, i) => {
      if (f.tasaFecha > mejorTasa) {
        mejorTasa = f.tasaFecha;
        mejor = i;
      }
    });
    if (mejor >= 0 && mejorTasa >= 0.8) {
      columnas.fecha = mejor;
      confianzaPorColumna.fecha = redondear2(mejorTasa * 0.78); // forma sola: nunca llega a 0.8
    }
  }
  if (columnas.fecha === undefined) return null; // sin fecha no hay extracto

  // — IMPORTE: débito/crédito (dos columnas) o importe único con signo.
  const colDebito = porHeader.get("debito");
  const colCredito = porHeader.get("credito");
  const colImporte = porHeader.get("importe");
  let esquemaImporte: EsquemaImporte;
  if (colDebito !== undefined && colCredito !== undefined) {
    esquemaImporte = "debito-credito";
    columnas.debito = colDebito;
    columnas.credito = colCredito;
    const formaOk = formas[colDebito].tasaNumero >= 0.5 || formas[colCredito].tasaNumero >= 0.5;
    confianzaPorColumna.importe = formaOk ? 0.95 : 0.6;
  } else if (colImporte !== undefined) {
    esquemaImporte = "importe-unico";
    columnas.importe = colImporte;
    confianzaPorColumna.importe = formas[colImporte].tasaNumero >= 0.8 ? 0.95 : 0.6;
  } else {
    // Sin headers de importe: forma pura. Prioridad a la columna numérica con
    // signos mixtos (importe único); si no, dos numéricas ≈ débito/crédito.
    const numericas = formas
      .map((f, i) => ({ f, i }))
      .filter(({ f, i }) => i !== columnas.fecha && f.tasaNumero >= 0.8 && f.tasaLlenado > 0.3);
    const mixta = numericas.find(({ f }) => f.signosMixtos);
    if (mixta) {
      esquemaImporte = "importe-unico";
      columnas.importe = mixta.i;
      confianzaPorColumna.importe = 0.7; // forma sola: pide confirmación
      // La otra numérica de alto llenado suele ser el saldo (acumulado).
      const otra = numericas.find(({ i }) => i !== mixta.i);
      if (otra) columnas.saldo = otra.i;
    } else if (numericas.length >= 2) {
      esquemaImporte = "debito-credito";
      // Convención bancaria: débito antes que crédito (orden de columnas).
      columnas.debito = numericas[0].i;
      columnas.credito = numericas[1].i;
      confianzaPorColumna.importe = 0.55;
    } else {
      return null; // sin importe no hay extracto
    }
  }

  // — SALDO: solo por header (se detecta para IGNORARLO; adivinarlo por forma
  //   es riesgoso y no hace falta: no participa del movimiento).
  const colSaldo = porHeader.get("saldo");
  if (colSaldo !== undefined) columnas.saldo = colSaldo;

  // — DESCRIPCIÓN: header, o la columna más "de texto".
  const colDesc = porHeader.get("descripcion");
  if (colDesc !== undefined) {
    columnas.descripcion = colDesc;
    confianzaPorColumna.descripcion = 0.9;
  } else {
    let mejor = -1;
    let mejorTasa = 0;
    formas.forEach((f, i) => {
      if (i === columnas.fecha || i === columnas.debito || i === columnas.credito || i === columnas.importe || i === columnas.saldo) return;
      if (f.tasaTexto > mejorTasa) {
        mejorTasa = f.tasaTexto;
        mejor = i;
      }
    });
    if (mejor >= 0 && mejorTasa >= 0.5) {
      columnas.descripcion = mejor;
      confianzaPorColumna.descripcion = 0.6;
    } else {
      return null; // sin descripción el clasificador queda ciego
    }
  }

  // — REFERENCIA / CONTRAPARTE: opcionales, solo por header.
  const colRef = porHeader.get("referencia");
  if (colRef !== undefined) columnas.referencia = colRef;
  const colContra = porHeader.get("contraparte");
  if (colContra !== undefined) columnas.contraparte = colContra;

  // Confianza global = el eslabón más débil de lo esencial.
  const confianza = redondear2(
    Math.min(confianzaPorColumna.fecha, confianzaPorColumna.importe, confianzaPorColumna.descripcion),
  );

  return {
    filaHeaders: filaHeaders ?? -1, // -1 = sin fila de headers (datos desde la fila 0)
    columnas: columnas as ColumnasTemplate,
    esquemaImporte,
    confianza,
    confianzaPorColumna,
    origen: "banco",
    requiereConfirmacion: confianza < CONFIANZA_MINIMA,
  };
}

// ── Normalización: matriz + mapeo → movimientos del dominio ─────────────────

/**
 * Convierte las filas de datos en `MovimientoBancario` normalizados. Filas que
 * no parsean (subtotales, leyendas al pie, renglones decorativos) se saltean
 * en silencio: en un extracto real SIEMPRE hay ruido después de la tabla.
 */
export function normalizarMovimientos(matriz: Celda[][], mapeo: MapeoColumnas): MovimientoBancario[] {
  const inicio = mapeo.filaHeaders + 1; // con filaHeaders = -1 arranca en 0
  const movimientos: MovimientoBancario[] = [];

  for (let i = inicio; i < matriz.length; i++) {
    const fila = matriz[i];
    const celdaFecha = fila[mapeo.columnas.fecha];
    const fecha = celdaFecha instanceof Date || typeof celdaFecha === "string" ? parsearFecha(celdaFecha) : null;
    if (fecha === null) continue; // sin fecha no es un movimiento (fila de ruido)

    let monto: number | null = null;
    if (mapeo.esquemaImporte === "importe-unico") {
      const celda = fila[mapeo.columnas.importe!];
      monto = typeof celda === "string" || typeof celda === "number" ? parsearNumeroAR(celda) : null;
    } else {
      const celdaDeb = fila[mapeo.columnas.debito!];
      const celdaCred = fila[mapeo.columnas.credito!];
      const debito = typeof celdaDeb === "string" || typeof celdaDeb === "number" ? parsearNumeroAR(celdaDeb) : null;
      const credito = typeof celdaCred === "string" || typeof celdaCred === "number" ? parsearNumeroAR(celdaCred) : null;
      if (debito === null && credito === null) continue; // fila sin importe = ruido
      // El débito viene en positivo en su columna → lo llevamos a signo negativo.
      monto = redondear2((credito ?? 0) - Math.abs(debito ?? 0));
    }
    if (monto === null || monto === 0) continue;

    const celdaDesc = fila[mapeo.columnas.descripcion];
    const descripcion = typeof celdaDesc === "string" ? celdaDesc.trim() : String(celdaDesc ?? "");

    const celdaRef = mapeo.columnas.referencia !== undefined ? fila[mapeo.columnas.referencia] : null;
    const celdaContra = mapeo.columnas.contraparte !== undefined ? fila[mapeo.columnas.contraparte] : null;

    movimientos.push({
      id: hashMovimiento(fecha, monto, descripcion),
      fecha,
      monto,
      descripcion,
      ...(celdaRef !== null && celdaRef !== "" ? { referencia: String(celdaRef) } : {}),
      ...(celdaContra !== null && celdaContra !== "" ? { contraparte: String(celdaContra) } : {}),
      origen: mapeo.origen,
    });
  }

  return movimientos;
}

// ── Port del mapeador ASISTIDO (IA), stub hoy ────────────────────────────────

/**
 * Puerta para enchufar un mapeador asistido por IA — SOLO para los casos donde
 * la heurística no llega a `CONFIANZA_MINIMA` (regla de unit-economics del
 * Lab: el camino feliz es determinista y gratis; la IA es la excepción cara).
 * Recibe la matriz y el mejor esfuerzo heurístico; devuelve un mapeo mejorado
 * o el mismo si no puede aportar.
 */
export interface MapeadorAsistido {
  proponerMapeo(matriz: Celda[][], heuristico: MapeoColumnas | null): Promise<MapeoColumnas | null>;
}

/** Stub: devuelve el heurístico tal cual (la IA vendrá después, si el caso lo paga). */
export class StubMapeadorAsistido implements MapeadorAsistido {
  async proponerMapeo(_matriz: Celda[][], heuristico: MapeoColumnas | null): Promise<MapeoColumnas | null> {
    return heuristico;
  }
}
