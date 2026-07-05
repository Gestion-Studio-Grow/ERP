// Tests del logger estructurado (observabilidad). Lógica pura de serialización —
// no se toca la consola real ni el reloj (el ts se pasa fijo).

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLogEntry, serializeError } from "./logger";

const TS = "2026-07-05T12:00:00.000Z";

test("serializeError conserva nombre, mensaje y stack de un Error", () => {
  const e = new Error("boom");
  const s = serializeError(e);
  assert.equal(s.name, "Error");
  assert.equal(s.message, "boom");
  assert.ok(typeof s.stack === "string" && s.stack.includes("boom"));
});

test("serializeError maneja string y valores no-Error sin romper", () => {
  assert.deepEqual(serializeError("texto"), { message: "texto" });
  assert.equal(serializeError({ code: 42 }).message, '{"code":42}');
  // Un valor no serializable (referencia circular hace throw a JSON.stringify)
  // cae al String(err) sin lanzar.
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(serializeError(circular).message, "[object Object]");
});

test("formatLogEntry emite JSON con las claves fijas primero", () => {
  const line = formatLogEntry("info", "reportes", "generado", TS);
  const parsed = JSON.parse(line);
  assert.deepEqual(parsed, { ts: TS, level: "info", scope: "reportes", msg: "generado" });
});

test("el contexto se mergea pero no pisa las claves fijas", () => {
  const line = formatLogEntry("warn", "auth", "intento", TS, {
    tenantId: "t1",
    actor: "user:9",
    level: "HACK", // intento de pisar la clave fija 'level'
  });
  const parsed = JSON.parse(line);
  assert.equal(parsed.level, "warn"); // no fue pisada
  assert.equal(parsed.tenantId, "t1");
  assert.equal(parsed.actor, "user:9");
});

test("un error adjunto se serializa bajo la clave 'err'", () => {
  const line = formatLogEntry("error", "arca", "falló", TS, { appointmentId: "a1" }, new Error("timeout"));
  const parsed = JSON.parse(line);
  assert.equal(parsed.scope, "arca");
  assert.equal(parsed.appointmentId, "a1");
  assert.equal(parsed.err.message, "timeout");
});

test("es determinista: mismo input → misma línea", () => {
  const a = formatLogEntry("error", "s", "m", TS, { x: 1 }, new Error("e"));
  const b = formatLogEntry("error", "s", "m", TS, { x: 1 }, new Error("e"));
  // El stack difiere por objeto, pero name+message+campos fijos deben coincidir:
  const pa = JSON.parse(a);
  const pb = JSON.parse(b);
  delete pa.err.stack;
  delete pb.err.stack;
  assert.deepEqual(pa, pb);
});
