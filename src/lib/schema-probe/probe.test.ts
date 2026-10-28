// Tests unitarios del probe (sin base): caché por proceso, TTL del "no", error → false sin
// cachear, consultas simultáneas compartidas. El test contra Postgres local con y sin las
// migraciones está en ./paquete-gate2.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSchemaProbe, SQL_COLUMNA, SQL_TABLA, SQL_VALOR_ENUM, type ConsultaSql } from "./probe";

function consultaFalsa(existe: (sql: string, params: readonly string[]) => boolean | Error) {
  const llamadas: Array<{ sql: string; params: readonly string[] }> = [];
  const consultar: ConsultaSql = async (sql, params) => {
    llamadas.push({ sql, params });
    const r = existe(sql, params);
    if (r instanceof Error) throw r;
    return r ? [{ ok: 1 }] : [];
  };
  return { consultar, llamadas };
}

test("hayTabla/hayColumna/hayValorEnum mandan el SQL de catálogo con sus parámetros", async () => {
  const { consultar, llamadas } = consultaFalsa(() => true);
  const p = crearSchemaProbe(consultar);
  assert.equal(await p.hayTabla("ApiKey"), true);
  assert.equal(await p.hayColumna("OutboxEvent", "clave"), true);
  assert.equal(await p.hayValorEnum("PaymentMethod", "TARJETA"), true);
  assert.deepEqual(llamadas, [
    { sql: SQL_TABLA, params: ["ApiKey"] },
    { sql: SQL_COLUMNA, params: ["OutboxEvent", "clave"] },
    { sql: SQL_VALOR_ENUM, params: ["PaymentMethod", "TARJETA"] },
  ]);
});

test("un `true` queda cacheado para siempre en el proceso", async () => {
  let t = 0;
  const { consultar, llamadas } = consultaFalsa(() => true);
  const p = crearSchemaProbe(consultar, { ahora: () => t });
  await p.hayTabla("ApiKey");
  t = 10 * 24 * 3600 * 1000;
  assert.equal(await p.hayTabla("ApiKey"), true);
  assert.equal(llamadas.length, 1);
});

test("un `false` se recuerda sólo el TTL: aplicada la migración, se entera sin reiniciar", async () => {
  let t = 0;
  let aplicada = false;
  const { consultar, llamadas } = consultaFalsa(() => aplicada);
  const p = crearSchemaProbe(consultar, { ahora: () => t, ttlNegativoMs: 1000 });
  assert.equal(await p.hayColumna("OutboxEvent", "clave"), false);
  aplicada = true;
  t = 999;
  assert.equal(await p.hayColumna("OutboxEvent", "clave"), false, "dentro del TTL no vuelve a preguntar");
  assert.equal(llamadas.length, 1);
  t = 1000;
  assert.equal(await p.hayColumna("OutboxEvent", "clave"), true);
  assert.equal(llamadas.length, 2);
});

test("error de consulta → false (ocultar) y no se cachea", async () => {
  let falla = true;
  const { consultar, llamadas } = consultaFalsa(() => (falla ? new Error("conexión caída") : true));
  const p = crearSchemaProbe(consultar);
  assert.equal(await p.hayValorEnum("UserRole", "ENCARGADO"), false);
  falla = false;
  assert.equal(await p.hayValorEnum("UserRole", "ENCARGADO"), true);
  assert.equal(llamadas.length, 2);
});

test("llamadas simultáneas a lo mismo comparten una consulta; claves distintas no se mezclan", async () => {
  const { consultar, llamadas } = consultaFalsa((_sql, params) => params[0] === "ApiKey");
  const p = crearSchemaProbe(consultar);
  const r = await Promise.all([p.hayTabla("ApiKey"), p.hayTabla("ApiKey"), p.hayTabla("PagoExterno")]);
  assert.deepEqual(r, [true, true, false]);
  assert.equal(llamadas.length, 2);
  // cada tipo de probe tiene su propia clave de caché: el true de hayTabla no responde por los otros
  assert.equal(await p.hayColumna("ApiKey", "x"), true);
  assert.equal(await p.hayValorEnum("ApiKey", "x"), true);
  assert.equal(llamadas.length, 4);
});

test("olvidar() vacía la caché", async () => {
  const { consultar, llamadas } = consultaFalsa(() => true);
  const p = crearSchemaProbe(consultar);
  await p.hayTabla("ApiKey");
  p.olvidar();
  await p.hayTabla("ApiKey");
  assert.equal(llamadas.length, 2);
});
