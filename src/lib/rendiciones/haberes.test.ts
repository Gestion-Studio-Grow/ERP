// Tests del archivo para Haberes: una línea por persona con actividad en el período, lo rendido,
// los reintegros sin comprobante, el saldo no rendido con su antigüedad y los viajes. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resumenParaHaberes } from "./haberes";
import { PERSONA, anticipo, comprobante, rendicion } from "./rendiciones.fixture";
import type { MedioPago, Persona, Viaje } from "./tipos";

const EF: MedioPago = { tipo: "efectivo_anticipo", anticipoId: "A-1" };
const PR: MedioPago = { tipo: "propio_a_reintegrar" };

const P1: Persona = { ...PERSONA, legajo: "1001", nombre: "Uno" };
const P2: Persona = { ...PERSONA, legajo: "1002", nombre: "Dos" };
const P3: Persona = { ...PERSONA, legajo: "1003", nombre: "Tres" };

const viaje = (parcial: Partial<Viaje>): Viaje => ({
  id: "V-1",
  legajo: "1001",
  desde: "2026-09-08",
  hasta: "2026-09-11",
  origen: "BA",
  destino: "NQ",
  km: 1150,
  pernoctes: 3,
  cubiertoPorConvenio: true,
  ...parcial,
});

const C_FACTURA = comprobante({ id: "C-1", legajo: "1001", imputacion: { medioPago: EF }, datos: { total: 30000000 } });
const C_PROPINA = comprobante({
  id: "C-2",
  legajo: "1001",
  imputacion: { medioPago: EF, tipoGastoId: "propinas" },
  datos: { clase: "sin_comprobante", cuitEmisor: undefined, lineasIva: [], total: 300000 },
});
const C_PROPIO = comprobante({ id: "C-3", legajo: "1001", imputacion: { medioPago: PR }, datos: { total: 5000000 } });
const C_BORRADOR = comprobante({ id: "C-4", legajo: "1002", imputacion: { medioPago: EF }, datos: { total: 9900000 } });

const ARGS = {
  personas: [P1, P2, P3],
  anticipos: [
    anticipo({ id: "A-1", legajo: "1001", importe: 50000000, fechaEntrega: "2026-09-05" }),
    // Entregado en agosto pero vinculado a la rendición de septiembre: cuenta y marca la antigüedad.
    anticipo({ id: "A-0", legajo: "1001", importe: 10000000, fechaEntrega: "2026-08-20" }),
    anticipo({ id: "A-otro-mes", legajo: "1001", importe: 777, fechaEntrega: "2026-07-01" }),
  ],
  rendiciones: [
    rendicion({
      id: "R-1",
      legajo: "1001",
      estado: "en_aprobacion",
      anticipoIds: ["A-1", "A-0"],
      comprobanteIds: ["C-1", "C-2", "C-3"],
      devolucionDeclarada: 10000000,
    }),
    rendicion({ id: "R-2", legajo: "1002", estado: "borrador", comprobanteIds: ["C-4"] }),
  ],
  comprobantes: [C_FACTURA, C_PROPINA, C_PROPIO, C_BORRADOR],
  viajes: [viaje({}), viaje({ id: "V-2", legajo: "1002", desde: "2026-08-30", hasta: "2026-09-02", cubiertoPorConvenio: false })],
  periodo: "2026-09",
  hoy: "2026-09-24",
};

test("una línea por persona con actividad; con todos sus números", () => {
  const lineas = resumenParaHaberes(ARGS);
  assert.deepEqual(
    lineas.map((l) => l.legajo),
    ["1001", "1002"],
  );
  const [uno] = lineas;
  assert.equal(uno.nombre, "Uno");
  assert.equal(uno.periodo, "2026-09");
  assert.equal(uno.anticipado, 60000000);
  assert.equal(uno.rendidoConComprobante, 35000000); // factura + la de su bolsillo
  assert.equal(uno.reintegrosSinComprobante, 300000); // la propina: es remuneración
  // 600.000 − (300.000 + 3.000 con el anticipo) − 100.000 devueltos = 197.000
  assert.equal(uno.saldoNoRendido, 19700000);
  assert.equal(uno.antiguedadDias, 35); // desde el 20/08, el anticipo más viejo
  assert.deepEqual(uno.viajes, [
    { id: "V-1", desde: "2026-09-08", hasta: "2026-09-11", km: 1150, pernoctes: 3, cubiertoPorConvenio: true },
  ]);
});

test("un borrador no cuenta como rendido; un viaje que cruza el mes sí aparece", () => {
  const [, dos] = resumenParaHaberes(ARGS);
  assert.equal(dos.anticipado, 0);
  assert.equal(dos.rendidoConComprobante, 0);
  assert.equal(dos.saldoNoRendido, 0);
  assert.equal(dos.antiguedadDias, 0);
  assert.deepEqual(dos.viajes.map((v) => v.id), ["V-2"]);
});

test("sin saldo no hay antigüedad; una rendición rechazada no cuenta", () => {
  const saldada = resumenParaHaberes({
    ...ARGS,
    rendiciones: [{ ...ARGS.rendiciones[0], devolucionDeclarada: 29700000 }],
  });
  assert.equal(saldada[0].saldoNoRendido, 0);
  assert.equal(saldada[0].antiguedadDias, 0);

  const rechazada = resumenParaHaberes({
    ...ARGS,
    rendiciones: [{ ...ARGS.rendiciones[0], estado: "rechazada" }],
  });
  assert.equal(rechazada[0].rendidoConComprobante, 0);
  assert.equal(rechazada[0].saldoNoRendido, 60000000);
});

test("sin actividad en el período no hay línea", () => {
  assert.deepEqual(resumenParaHaberes({ ...ARGS, periodo: "2026-11" }), []);
});
