import test from "node:test";
import assert from "node:assert/strict";
import { resumenCierre } from "./cierre-resumen";

const CIERRE = {
  day: "2026-09-07",
  estado: "FALTANTE",
  note: "Cajón contado 20:10. Falta un billete de $1.000.",
  movimientos: 8,
  porMedio: {
    EFECTIVO: { esperado: 39400, declarado: 38400, diferencia: -1000 },
    MP: { esperado: 41600, declarado: 41600, diferencia: 0 },
    TARJETA: { esperado: 0, declarado: null, diferencia: null },
  },
};

test("cuenta el arqueo en castellano, medio por medio", () => {
  const r = resumenCierre(CIERRE)!;
  assert.ok(r.titulo.includes("8 movimientos"));
  assert.ok(r.titulo.includes("faltó plata"));
  assert.equal(r.medios.length, 3);
  assert.match(r.medios[0], /Efectivo: contó .*38\.400.* sobre .*39\.400.* · faltan .*1\.000/);
  assert.match(r.medios[1], /Mercado Pago.*cuadra/);
  assert.match(r.medios[2], /Tarjeta: sin conciliar/);
  assert.equal(r.nota, "Cajón contado 20:10. Falta un billete de $1.000.");
});

test("un sobrante se dice sobrante", () => {
  const r = resumenCierre({
    ...CIERRE,
    estado: "SOBRANTE",
    porMedio: { ...CIERRE.porMedio, EFECTIVO: { esperado: 39400, declarado: 40400, diferencia: 1000 } },
  })!;
  assert.match(r.medios[0], /sobran/);
});

test("sin nota, no inventa una", () => {
  const r = resumenCierre({ ...CIERRE, note: null })!;
  assert.equal(r.nota, null);
  const r2 = resumenCierre({ ...CIERRE, note: "   " })!;
  assert.equal(r2.nota, null);
});

test("deriva la diferencia si falta en el JSON (filas viejas)", () => {
  const r = resumenCierre({
    ...CIERRE,
    porMedio: { EFECTIVO: { esperado: 100, declarado: 90 }, MP: { esperado: 0, declarado: 0 }, TARJETA: { esperado: 0, declarado: null } },
  })!;
  assert.match(r.medios[0], /faltan/);
});

test("un changes que no es un cierre devuelve null (la pantalla cae al volcado)", () => {
  assert.equal(resumenCierre(null), null);
  assert.equal(resumenCierre("texto"), null);
  assert.equal(resumenCierre({ foo: 1 }), null);
  assert.equal(resumenCierre({ porMedio: {} }), null);
  assert.equal(resumenCierre({ porMedio: { EFECTIVO: { esperado: "mal" } } }), null);
});

// Cert. M1 v9 O1: la fila trae la hoja (`porColumna`) y el libro (`porMedio`); manda la hoja, con
// las etiquetas de la hoja que se usó.
test("con porColumna manda la hoja; «hoja: siempre» usa las etiquetas del libro («Mercado Pago» desde el UAT)", async () => {
  const { resumenCierre } = await import("./cierre-resumen");
  const fila = (hoja?: string) => ({
    estado: "CUADRA",
    ...(hoja ? { hoja } : {}),
    porMedio: { MP: { esperado: 7_400, declarado: 7_400, diferencia: 0 }, TRANSFERENCIA: { esperado: 7_400, declarado: 7_400, diferencia: 0 } },
    porColumna: { MP: { esperado: 2_300, declarado: 2_300, diferencia: 0 }, TRANSFERENCIA: { esperado: 2_600, declarado: 2_600, diferencia: 0 } },
  });
  const money = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  assert.deepEqual(resumenCierre(fila("nueva"))?.medios, [
    `Mercado Pago: contó ${money(2_300)} sobre ${money(2_300)} · cuadra`,
    `Transferencia: contó ${money(2_600)} sobre ${money(2_600)} · cuadra`,
  ]);
  assert.deepEqual(resumenCierre(fila("siempre"))?.medios, [
    `Mercado Pago: contó ${money(2_300)} sobre ${money(2_300)} · cuadra`,
    `Transferencia: contó ${money(2_600)} sobre ${money(2_600)} · cuadra`,
  ]);
});
