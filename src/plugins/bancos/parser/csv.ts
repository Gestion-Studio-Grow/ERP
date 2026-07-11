/**
 * Parser CSV robusto para extractos bancarios. Los bancos argentinos exportan
 * "CSV" de mil maneras: separador `;` o `,` (a veces tab), comillas con
 * separadores adentro, BOM, encoding latin1 (Windows viejo) o UTF-8, filas de
 * encabezado basura de largo variable. Este parser NO interpreta nada: devuelve
 * la matriz cruda de celdas (strings) y deja la inteligencia al mapeador.
 *
 * Puro y sin dependencias (regla de plugin, ADR-022): entra `Uint8Array` (el
 * archivo tal cual se subió) o `string`, sale `string[][]`.
 */

/** Separadores candidatos, en orden de preferencia ante empate ( `;` es el más común en bancos AR). */
const SEPARADORES = [";", ",", "\t"] as const;
export type SeparadorCsv = (typeof SEPARADORES)[number];

/**
 * Decodifica los bytes del archivo a texto. Estrategia:
 *   1. BOM UTF-8 (EF BB BF) o UTF-16 LE (FF FE) → decodifica según BOM.
 *   2. Intenta UTF-8 estricto (`fatal: true`): si valida, es UTF-8.
 *   3. Si no valida, es latin1 (el encoding clásico de los exports bancarios viejos).
 */
export function decodificar(entrada: Uint8Array): string {
  if (entrada.length >= 3 && entrada[0] === 0xef && entrada[1] === 0xbb && entrada[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(entrada.subarray(3));
  }
  if (entrada.length >= 2 && entrada[0] === 0xff && entrada[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(entrada.subarray(2));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(entrada);
  } catch {
    return new TextDecoder("latin1").decode(entrada);
  }
}

/** Cuenta ocurrencias de `sep` en una línea, ignorando lo que está entre comillas. */
function contarFueraDeComillas(linea: string, sep: string): number {
  let cuenta = 0;
  let enComillas = false;
  for (const ch of linea) {
    if (ch === '"') enComillas = !enComillas;
    else if (ch === sep && !enComillas) cuenta++;
  }
  return cuenta;
}

/**
 * Autodetecta el separador mirando las primeras líneas con contenido: gana el
 * candidato que aparece en MÁS líneas (consistencia) y, a igualdad, el que más
 * columnas produce. `;` desempata (formato AR: la coma es el decimal).
 */
export function detectarSeparador(texto: string): SeparadorCsv {
  const lineas = texto
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim() !== "")
    .slice(0, 20);
  let mejor: SeparadorCsv = ";";
  let mejorPuntaje = -1;
  for (const sep of SEPARADORES) {
    const cuentas = lineas.map((l) => contarFueraDeComillas(l, sep));
    const conSep = cuentas.filter((c) => c > 0).length;
    const total = cuentas.reduce((a, b) => a + b, 0);
    const puntaje = conSep * 1000 + total; // consistencia primero, volumen después
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = sep;
    }
  }
  return mejor;
}

/**
 * Parsea el CSV completo a la matriz cruda. Máquina de estados clásica:
 * comillas dobles con escape `""`, separadores y saltos de línea dentro de
 * comillas, finales `\r\n` / `\n` / `\r`. Las celdas salen con trim de bordes.
 */
export function parsearCsv(entrada: Uint8Array | string, separador?: SeparadorCsv): string[][] {
  const texto = typeof entrada === "string" ? entrada : decodificar(entrada);
  if (texto.trim() === "") return [];
  const sep = separador ?? detectarSeparador(texto);

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;

  const cerrarCelda = () => {
    fila.push(celda.trim());
    celda = "";
  };
  const cerrarFila = () => {
    cerrarCelda();
    // Filas totalmente vacías (renglones decorativos del banco) no aportan.
    if (fila.some((c) => c !== "")) filas.push(fila);
    fila = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          celda += '"'; // escape "" → comilla literal
          i++;
        } else {
          enComillas = false;
        }
      } else {
        celda += ch;
      }
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === sep) {
      cerrarCelda();
    } else if (ch === "\n") {
      cerrarFila();
    } else if (ch === "\r") {
      cerrarFila();
      if (texto[i + 1] === "\n") i++;
    } else {
      celda += ch;
    }
  }
  if (celda !== "" || fila.length > 0) cerrarFila();

  return filas;
}
