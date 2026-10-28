// Tests unitarios del probe (sin base): caché por proceso, TTL del "no", error → false sin
// cachear, consultas simultáneas compartidas. El test contra Postgres local con y sin las
// migraciones está en ./paquete-gate2.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clienteConoceValor, crearSchemaProbe, SQL_COLUMNA, SQL_TABLA, SQL_VALOR_ENUM, type ConsultaSql } from "./probe";

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
  assert.equal(await p.hayValorEnum("PaymentMethod", "DEBITO"), true);
  assert.deepEqual(llamadas, [
    { sql: SQL_TABLA, params: ["ApiKey"] },
    { sql: SQL_COLUMNA, params: ["OutboxEvent", "clave"] },
    { sql: SQL_VALOR_ENUM, params: ["PaymentMethod", "DEBITO"] },
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

test("olvidar() con una consulta en vuelo: la vieja no repone su valor ni borra la promesa nueva", async () => {
  // Consulta controlada a mano: cada llamada queda colgada hasta que el test la resuelve.
  const colgadas: Array<(filas: Array<Record<string, unknown>>) => void> = [];
  const consultar: ConsultaSql = () => new Promise((resolve) => colgadas.push(resolve));
  const p = crearSchemaProbe(consultar, { ttlNegativoMs: 60_000 });

  const vieja = p.hayTabla("ApiKey"); // consulta 1, en vuelo
  p.olvidar();
  const nueva = p.hayTabla("ApiKey"); // consulta 2, en vuelo (no comparte con la vieja)
  assert.equal(colgadas.length, 2);

  colgadas[0]([]); // la vieja termina: "no está" (estado previo a olvidar)
  assert.equal(await vieja, false);
  // (b) el `finally` de la vieja NO borró la promesa de la nueva: una 3.ª llamada la comparte.
  const tercera = p.hayTabla("ApiKey");
  assert.equal(colgadas.length, 2, "la 3.ª llamada se suma a la consulta nueva en vuelo");

  colgadas[1]([{ ok: 1 }]); // la nueva termina: "sí está"
  assert.equal(await nueva, true);
  assert.equal(await tercera, true);
  // (a) el `cache.set` de la vieja no repuso el `false`: queda el `true` de la nueva, sin consultar.
  assert.equal(await p.hayTabla("ApiKey"), true);
  assert.equal(colgadas.length, 2);
});

test("olvidar() con una consulta en vuelo que termina DESPUÉS: no deja nada en la caché", async () => {
  const colgadas: Array<(filas: Array<Record<string, unknown>>) => void> = [];
  const consultar: ConsultaSql = () => new Promise((resolve) => colgadas.push(resolve));
  const p = crearSchemaProbe(consultar);
  const vieja = p.hayValorEnum("PaymentMethod", "DEBITO");
  p.olvidar();
  colgadas[0]([]);
  assert.equal(await vieja, false);
  // Sin generación, este `false` viejo quedaba cacheado 60 s después de olvidar().
  const otra = p.hayValorEnum("PaymentMethod", "DEBITO");
  assert.equal(colgadas.length, 2, "vuelve a preguntar");
  colgadas[1]([{ ok: 1 }]);
  assert.equal(await otra, true);
});

test("sePuedeEscribirValorEnum: hace falta que la base lo tenga Y que el cliente de Prisma lo conozca", async () => {
  const { consultar, llamadas } = consultaFalsa(() => true);
  const clienteViejo = { PaymentMethod: { MERCADOPAGO: "MERCADOPAGO", EFECTIVO: "EFECTIVO", TRANSFERENCIA: "TRANSFERENCIA" } };
  const clienteNuevo = { PaymentMethod: { ...clienteViejo.PaymentMethod, DEBITO: "DEBITO", CREDITO: "CREDITO" } };

  // Base con el valor, cliente sin él (`// N2-enum:` apagado): NO se escribe, y ni se consulta.
  const viejo = crearSchemaProbe(consultar, { enumsDelCliente: clienteViejo });
  assert.equal(await viejo.sePuedeEscribirValorEnum("PaymentMethod", "DEBITO"), false);
  assert.equal(llamadas.length, 0);
  // Sin enums inyectados: fail-safe, no se escribe.
  assert.equal(await crearSchemaProbe(consultar).sePuedeEscribirValorEnum("PaymentMethod", "DEBITO"), false);

  // Cliente con el valor y base con el valor: se escribe.
  const nuevo = crearSchemaProbe(consultar, { enumsDelCliente: clienteNuevo });
  assert.equal(await nuevo.sePuedeEscribirValorEnum("PaymentMethod", "CREDITO"), true);
  // Cliente con el valor y base SIN el valor (paquete sin aplicar): no se escribe.
  const sinBase = crearSchemaProbe(consultaFalsa(() => false).consultar, { enumsDelCliente: clienteNuevo });
  assert.equal(await sinBase.sePuedeEscribirValorEnum("PaymentMethod", "DEBITO"), false);
});

test("clienteConoceValor no se confunde con propiedades heredadas ni tipos inexistentes", () => {
  const enums = { UserRole: { OWNER: "OWNER" } };
  assert.equal(clienteConoceValor(enums, "UserRole", "OWNER"), true);
  assert.equal(clienteConoceValor(enums, "UserRole", "ENCARGADO"), false);
  assert.equal(clienteConoceValor(enums, "UserRole", "toString"), false);
  assert.equal(clienteConoceValor(enums, "PaymentMethod", "DEBITO"), false);
  assert.equal(clienteConoceValor(undefined, "UserRole", "OWNER"), false);
});

test("una consulta que tira en el acto (sincrónica) no deja una promesa vieja trabada en vuelo", async () => {
  let n = 0;
  const consultar: ConsultaSql = (() => {
    n++;
    if (n === 1) throw new Error("pool cerrado");
    return Promise.resolve([{ ok: 1 }]);
  }) as ConsultaSql;
  const p = crearSchemaProbe(consultar);
  assert.equal(await p.hayTabla("ApiKey"), false);
  assert.equal(await p.hayTabla("ApiKey"), true, "vuelve a preguntar");
  assert.equal(n, 2);
});
