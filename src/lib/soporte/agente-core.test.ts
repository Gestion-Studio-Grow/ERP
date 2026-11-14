import { test } from "node:test";
import assert from "node:assert/strict";
import { agentePuedeEnTicket, urlDeAgente, validarBorradorDeAgente, LARGO_MAXIMO_BORRADOR } from "./agente-core";

test("urlDeAgente: sin caída a otra conexión; igual a la app o a la consola → apagado", () => {
  assert.equal(urlDeAgente({}), null);
  assert.equal(urlDeAgente({ AGENTE_DATABASE_URL: "   " }), null);
  assert.equal(urlDeAgente({ DATABASE_URL: "postgres://app", OPERATOR_DATABASE_URL: "postgres://op" }), null, "no cae a DATABASE_URL ni a OPERATOR");
  assert.equal(urlDeAgente({ AGENTE_DATABASE_URL: "postgres://app", DATABASE_URL: "postgres://app" }), null);
  assert.equal(urlDeAgente({ AGENTE_DATABASE_URL: "postgres://op ", OPERATOR_DATABASE_URL: "postgres://op" }), null);
  assert.equal(urlDeAgente({ AGENTE_DATABASE_URL: " postgres://agente ", DATABASE_URL: "postgres://app" }), "postgres://agente");
});

test("agentePuedeEnTicket: estudio y cliente de cartera, CH nunca", () => {
  const ok = (n1: boolean, slug = "estudio") => ({ slug, n1 });
  assert.equal(agentePuedeEnTicket({ estudio: ok(true) }).puede, true);
  assert.equal(agentePuedeEnTicket({ estudio: ok(false) }).puede, false, "sin permiso del negocio");
  assert.equal(agentePuedeEnTicket({ estudio: ok(true), cliente: ok(true, "cliente") }).puede, true);
  assert.equal(agentePuedeEnTicket({ estudio: ok(true), cliente: ok(false, "cliente") }).puede, false, "sin permiso del cliente");
  assert.equal(agentePuedeEnTicket({ estudio: ok(false), cliente: ok(true, "cliente") }).puede, false, "sin permiso del estudio");
  assert.equal(agentePuedeEnTicket({ estudio: ok(true), cliente: ok(true, "beauty-spa") }).puede, false, "cliente CH");
  assert.equal(agentePuedeEnTicket({ estudio: ok(true), cliente: ok(true, "Beauty_Spa") }).puede, false, "cliente CH escrito distinto");
  assert.equal(agentePuedeEnTicket({ estudio: ok(true, "beauty-spa") }).puede, false, "estudio CH");
  assert.equal(agentePuedeEnTicket({ estudio: ok(true, "") }).puede, false, "estudio sin slug");
  assert.equal(agentePuedeEnTicket({ estudio: ok(true), cliente: { slug: null, n1: true } }).puede, false, "cliente sin slug");
  assert.equal(agentePuedeEnTicket({ estudio: ok(true), cliente: null }).puede, true, "null = no es de cartera");
});

test("validarBorradorDeAgente: listas cerradas, vacío y largo", () => {
  const base = { tipo: "consulta", prioridad: "P3", respuesta: " Hola ", motivo: "m" };
  assert.deepEqual(validarBorradorDeAgente(base), { ok: true, valor: { tipo: "consulta", prioridad: "P3", respuesta: "Hola", motivo: "m" } });
  assert.equal(validarBorradorDeAgente(null).ok, false);
  assert.equal(validarBorradorDeAgente({ ...base, tipo: "plata" }).ok, false);
  assert.equal(validarBorradorDeAgente({ ...base, prioridad: "P0" }).ok, false);
  assert.equal(validarBorradorDeAgente({ ...base, respuesta: "   " }).ok, false);
  assert.equal(validarBorradorDeAgente({ ...base, respuesta: "x".repeat(LARGO_MAXIMO_BORRADOR + 1) }).ok, false);
  const sinMotivo = validarBorradorDeAgente({ ...base, motivo: 3 });
  assert.ok(sinMotivo.ok && sinMotivo.valor.motivo === "");
});
