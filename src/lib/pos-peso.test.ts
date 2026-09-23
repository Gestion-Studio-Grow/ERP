// ============================================================================
// TEST-GATE · LA COMA QUE EL `<input type="number">` SE TRAGABA
// ============================================================================
//
// El defecto real: `<input type="number">` + `Number(e.target.value)`. MEDIDO con Chromium
// 141 (es-AR y en-US, tecla por tecla; tabla completa en la cabecera de pos-peso.ts):
// tecleando "1,3" el campo entrega "13", "4,350" entrega "4350" y "12,5" entrega "125", con
// `validity.valid === true`. O sea, el número sale multiplicado y nadie protesta. Estos
// casos son los que se tipean de verdad; si alguien vuelve a un parseo ingenuo, se ponen
// rojos.
//
// (Una versión anterior de este archivo decía que `.value` quedaba vacío y la línea valía
// $0. Eso es lo que da asignar el valor por JS, no tipearlo: re-medido, no se sostiene.)

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

// ── 1. La coma es decimal ────────────────────────────────────────────────────
//
// Con el `<input type="number">` viejo, tipear "1,3" dejaba `.value` en "13" (medido, ver
// arriba), así que `Number(.value)` daba 13: un kilo trescientos leído como trece kilos.

test("coma decimal: 1,3 kg es 1,3", () => {
  assert.equal(valor("1,3"), 1.3);
});

test("punto decimal: 1.3 vale lo mismo que 1,3 (pad numérico del celular)", () => {
  assert.equal(valor("1.3"), 1.3);
});

test("1,3 kg a $18.900/kg son $24.570 — el camino viejo daba diez veces más", () => {
  const kg = valor("1,3");
  assert.ok(kg !== null);
  assert.equal(Math.round(kg * 18900 * 100) / 100, 24570);
  // El camino viejo con lo que MEDÍ que entrega el navegador al teclear "1,3": "13".
  // No es una tautología decorativa: si alguien vuelve a leer un `type="number"` con
  // `Number(value)`, esto es lo que va a calcular.
  const loQueEntregabaElInputNumber = "13";
  assert.equal(Number(loQueEntregabaElInputNumber) * 18900, 245700);
});

// ── 2. Gramos: el peso típico de un paquete al vacío ─────────────────────────

test("1,234 kg (gramos) entra entero", () => {
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

// ── Importes ────────────────────────────────────────────────────────────────
import {
  leerImporte,
  importeOCero,
  importeParaFormulario,
  cantidadDelFormulario,
  importeDelFormulario,
} from "./pos-peso";

const ok = (raw: string) => {
  const l = leerImporte(raw);
  assert.equal(l.estado, "ok", `"${raw}" tenía que leerse`);
  return l.estado === "ok" ? l.valor : NaN;
};

test("importe: '12.500' son doce mil quinientos, no doce con cincuenta", () => {
  assert.equal(ok("12.500"), 12500);
  assert.equal(ok("12,500"), 12500);
  assert.equal(ok("$ 12.500"), 12500);
});

test("importe: un solo separador con 1 o 2 dígitos es el decimal", () => {
  assert.equal(ok("12,5"), 12.5);
  assert.equal(ok("12.50"), 12.5);
  assert.equal(ok("6543,21"), 6543.21);
});

test("importe: miles y centavos juntos, como en el extracto", () => {
  assert.equal(ok("1.234,56"), 1234.56);
  assert.equal(ok("1,234.56"), 1234.56);
  assert.equal(ok("1.234.567"), 1234567);
  assert.equal(ok("1.234.567,8"), 1234567.8);
});

test("importe: lo que no es plata rebota, no se vuelve 0", () => {
  for (const raw of ["abc", "-500", "12,345,6", "1,234,56", "12.3456", "1.2.3", "0,555", "0.555", "012.500"]) {
    assert.equal(leerImporte(raw).estado, "invalida", raw);
  }
  assert.equal(leerImporte("").estado, "vacio");
  assert.equal(importeOCero("abc"), 0);
});

test("importe: separador colgando mientras se tipea no es error", () => {
  assert.equal(ok("12."), 12);
  assert.equal(ok("12.500,"), 12500);
});

test("importe: viaja al server con punto y sin miles", () => {
  assert.equal(importeParaFormulario(12500), "12500");
  assert.equal(importeParaFormulario(1234.567), "1234.57");
});

// ── Los casos de la tanda (compras, recuento, alta de producto) ─────────────
//
// Los números son los que se tipean en esas pantallas: el recuento de un corte al gramo, la
// línea del remito en kilos, el costo del proveedor con separador de miles.

test("cantidades de compras y recuento: 4,350 · 12,5 · 1.234,5", () => {
  assert.equal(valor("4,350"), 4.35);
  assert.equal(valor("12,5"), 12.5);
  assert.equal(valor("1.234,5"), 1234.5);
});

test("importes del proveedor: 6.543 · 6.543,50 · 6543,5 · 12.500", () => {
  assert.equal(ok("6.543"), 6543);
  assert.equal(ok("6.543,50"), 6543.5);
  assert.equal(ok("6543,5"), 6543.5);
  assert.equal(ok("12.500"), 12500);
});


test("server: lo ilegible se RECHAZA con mensaje, no viaja como 0", () => {
  assert.throws(() => cantidadDelFormulario("abc", "Cantidad"), /Cantidad: "abc" no es una cantidad/);
  assert.throws(() => cantidadDelFormulario("-2", "Contado"), /no es una cantidad/);
  assert.throws(() => importeDelFormulario("6.5.4", "Costo"), /Costo: "6.5.4" no es un importe/);
  assert.throws(() => importeDelFormulario("12,345,6", "Costo"), /no es un importe/);
});

test("server: vacío es null (el llamador decide si el campo es opcional)", () => {
  assert.equal(cantidadDelFormulario("", "Cantidad"), null);
  assert.equal(cantidadDelFormulario(null, "Cantidad"), null);
  assert.equal(importeDelFormulario("  ", "Costo"), null);
});

test("server: lee lo tipeado Y lo canónico que manda el hidden, con el mismo resultado", () => {
  assert.equal(cantidadDelFormulario("4,350", "Contado"), 4.35);
  assert.equal(cantidadDelFormulario(cantidadParaFormulario(4.35), "Contado"), 4.35);
  assert.equal(importeDelFormulario("$6.543", "Costo"), 6543);
  assert.equal(importeDelFormulario(importeParaFormulario(6543), "Costo"), 6543);
  // El caso borde del hidden: un importe con centavos viaja "6543.5" y NO se confunde con miles.
  assert.equal(importeDelFormulario(importeParaFormulario(6543.5), "Costo"), 6543.5);
  assert.equal(importeDelFormulario(importeParaFormulario(0.05), "Costo"), 0.05);
});

test("server: el eco de un valor larguísimo se recorta (el mensaje se lee en el teléfono)", () => {
  assert.throws(
    () => cantidadDelFormulario("x".repeat(500), "Cantidad"),
    (e: Error) => e.message.length < 120,
  );
});

// La vidriera (tienda genérica y la de MAGRA) muestra la cantidad del carrito con coma, como
// la bandeja y el ticket. Antes decía "0.25 kg". Forma del código (los componentes son de
// cliente), más la función que usan. El mensaje de WhatsApp ya no se arma en el cliente: lo
// arma el servidor con lo que quedó grabado (`mensajeWhatsAppDelPedido`, reglas-tienda.ts), y
// su "1,25 kg" lo ejecuta src/app/tienda/pedido-online.test.ts.
test("la vidriera muestra la cantidad con coma", async () => {
  const { readFileSync } = await import("node:fs");
  assert.equal(formatearCantidad(0.25), "0,25");
  const tienda = readFileSync("src/app/tienda/Storefront.tsx", "utf8");
  assert.match(tienda, /<span>\{formatearCantidad\(l\.qty\)\} /, "la línea del carrito");
  const magra = readFileSync("src/app/tienda/MagraFront.tsx", "utf8");
  assert.match(magra, /\$\{formatearCantidad\(q\)\} \$\{p\.saleUnit/, "el contador de la tarjeta");
  assert.match(magra, /\{formatearCantidad\(l\.q\)\}\{l\.p\.saleUnit/, "la línea del carrito de MAGRA");
  const reglas = readFileSync("src/app/tienda/reglas-tienda.ts", "utf8");
  assert.match(reglas, /formatearCantidad\(/, "el mensaje de WhatsApp, armado en el servidor");
});
