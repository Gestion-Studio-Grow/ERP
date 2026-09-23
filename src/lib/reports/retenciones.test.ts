// Los pagos a cuenta del mes EJECUTADOS con leyendas de extractos argentinos: qué es SIRCREB,
// qué es percepción de IVA, qué es impuesto al cheque, y qué NO es pago a cuenta (la comisión
// del banco y el IVA de esa comisión).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirPagosACuenta, tipoDePagoACuenta, whereExtractoDelMes } from "./retenciones";

test("la leyenda del extracto dice qué pago a cuenta es", () => {
  assert.equal(tipoDePagoACuenta("RET. SIRCREB 0,9%"), "iibb");
  assert.equal(tipoDePagoACuenta("Retención Ingresos Brutos Bs.As."), "iibb");
  assert.equal(tipoDePagoACuenta("PERC IIBB CABA"), "iibb");
  assert.equal(tipoDePagoACuenta("Percepción IVA RG 2408"), "iva");
  assert.equal(tipoDePagoACuenta("PERCEP. IVA"), "iva");
  assert.equal(tipoDePagoACuenta("IMP. DEB. LEY 25413"), "cheque");
  assert.equal(tipoDePagoACuenta("Impuesto a los débitos y créditos"), "cheque");
  assert.equal(tipoDePagoACuenta("IMP.CRED. LEY 25.413"), "cheque");
  assert.equal(tipoDePagoACuenta("Retención Ganancias RG 830"), "ganancias");
  // No son pago a cuenta: el gasto del banco y el IVA de ese gasto.
  assert.equal(tipoDePagoACuenta("COMISION MANTENIMIENTO CUENTA"), null);
  assert.equal(tipoDePagoACuenta("IVA 21% S/COMISION"), null);
  assert.equal(tipoDePagoACuenta("Transferencia recibida - Juan Pérez"), null);
  assert.equal(tipoDePagoACuenta("Ingresos brutos: pago de anticipo"), null, "un pago de la DDJJ no es una retención sufrida");
});

test("el mes: por tipo, del más viejo al más nuevo; una devolución resta; el impuesto al cheque, aparte", () => {
  const r = resumirPagosACuenta([
    { id: "3", fecha: "20260915", descripcion: "IMP. DEB. LEY 25413", monto: -1200 },
    { id: "1", fecha: "20260902", descripcion: "RET. SIRCREB", monto: -9000 },
    { id: "2", fecha: "20260905", descripcion: "PERCEPCION IVA RG 2408", monto: -3000 },
    { id: "4", fecha: "20260920", descripcion: "DEVOLUCION RET. SIRCREB", monto: 1000 },
    { id: "5", fecha: "20260921", descripcion: "COMISION TRANSFERENCIA", monto: -500 },
    { id: "6", fecha: "20260922", descripcion: "Acreditación venta", monto: 50000 },
  ]);
  assert.deepEqual(r.porTipo, { iibb: 8000, iva: 3000, cheque: 1200, ganancias: 0 });
  // El impuesto al cheque va aparte: qué parte se computa depende de la condición del negocio
  // (a un monotributista no se le puede prometer como pago a cuenta).
  assert.equal(r.total, 11000, "retenciones y percepciones, sin el impuesto al cheque");
  assert.equal(r.impuestoAlCheque, 1200);
  assert.equal(r.leidos, 6);
  assert.deepEqual(r.movimientos.map((m) => [m.id, m.importe]), [
    ["1", 9000],
    ["2", 3000],
    ["3", 1200],
    ["4", -1000],
  ]);
});

test("el mes del extracto va por la fecha fiscal (AAAAMMDD), del 1 al último día", () => {
  assert.deepEqual(whereExtractoDelMes("t", "2026-09"), { tenantId: "t", fecha: { gte: "20260901", lt: "20261001" } });
});
