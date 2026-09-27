import { test } from "node:test";
import assert from "node:assert/strict";
import { medioPrincipal, repartirPagos, textoDelPago } from "./pago-mixto";

test("un solo medio exacto: un asiento, sin vuelto, no es mixto", () => {
  assert.deepEqual(repartirPagos(12500, [{ medio: "MERCADOPAGO", monto: 12500 }]), {
    ok: true,
    asientos: [{ medio: "MERCADOPAGO", monto: 12500 }],
    vuelto: 0,
    mixto: false,
  });
});

test("efectivo de más: al libro va el total y la diferencia es el vuelto", () => {
  assert.deepEqual(repartirPagos(12345.5, [{ medio: "EFECTIVO", monto: 20000 }]), {
    ok: true,
    asientos: [{ medio: "EFECTIVO", monto: 12345.5 }],
    vuelto: 7654.5,
    mixto: false,
  });
});

test("Mercado Pago más efectivo: el efectivo paga lo que falta y da vuelto", () => {
  const r = repartirPagos(34560, [
    { medio: "MERCADOPAGO", monto: 20000 },
    { medio: "EFECTIVO", monto: 15000 },
  ]);
  assert.deepEqual(r, {
    ok: true,
    asientos: [
      { medio: "EFECTIVO", monto: 14560 },
      { medio: "MERCADOPAGO", monto: 20000 },
    ],
    vuelto: 440,
    mixto: true,
  });
  assert.equal(textoDelPago(r.ok ? r.asientos : []), "Efectivo $14.560,00 + Mercado Pago $20.000,00");
});

test("los asientos suman exacto el total, al centavo", () => {
  const r = repartirPagos(1000.03, [
    { medio: "TRANSFERENCIA", monto: 333.33 },
    { medio: "MERCADOPAGO", monto: 333.33 },
    { medio: "EFECTIVO", monto: 400 },
  ]);
  assert.ok(r.ok);
  if (r.ok) {
    const suma = r.asientos.reduce((s, a) => s + Math.round(a.monto * 100), 0);
    assert.equal(suma, 100003);
    assert.equal(r.vuelto, 66.63);
  }
});

test("sin efectivo, lo que falta se dice con el importe", () => {
  const r = repartirPagos(10000, [
    { medio: "MERCADOPAGO", monto: 6000 },
    { medio: "TRANSFERENCIA", monto: 3000 },
  ]);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.falta, 1000);
    assert.match(r.error, /Faltan \$1\.000,00/);
  }
});

test("Mercado Pago o transferencia de más no tienen vuelto: se rechaza", () => {
  const r = repartirPagos(10000, [{ medio: "MERCADOPAGO", monto: 10500 }]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /no hay vuelto/);
});

test("efectivo sobrante cuando lo demás ya cubre todo: se pide sacarlo", () => {
  const r = repartirPagos(10000, [
    { medio: "MERCADOPAGO", monto: 10000 },
    { medio: "EFECTIVO", monto: 500 },
  ]);
  assert.equal(r.ok, false);
});

test("el mismo medio dos veces se suma", () => {
  const r = repartirPagos(10000, [
    { medio: "MERCADOPAGO", monto: 4000 },
    { medio: "MERCADOPAGO", monto: 6000 },
  ]);
  assert.deepEqual(r, { ok: true, asientos: [{ medio: "MERCADOPAGO", monto: 10000 }], vuelto: 0, mixto: false });
});

test("medio desconocido, monto en cero o con más de dos decimales: rechazo con qué hacer", () => {
  assert.equal(repartirPagos(100, [{ medio: "CHEQUE" as never, monto: 100 }]).ok, false);
  assert.equal(repartirPagos(100, [{ medio: "EFECTIVO", monto: 0 }]).ok, false);
  assert.equal(repartirPagos(100, [{ medio: "EFECTIVO", monto: 100.005 }]).ok, false);
  assert.equal(repartirPagos(0, [{ medio: "EFECTIVO", monto: 100 }]).ok, false);
  assert.equal(repartirPagos(100, []).ok, false);
});


test("el medio principal es el de más plata; en empate, efectivo, Mercado Pago, transferencia", () => {
  assert.equal(
    medioPrincipal([
      { medio: "EFECTIVO", monto: 4000 },
      { medio: "MERCADOPAGO", monto: 10000 },
    ]),
    "MERCADOPAGO",
  );
  assert.equal(
    medioPrincipal([
      { medio: "TRANSFERENCIA", monto: 5000 },
      { medio: "EFECTIVO", monto: 5000 },
    ]),
    "EFECTIVO",
  );
  assert.equal(medioPrincipal([]), null);
});
