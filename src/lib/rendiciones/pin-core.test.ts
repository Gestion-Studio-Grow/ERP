import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOQUEO_PIN_MS,
  datosDelPedido,
  datosTrasExito,
  datosTrasFallo,
  estadoDelPin,
  generarPin,
  hashDelPin,
  MAX_INTENTOS_PIN,
  pinCoincide,
  puedePedir,
  VENTANA_FALLOS_MS,
  VIGENCIA_PIN_MS,
  type FilaPin,
} from "./pin-core";

const CLAVE = Buffer.alloc(32, 7);
const A = { tenantId: "negocio-a", userId: "u1" };
const T0 = 1_800_000_000_000;

const fila = (extra: Partial<FilaPin> = {}): FilaPin => ({ venceEl: new Date(T0 + VIGENCIA_PIN_MS), usadoEl: null, intentos: 0, intentosVentana: 0, ventanaDesde: null, bloqueadoHasta: null, ...extra });

test("genera 6 dígitos, con ceros a la izquierda", () => {
  assert.equal(generarPin(() => 42), "000042");
  for (let i = 0; i < 50; i++) assert.match(generarPin(), /^\d{6}$/);
});

test("el hash no es el código y está atado al negocio y a la persona", () => {
  const h = hashDelPin("123456", A, CLAVE);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes("123456"));
  assert.ok(pinCoincide("123 456", h, A, CLAVE), "acepta espacios");
  assert.ok(!pinCoincide("123457", h, A, CLAVE));
  assert.ok(!pinCoincide("123456", h, { ...A, tenantId: "negocio-b" }, CLAVE), "el código de A no abre en B");
  assert.ok(!pinCoincide("123456", h, { ...A, userId: "u2" }, CLAVE), "ni para otra persona");
  assert.ok(!pinCoincide("123456", h, A, Buffer.alloc(32, 8)), "ni con otra clave");
  assert.ok(!pinCoincide("123456", null, A, CLAVE), "sin hash guardado no entra");
  assert.ok(!pinCoincide("abc", "zz", A, CLAVE), "basura no rompe");
});

test("vence a los 5 minutos; usado y bloqueado tienen prioridad", () => {
  assert.equal(estadoDelPin(fila(), T0), "vivo");
  assert.equal(estadoDelPin(fila(), T0 + VIGENCIA_PIN_MS), "vencido");
  assert.equal(estadoDelPin(fila({ usadoEl: new Date(T0) }), T0), "usado");
  assert.equal(estadoDelPin(fila({ bloqueadoHasta: new Date(T0 + 1) }), T0), "bloqueado");
  assert.equal(estadoDelPin(fila({ bloqueadoHasta: new Date(T0) }), T0), "vivo", "el bloqueo vencido ya no frena");
});

test("al quinto fallo de la ventana bloquea 15 minutos", () => {
  let f = fila();
  for (let i = 1; i < MAX_INTENTOS_PIN; i++) {
    f = { ...f, ...datosTrasFallo(f, T0 + i * 1000) };
    assert.equal(f.intentosVentana, i);
    assert.equal(estadoDelPin(f, T0 + i * 1000), "vivo");
  }
  f = { ...f, ...datosTrasFallo(f, T0 + 10_000) };
  assert.equal(f.bloqueadoHasta?.getTime(), T0 + 10_000 + BLOQUEO_PIN_MS);
  assert.equal(estadoDelPin(f, T0 + 11_000), "bloqueado");
});

test("pedir otro código no reinicia la ventana ni el bloqueo", () => {
  let f = fila();
  for (let i = 0; i < 4; i++) f = { ...f, ...datosTrasFallo(f, T0) };
  const pedido = datosDelPedido("otro-hash", T0 + 120_000);
  assert.deepEqual(Object.keys(pedido).sort(), ["hash", "intentos", "usadoEl", "venceEl"]);
  f = { ...f, ...pedido };
  f = { ...f, ...datosTrasFallo(f, T0 + 130_000) };
  assert.equal(estadoDelPin(f, T0 + 131_000), "bloqueado", "el quinto fallo cuenta aunque sea contra un código nuevo");
  assert.ok(!puedePedir(f, T0 + 200_000), "bloqueado no recibe códigos");
});

test("los fallos viejos salen de la ventana", () => {
  let f = fila();
  for (let i = 0; i < 4; i++) f = { ...f, ...datosTrasFallo(f, T0) };
  f = { ...f, ...datosTrasFallo(f, T0 + VENTANA_FALLOS_MS) };
  assert.equal(f.intentosVentana, 1);
  assert.equal(f.bloqueadoHasta, null);
});

test("un pedido por minuto; tras entrar se limpia todo", () => {
  assert.ok(puedePedir(null, T0));
  const f = fila({ venceEl: new Date(T0 + VIGENCIA_PIN_MS) });
  assert.ok(!puedePedir(f, T0 + 59_000));
  assert.ok(puedePedir(f, T0 + 60_000));
  assert.deepEqual(datosTrasExito(T0), { usadoEl: new Date(T0), intentos: 0, intentosVentana: 0, ventanaDesde: null, bloqueadoHasta: null });
});
