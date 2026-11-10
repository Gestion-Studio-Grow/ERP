import { test } from "node:test";
import assert from "node:assert/strict";
import { azulejoMosaicoSvg, hojaMosaicoSvg, urlAzulejoMosaico, OPACIDAD_MARCA_DE_AGUA, CELDA_MOSAICO } from "./marca-de-agua";
import { ISOTIPO_GSG } from "./marca-svg";
import { ISOTIPO_FACTOQUE } from "../factoque-icono";

test("el azulejo lleva dos isotipos, el segundo corrido media celda en los dos ejes (filas desplazadas → diagonales)", () => {
  const svg = azulejoMosaicoSvg(ISOTIPO_GSG);
  const traslados = [...svg.matchAll(/translate\(([\d.]+) ([\d.]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(traslados.length, 2);
  assert.deepEqual([traslados[1][0] - traslados[0][0], traslados[1][1] - traslados[0][1]], [CELDA_MOSAICO / 2, CELDA_MOSAICO / 2]);
  assert.ok(svg.includes(ISOTIPO_GSG.nudo), "el nudo va en la misma forma (máscara monocroma)");
});

test("el isotipo es chico: textura, no logo", () => {
  const k = Number(/scale\(([\d.]+)\)/.exec(azulejoMosaicoSvg())![1]);
  assert.ok(k * 100 <= CELDA_MOSAICO / 3);
});

test("sirve con el isotipo de un producto y da un data URI válido", () => {
  assert.ok(azulejoMosaicoSvg(ISOTIPO_FACTOQUE).includes(ISOTIPO_FACTOQUE.forma));
  assert.match(urlAzulejoMosaico(), /^url\("data:image\/svg\+xml,%3Csvg/);
});

test("la opacidad queda dentro del 3–6 % pedido y la hoja del kit usa <pattern>", () => {
  for (const o of Object.values(OPACIDAD_MARCA_DE_AGUA)) assert.ok(o >= 0.03 && o <= 0.06);
  const hoja = hojaMosaicoSvg();
  assert.match(hoja, /<pattern id="gsg-mosaico"/);
  assert.match(hoja, /opacity="0.04"/);
});
