// La cuenta de color contra valores conocidos: si esto falla, ningún contraste medido vale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aHex, leerColor, mezclarOklch, oklchASrgb, razonContraste, srgbAOklch } from "./color";
import { resolverColor } from "./resolver";

const rgb = (s: string) => oklchASrgb(leerColor(s));
const cerca = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test("contraste WCAG de pares de referencia", () => {
  cerca(razonContraste(rgb("#fff"), rgb("#000")), 21, 1e-4);
  cerca(razonContraste(rgb("#767676"), rgb("#fff")), 4.54, 0.01);
  cerca(razonContraste(rgb("#777777"), rgb("#fff")), 4.48, 0.01);
});

test("OKLCH ↔ sRGB: el rojo puro va y vuelve", () => {
  const rojo = srgbAOklch({ r: 1, g: 0, b: 0, a: 1 });
  cerca(rojo.l, 0.628, 0.001);
  cerca(rojo.c, 0.2577, 0.001);
  assert.equal(aHex(oklchASrgb(rojo)), "#ff0000");
});

test("color-mix en oklch: mitad blanco y negro da L = 0,5; con transparente baja el alfa", () => {
  assert.equal(aHex(oklchASrgb(resolverColor("color-mix(in oklch, white, black)", {}))), "#636363");
  const m = resolverColor("color-mix(in oklch, #2c6e77 12%, transparent)", {});
  cerca(m.a, 0.12, 1e-9);
  const acro = mezclarOklch({ color: leerColor("#2c6e77"), porcentaje: 50 }, { color: leerColor("white"), porcentaje: 50 });
  assert.notEqual(acro.h, null, "el blanco no aporta tono: manda el del acento");
});

test("var() sigue la variable o su respaldo y corta los ciclos", () => {
  assert.equal(aHex(oklchASrgb(resolverColor("var(--x, #123456)", {}))), "#123456");
  assert.equal(aHex(oklchASrgb(resolverColor("var(--a)", { "--a": "var(--b)", "--b": "#abcdef" }))), "#abcdef");
  assert.throws(() => resolverColor("var(--a)", { "--a": "var(--a)" }), /ciclo/);
  assert.throws(() => resolverColor("color-mix(in srgb, red, blue)", {}), /oklch/);
});

test("color relativo: oklch(from <acento> L C h) toma el matiz del acento y fija luz y croma", () => {
  const acento = "#7b2d3b"; // bordó de MAGRA
  const origen = resolverColor(acento, {});
  const gris = resolverColor("oklch(from var(--accent) 97.2% 0.004 h)", { "--accent": acento });
  cerca(gris.l, 0.972, 1e-9);
  cerca(gris.c, 0.004, 1e-9);
  cerca(gris.h ?? -1, origen.h ?? -2, 1e-9);
  // Con alfa y con canales tomados tal cual.
  const mismo = resolverColor("oklch(from #2c6e77 l c h / 50%)", {});
  const petroleo = resolverColor("#2c6e77", {});
  cerca(mismo.l, petroleo.l, 1e-9);
  cerca(mismo.a, 0.5, 1e-9);
  assert.throws(() => resolverColor("oklch(from #fff calc(l - 0.1) c h)", {}), /no sé leer/);
});
