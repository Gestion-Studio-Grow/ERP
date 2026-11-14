// Reglas puras de la rendición de la profesional que cobra aparte (RENDICION.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comisionEstimada,
  destinoDelCobro,
  detalleDeRendicion,
  esAsientoDeRendicion,
  marcaDeRendicion,
  validarRendicion,
} from "./rendicion-core";
import { motivoParaNoBorrar } from "@/lib/caja/libro-caja";

test("destino: sólo la profesional que cobra aparte, cobrando SU turno, deja el cobro a rendir", () => {
  const base = { cobraEnMostrador: false, cobradoPorLaProfesionalDelTurno: true, method: "EFECTIVO" };
  assert.equal(destinoDelCobro(base), "a-rendir");
  assert.equal(destinoDelCobro({ ...base, method: "MERCADOPAGO" }), "a-rendir");
  assert.equal(destinoDelCobro({ ...base, method: "TRANSFERENCIA" }), "a-rendir");
  // La dueña le cobra el turno a la de uñas: la plata entra al cajón.
  assert.equal(destinoDelCobro({ ...base, cobradoPorLaProfesionalDelTurno: false }), "caja");
  // Una profesional común (el mostrador le cobra) que cobra su turno: caja, como hoy.
  assert.equal(destinoDelCobro({ ...base, cobraEnMostrador: true }), "caja");
  // Columna sin migrar: como hoy.
  assert.equal(destinoDelCobro({ ...base, cobraEnMostrador: undefined }), "caja");
  assert.equal(destinoDelCobro({ ...base, cobraEnMostrador: null }), "caja");
  // El voucher lo liquida OpenKey al local: nunca es plata de la profesional.
  assert.equal(destinoDelCobro({ ...base, method: "VOUCHER" }), "caja");
});

const pendientes = [
  { id: "a", monto: 18000 },
  { id: "b", monto: 0.1 },
  { id: "c", monto: 0.2 },
];

test("validar: rinde todo lo cobrado, sin error de float", () => {
  const v = validarRendicion({ pendientes, idsPedidos: ["b", "c"], entregado: 0.3, puedeRetener: false });
  assert.deepEqual(v, { ok: true, ids: ["b", "c"], cobrado: 0.3, entregado: 0.3, retenido: 0 });
});

test("validar: nunca de más, nunca negativo, nunca un cobro ajeno o ya rendido", () => {
  assert.deepEqual(validarRendicion({ pendientes, idsPedidos: ["a"], entregado: 18000.01, puedeRetener: true }), { ok: false, motivo: "entregado-de-mas" });
  assert.deepEqual(validarRendicion({ pendientes, idsPedidos: ["a"], entregado: -1, puedeRetener: true }), { ok: false, motivo: "entregado-invalido" });
  assert.deepEqual(validarRendicion({ pendientes, idsPedidos: ["a"], entregado: NaN, puedeRetener: true }), { ok: false, motivo: "entregado-invalido" });
  assert.deepEqual(validarRendicion({ pendientes, idsPedidos: ["a", "z"], entregado: 1, puedeRetener: true }), { ok: false, motivo: "cobro-ajeno" });
  assert.deepEqual(validarRendicion({ pendientes, idsPedidos: [" ", ""], entregado: 1, puedeRetener: true }), { ok: false, motivo: "sin-cobros" });
});

test("validar: ids repetidos cuentan una vez (no se infla lo cobrado)", () => {
  const v = validarRendicion({ pendientes, idsPedidos: ["a", "a", "a"], entregado: 18000, puedeRetener: false });
  assert.equal(v.ok && v.cobrado, 18000);
});

test("validar: la retención (su comisión) sólo con permiso de liquidar comisiones", () => {
  assert.deepEqual(validarRendicion({ pendientes, idsPedidos: ["a"], entregado: 12600, puedeRetener: false }), { ok: false, motivo: "retencion-sin-permiso" });
  const v = validarRendicion({ pendientes, idsPedidos: ["a"], entregado: 12600, puedeRetener: true });
  assert.deepEqual(v, { ok: true, ids: ["a"], cobrado: 18000, entregado: 12600, retenido: 5400 });
  // Se queda con todo (lo acordado): entrega $0.
  const todo = validarRendicion({ pendientes, idsPedidos: ["a"], entregado: 0, puedeRetener: true });
  assert.equal(todo.ok && todo.retenido, 18000);
});

test("comisión estimada: % de la profesional con override por servicio", () => {
  const cobros = [
    { monto: 10000, serviceId: "s1" },
    { monto: 10000, serviceId: "s2" },
    { monto: 10000, serviceId: null },
  ];
  assert.equal(comisionEstimada(cobros, 30, new Map([["s2", 50]])), 3000 + 5000 + 3000);
  assert.equal(comisionEstimada(cobros, 30, new Map([["s1", 0]])), 0 + 3000 + 3000);
});

test("el asiento de la rendición no se borra a mano desde el libro", () => {
  const m = { type: "INGRESO" as const, createdBy: marcaDeRendicion("r1"), orderId: null };
  assert.equal(esAsientoDeRendicion(m), true);
  assert.match(motivoParaNoBorrar(m) ?? "", /rendición de una profesional/);
  assert.equal(motivoParaNoBorrar({ type: "INGRESO", createdBy: "user:u1", orderId: null }), null);
});

test("detalle del asiento", () => {
  assert.equal(detalleDeRendicion("Vero", 1, 0), "Rendición · Vero · 1 cobro");
  assert.match(detalleDeRendicion("Vero", 3, 5400), /^Rendición · Vero · 3 cobros \(retuvo \$5\.400\)$/);
});
