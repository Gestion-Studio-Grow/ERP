// Tests de la aritmética pura de los ajustes de stock (F2): cómo cada motivo traduce
// el valor cargado por el operador en un delta FIRMADO, y las reglas de motivo/nota.
// `insertStockAdjustment` (que toca Prisma) no se testea acá — se cubre la lógica de
// signo, que es donde vive el riesgo (convertir una baja en suba, o un recuento mal).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustmentDelta,
  motivoMode,
  requiresNote,
  buildReason,
  leerValorDeAjuste,
  leerLineasDeAjuste,
  filtroDeAjustables,
  type AdjustmentMode,
} from "./adjustment-core";

test("motivoMode: recuento cuenta, mermas restan, otro es delta firmado", () => {
  assert.equal(motivoMode("RECUENTO"), "COUNT");
  assert.equal(motivoMode("MERMA"), "LOSS");
  assert.equal(motivoMode("ROTURA"), "LOSS");
  assert.equal(motivoMode("VENCIMIENTO"), "LOSS");
  assert.equal(motivoMode("OTRO"), "SIGNED");
});

test("adjustmentDelta COUNT (recuento): delta = contado − stock actual", () => {
  assert.equal(adjustmentDelta("COUNT", 8, 10), -2); // faltan 2 respecto del sistema
  assert.equal(adjustmentDelta("COUNT", 12, 10), 2); // sobran 2
  assert.equal(adjustmentDelta("COUNT", 10, 10), 0); // coincide → no-op
});

test("adjustmentDelta LOSS (merma/rotura/vencimiento): siempre resta la magnitud", () => {
  assert.equal(adjustmentDelta("LOSS", 3, 10), -3);
  // Aunque el operador cargue negativo por error, una pérdida SIEMPRE baja.
  assert.equal(adjustmentDelta("LOSS", -3, 10), -3);
});

test("adjustmentDelta SIGNED (otro): respeta el signo del valor cargado", () => {
  assert.equal(adjustmentDelta("SIGNED", 5, 10), 5);
  assert.equal(adjustmentDelta("SIGNED", -5, 10), -5);
});

test("adjustmentDelta: redondea a 3 decimales (stock fraccional en kg)", () => {
  assert.equal(adjustmentDelta("COUNT", 9.25, 10), -0.75);
  assert.equal(adjustmentDelta("LOSS", 0.756, 10), -0.756);
});

test("adjustmentDelta: valor no numérico → 0 (línea inerte, no rompe el lote)", () => {
  assert.equal(adjustmentDelta("LOSS", NaN, 10), 0);
  assert.equal(adjustmentDelta("COUNT", NaN, 10), 0);
});

test("requiresNote: sólo OTRO exige nota (el resto la tiene en el motivo)", () => {
  assert.equal(requiresNote("OTRO"), true);
  assert.equal(requiresNote("MERMA"), false);
  assert.equal(requiresNote("RECUENTO"), false);
});

test("buildReason: motivo + nota; nunca vacío (reason obligatorio)", () => {
  assert.equal(buildReason("MERMA", "se cayó una caja"), "Merma — se cayó una caja");
  assert.equal(buildReason("RECUENTO", null), "Recuento");
  assert.equal(buildReason("RECUENTO", "   "), "Recuento"); // nota en blanco se ignora
});

// ── Lo que se tipea en la línea → el delta que se asienta ───────────────────
//
// El camino completo que usan la pantalla (preview) y la Server Action: texto tipeado →
// `leerValorDeAjuste` → `adjustmentDelta`. Si alguien vuelve a leer con `Number()`, estos
// casos se ponen rojos.

function deltaDeLoTipeado(mode: AdjustmentMode, raw: string, stock: number): number | null {
  const l = leerValorDeAjuste(mode, raw);
  return l.estado === "ok" ? adjustmentDelta(mode, l.valor, stock) : null;
}

test("recuento de '4,350' kg contra 10 kg en sistema: delta −5,65, el corte queda en 4,35", () => {
  const delta = deltaDeLoTipeado("COUNT", "4,350", 10);
  assert.equal(delta, -5.65);
  assert.equal(Math.round((10 + delta!) * 1000) / 1000, 4.35);
  // Lo que pasaba con el `type="number"`: tecleado "4,350" el campo entregaba "4350"
  // (medido, cabecera de pos-peso.ts) y el recuento SUBÍA el stock a 4350 kg.
  assert.equal(adjustmentDelta("COUNT", Number("4350"), 10), 4340);
});

test("recuento: punto y coma valen lo mismo, y contado 0 es un recuento válido", () => {
  assert.equal(deltaDeLoTipeado("COUNT", "4.350", 10), -5.65);
  assert.equal(deltaDeLoTipeado("COUNT", "0", 3.2), -3.2);
});

test("un contado ilegible NO produce delta (ni 0 − stock ni nada)", () => {
  for (const raw of ["abc", "4,3,5", "1.3.4", "-2", "4,350kg2"]) {
    assert.equal(leerValorDeAjuste("COUNT", raw).estado, "invalida", raw);
    assert.equal(deltaDeLoTipeado("COUNT", raw, 10), null, raw);
  }
  // Vacío tampoco: es un campo que todavía no se tocó.
  assert.equal(leerValorDeAjuste("COUNT", "").estado, "vacio");
});

test("merma: la cantidad perdida con coma resta; con signo es un error de tipeo", () => {
  assert.equal(deltaDeLoTipeado("LOSS", "0,750", 10), -0.75);
  assert.equal(leerValorDeAjuste("LOSS", "-0,750").estado, "invalida");
});

test("otro (delta firmado): el signo se respeta, con coma y con el menos del celular", () => {
  assert.equal(deltaDeLoTipeado("SIGNED", "-2,5", 10), -2.5);
  assert.equal(deltaDeLoTipeado("SIGNED", "\u22122,5", 10), -2.5);
  assert.equal(deltaDeLoTipeado("SIGNED", "+1,25", 10), 1.25);
  assert.equal(deltaDeLoTipeado("SIGNED", "3", 10), 3);
  // Un signo solo, o dos, no es un número.
  assert.equal(leerValorDeAjuste("SIGNED", "-").estado, "invalida");
  assert.equal(leerValorDeAjuste("SIGNED", "--2").estado, "invalida");
});

test("server: lee las líneas con la misma regla y lo que viaja canónico da lo mismo", () => {
  assert.deepEqual(leerLineasDeAjuste("COUNT", ["p1", "p2"], ["4,350", "4.35"]), [
    { productId: "p1", value: 4.35 },
    { productId: "p2", value: 4.35 },
  ]);
  assert.deepEqual(leerLineasDeAjuste("SIGNED", ["p1"], ["-2.5"]), [{ productId: "p1", value: -2.5 }]);
});

test("server: una línea ilegible RECHAZA el ajuste entero con mensaje, no se descarta callada", () => {
  assert.throws(
    () => leerLineasDeAjuste("COUNT", ["p1", "p2"], ["4,350", "abc"]),
    /Línea 2: "abc" no es una cantidad/,
  );
  assert.throws(() => leerLineasDeAjuste("COUNT", ["p1"], [""]), /Línea 1: falta el valor/);
  assert.throws(() => leerLineasDeAjuste("COUNT", ["p1", "p2"], ["1"]), /incompleto/);
});

test("server: la fila sin producto no es un error (no se pidió nada)", () => {
  assert.deepEqual(leerLineasDeAjuste("COUNT", ["", "p1"], ["", "2"]), [{ productId: "p1", value: 2 }]);
});

test("pantalla de ajustes: sin preelegido, sólo productos activos", () => {
  assert.deepEqual(filtroDeAjustables(), { active: true });
  assert.deepEqual(filtroDeAjustables(""), { active: true });
  assert.deepEqual(filtroDeAjustables("   "), { active: true });
  assert.deepEqual(filtroDeAjustables(null), { active: true });
});

test("pantalla de ajustes: el 'Recontar' de un producto INACTIVO lo trae igual", () => {
  // Sin esto, el enlace llegaba sin preselección (el id no estaba en la lista) y el stock de
  // un producto dado de baja no se podía corregir desde ningún lado.
  // Los activos siguen todos; de los inactivos, sólo ese id (no se abre la lista entera).
  assert.deepEqual(filtroDeAjustables("p-inactivo"), { OR: [{ active: true }, { id: "p-inactivo" }] });
  assert.deepEqual(filtroDeAjustables(" p-inactivo "), { OR: [{ active: true }, { id: "p-inactivo" }] });
});
