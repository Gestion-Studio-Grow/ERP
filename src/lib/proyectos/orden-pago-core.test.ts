// MIA-199 (P1 «Aurora», pasos 6 · P6 y P6-1): las reglas puras del pago de una orden. Esperados escritos a mano.
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeOrdenCreada, errorDelPago, textosDelPago } from "./orden-pago-core";

test("P6-1 · el aviso de la orden creada dice la regla real: no la paga quien cargó sus comprobantes", () => {
  const aviso = avisoDeOrdenCreada(1);
  assert.equal(aviso, "OP 00000001 creada: la aprueba y la paga alguien de Administración que no haya cargado sus comprobantes.");
  assert.doesNotMatch(aviso, /otra persona de Administración/, "no promete que la paga otra persona que quien hizo la orden");
});

test("P6 · por transferencia, cheque o Mercado Pago el pago pide la cuenta; en efectivo, no", () => {
  const base = { cuentaId: "", hayCuentas: true, fecha: "2026-11-18", hoy: "2026-11-19" };
  for (const medio of ["TRANSFERENCIA", "CHEQUE", "MERCADO_PAGO"]) assert.equal(errorDelPago({ ...base, medio }), "Elegí la cuenta de la que sale el pago.", medio);
  assert.equal(errorDelPago({ ...base, medio: "TRANSFERENCIA", cuentaId: "c1" }), null);
  assert.equal(errorDelPago({ ...base, medio: "EFECTIVO" }), null, "en efectivo sale de la caja");
  assert.equal(errorDelPago({ ...base, medio: "TRANSFERENCIA", hayCuentas: false }), null, "sin cuentas cargadas no hay cuál elegir");
});

test("P6 · la fecha del pago: se entiende y no es posterior a hoy; vacía = hoy", () => {
  const base = { medio: "TRANSFERENCIA", cuentaId: "c1", hayCuentas: true, hoy: "2026-11-19" };
  assert.equal(errorDelPago({ ...base, fecha: "2026-11-20" }), "La fecha del pago no puede ser posterior a hoy.");
  assert.equal(errorDelPago({ ...base, fecha: "19/11/2026" }), "La fecha del pago no se entiende: elegila en el calendario.");
  assert.equal(errorDelPago({ ...base, fecha: "2026-11-19" }), null);
  assert.equal(errorDelPago({ ...base, fecha: null }), null);
});

test("P6 · el texto dice «caja» sólo si el pago es en efectivo", () => {
  const ef = textosDelPago("EFECTIVO", null);
  assert.equal(ef.sale, "Sale de la caja, en efectivo.");
  assert.equal(ef.anular, "Anular la orden (vuelve la plata a la caja)");
  const tr = textosDelPago("TRANSFERENCIA", "Cuenta de prueba");
  assert.equal(tr.sale, "Sale de la cuenta «Cuenta de prueba», con Transferencia.");
  assert.equal(tr.anular, "Anular la orden (vuelve la plata a «Cuenta de prueba»)");
  const sinCuenta = textosDelPago("CHEQUE", null);
  assert.equal(sinCuenta.sale, "Sale de la cuenta que elijas, con Cheque.");
  assert.equal(sinCuenta.anular, "Anular la orden (se revierte el pago)");
  for (const t of [tr, sinCuenta]) assert.doesNotMatch(`${t.sale} ${t.anular}`, /caja/);
});
