// R1 · una transferencia de un tercero (la seña de una clienta) no se pierde como «cuenta propia».
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarPago } from "./http";
import { ClasificadorPorReglas } from "./classifier";
import { procesarNotificacionPago } from "./handler";
import { StubMercadoPagoClient } from "./stub";
import type { PagoMP } from "./port";

const base = { status: "approved", transaction_amount: 5000, date_approved: "2026-10-22T10:00:00-03:00" };

test("normalizarPago: propia (fondeo o pagador = cobrador), de un tercero, o sin datos", () => {
  assert.equal(normalizarPago({ ...base, id: 1, operation_type: "account_fund" }).cuentaPropia, true);
  assert.equal(normalizarPago({ ...base, id: 2, operation_type: "money_transfer", collector_id: 9, payer: { id: 9 } }).cuentaPropia, true);
  assert.equal(normalizarPago({ ...base, id: 3, operation_type: "money_transfer", collector_id: 9, payer: { id: 7 } }).cuentaPropia, false);
  assert.equal(normalizarPago({ ...base, id: 4, operation_type: "money_transfer", payer: { id: 7 } }).cuentaPropia, undefined);
  assert.equal(normalizarPago({ ...base, id: 5, operation_type: "regular_payment", collector_id: 9, payer: { id: 7 } }).cuentaPropia, undefined);
});

test("clasificador: la de un tercero va a REVISAR; la propia (o sin datos, como antes) no se factura", async () => {
  const c = new ClasificadorPorReglas();
  const pago = (extra: Partial<PagoMP>): PagoMP => ({ id: "x", estado: "approved", monto: 5000, externalReference: "", operacion: "transferencia", ...extra });
  assert.equal((await c.clasificar(pago({ cuentaPropia: false }), "t")).clasificacion, "REVISAR");
  assert.equal((await c.clasificar(pago({ cuentaPropia: true }), "t")).clasificacion, "NO_FACTURABLE");
  assert.equal((await c.clasificar(pago({}), "t")).clasificacion, "NO_FACTURABLE");
});

test("config del negocio: una cuenta propia declarada no se factura aunque el pagador sea otro id", async () => {
  const c = new ClasificadorPorReglas({ config: { cuentasPropias: ["7"] } });
  const r = await c.clasificar(
    { id: "x", estado: "approved", monto: 5000, externalReference: "", operacion: "transferencia", contraparteId: "7", cuentaPropia: false },
    "t",
  );
  assert.equal(r.clasificacion, "NO_FACTURABLE");
  assert.equal(r.reglaId, "cuenta-propia");
});

test("aviso de un turno: el handler le pasa el PAGO al Core (factura ese cobro, no el turno entero)", async () => {
  const cuenta = new StubMercadoPagoClient();
  cuenta.simularPago({ id: "p-1", estado: "approved", monto: 5000, externalReference: "turno-1" });
  const llamados: unknown[][] = [];
  await procesarNotificacionPago(
    { type: "payment", paymentId: "p-1", tenantId: "t" },
    {
      clientePara: () => cuenta,
      facturar: async (...args) => {
        llamados.push(args);
        return "inv";
      },
    },
  );
  assert.equal(llamados.length, 1);
  assert.equal(llamados[0][0], "turno-1");
  assert.equal((llamados[0][2] as PagoMP).monto, 5000);
});
