import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHex, rgbFuncToHex, hexToRgb, colorDistance, isNeutral, saturation, lightness } from "./color";

test("normalizeHex: acepta #rgb, #rrggbb, #rrggbbaa; rechaza basura", () => {
  assert.equal(normalizeHex("#FFF"), "#ffffff");
  assert.equal(normalizeHex("#6e1e28"), "#6e1e28");
  assert.equal(normalizeHex("#6E1E28FF"), "#6e1e28"); // descarta alfa
  assert.equal(normalizeHex("6e1e28"), null); // sin #
  assert.equal(normalizeHex("#zzz"), null);
  assert.equal(normalizeHex("#12"), null);
});

test("rgbFuncToHex: rgb()/rgba() → hex", () => {
  assert.equal(rgbFuncToHex("rgb(110, 30, 40)"), "#6e1e28");
  assert.equal(rgbFuncToHex("rgba(255,255,255,0.5)"), "#ffffff");
  assert.equal(rgbFuncToHex("rgb(300,0,0)"), null); // fuera de rango
  assert.equal(rgbFuncToHex("nope"), null);
});

test("hexToRgb + colorDistance: idénticos = 0, distintos > 0", () => {
  assert.deepEqual(hexToRgb("#6e1e28"), [110, 30, 40]);
  const a = hexToRgb("#6e1e28")!;
  assert.equal(colorDistance(a, a), 0);
  assert.ok(colorDistance(a, hexToRgb("#2c6e77")!) > 0);
});

test("isNeutral: grises y casi-blanco/negro son neutros; un oxblood no", () => {
  assert.equal(isNeutral("#ffffff"), true);
  assert.equal(isNeutral("#0a0a0a"), true);
  assert.equal(isNeutral("#888888"), true); // gris
  assert.equal(isNeutral("#faf7f2"), true); // hueso (fondo CH)
  assert.equal(isNeutral("#6e1e28"), false); // oxblood de marca
  assert.equal(isNeutral("#2c6e77"), false); // petróleo de marca
});

test("saturation/lightness: coherentes en extremos", () => {
  assert.equal(saturation([128, 128, 128]), 0); // gris → 0
  assert.ok(saturation([110, 30, 40]) > 0.4); // oxblood saturado
  assert.ok(lightness([255, 255, 255]) > 0.99);
  assert.ok(lightness([0, 0, 0]) < 0.01);
});
