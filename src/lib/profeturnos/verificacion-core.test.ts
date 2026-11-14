import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCION_ALTA,
  ACCION_REVOCADA,
  ACCION_VERIFICADO,
  decidirVerificar,
  estadoDeVerificacion,
  filaDeVerificado,
  filtroDeVerificacion,
  panelMuestraAviso,
  turneroTomaPedidos,
  type FilaDeVerificacion,
} from "./verificacion-core";

let n = 0;
const fila = (action: string, minuto: number, extra: Partial<FilaDeVerificacion> = {}): FilaDeVerificacion => ({
  id: `f${String(++n).padStart(4, "0")}`,
  action,
  actor: action === ACCION_ALTA ? "web:alta-profeturnos" : "operator:ana",
  channel: action === ACCION_ALTA ? null : "operador",
  createdAt: new Date(Date.UTC(2026, 10, 10, 12, minuto)),
  ...extra,
});

test("sin fila de alta web: no-aplica (el profe de referencia y los negocios viejos nunca se bloquean)", () => {
  assert.equal(estadoDeVerificacion([]), "no-aplica");
  // Ni con una verificación suelta: sin alta no hay nada que verificar.
  assert.equal(estadoDeVerificacion([fila(ACCION_VERIFICADO, 1)]), "no-aplica");
  assert.equal(turneroTomaPedidos("no-aplica"), true);
  assert.equal(panelMuestraAviso("no-aplica"), false);
});

test("con alta y sin verificar: pendiente → el turnero no toma pedidos y el panel avisa", () => {
  assert.equal(estadoDeVerificacion([fila(ACCION_ALTA, 0)]), "pendiente");
  assert.equal(turneroTomaPedidos("pendiente"), false);
  assert.equal(panelMuestraAviso("pendiente"), true);
});

test("la última decisión manda (verificado, revocado, vuelto a verificar), en cualquier orden", () => {
  const alta = fila(ACCION_ALTA, 0);
  const v1 = fila(ACCION_VERIFICADO, 5);
  const r1 = fila(ACCION_REVOCADA, 10);
  const v2 = fila(ACCION_VERIFICADO, 15);
  assert.equal(estadoDeVerificacion([alta, v1]), "verificado");
  assert.equal(estadoDeVerificacion([r1, alta, v1]), "pendiente");
  assert.equal(estadoDeVerificacion([v1, r1, v2, alta]), "verificado");
  assert.equal(turneroTomaPedidos("verificado"), true);
  assert.equal(panelMuestraAviso("verificado"), false);
  // Mismo instante: desempata el id (el más nuevo gana).
  const a = fila(ACCION_VERIFICADO, 20, { id: "z1" });
  const b = fila(ACCION_REVOCADA, 20, { id: "z2" });
  assert.equal(estadoDeVerificacion([alta, a, b]), "pendiente");
});

test("una verificación que no firmó la consola no abre nada", () => {
  const alta = fila(ACCION_ALTA, 0);
  assert.equal(estadoDeVerificacion([alta, fila(ACCION_VERIFICADO, 1, { actor: "admin" })]), "pendiente");
  assert.equal(estadoDeVerificacion([alta, fila(ACCION_VERIFICADO, 1, { actor: "operator:" })]), "pendiente");
  assert.equal(estadoDeVerificacion([alta, fila(ACCION_VERIFICADO, 1, { channel: "admin" })]), "pendiente");
  assert.equal(estadoDeVerificacion([alta, fila(ACCION_VERIFICADO, 1, { channel: null })]), "pendiente");
  // Ni una revocación ajena cierra lo que la consola verificó.
  assert.equal(estadoDeVerificacion([alta, fila(ACCION_VERIFICADO, 1), fila(ACCION_REVOCADA, 2, { actor: "cliente:11" })]), "verificado");
});

test("lectura fallida: el turnero queda en verificación (fail-closed) y el panel sin aviso", () => {
  assert.equal(turneroTomaPedidos(null), false);
  assert.equal(panelMuestraAviso(null), false);
});

test("la consola verifica sólo a un pendiente; uno ya verificado no escribe de nuevo", () => {
  assert.deepEqual(decidirVerificar("pendiente"), { ok: true });
  const sinAlta = decidirVerificar("no-aplica");
  assert.equal(sinAlta.ok, false);
  const ya = decidirVerificar("verificado");
  assert.ok(!ya.ok && ya.yaEstaba);
});

test("la fila escrita dice quién y cuándo, sobre el propio negocio, y la lectura la reconoce", () => {
  const ahora = new Date("2026-11-10T15:00:00.000Z");
  const f = filaDeVerificado("t1", "ana", ahora);
  assert.deepEqual(f, {
    tenantId: "t1",
    actor: "operator:ana",
    action: ACCION_VERIFICADO,
    entity: "Tenant",
    entityId: "t1",
    channel: "operador",
    changes: { via: "whatsapp", verificadoPor: "ana", verificadoEl: ahora.toISOString() },
  });
  assert.equal(estadoDeVerificacion([fila(ACCION_ALTA, 0), { id: "x", action: f.action, actor: f.actor, channel: f.channel, createdAt: ahora }]), "verificado");
  const w = filtroDeVerificacion("t1");
  assert.equal(w.tenantId, "t1");
  assert.equal(w.entityId, "t1");
});
