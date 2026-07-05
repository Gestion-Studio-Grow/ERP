// Test de integración logger ↔ contexto de request (observabilidad v2): que el
// logger mergee SOLO el contexto ambiente (requestId/tenantId) en cada línea, con
// el ctx explícito del caller ganando, y sin ensuciar cuando no hay request.
// Captura la consola real (el logger emite a stdout/stderr).

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { logger } from "./logger";
import { runInRequestContext, setRequestContext } from "./request-context";

let lines: string[] = [];
const origLog = console.log;
const origError = console.error;

function capture() {
  lines = [];
  console.log = (l: string) => void lines.push(l);
  console.error = (l: string) => void lines.push(l);
}
afterEach(() => {
  console.log = origLog;
  console.error = origError;
});

test("info dentro de un request lleva el requestId ambiente", () => {
  capture();
  runInRequestContext({ requestId: "req-9" }, () => {
    logger.info("reportes", "generado");
  });
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.requestId, "req-9");
  assert.equal(entry.scope, "reportes");
});

test("las etiquetas agregadas con setRequestContext aparecen en líneas posteriores", () => {
  capture();
  runInRequestContext({ requestId: "req-10" }, () => {
    setRequestContext({ tenantId: "t_caro" });
    logger.error("mercadopago", "webhook falló", new Error("boom"), { paymentId: "p1" });
  });
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.requestId, "req-10");
  assert.equal(entry.tenantId, "t_caro");
  assert.equal(entry.paymentId, "p1");
  assert.equal(entry.err.message, "boom");
});

test("el ctx explícito del caller pisa al ambiente en caso de choque", () => {
  capture();
  runInRequestContext({ requestId: "req-11", tenantId: "t_ambiente" }, () => {
    logger.warn("auth", "intento", { tenantId: "t_explicito" });
  });
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.tenantId, "t_explicito");
});

test("fuera de un request no se agrega requestId (comportamiento v1 intacto)", () => {
  capture();
  logger.info("cron", "corrida");
  const entry = JSON.parse(lines[0]);
  assert.equal("requestId" in entry, false);
  assert.deepEqual(Object.keys(entry), ["ts", "level", "scope", "msg"]);
});
