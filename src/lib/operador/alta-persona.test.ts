// El alta de una persona desde la consola (alta-persona.ts), con un puerto en memoria: sin base.
import test from "node:test";
import assert from "node:assert/strict";
import { altaPersonaCore, validarAltaPersona, type AltaPersonaPort } from "./alta-persona";
import { CambioObligatorioInactivo } from "../must-change-password";
import { ClaveNoEnviada } from "../clave-temporal-mail";

function puerto(over: Partial<AltaPersonaPort> = {}) {
  const log = {
    creados: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
    mustChange: [] as string[],
    mails: [] as Array<{ email: string; nombre: string; clave: string }>,
  };
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
    enviarClave: async (destino, clave) => {
      log.mails.push({ ...destino, clave });
      return { enviado: true };
    },
    ...over,
  };
  return { p, log };
}
const entrada = { name: "  Caro Hapo ", email: " CAROHAPO@Mail.com ", role: "OWNER" };

test("da de alta: normaliza, guarda sólo el hash, fuerza el cambio, audita sin la clave y la manda por mail", async () => {
  const { p, log } = puerto();
  const r = await altaPersonaCore(p, { tenantId: "t1", operatorSubject: "dueño", entrada });
  assert.deepEqual(r, { ok: true, email: "carohapo@mail.com", enviadaA: "c***@mail.com", name: "Caro Hapo", role: "OWNER" });
  assert.equal(log.mails.length, 1);
  const clave = log.mails[0].clave;
  assert.ok(clave.length >= 12);
  assert.equal(log.mails[0].email, "carohapo@mail.com");
  assert.equal(log.mails[0].nombre, "Caro Hapo");
  assert.ok(!JSON.stringify(r).includes(clave), "la clave no vuelve a la pantalla");
  assert.equal(log.creados.length, 1);
  const c = log.creados[0] as { passwordHash: string; email: string };
  assert.notEqual(c.passwordHash, clave, "el hash no puede ser la clave en claro");
  assert.equal(c.email, "carohapo@mail.com");
  assert.deepEqual(log.mustChange, ["u1"]);
  assert.equal(log.audits.length, 1);
  assert.ok(!JSON.stringify(log.audits[0]).includes(clave), "la auditoría no puede llevar la clave");
  assert.equal((log.audits[0] as { actor: string }).actor, "operator:dueño");
});

test("MAIL CAÍDO: tira ClaveNoEnviada para que la transacción deshaga el alta (no nace nadie con una clave que nadie tiene)", async () => {
  const { p } = puerto({ enviarClave: async () => ({ enviado: false, motivo: "mail no configurado" }) });
  await assert.rejects(
    altaPersonaCore(p, { tenantId: "t1", operatorSubject: "x", entrada }),
    (e: unknown) => e instanceof ClaveNoEnviada && e.destino === "c***@mail.com" && /mail no configurado/.test(e.message),
  );
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

test("FALLA CERRADO: sin la columna del cambio forzado tira CambioObligatorioInactivo (la transacción deshace el alta)", async () => {
  const { p, log } = puerto({ setMustChange: async () => ({ persisted: false }) });
  await assert.rejects(
    altaPersonaCore(p, { tenantId: "t1", operatorSubject: "x", entrada }),
    (e: unknown) => e instanceof CambioObligatorioInactivo,
  );
  // No se audita un alta que se va a deshacer, ni sale ningún mail.
  assert.equal(log.audits.length, 0);
  assert.equal(log.mails.length, 0);
});
