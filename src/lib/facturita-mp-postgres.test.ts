// ============================================================================
// FACTOQUE · «Conectá tu Mercado Pago» con DOS negocios (Postgres efímero, app como `app_rls`).
// ============================================================================
//
//  · A conecta su cuenta de MP: tokens sellados (nada en claro), vencimiento guardado, estado
//    visible SÓLO para A; B sigue «sin conectar».
//  · La misma cuenta de MP en B → «cuenta_en_uso» (la base lo impide aunque B no vea la de A).
//  · Desconectar A borra sus credenciales y no toca las de B.
//  · Renovación: un solo renovador gana; si MP rechaza, «hay que volver a conectarlo».
//
// La KEK se genera en memoria del proceso: nunca se escribe en un archivo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import type { PedirMP, TokensMP } from "@/plugins/mercadopago/oauth-mp";

const laBase = baseEfimeraDelArchivo();
const env = process.env as Record<string, string | undefined>;
const ENV_APP = { MP_OAUTH_CLIENT_ID: "1234567890", MP_OAUTH_CLIENT_SECRET: "secreto-app-mp", MP_OAUTH_WEBHOOK_SECRET: "whsec-app-gsg-0001" };

interface Estado {
  base: BaseEfimera;
  duenio: Awaited<ReturnType<typeof prismaComoDuenio>>;
  mp: typeof import("./facturita-mp.server");
  cx: typeof import("@/integraciones/conexiones.server");
}
let estado: Estado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Estado | null> {
  if (estado) return estado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(env, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000", INTEGRACIONES_MASTER_KEY: randomBytes(32).toString("base64"), ...ENV_APP });
  delete env.INTEGRACIONES_MASTER_KEY_ID;
  const duenio = await prismaComoDuenio(base);
  estado = { base, duenio, mp: await import("./facturita-mp.server"), cx: await import("@/integraciones/conexiones.server") };
  return estado;
}

const AHORA = new Date("2026-11-05T12:00:00Z");
const tokens = (cuenta: string, sufijo: string, dias = 180): TokensMP => ({
  accessToken: `APP_USR-${sufijo}-acceso-0001`,
  refreshToken: `TG-${sufijo}-refresh-0001`,
  cuentaMp: cuenta,
  expiraEn: new Date(AHORA.getTime() + dias * 86400_000),
});

test("dos negocios: A conecta, B no ve nada; la misma cuenta en B choca; desconectar A no toca a B", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { a, b } = s.base;
  const cfg = s.mp.conexionMPDisponible(env)!;
  assert.ok(cfg, "con la app de MP y la KEK, la conexión está disponible");

  assert.deepEqual(await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("111111", "a"), cfg, env), { ok: true });
  const ea = await s.mp.estadoMPDelNegocio(a.id);
  assert.equal(ea.conectado && ea.cuenta, "111111");
  assert.deepEqual(await s.mp.estadoMPDelNegocio(b.id), { conectado: false });

  // Sellado: ni el access ni el refresh ni el secreto de la app en claro; vencimiento guardado.
  const creds = await s.duenio.integracionCredencial.findMany({ where: { tenantId: a.id } });
  assert.deepEqual(creds.map((c) => c.campo).sort(), ["access_token", "refresh_token", "webhook_secret"]);
  for (const c of creds) assert.ok(!c.sealed.includes("APP_USR") && !c.sealed.includes("TG-") && !c.sealed.includes("whsec"));
  assert.equal(creds.find((c) => c.campo === "access_token")?.expiraEn?.toISOString(), tokens("1", "x").expiraEn.toISOString());

  // El dispatch de cobros encuentra el token de A (y sólo de A).
  const cxA = await s.cx.conexionDelNegocio(a.id, "mercadopago");
  assert.equal(await s.cx.leerCredencial(a.id, cxA!.conexionId, "access_token"), "APP_USR-a-acceso-0001");
  assert.equal(await s.cx.leerCredencial(b.id, cxA!.conexionId, "access_token"), null, "B no abre la credencial de A");

  // La misma cuenta de MP en B: la base lo impide aunque B no pueda leer la fila de A.
  assert.deepEqual(await s.mp.guardarConexionMP(b.id, b.duenia.id, tokens("111111", "b"), cfg, env), { ok: false, motivo: "cuenta_en_uso" });
  assert.deepEqual(await s.mp.guardarConexionMP(b.id, b.duenia.id, tokens("222222", "b"), cfg, env), { ok: true });

  // B intenta desconectar: baja SU conexión, nunca la de A.
  assert.equal(await s.mp.desconectarMP(b.id, b.duenia.id), 1);
  assert.equal((await s.mp.estadoMPDelNegocio(a.id)).conectado, true);
  assert.equal(await s.duenio.integracionCredencial.count({ where: { tenantId: b.id } }), 0);
  assert.equal(await s.duenio.integracionCredencial.count({ where: { tenantId: a.id } }), 3);

  // A desconecta: credenciales borradas, conexión «desconectada», auditado.
  assert.equal(await s.mp.desconectarMP(a.id, a.duenia.id), 1);
  assert.deepEqual(await s.mp.estadoMPDelNegocio(a.id), { conectado: false });
  assert.equal(await s.duenio.integracionCredencial.count({ where: { tenantId: a.id } }), 0);
  const fila = await s.duenio.integracionConexion.findFirst({ where: { tenantId: a.id } });
  assert.equal(fila?.estado, "desconectada");
  assert.equal(fila?.rutaHash, null);
  const audit = await s.duenio.auditLog.findMany({ where: { tenantId: a.id, action: { startsWith: "facturita.mercadopago" } }, select: { action: true } });
  assert.deepEqual(audit.map((x) => x.action).sort(), ["facturita.mercadopago_conectado", "facturita.mercadopago_desconectado"]);
  assert.equal(await s.mp.desconectarMP(a.id, a.duenia.id), 0, "desconectar dos veces no rompe");

  // Reconectar la misma cuenta después de desconectar vuelve a andar.
  assert.deepEqual(await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("111111", "a2"), cfg, env), { ok: true });
});

test("sin la app de MP en el entorno: «todavía no disponible» y la renovación no hace nada", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  assert.equal(s.mp.conexionMPDisponible({ ...env, MP_OAUTH_CLIENT_SECRET: "" }), null);
  assert.equal(s.mp.conexionMPDisponible({ ...env, INTEGRACIONES_MASTER_KEY: "" }), null);
  assert.equal(await s.mp.renovarMPSiHaceFalta(s.base.a.id, { env: { ...env, MP_OAUTH_CLIENT_ID: "" } }), "no_hacia_falta");
});

test("renovación: un solo renovador gana; MP rechaza → «hay que volver a conectarlo»", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { a } = s.base;
  const cfg = s.mp.conexionMPDisponible(env)!;
  await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("111111", "r", 5), cfg, env); // vence en 5 días

  let llamados = 0;
  const pedirOk: PedirMP = async (_url, init) => {
    llamados++;
    assert.equal(new URLSearchParams(init.body).get("refresh_token"), "TG-r-refresh-0001");
    await new Promise((r) => setTimeout(r, 30));
    return { ok: true, status: 200, json: async () => ({ access_token: "APP_USR-nuevo-0002", refresh_token: "TG-nuevo-0002", expires_in: 15552000, user_id: 111111 }) };
  };
  const [r1, r2] = await Promise.all([
    s.mp.renovarMPSiHaceFalta(a.id, { env, pedir: pedirOk, ahora: AHORA }),
    s.mp.renovarMPSiHaceFalta(a.id, { env, pedir: pedirOk, ahora: AHORA }),
  ]);
  assert.deepEqual([r1, r2].sort(), ["otro_renovo", "renovado"]);
  assert.equal(llamados, 1, "a MP se le pide UNA renovación");
  const cxA = await s.cx.conexionDelNegocio(a.id, "mercadopago");
  assert.equal(await s.cx.leerCredencial(a.id, cxA!.conexionId, "access_token"), "APP_USR-nuevo-0002");
  assert.equal(await s.cx.leerCredencial(a.id, cxA!.conexionId, "refresh_token"), "TG-nuevo-0002");
  assert.equal(await s.mp.renovarMPSiHaceFalta(a.id, { env, pedir: pedirOk, ahora: AHORA }), "no_hacia_falta");

  // Un refresh que devuelve OTRA cuenta no se guarda.
  await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("111111", "r", 5), cfg, env);
  const otraCuenta: PedirMP = async () => ({ ok: true, status: 200, json: async () => ({ access_token: "APP_USR-ajeno-0003", refresh_token: "TG-ajeno-0003", expires_in: 100, user_id: 999 }) });
  assert.equal(await s.mp.renovarMPSiHaceFalta(a.id, { env, pedir: otraCuenta, ahora: AHORA }), "fallo");
  assert.equal(await s.cx.leerCredencial(a.id, cxA!.conexionId, "access_token"), "APP_USR-r-acceso-0001");

  const rechazo: PedirMP = async () => ({ ok: false, status: 400, json: async () => ({ message: "invalid_grant" }) });
  assert.equal(await s.mp.renovarMPSiHaceFalta(a.id, { env, pedir: rechazo, ahora: AHORA }), "fallo");
  const e = await s.mp.estadoMPDelNegocio(a.id);
  assert.ok(e.conectado && e.problema === "reconectar");
  // El negocio B no se enteró de nada.
  assert.deepEqual(await s.mp.estadoMPDelNegocio(s.base.b.id), { conectado: false });
});

test("certificación M1/M2: reemplazar y desconectar no dejan secretos ni bloquean la cuenta de MP", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { a, b } = s.base;
  const cfg = s.mp.conexionMPDisponible(env)!;
  await s.mp.desconectarMP(a.id, a.duenia.id);
  await s.mp.desconectarMP(b.id, b.duenia.id);
  // A conecta 333333 y después la reemplaza por 444444: de la vieja no queda ninguna credencial.
  assert.deepEqual(await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("333333", "m1"), cfg, env), { ok: true });
  assert.deepEqual(await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("444444", "m1b"), cfg, env), { ok: true });
  assert.equal(await s.duenio.integracionCredencial.count({ where: { tenantId: a.id } }), 3, "sólo las de la conexión vigente");
  // La cuenta reemplazada queda libre: B la puede conectar.
  assert.deepEqual(await s.mp.guardarConexionMP(b.id, b.duenia.id, tokens("333333", "m2"), cfg, env), { ok: true });
  // A desconecta: cero credenciales y 444444 queda libre para B.
  await s.mp.desconectarMP(a.id, a.duenia.id);
  assert.equal(await s.duenio.integracionCredencial.count({ where: { tenantId: a.id } }), 0);
  assert.deepEqual(await s.mp.guardarConexionMP(b.id, b.duenia.id, tokens("444444", "m2b"), cfg, env), { ok: true });
  assert.equal((await s.mp.estadoMPDelNegocio(b.id)).conectado, true);
  assert.deepEqual(await s.mp.estadoMPDelNegocio(a.id), { conectado: false });
});

test("renovación: un 5xx o 429 de MP no pide reconectar (es pasajero)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { a } = s.base;
  const cfg = s.mp.conexionMPDisponible(env)!;
  await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("555555", "p", 5), cfg, env);
  const caido: PedirMP = async () => ({ ok: false, status: 503, json: async () => ({}) });
  assert.equal(await s.mp.renovarMPSiHaceFalta(a.id, { env, pedir: caido, ahora: AHORA }), "fallo");
  const e = await s.mp.estadoMPDelNegocio(a.id);
  assert.ok(e.conectado && e.problema === "ninguno");
});

test("PR2: conectar activa el módulo; la configuración arranca apagada, se guarda por negocio y no cruza", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { a, b } = s.base;
  const cfg = s.mp.conexionMPDisponible(env)!;
  await s.mp.desconectarMP(a.id, a.duenia.id);
  await s.mp.desconectarMP(b.id, b.duenia.id);
  await s.duenio.tenant.update({ where: { id: a.id }, data: { modules: { set: (await s.duenio.tenant.findUniqueOrThrow({ where: { id: a.id } })).modules.filter((m) => m !== "mercadopago") } } });

  // Sin conexión: apagada y no se puede guardar.
  assert.equal((await s.mp.configFacturacionMPDelNegocio(a.id)).modo, "apagado");
  assert.deepEqual(await s.mp.guardarConfigFacturacionMP(a.id, a.duenia.id, { modo: "automatico" }), { ok: false, motivo: "sin_conexion" });

  await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("777777", "c"), cfg, env);
  await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("777777", "c2"), cfg, env); // reconectar no duplica el módulo
  const modulos = (await s.duenio.tenant.findUniqueOrThrow({ where: { id: a.id } })).modules;
  assert.equal(modulos.filter((m) => m === "mercadopago").length, 1);
  assert.equal((await s.mp.configFacturacionMPDelNegocio(a.id)).modo, "apagado", "conectar no prende la facturación");

  const r = await s.mp.guardarConfigFacturacionMP(a.id, a.duenia.id, { modo: "proponer", puntoVenta: 3, concepto: 1, importeMinimo: 500, palabrasExcluidas: ["propina"] });
  assert.equal(r.ok, true);
  assert.equal((await s.mp.configFacturacionMPDelNegocio(a.id)).modo, "proponer");
  assert.equal((await s.mp.configFacturacionMPDelNegocio(b.id)).modo, "apagado", "B no ve la de A");
  const inval = await s.mp.guardarConfigFacturacionMP(a.id, a.duenia.id, { modo: "a-full" });
  assert.equal(inval.ok, false);
  assert.equal((await s.mp.configFacturacionMPDelNegocio(a.id)).modo, "proponer", "lo inválido no pisa");
  const audit = await s.duenio.auditLog.count({ where: { tenantId: a.id, action: "facturita.mercadopago_facturacion_config" } });
  assert.equal(audit, 1);
  // Reconectar la misma cuenta conserva la configuración; otra cuenta arranca apagada.
  await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("777777", "c3"), cfg, env);
  assert.equal((await s.mp.configFacturacionMPDelNegocio(a.id)).modo, "proponer");
  await s.mp.guardarConexionMP(a.id, a.duenia.id, tokens("888888", "c4"), cfg, env);
  assert.equal((await s.mp.configFacturacionMPDelNegocio(a.id)).modo, "apagado");
});
