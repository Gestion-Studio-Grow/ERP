// Motor de facturación · cuentas de la nota de crédito (prorrateo al centavo, cierre exacto).
import { test } from "node:test";
import assert from "node:assert/strict";
import { montosDeLaNota, saldoPorAnular } from "./nota-credito-core";

const cent = (n: number) => Math.round(n * 100);

test("la nota total copia los montos de la factura", () => {
  const f = { neto: 1000, iva: [{ alicuotaId: 5, base: 1000, importe: 210 }], total: 1210 };
  assert.deepEqual(montosDeLaNota(f, 1210), f);
});

test("factura C (sin IVA): el neto es el importe", () => {
  assert.deepEqual(montosDeLaNota({ neto: 5000, iva: [], total: 5000 }, 1234.56), { neto: 1234.56, iva: [], total: 1234.56 });
});

test("parcial con una alícuota: neto + IVA = importe y la base es el neto", () => {
  const n = montosDeLaNota({ neto: 1000, iva: [{ alicuotaId: 5, base: 1000, importe: 210 }], total: 1210 }, 100);
  assert.equal(cent(n.total), 10000);
  assert.equal(cent(n.neto) + cent(n.iva[0].importe), 10000);
  assert.equal(n.iva[0].base, n.neto);
  assert.equal(n.iva[0].importe, 17.36);
});

test("parcial con dos alícuotas: cierra exacto al centavo y las bases suman el neto", () => {
  const f = {
    neto: 1500,
    iva: [
      { alicuotaId: 5, base: 1000, importe: 210 },
      { alicuotaId: 4, base: 500, importe: 52.5 },
    ],
    total: 1762.5,
  };
  for (const importe of [0.01, 1, 333.33, 999.99, 1762.49]) {
    const n = montosDeLaNota(f, importe);
    const iva = n.iva.reduce((a, r) => a + cent(r.importe), 0);
    const bases = n.iva.reduce((a, r) => a + cent(r.base), 0);
    assert.equal(cent(n.neto) + iva, cent(importe), `cierra en ${importe}`);
    assert.equal(bases, cent(n.neto), `bases = neto en ${importe}`);
  }
});

test("rechaza importe cero, negativo o mayor que la factura", () => {
  const f = { neto: 100, iva: [], total: 100 };
  assert.throws(() => montosDeLaNota(f, 0), /mayor a cero/);
  assert.throws(() => montosDeLaNota(f, -5), /mayor a cero/);
  assert.throws(() => montosDeLaNota(f, 100.01), /mayor que la factura/);
});

test("saldo por anular: total menos notas vivas, nunca negativo, al centavo", () => {
  assert.equal(saldoPorAnular(1210, 0), 1210);
  assert.equal(saldoPorAnular(1210, 210.1), 999.9);
  assert.equal(saldoPorAnular(0.3, 0.1 + 0.2), 0);
  assert.equal(saldoPorAnular(100, 150), 0);
});
