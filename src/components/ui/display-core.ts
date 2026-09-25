// ============================================================================
// DISPLAY — cómo se parte y se lee una cifra grande. Puro: sin React, sin datos.
// ============================================================================
//
// El display del Inicio y del cobro muestra la plata como un visor de balanza o un pizarrón de
// precios: el signo «$» chico arriba, la parte entera grande y ancha, los centavos chicos arriba.
// Acá se decide cómo se parte el número (es-AR: punto de miles, coma decimal), qué dice el delta
// (con signo y palabra, nunca sólo un color) y el dibujo de la micro línea de 7 días.
//
// NO calcula nada del negocio: recibe los números ya hechos por la pantalla. Lo prueba
// display-core.test.ts ejecutando cada caso.

export type FormatoCifra = "plata" | "numero" | "kg";

export interface CifraPartida {
  /** «-» si es negativa, si no "". */
  signo: string;
  /** «$» en plata; "" en el resto. */
  moneda: string;
  /** La parte entera con punto de miles («1.284.500»). */
  entero: string;
  /** «,50» (con la coma) o "" si no lleva. */
  decimales: string;
  /** «kg» en peso; "" en el resto. */
  unidad: string;
  /** Todo junto, para el lector de pantalla y para `title` («$1.284.500,50»). */
  texto: string;
}

function agrupar(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Parte una cifra. Plata: 2 decimales, salvo `sinCentavos` (los importes del Inicio se leen sin
 * centavos; el cobro los muestra). Peso: 3 decimales (gramos). Número: sin decimales.
 * Redondea como la cuenta de la pantalla (medio para arriba) y nunca devuelve «-0».
 */
export function partirCifra(valor: number, formato: FormatoCifra = "plata", sinCentavos = false): CifraPartida {
  if (!Number.isFinite(valor)) {
    return { signo: "", moneda: formato === "plata" ? "$" : "", entero: "—", decimales: "", unidad: formato === "kg" ? "kg" : "", texto: "—" };
  }
  const lugares = formato === "kg" ? 3 : formato === "plata" && !sinCentavos ? 2 : 0;
  const factor = 10 ** lugares;
  const redondo = Math.round(Math.abs(valor) * factor + Number.EPSILON * factor);
  const signo = valor < 0 && redondo !== 0 ? "-" : "";
  const entero = agrupar(String(Math.floor(redondo / factor)));
  const decimales = lugares > 0 ? "," + String(redondo % factor).padStart(lugares, "0") : "";
  const moneda = formato === "plata" ? "$" : "";
  const unidad = formato === "kg" ? "kg" : "";
  const texto = `${signo}${moneda}${entero}${decimales}${unidad ? " " + unidad : ""}`;
  return { signo, moneda, entero, decimales, unidad, texto };
}

export type SentidoDelta = "sube" | "baja" | "igual";
export type LecturaDelta = "buena" | "mala" | "neutra";

export interface Delta {
  sentido: SentidoDelta;
  lectura: LecturaDelta;
  /** «+12,4 %», «−$3.200», «igual». Con signo SIEMPRE (el color no alcanza). */
  cifra: string;
  /** Todo en palabras, para el lector: «12,4 % más que el martes pasado». */
  enPalabras: string;
}

/**
 * El delta de un display. `valor` ya calculado por la pantalla (p. ej. 12.4 = +12,4 %).
 * `subirEsBueno`: en ventas sí; en gastos o en deuda, no. Cero es «igual» y se lee neutro.
 */
export function leerDelta(
  valor: number,
  unidad: "%" | "$",
  frente: string,
  subirEsBueno = true,
): Delta {
  const sentido: SentidoDelta = valor > 0 ? "sube" : valor < 0 ? "baja" : "igual";
  const lectura: LecturaDelta = sentido === "igual" ? "neutra" : (sentido === "sube") === subirEsBueno ? "buena" : "mala";
  const abs = Math.abs(valor);
  const numero =
    unidad === "%"
      ? `${abs.toLocaleString("es-AR", { minimumFractionDigits: abs < 10 && abs % 1 !== 0 ? 1 : 0, maximumFractionDigits: 1 })} %`
      : partirCifra(abs, "plata", true).texto;
  // «−» tipográfico (U+2212), del mismo ancho que el «+» en cifras tabulares.
  const cifra = sentido === "igual" ? "igual" : `${sentido === "sube" ? "+" : "−"}${numero}`;
  const enPalabras =
    sentido === "igual" ? `igual que ${frente}` : `${numero} ${sentido === "sube" ? "más" : "menos"} que ${frente}`;
  return { sentido, lectura, cifra, enPalabras };
}

/**
 * El dibujo de la micro línea (7 días, p. ej.) en una caja `ancho × alto`, con un margen para que
 * el trazo y el punto final no se corten. Devuelve el `d` del <path> y dónde va el punto de hoy.
 * Menos de 2 datos: no hay línea (no se inventa una tendencia de un solo día).
 */
export function rutaMicroLinea(
  serie: readonly number[],
  ancho = 120,
  alto = 32,
  margen = 3,
): { d: string; ultimo: { x: number; y: number } } | null {
  const datos = serie.filter((v) => Number.isFinite(v));
  if (datos.length < 2 || datos.length !== serie.length) return null;
  const min = Math.min(...datos);
  const max = Math.max(...datos);
  const rango = max - min;
  const paso = (ancho - margen * 2) / (datos.length - 1);
  const r = (n: number) => Math.round(n * 10) / 10;
  const puntos = datos.map((v, i) => ({
    x: r(margen + i * paso),
    // Serie plana: una línea al medio (no al piso, que se leería como «cero»).
    y: r(rango === 0 ? alto / 2 : margen + (1 - (v - min) / rango) * (alto - margen * 2)),
  }));
  const d = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  return { d, ultimo: puntos[puntos.length - 1] };
}
