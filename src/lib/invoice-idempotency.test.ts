// Tests de la decisión PURA de idempotencia de facturación (sin DB). Blinda que un
// webhook MP duplicado NO dispare una segunda factura. Patrón node:test, igual que
// `cash-sale.test.ts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirFacturacion } from "./invoice-idempotency";

test("turno sin pago → emitir", () => {
  assert.deepEqual(decidirFacturacion(null), { accion: "emitir" });
  assert.deepEqual(decidirFacturacion(undefined), { accion: "emitir" });
});

test("pago sin comprobante → emitir", () => {
  assert.deepEqual(decidirFacturacion({ comprobanteNro: null }), { accion: "emitir" });
});

test("pago con comprobante → reusar (idempotente, no re-factura)", () => {
  assert.deepEqual(decidirFacturacion({ comprobanteNro: "inv_123" }), {
    accion: "reusar",
    comprobante: "inv_123",
  });
});

test("comprobante de recibo de caja también bloquea la re-facturación", () => {
  // Un turno cobrado en efectivo ya tiene comprobanteNro "REC-..." (actions.ts):
  // el webhook MP para ese turno NO debe emitir otra factura.
  assert.deepEqual(decidirFacturacion({ comprobanteNro: "REC-1720000000000" }), {
    accion: "reusar",
    comprobante: "REC-1720000000000",
  });
});
