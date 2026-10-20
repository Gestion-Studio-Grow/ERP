// El alta de una persona desde la consola (alta-persona.ts), con un puerto en memoria: sin base.
import test from "node:test";
import assert from "node:assert/strict";
import { altaPersonaCore, validarAltaPersona, type AltaPersonaPort } from "./alta-persona";

function puerto(over: Partial<AltaPersonaPort> = {}) {
  const log = { creados: [] as Array<Record<string, unknown>>, audits: [] as Array<Record<string, unknown>>, mustChange: [] as string[] };
  const p: AltaPersonaPort = {
    existeEmail: async () => false,
    decidirTope: async () => ({ ok: true }),
    crear: async (d) => {
      log.creados.push(d);
      return { id: "u1" };
    },
    setMustChange: async (id) => {
      log.mustChange.push(id);
      return { persisted: true };
    },
    audit: async (e) => {
      log.audits.push(e);
    },
    ...over,
  };
  return { p, log };
}
const entrada = { name: "  Caro Hapo ", email: " CAROHAPO@Mail.com ", role: "OWNER" };

test("da de alta: normaliza, guarda sólo el hash, fuerza el cambio y audita sin la clave", async () => {
  const { p, log } = puerto();
  const r = await altaPersonaCore(p, { tenantId: "t1", operatorSubject: "dueño", entrada });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.email, "carohapo@mail.com");
  assert.equal(r.name, "Caro Hapo");
  assert.ok(r.password.length >= 12);
  assert.equal(log.creados.length, 1);
  const c = log.creados[0] as { passwordHash: string; email: string };
  assert.notEqual(c.passwordHash, r.password, "el hash no puede ser la clave en claro");
  assert.equal(c.email, "carohapo@mail.com");
  assert.deepEqual(log.mustChange, ["u1"]);
  assert.equal(log.audits.length, 1);
  assert.ok(!JSON.stringify(log.audits[0]).includes(r.password), "la auditoría no puede llevar la clave");
  assert.equal((log.audits[0] as { actor: string }).actor, "operator:dueño");
});

test("rechaza nombre vacío, email sin formato y rol desconocido, sin tocar nada", async () => {
  for (const mala of [
    { ...entrada, name: "   " },
    { ...entrada, email: "sin-arroba" },
    { ...entrada, email: "a@b" },
    { ...entrada, role: "ADMIN" },
  ]) {
    const { p, log } = puerto();
    const r = await altaPersonaCore(p, { tenantId: "t1", operatorSubject: "x", entrada: mala });
    assert.equal(r.ok, false);
    assert.equal(log.creados.length, 0);
  }
  assert.equal(validarAltaPersona(entrada).ok, true);
});

test("un email repetido en el negocio no se crea", async () => {
  const { p, log } = puerto({ existeEmail: async () => true });
  const r = await altaPersonaCore(p, { tenantId: "t1", operatorSubject: "x", entrada });
  assert.equal(r.ok, false);
  assert.equal(log.creados.length, 0);
});

test("si el plan no admite una persona más, no se crea y dice por qué", async () => {
  const { p, log } = puerto({ decidirTope: async () => ({ ok: false, motivo: "tope de 3 usuarios" }) });
  const r = await altaPersonaCore(p, { tenantId: "t1", operatorSubject: "x", entrada });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /tope de 3 usuarios/);
  assert.equal(log.creados.length, 0);
});

test("si la columna del cambio forzado no existe, lo avisa pero el alta queda hecha", async () => {
  const { p } = puerto({ setMustChange: async () => ({ persisted: false }) });
  const r = await altaPersonaCore(p, { tenantId: "t1", operatorSubject: "x", entrada });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.flagPending, true);
});
