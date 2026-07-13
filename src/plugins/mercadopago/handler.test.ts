// ============================================================================
// TEST-GATE webhook MP — decisión de auto-facturación (único disparador público de plata).
// ============================================================================
//
// `procesarNotificacionPago` decide si una notificación de MP factura o no. Es el
// corazón del único endpoint PÚBLICO que dispara facturación real, y no tenía test.
// Invariante: SOLO factura si type==="payment" Y estado==="approved" Y hay
// external_reference (appointmentId). Cualquier otra cosa: no llama a `facturar`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { procesarNotificacionPago, type MpHandlerDeps } from "./handler";
import type { NotificacionPagoMP } from "./core-contract";

function makeDeps(pago: { estado: string; externalReference: string | null }) {
  const calls: { appointmentId: string; tenantId: string }[] = [];
  const deps = {
    clientePara: () => ({
      getPayment: async () => pago,
    }),
    facturar: async (appointmentId: string, tenantId: string) => {
      calls.push({ appointmentId, tenantId });
      return "inv_1";
    },
  } as unknown as MpHandlerDeps;
  return { deps, calls };
}

const NOTIF: NotificacionPagoMP = { type: "payment", paymentId: "pay_1", tenantId: "t1" };

test("type != payment: ignora, no verifica ni factura", async () => {
  const { deps, calls } = makeDeps({ estado: "approved", externalReference: "appt_1" });
  const r = await procesarNotificacionPago({ ...NOTIF, type: "merchant_order" }, deps);
  assert.equal(r.procesado, false);
  assert.equal(r.facturado, false);
  assert.equal(calls.length, 0);
});

test("estado != approved: procesa pero NO factura (idempotente: un 'approved' posterior sí)", async () => {
  for (const estado of ["pending", "rejected", "in_process", "cancelled"]) {
    const { deps, calls } = makeDeps({ estado, externalReference: "appt_1" });
    const r = await procesarNotificacionPago(NOTIF, deps);
    assert.equal(r.facturado, false, `estado ${estado} no debe facturar`);
    assert.equal(calls.length, 0, `estado ${estado} no debe llamar a facturar`);
    assert.match(r.motivo ?? "", new RegExp(estado));
  }
});

test("approved SIN external_reference: no factura (no sabe qué turno)", async () => {
  const { deps, calls } = makeDeps({ estado: "approved", externalReference: null });
  const r = await procesarNotificacionPago(NOTIF, deps);
  assert.equal(r.facturado, false);
  assert.equal(calls.length, 0);
  assert.match(r.motivo ?? "", /external_reference/);
});

test("approved CON external_reference: factura el turno con (appointmentId, tenantId)", async () => {
  const { deps, calls } = makeDeps({ estado: "approved", externalReference: "appt_42" });
  const r = await procesarNotificacionPago(NOTIF, deps);
  assert.equal(r.procesado, true);
  assert.equal(r.facturado, true);
  assert.equal(r.invoiceId, "inv_1");
  assert.deepEqual(calls, [{ appointmentId: "appt_42", tenantId: "t1" }]);
});
