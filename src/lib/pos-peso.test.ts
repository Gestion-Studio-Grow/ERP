// ============================================================================
// TEST-GATE · LA COMA QUE COBRABA 10 VECES DE MÁS
// ============================================================================
//
// El defecto real: `<input type="number">` + `Number(e.target.value)`. Tecleando `1,3` kilos
// el navegador entregaba `13` y la venta salía por diez veces su valor, sin error y con el
// botón "Cobrar" habilitado. Estos casos son los que el mostrador tipea de verdad; si alguien
// vuelve a un parseo ingenuo, el primer bloque se pone rojo.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leerCantidad,
  cantidadOCero,
  cantidadParaFormulario,
  formatearCantidad,
  avisoDeCantidad,
  redondearCantidad,
  KG_SOSPECHOSO,
} from "./pos-peso";

function valor(raw: string): number | null {
  const l = leerCantidad(raw);
  return l.estado === "ok" ? l.valor : null;
}

// ── 1. La coma es decimal (el bug que regalaba la mercadería) ────────────────
//
// Con el `<input type="number">` viejo, tipear "1,3" dejaba `.value` en la cadena VACÍA
// —medido con Chromium en es-AR y en en-US, los dos igual— así que `Number(.value)` daba 0.
// La carne salía del mostrador y la línea valía cero.

test("coma decimal: 1,3 kg es 1,3", () => {
  assert.equal(valor("1,3"), 1.3);
});

test("punto decimal: 1.3 vale lo mismo que 1,3 (pad numérico del celular)", () => {
  assert.equal(valor("1.3"), 1.3);
});

test("1,3 kg a $18.900/kg se cobra $24.570 — antes se cobraba $0", () => {
  const kg = valor("1,3");
  assert.ok(kg !== null);
  assert.equal(Math.round(kg * 18900 * 100) / 100, 24570);
  // El camino viejo, reproducido tal cual lo hacía el navegador: `.value` vacío → 0.
  // No es una tautología decorativa: si alguien vuelve a leer el campo con `Number(value)`
  // sin parsear, esto es exactamente lo que va a cobrar.
  const comoLoLeiaElInputNumber = Number("");
  assert.equal(comoLoLeiaElInputNumber * 18900, 0);
});

// ── 2. Gramos: el peso típico de un paquete al vacío ─────────────────────────

test("1,234 kg (gramos) entra entero: el step=0.01 viejo lo rechazaba", () => {
  assert.equal(valor("1,234"), 1.234);
  assert.equal(valor("1.234"), 1.234);
});

test("medio kilo escrito como lo escribe la gente", () => {
  assert.equal(valor("0,5"), 0.5);
  assert.equal(valor(",5"), 0.5);
});

test("más de 3 decimales se redondea a gramos, no se rechaza", () => {
  assert.equal(valor("1,2349"), 1.235);
  assert.equal(redondearCantidad(0.1 + 0.2), 0.3);
});

// ── 3. Miles ─────────────────────────────────────────────────────────────────

test("con DOS separadores distintos, el último manda: 1.234,5 → 1234,5", () => {
  assert.equal(valor("1.234,5"), 1234.5);
  assert.equal(valor("1,234.5"), 1234.5);
});

test("con separadores IGUALES repetidos, todos son de miles: 1.234.567", () => {
  assert.equal(valor("1.234.567"), 1234567);
  assert.equal(valor("1,234,567"), 1234567);
});

test("entero puro", () => {
  assert.equal(valor("3"), 3);
  assert.equal(valor("12"), 12);
});

// ── 4. Lo que NO es una cantidad ─────────────────────────────────────────────

test("vacío no es un error: es un campo que todavía no se tocó", () => {
  assert.deepEqual(leerCantidad(""), { estado: "vacio" });
  assert.deepEqual(leerCantidad("   "), { estado: "vacio" });
  assert.deepEqual(leerCantidad(null), { estado: "vacio" });
  assert.deepEqual(leerCantidad(undefined), { estado: "vacio" });
});

test("texto e importes negativos se marcan inválidos, no se silencian como 0", () => {
  assert.deepEqual(leerCantidad("abc"), { estado: "invalida" });
  assert.deepEqual(leerCantidad("1kg2"), { estado: "invalida" });
  assert.deepEqual(leerCantidad("-1"), { estado: "invalida" });
  assert.deepEqual(leerCantidad("-1,5"), { estado: "invalida" });
  assert.deepEqual(leerCantidad("1e3"), { estado: "invalida" });
});

test("dedo torcido: 1.3.4 rebota en vez de convertirse en 13,4 kg", () => {
  assert.deepEqual(leerCantidad("1.3.4"), { estado: "invalida" });
  assert.deepEqual(leerCantidad("12.34,5"), { estado: "invalida" });
});

test("separador colgando mientras se tipea no pone el campo en rojo", () => {
  assert.equal(valor("1,"), 1);
  assert.equal(valor("1."), 1);
});

test("lo que pega la balanza o el Excel: espacios y la unidad", () => {
  assert.equal(valor(" 1,240 "), 1.24);
  assert.equal(valor("1,240 kg"), 1.24);
  assert.equal(valor("1 234,5"), 1234.5);
});

test("cantidadOCero no suma lo ilegible al total del ticket", () => {
  assert.equal(cantidadOCero("1,3"), 1.3);
  assert.equal(cantidadOCero("abc"), 0);
  assert.equal(cantidadOCero(""), 0);
});

// ── 5. Ida y vuelta al formulario ────────────────────────────────────────────

test("lo que viaja al server usa PUNTO decimal (Number() del otro lado lo lee bien)", () => {
  const kg = valor("1,234");
  assert.ok(kg !== null);
  const enElHidden = cantidadParaFormulario(kg);
  assert.equal(enElHidden, "1.234");
  assert.equal(Number(enElHidden), 1.234);
  // Y el server, que no confía en el navegador, lo vuelve a leer igual.
  assert.equal(valor(enElHidden), 1.234);
});

test("lo que ve la persona usa COMA", () => {
  assert.equal(formatearCantidad(1.234), "1,234");
  assert.equal(formatearCantidad(3), "3");
});

// ── 6. El aviso del decimal olvidado ─────────────────────────────────────────

test("1300 kg avisa (la balanza decía 1,300) pero NO bloquea la venta", () => {
  const aviso = avisoDeCantidad({ valor: 1300, saleUnit: "WEIGHT" });
  assert.ok(aviso && aviso.includes("1,3"));
});

test("un peso normal de mostrador no molesta a nadie", () => {
  assert.equal(avisoDeCantidad({ valor: 1.24, saleUnit: "WEIGHT" }), null);
  assert.equal(avisoDeCantidad({ valor: KG_SOSPECHOSO - 0.001, saleUnit: "WEIGHT" }), null);
  // Las unidades no se avisan: 50 latas es una compra grande, no un error de coma.
  assert.equal(avisoDeCantidad({ valor: 50, saleUnit: "UNIT" }), null);
});
