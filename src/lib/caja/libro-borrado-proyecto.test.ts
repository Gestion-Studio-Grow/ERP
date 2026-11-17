// ============================================================================
// MIA-060 · Qué filas de PROYECTO no se borran desde el libro de caja (tabla pura).
//
// El cobro de un proyecto asienta una VENTA con `proyectoPagoId` y, si se anula, un EGRESO con el mismo
// `proyectoPagoId`, los dos firmados con el NOMBRE del usuario (acciones.ts `registrarCobro`, acciones-ficha.ts
// `anularCobroFicha`): sin marca, la única pista es la columna. El pago de un gasto (y su reversa) lleva
// `proyectoGastoId` además de la marca `gasto-proyecto:`. Una fila por forma, más las que tienen que seguir como
// estaban: la cuota de Empresa, el Taller y el INGRESO/EGRESO tipeado a mano (borrable).
// La misma función decide la ✕ de la pantalla (`movimientoDelLedger`) y el borrado del servidor (`deleteLibroEntry`).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoParaNoBorrar, movimientoDelLedger, type FilaLedger } from "./libro-caja";
import { marcaDeGastoProyecto } from "@/lib/proyectos/marcas";

type Fila = Parameters<typeof motivoParaNoBorrar>[0];

const PROYECTO: { forma: string; fila: Fila; mensaje: RegExp }[] = [
  {
    forma: "VENTA del cobro de un proyecto (firmada con el usuario)",
    fila: { type: "VENTA", createdBy: "Ana Pérez", proyectoPagoId: "pp_1", reason: "Proyecto #12 · Stand" },
    mensaje: /cobro del proyecto #12/,
  },
  {
    forma: "EGRESO de la anulación de un cobro (fila vieja: firmada con el usuario, como la escribe acciones-ficha.ts)",
    fila: { type: "EGRESO", createdBy: "Ana Pérez", proyectoPagoId: "pp_1", reason: "Anulación · Proyecto #12" },
    mensaje: /anulación de un cobro del proyecto #12/,
  },
  {
    forma: "EGRESO de la anulación sin detalle (el mensaje igual dice que es de un proyecto)",
    fila: { type: "EGRESO", createdBy: "Ana Pérez", proyectoPagoId: "pp_1", reason: null },
    mensaje: /anulación de un cobro de un proyecto/,
  },
  {
    forma: "EGRESO del pago de un gasto de proyecto (con marca)",
    fila: { type: "EGRESO", createdBy: marcaDeGastoProyecto("pg_1"), proyectoGastoId: "pg_1", reason: "Proyecto #12 · Alfombra" },
    mensaje: /pago de un gasto del proyecto #12/,
  },
  {
    forma: "EGRESO del pago de un gasto con la columna y SIN marca",
    fila: { type: "EGRESO", createdBy: "Ana Pérez", proyectoGastoId: "pg_1", reason: "Proyecto #12 · Alfombra" },
    mensaje: /pago de un gasto del proyecto #12/,
  },
  {
    forma: "INGRESO de la reversa de un gasto anulado",
    fila: { type: "INGRESO", createdBy: marcaDeGastoProyecto("pg_1"), proyectoGastoId: "pg_1", reason: "Anulación de gasto · Proyecto #12" },
    mensaje: /anulación de un gasto del proyecto #12/,
  },
];

for (const { forma, fila, mensaje } of PROYECTO) {
  test(`no se borra desde el libro: ${forma}`, () => {
    const motivo = motivoParaNoBorrar(fila);
    assert.ok(motivo, "tiene que traer un motivo");
    assert.match(motivo, mensaje);
    assert.match(motivo, /[Nn]o se borra desde el libro/);
  });
}

test("siguen bloqueadas como antes: cuota de Empresa, cobro del Taller y su anulación", () => {
  const cuota = motivoParaNoBorrar({ type: "INGRESO", createdBy: marcaDeGastoProyecto("cuota-c1") });
  assert.match(String(cuota), /gasto de proyecto/);
  assert.match(String(motivoParaNoBorrar({ type: "VENTA", createdBy: "Ana", tallerPagoId: "tp_1" })), /cobro del Taller/);
  assert.match(String(motivoParaNoBorrar({ type: "EGRESO", createdBy: "Ana", tallerPagoId: "tp_1" })), /anulación de un cobro del Taller/);
});

test("un INGRESO o EGRESO tipeado a mano sigue borrable (aunque el detalle diga «Proyecto #12»)", () => {
  assert.equal(motivoParaNoBorrar({ type: "INGRESO", createdBy: "Ana Pérez", reason: "Seña en mano" }), null);
  assert.equal(motivoParaNoBorrar({ type: "EGRESO", createdBy: "Ana Pérez", reason: "Anulación · Proyecto #12" }), null);
  assert.equal(motivoParaNoBorrar({ type: "EGRESO", createdBy: "Ana Pérez", proyectoPagoId: null, proyectoGastoId: null }), null);
});

test("pantalla = servidor: la fila del loader con `proyectoPagoId` sale sin ✕; la manual, con ✕", () => {
  const base: FilaLedger = { id: "m1", occurredAt: new Date("2026-11-17T15:00:00Z"), type: "EGRESO", method: "EFECTIVO", amount: 1210, reason: "Anulación · Proyecto #12", orderId: null, createdBy: "Ana Pérez" };
  assert.equal(movimientoDelLedger({ ...base, proyectoPagoId: "pp_1" }).borrable, false, "la anulación del cobro no lleva ✕");
  assert.equal(movimientoDelLedger({ ...base, proyectoGastoId: "pg_1" }).borrable, false, "el pago de un gasto no lleva ✕");
  assert.equal(movimientoDelLedger({ ...base, proyectoPagoId: null, proyectoGastoId: null }).borrable, true, "la manual sí");
});
