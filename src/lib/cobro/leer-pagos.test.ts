// `leerPagos`: lo que llega del formulario, leído por el servidor sin confiar en la pantalla.
// Con los formularios de siempre (sin `pago.*`) el medio pasa CRUDO a `medioDeCobroRequerido`
// (MAG-1): nada se rellena con EFECTIVO.

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerPagos, vueltoDelCobro, PAGOS_NO_COINCIDEN } from "./leer-pagos";

function form(pares: [string, string][]) {
  return (nombre: string) => pares.filter(([n]) => n === nombre).map(([, v]) => v);
}

test("formulario de siempre: `paid=on` + medio crudo, sin asientos", () => {
  assert.deepEqual(leerPagos(form([["paid", "on"], ["paymentMethod", "MERCADOPAGO"]])), {
    ok: true,
    pagado: true,
    medio: "MERCADOPAGO",
    asientos: null,
    recibido: null,
  });
  assert.deepEqual(leerPagos(form([["paid", "true"]])), { ok: true, pagado: true, medio: "", asientos: null, recibido: null });
  // El medio basura pasa crudo: lo rechaza `medioDeCobroRequerido`, no se convierte en EFECTIVO.
  const basura = leerPagos(form([["paid", "on"], ["paymentMethod", "TARJETA"]]));
  assert.ok(basura.ok && basura.medio === "TARJETA");
  // Sin nada: no cobrado.
  assert.deepEqual(leerPagos(form([])), { ok: true, pagado: false, medio: "", asientos: null, recibido: null });
});

test("un solo `pago.*` es el cobro de siempre con ese medio (no un mixto de un medio)", () => {
  const r = leerPagos(form([["pagado", "1"], ["pago.medio", "TRANSFERENCIA"], ["pago.monto", "25700.00"]]));
  assert.deepEqual(r, { ok: true, pagado: true, medio: "TRANSFERENCIA", asientos: null, recibido: null });
});

test("dos `pago.*`: asientos en orden y el medio es el principal (el de más plata)", () => {
  const r = leerPagos(
    form([
      ["pagado", "1"],
      ["pago.medio", "EFECTIVO"],
      ["pago.monto", "10000.00"],
      ["pago.medio", "TRANSFERENCIA"],
      ["pago.monto", "15700.00"],
    ]),
  );
  assert.ok(r.ok);
  assert.equal(r.medio, "TRANSFERENCIA");
  assert.deepEqual(r.asientos, [
    { medio: "EFECTIVO", monto: 10000 },
    { medio: "TRANSFERENCIA", monto: 15700 },
  ]);
});

test("si el `paymentMethod` no es el principal de los pagos, no se cobra: la pantalla y el servidor no coinciden", () => {
  const r = leerPagos(
    form([
      ["paymentMethod", "EFECTIVO"],
      ["pago.medio", "EFECTIVO"],
      ["pago.monto", "10000"],
      ["pago.medio", "TRANSFERENCIA"],
      ["pago.monto", "15700"],
    ]),
  );
  assert.deepEqual(r, { ok: false, error: PAGOS_NO_COINCIDEN });
});

test("forma inválida: incompleto, medio desconocido, repetido, importe raro, cero, demasiados medios", () => {
  const malos: [string, [string, string][], RegExp][] = [
    ["incompleto", [["pago.medio", "EFECTIVO"]], /incompletos/],
    ["medio desconocido", [["pago.medio", "TARJETA"], ["pago.monto", "1"], ["pago.medio", "EFECTIVO"], ["pago.monto", "1"]], /no se reconoce/],
    ["repetido", [["pago.medio", "EFECTIVO"], ["pago.monto", "1"], ["pago.medio", "EFECTIVO"], ["pago.monto", "2"]], /dos veces/],
    ["miles con punto (no es el formato del pie)", [["pago.medio", "EFECTIVO"], ["pago.monto", "20.000,00"], ["pago.medio", "MERCADOPAGO"], ["pago.monto", "1"]], /importe/],
    ["tres decimales", [["pago.medio", "EFECTIVO"], ["pago.monto", "1.005"], ["pago.medio", "MERCADOPAGO"], ["pago.monto", "1"]], /importe/],
    ["negativo", [["pago.medio", "EFECTIVO"], ["pago.monto", "-5"], ["pago.medio", "MERCADOPAGO"], ["pago.monto", "1"]], /importe/],
    ["cero", [["pago.medio", "EFECTIVO"], ["pago.monto", "0.00"], ["pago.medio", "MERCADOPAGO"], ["pago.monto", "1"]], /importe/],
    [
      "cinco medios",
      [
        ["pago.medio", "EFECTIVO"], ["pago.monto", "1"],
        ["pago.medio", "MERCADOPAGO"], ["pago.monto", "1"],
        ["pago.medio", "TRANSFERENCIA"], ["pago.monto", "1"],
        ["pago.medio", "EFECTIVO"], ["pago.monto", "1"],
        ["pago.medio", "EFECTIVO"], ["pago.monto", "1"],
      ],
      /Hasta 4/,
    ],
  ];
  for (const [nombre, pares, error] of malos) {
    const r = leerPagos(form(pares));
    assert.ok(!r.ok && error.test(r.error), `${nombre}: ${JSON.stringify(r)}`);
  }
});

test("recibido: se lee con centavos; si no se entiende, no se cobra", () => {
  const r = leerPagos(form([["pagado", "1"], ["paymentMethod", "EFECTIVO"], ["recibido", "50000.00"]]));
  assert.ok(r.ok && r.recibido === 50000);
  const malo = leerPagos(form([["pagado", "1"], ["paymentMethod", "EFECTIVO"], ["recibido", "cincuenta"]]));
  assert.ok(!malo.ok && /entregó/.test(malo.error));
});

test("vueltoDelCobro: efectivo de más da vuelto; sin dato, corto o sin efectivo, no se inventa", () => {
  assert.equal(vueltoDelCobro({ total: 36608, medio: "EFECTIVO", asientos: null, recibido: 50000 }), 13392);
  assert.equal(vueltoDelCobro({ total: 36608, medio: "EFECTIVO", asientos: null, recibido: 36608 }), 0);
  assert.equal(vueltoDelCobro({ total: 36608, medio: "EFECTIVO", asientos: null, recibido: 30000 }), null);
  assert.equal(vueltoDelCobro({ total: 36608, medio: "EFECTIVO", asientos: null, recibido: null }), null);
  assert.equal(vueltoDelCobro({ total: 36608, medio: "MERCADOPAGO", asientos: null, recibido: 50000 }), null);
  // Mixto: el vuelto sale del asiento en efectivo, no del total.
  const asientos = [
    { medio: "EFECTIVO" as const, monto: 20000 },
    { medio: "MERCADOPAGO" as const, monto: 16608 },
  ];
  assert.equal(vueltoDelCobro({ total: 36608, medio: "EFECTIVO", asientos, recibido: 25000 }), 5000);
  assert.equal(vueltoDelCobro({ total: 36608, medio: "MERCADOPAGO", asientos: [asientos[1], { medio: "TRANSFERENCIA", monto: 20000 }], recibido: 25000 }), null);
  // Al centavo.
  assert.equal(vueltoDelCobro({ total: 4135.58, medio: "EFECTIVO", asientos: null, recibido: 4135.6 }), 0.02);
});
