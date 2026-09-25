// ============================================================================
// LA LETRA DE «RENGLÓN» — Archivo variable (ancho 62–125, peso 100–900).
// ============================================================================
//
// Una sola familia para interfaz, títulos y cifras (Omnibus-Type, SIL Open Font License 1.1: se
// puede auto-hospedar). Su EJE DE ANCHO es la razón de elegirla: un ERP necesita rótulos condensados
// en cabeceras de columna estrechas, texto normal legible y cifras compactas. Con una familia de un
// solo ancho eso se resuelve con tamaños y se pierde la jerarquía. Es además la letra de los títulos
// de la marca GSG: el producto y la marca comparten letra sin compartir estética. Trae cifras
// tabulares (`tnum`, verificado con fontTools), la ñ, ¿ ¡ y el «−» tipográfico (U+2212).
//
// POR QUÉ NO `next/font` (decisión medida, ADR-099 §Letra): `next/font` escribe sus `@font-face` en
// el CSS del LAYOUT que lo importa, es decir, también en el de CH (medido en la corrida anterior:
// 424 B gzip de CSS que CH descargaba sin usar). Declarada en la hoja de la piel (que CH, apagado,
// no pide), CH paga 0 bytes. Del cargador de next/font se tomaron los MISMOS números del respaldo
// ajustado (get-fallback-metrics-from-font-file sobre este archivo, con Arial): el cambio de letra
// al llegar el archivo no mueve el diseño (CLS).
//
// Un solo archivo: el subconjunto latino (90.104 bytes). Sin itálica en el backoffice (el archivo
// itálico, 102 KB, no se carga). hoja.ts escribe el `@font-face` en la hoja desde acá y ConDiseno
// lo precarga sólo con el diseño nuevo prendido.

export const LETRA = {
  familia: "Archivo Renglon",
  archivo: "/diseno/archivo-latin.woff2",
  /** Bytes del archivo (lo verifica hoja.test.ts contra public/). */
  bytes: 90104,
  pesos: "100 900",
  anchos: "62% 125%",
  /** El rango del subconjunto «latin» de Google Fonts (el mismo que declara next/font). */
  rango:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  /**
   * Respaldo ajustado: los números que calcula next/font para Archivo sobre Arial
   * (get-fallback-metrics-from-font-file), medidos con su cargador sobre este archivo.
   */
  respaldo: {
    familia: "Archivo Renglon Respaldo",
    local: "Arial",
    ascent: "85.41%",
    descent: "20.43%",
    lineGap: "0.00%",
    sizeAdjust: "102.80%",
  },
} as const;

/** Los dos `@font-face` (la letra y su respaldo ajustado), tal como van en la hoja. */
export function fontFaces(): string {
  const r = LETRA.respaldo;
  return [
    "@font-face {",
    `  font-family: "${LETRA.familia}";`,
    "  font-style: normal;",
    `  font-weight: ${LETRA.pesos};`,
    `  font-stretch: ${LETRA.anchos};`,
    "  font-display: swap;",
    `  src: url("${LETRA.archivo}") format("woff2");`,
    `  unicode-range: ${LETRA.rango};`,
    "}",
    "@font-face {",
    `  font-family: "${r.familia}";`,
    `  src: local("${r.local}");`,
    `  ascent-override: ${r.ascent};`,
    `  descent-override: ${r.descent};`,
    `  line-gap-override: ${r.lineGap};`,
    `  size-adjust: ${r.sizeAdjust};`,
    "}",
  ].join("\n");
}
