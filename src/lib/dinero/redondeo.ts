/**
 * La regla de redondeo de la plata, en un solo lugar (ENG-109, ADR-100 §3).
 *
 * R1 · Medio centavo hacia arriba, lejos del cero: 2,675 → 2,68 y −2,675 → −2,68
 *      (lo mismo que `round()` de Postgres y lo que se usa en comercio).
 * R7 · Un `number` vale lo que dicen sus 15 cifras significativas
 *      (`toPrecision(15)`, lo mismo que hace Postgres al pasar `float8` a `numeric`):
 *      1,005 es 1,005 aunque en binario sea 1,00499999…, y 0,1 + 0,2 es 0,3.
 * R3 · Una suma de renglones redondea cada renglón y suma exacto (`sumarAlCentavo`).
 * R4 · El porcentaje de un importe (`porcentajeDe`) se redondea UNA vez, desde el valor
 *      exacto, a la unidad que se pida (peso o centavo): nunca centavo primero y peso después.
 *
 * Sin importaciones, a propósito: lo usan pantallas del navegador y el plugin ARCA
 * (que no puede traer el resto del Core, ADR-022). `redondeo.test.ts` lo verifica.
 *
 * Lo que no es un número (NaN, ±Infinity) pasa sin cambios por `centavosDe`,
 * `redondearAlCentavo` y `sumarAlCentavo`, como con `Math.round`: validarlo es de
 * quien lee el dato. Lo que sale del sistema (`textoAlCentavo`) sí lo rechaza.
 */

/**
 * Con hasta 13 cifras enteras, las 15 cifras de un `number` alcanzan para los centavos;
 * desde 10^13 (14 enteras) ya no: de ahí para arriba no es un importe con centavos.
 */
const LIMITE_CON_CENTAVOS = 1e13;

/** Centavos de un importe positivo menor que el límite, por R7 y R1. */
function centavosSinSigno(importe: number): number {
  // Menos de un décimo de centavo redondea a 0 (y evita la notación 1e-7 de toPrecision).
  if (importe < 0.001) return 0;
  // Entre 0,001 y 10^13, toPrecision(15) siempre escribe "enteros.decimales".
  const texto = importe.toPrecision(15);
  const punto = texto.indexOf(".");
  let enteros = 0;
  for (let i = 0; i < punto; i++) enteros = enteros * 10 + (texto.charCodeAt(i) - 48);
  // Las cifras que siguen al punto; las que no están cuentan 0: 1234567890123.45 no trae
  // milésimos y 9999999999999.996 se escribe "10000000000000.0", sin centésimos.
  const largo = texto.length;
  const decimos = punto + 1 < largo ? texto.charCodeAt(punto + 1) - 48 : 0;
  const centesimos = punto + 2 < largo ? texto.charCodeAt(punto + 2) - 48 : 0;
  const milesimos = punto + 3 < largo ? texto.charCodeAt(punto + 3) - 48 : 0;
  return enteros * 100 + decimos * 10 + centesimos + (milesimos >= 5 ? 1 : 0);
}

/** Pesos de un importe positivo menor que el límite, por R7 y R1: 1.234,495 → 1.234. */
function pesosSinSigno(importe: number): number {
  if (importe < 0.001) return 0;
  const texto = importe.toPrecision(15);
  const punto = texto.indexOf(".");
  let enteros = 0;
  for (let i = 0; i < punto; i++) enteros = enteros * 10 + (texto.charCodeAt(i) - 48);
  const decimos = punto + 1 < texto.length ? texto.charCodeAt(punto + 1) - 48 : 0;
  return enteros + (decimos >= 5 ? 1 : 0);
}

/** El importe en centavos enteros: 1,005 → 101; −2,675 → −268. */
export function centavosDe(importe: number): number {
  if (!Number.isFinite(importe)) return importe * 100;
  const absoluto = Math.abs(importe);
  const centavos =
    absoluto < LIMITE_CON_CENTAVOS
      ? centavosSinSigno(absoluto)
      : Number(absoluto.toPrecision(15)) * 100;
  if (centavos === 0) return 0;
  return importe < 0 ? -centavos : centavos;
}

/** El importe redondeado al centavo: 1,005 → 1,01; −0,004 → 0 (nunca −0). */
export function redondearAlCentavo(importe: number): number {
  if (!Number.isFinite(importe)) return importe;
  const absoluto = Math.abs(importe);
  const redondeado =
    absoluto < LIMITE_CON_CENTAVOS
      ? centavosSinSigno(absoluto) / 100
      : Number(absoluto.toPrecision(15));
  if (redondeado === 0) return 0;
  return importe < 0 ? -redondeado : redondeado;
}

/** El importe redondeado al peso: 1.234,50 → 1.235; 1.234,495 → 1.234; −0,4 → 0 (nunca −0). */
export function redondearAlPeso(importe: number): number {
  if (!Number.isFinite(importe)) return importe;
  const absoluto = Math.abs(importe);
  const redondeado =
    absoluto < LIMITE_CON_CENTAVOS
      ? pesosSinSigno(absoluto)
      : Math.round(Number(absoluto.toPrecision(15)));
  if (redondeado === 0) return 0;
  return importe < 0 ? -redondeado : redondeado;
}

/** A qué se redondea un porcentaje de un importe. */
export type UnidadDeRedondeo = "peso" | "centavo";

/**
 * R4: `porcentaje` % de `base`, redondeado una sola vez a `unidad`: 10 % de 12.345 da 1.235 al
 * peso y 1.234,50 al centavo; 10 % de 12.344,95 (1.234,495) da 1.234 al peso.
 * La base vale al centavo y el porcentaje con dos decimales (R1 y R7: 12,345 % es 12,35 %).
 * La cuenta es entera (centavos × centésimos de punto), sin error de binario; si el producto
 * no entra entero en un `number` (bases de más de $9.000 millones al 100 %), la hace en
 * binario con R7. Lo que no es número pasa sin cambios, como en el resto del módulo.
 * Sirve para descuentos comerciales (hoy, sólo el cupón). NO sirve para alícuotas de
 * percepción o retención de IIBB ni para coeficientes del Convenio Multilateral: esos llevan
 * más de dos decimales (4 en el CM, a confirmar contra el padrón de cada jurisdicción).
 */
export function porcentajeDe(base: number, porcentaje: number, unidad: UnidadDeRedondeo): number {
  if (!Number.isFinite(base) || !Number.isFinite(porcentaje)) return (base * porcentaje) / 100;
  const producto = centavosDe(base) * centavosDe(porcentaje); // en millonésimos de peso
  if (!Number.isSafeInteger(producto)) {
    const exacto = (base * porcentaje) / 100;
    return unidad === "peso" ? redondearAlPeso(exacto) : redondearAlCentavo(exacto);
  }
  const divisor = unidad === "peso" ? 1_000_000 : 10_000;
  const absoluto = Math.abs(producto);
  const resto = absoluto % divisor;
  const cociente = (absoluto - resto) / divisor + (2 * resto >= divisor ? 1 : 0);
  if (cociente === 0) return 0;
  const redondeado = unidad === "peso" ? cociente : cociente / 100;
  return producto < 0 ? -redondeado : redondeado;
}

/**
 * R3: cada renglón al centavo y el total es la suma exacta de los renglones.
 * [1,005; 1,005] → 2,02 (dos renglones de 1,01), no 2,01.
 */
export function sumarAlCentavo(importes: readonly number[]): number {
  let centavos = 0;
  for (const importe of importes) centavos += centavosDe(importe);
  return centavos / 100;
}

/** Si el importe se puede escribir con centavos: finito y de menos de 13 cifras enteras. */
export function admiteCentavos(importe: number): boolean {
  return Number.isFinite(importe) && Math.abs(importe) < LIMITE_CON_CENTAVOS;
}

/**
 * El importe como texto con dos decimales y punto, redondeado por esta regla:
 * 1,005 → "1.01"; −12,345 → "-12.35"; 0 → "0.00". Es el formato de WSFEv1.
 * Rechaza (RangeError) lo que no es un importe: nunca sale "NaN" ni "1e+21".
 */
export function textoAlCentavo(importe: number): string {
  if (!admiteCentavos(importe)) {
    throw new RangeError(
      `No es un importe que se pueda escribir con centavos: ${String(importe)}.`,
    );
  }
  const centavos = centavosDe(importe);
  const absoluto = Math.abs(centavos);
  const resto = absoluto % 100;
  const signo = centavos < 0 ? "-" : "";
  return `${signo}${(absoluto - resto) / 100}.${resto < 10 ? "0" : ""}${resto}`;
}
