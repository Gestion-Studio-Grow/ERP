import { test } from "node:test";
import assert from "node:assert/strict";
import { despachoActual, tipoDeEvento, type Despacho, type EventoCrudo } from "./despacho-core";
import {
  despacharAlEntrar,
  mensajeDelDespacho,
  vistaDelDespacho,
  TEXTO_APAGADA,
  TEXTO_CH,
  TEXTO_ESPERANDO,
  TEXTO_LISTO,
  TEXTO_NO_RESPONDIO,
  TEXTO_SIN_PREPARAR,
} from "./vista-despacho-core";

const T0 = new Date("2026-11-14T12:00:00.000Z");
const ev = (estado: Parameters<typeof tipoDeEvento>[1], datos: Record<string, unknown>, min = 0): EventoCrudo => ({
  tipo: tipoDeEvento("n1", estado),
  actor: "sistema:despacho",
  datos: { despachoId: "d1", ...datos },
  createdAt: new Date(T0.getTime() + min * 60_000),
});
const SESION = "https://claude.ai/code/session_abc";
const d = (eventos: EventoCrudo[]): Despacho | null => despachoActual(eventos, "n1");
const base = { modo: "manual" as const, rutinaCargada: true, slug: "magra", estadoTicket: "nuevo" };

test("vista: sin despacho y motor encendido → «Sin preparar» con botón", () => {
  const v = vistaDelDespacho({ ...base, despacho: null });
  assert.deepEqual(v, { boton: true, etiqueta: "Preparar con IA", estado: TEXTO_SIN_PREPARAR, tono: "info", sesionUrl: null });
  assert.equal(vistaDelDespacho({ ...base, modo: "automatico", despacho: null }).boton, true);
});

test("vista: motor apagado o sin la tarea n1 cargada → «La IA está apagada», sin botón", () => {
  for (const v of [vistaDelDespacho({ ...base, modo: "apagado", despacho: null }), vistaDelDespacho({ ...base, rutinaCargada: false, despacho: null })]) {
    assert.equal(v.boton, false);
    assert.equal(v.estado, TEXTO_APAGADA);
  }
});

test("vista: CH o negocio sin slug → lo atiende una persona, sin botón", () => {
  for (const slug of ["beauty_spa", null]) {
    const v = vistaDelDespacho({ ...base, slug, despacho: null });
    assert.equal(v.boton, false);
    assert.equal(v.estado, TEXTO_CH);
  }
});

test("vista: ticket resuelto o cerrado → sin botón, pero se ve el estado", () => {
  for (const estadoTicket of ["resuelto", "cerrado"]) {
    const v = vistaDelDespacho({ ...base, estadoTicket, despacho: null });
    assert.equal(v.boton, false);
    assert.equal(v.estado, TEXTO_SIN_PREPARAR);
  }
  assert.equal(vistaDelDespacho({ ...base, estadoTicket: "esperando_cliente", despacho: null }).boton, true);
});

test("vista: pendiente y disparado → «Esperando a la IA»; con sesión, el enlace", () => {
  const pend = vistaDelDespacho({ ...base, despacho: d([ev("pendiente", { intento: 0 })]) });
  assert.equal(pend.estado, TEXTO_ESPERANDO);
  assert.equal(pend.sesionUrl, null);
  const disp = vistaDelDespacho({ ...base, despacho: d([ev("pendiente", {}), ev("disparado", { intento: 1, nonceHash: "h" }, 1), ev("disparado", { sesionUrl: SESION }, 1)]) });
  assert.equal(disp.estado, TEXTO_ESPERANDO);
  assert.equal(disp.tono, "pendiente");
  assert.equal(disp.sesionUrl, SESION);
  assert.equal(disp.boton, true, "el segundo clic lo frena el despacho, no la vista");
  assert.equal(disp.etiqueta, "Preparar con IA");
});

test("vista: borrador del agente n1 → «Borrador listo»; vencido o fallido → «respondé a mano»", () => {
  const disparado = [ev("pendiente", {}), ev("disparado", { intento: 1, sesionUrl: SESION }, 1)];
  const borrador: EventoCrudo = { tipo: "borrador_ia", actor: "agente:n1", datos: {}, createdAt: new Date(T0.getTime() + 5 * 60_000) };
  const listo = vistaDelDespacho({ ...base, despacho: d([...disparado, borrador]) });
  assert.equal(listo.estado, TEXTO_LISTO);
  assert.equal(listo.tono, "hecho");
  assert.equal(listo.sesionUrl, SESION);
  assert.equal(listo.etiqueta, "Volver a preparar con IA");
  assert.equal(vistaDelDespacho({ ...base, despacho: d([...disparado, ev("vencido", {}, 31)]) }).estado, TEXTO_NO_RESPONDIO);
  assert.equal(vistaDelDespacho({ ...base, despacho: d([ev("pendiente", {}), ev("fallido", {}, 1)]) }).estado, TEXTO_NO_RESPONDIO);
  // Con el motor apagado se dice que está apagada aunque haya un despacho viejo (el enlace sigue).
  const apagado = vistaDelDespacho({ ...base, modo: "apagado", despacho: d([...disparado, borrador]) });
  assert.equal(apagado.estado, TEXTO_APAGADA);
  assert.equal(apagado.sesionUrl, SESION);
});

const D = (estado: Despacho["estado"]) => ({ estado });

test("mensaje: rechazo del despacho → error con el motivo", () => {
  assert.deepEqual(mensajeDelDespacho({ ok: false, motivo: "El ticket ya está resuelto o cerrado." }), {
    ok: false,
    error: "No se pidió a la IA: El ticket ya está resuelto o cerrado.",
  });
});

test("mensaje: primer clic disparado → listo; disparo apagado → respondé a mano", () => {
  const r = mensajeDelDespacho({ ok: true, creado: true, despacho: D("pendiente"), disparo: { ok: true, disparado: true, sesionUrl: SESION } });
  assert.ok(r.ok && r.mensaje.startsWith("Listo: la IA está preparando"));
  const apagado = mensajeDelDespacho({ ok: true, creado: true, despacho: D("pendiente"), disparo: { ok: false, apagado: true, motivo: "x" } });
  assert.deepEqual(apagado, { ok: false, error: `${TEXTO_APAGADA}.` });
});

test("mensaje: segundo clic con el pedido en curso → lo dice, no abre otro", () => {
  const r = mensajeDelDespacho({ ok: true, creado: false, despacho: D("disparado"), disparo: { ok: true, disparado: false, motivo: "No le toca disparar.", estado: "disparado" } });
  assert.ok(r.ok && /No se abrió otro pedido/.test(r.mensaje));
  const reenvio = mensajeDelDespacho({ ok: true, creado: false, despacho: D("pendiente"), disparo: { ok: true, disparado: true, sesionUrl: null } });
  assert.ok(reenvio.ok && /No se abrió otro/.test(reenvio.mensaje));
});

test("mensaje: la falla del /fire queda en cola; fallido o vencido → respondé a mano; listo → revisalo", () => {
  const cola = mensajeDelDespacho({ ok: true, creado: true, despacho: D("pendiente"), disparo: { ok: true, disparado: false, motivo: "El /fire respondió 503." } });
  assert.ok(cola.ok && /queda en cola/.test(cola.mensaje));
  const fallido = mensajeDelDespacho({ ok: true, creado: true, despacho: D("pendiente"), disparo: { ok: true, disparado: false, motivo: "x", estado: "fallido" } });
  assert.deepEqual(fallido, { ok: false, error: `${TEXTO_NO_RESPONDIO}.` });
  const listo = mensajeDelDespacho({ ok: true, creado: false, despacho: D("listo"), disparo: { ok: true, disparado: false, motivo: "x", estado: "listo" } });
  assert.ok(listo.ok && /ya dejó el borrador/.test(listo.mensaje));
});

test("entrada: sólo con motor automático y ticket nuevo se intenta despachar n1", () => {
  assert.equal(despacharAlEntrar("automatico", { nuevo: true }), true);
  assert.equal(despacharAlEntrar("automatico", { nuevo: false }), false, "el mismo mensaje dos veces no redespacha");
  assert.equal(despacharAlEntrar("manual", { nuevo: true }), false);
  assert.equal(despacharAlEntrar("apagado", { nuevo: true }), false);
  assert.equal(despacharAlEntrar("automatico", { sinTabla: true }), false);
  assert.equal(despacharAlEntrar("automatico", { rechazado: true }), false);
});
