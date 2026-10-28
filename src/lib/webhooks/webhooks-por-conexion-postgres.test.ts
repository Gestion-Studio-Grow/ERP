// ============================================================================
// Webhook viejo de Mercado Pago por CONEXIÓN, con DOS negocios (Tanda P1, Postgres con RLS)
// ============================================================================
//
// `atenderAvisoMP` real (rate limit → conexión por firma con `resolverConexionPorFirma` → servicio
// nuevo: EventoIntegracion deduplicado + `manejadorAvisoMP` en runInTenantContext → cobro del
// pedido) contra la base efímera del arnés (A = "magra", B = "breakpoint"). Sin MP_MODO_LEGADO:
// los secretos por env de S1 no existen. Lo único falso es la red de MP (`leerPago`), que además
// registra con QUÉ conexión se leyó el pago.
//
//  · P1-C4: el dispatch de cobros toma el token de la conexión; sin conexión y sin flag falla
//    cerrado; con el flag usa el global y lo audita en el negocio;
//  · P1-C5: el aviso firmado con el secreto de A cobra el pedido de A; el de B, el de B; cero cruce;
//  · doble envío (en serie y en paralelo) del mismo aviso y un aviso NUEVO del mismo pago:
//    un solo EventoIntegracion por aviso y UN solo asiento por pago;
//  · firma de A con un pago que dice ser de B → ignorado, sin cobro, auditado en A;
//  · firma que no es de ninguna conexión → 401 sin efecto.
//
// La KEK se genera acá, en memoria del proceso: nunca se escribe en un archivo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { buildManifest } from "@/plugins/mercadopago/signature";
import type { PagoMP } from "@/plugins/mercadopago";

const laBase = baseEfimeraDelArchivo();
const env = process.env as Record<string, string | undefined>;
const TOTAL = 5000;
const SECRETO_A = "whsec-conexion-A-5b2e9d1c7a40";
const SECRETO_B = "whsec-conexion-B-81f3c6a0e2d7";
const TOKEN_A = "APP_USR-token-conexion-a-1111";
const TOKEN_B = "APP_USR-token-conexion-b-2222";

type Duenio = Awaited<ReturnType<typeof prismaComoDuenio>>;
interface Estado {
  base: BaseEfimera;
  duenio: Duenio;
  conexiones: { a: string; b: string } | null;
}
let estado: Estado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Estado | null> {
  if (estado) return estado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(env, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  for (const v of ["MP_ACCESS_TOKEN", "MP_MODO_LEGADO", "MP_WEBHOOK_SECRET", "MP_WEBHOOK_SECRETS", "ARCA_INVOICING_ENABLED"]) delete env[v];
  env.INTEGRACIONES_MASTER_KEY = randomBytes(32).toString("base64");
  const duenio = await prismaComoDuenio(base);
  for (const n of [base.a, base.b]) {
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: { push: "mercadopago" } } });
    await duenio.order.updateMany({ where: { tenantId: n.id }, data: { total: TOTAL } });
  }
  estado = { base, duenio, conexiones: null };
  return estado;
}

async function conectar(s: Estado): Promise<{ a: string; b: string }> {
  if (s.conexiones) return s.conexiones;
  const { crearConexion } = await import("@/integraciones/conexiones.server");
  const ca = await crearConexion(s.base.a.id, "mercadopago", {
    cuentaExterna: "mp-cuenta-pc-a",
    credenciales: { access_token: TOKEN_A, webhook_secret: SECRETO_A },
    conectadaPor: "cli",
  });
  const cb = await crearConexion(s.base.b.id, "mercadopago", {
    cuentaExterna: "mp-cuenta-pc-b",
    credenciales: { access_token: TOKEN_B, webhook_secret: SECRETO_B },
    conectadaPor: "cli",
  });
  s.conexiones = { a: ca.conexionId, b: cb.conexionId };
  return s.conexiones;
}

function aviso(paymentId: string, secreto: string, requestId: string, host = "erp-ch.vercel.app"): Request {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", secreto).update(buildManifest(paymentId, requestId, ts)).digest("hex");
  return new Request(`https://${host}/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, {
    method: "POST",
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId, host, "content-type": "application/json" },
    body: JSON.stringify({ type: "payment", action: "payment.updated", data: { id: paymentId } }),
  });
}

/** El webhook viejo con todo real salvo la red de MP. `lecturas` = "<tenant>/<conexión>/<pago>". */
async function enviar(req: Request, pagos: Record<string, PagoMP>, lecturas: string[]) {
  const m = await import("@/lib/mercadopago-dispatch");
  const manejador = m.manejadorAvisoMP({
    ...m.DEPS_MANEJADOR_MP,
    leerPago: async (c, id) => {
      lecturas.push(`${c.tenantId}/${c.conexionId}/${id}`);
      const p = pagos[id];
      if (!p) throw new Error(`pago ${id} inexistente`);
      return p;
    },
  });
  const r = await m.atenderAvisoMP(req, {
    ...m.DEPS_AVISO_MP,
    env: { ...process.env },
    despachar: (c, rq) => m.despacharAvisoMP(c, rq, manejador),
    leerPago: async () => {
      throw new Error("el camino legado no tiene que correr");
    },
    limitar: () => null,
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

async function fotoDe(duenio: Duenio, tenantId: string) {
  const [pedidos, movimientos, auditoria, eventos] = await Promise.all([
    duenio.order.findMany({ where: { tenantId }, select: { id: true, paid: true, paymentMethod: true }, orderBy: { id: "asc" } }),
    duenio.cashMovement.count({ where: { tenantId } }),
    duenio.auditLog.count({ where: { tenantId } }),
    duenio.eventoIntegracion.count({ where: { tenantId } }),
  ]);
  return { pedidos, movimientos, auditoria, eventos };
}

test("P1-C4: sin conexión y sin MP_MODO_LEGADO el dispatch falla cerrado; con el flag usa el global y lo audita", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const pd = await import("@/lib/pagos-dispatch");
  const { conexionDelNegocio } = await import("@/integraciones/conexiones.server");
  assert.equal(await conexionDelNegocio(s.base.a.id, "mercadopago"), null);
  await assert.rejects(
    async () => pd.configCobrosPorDefecto.configDe(s.base.a.id),
    (e: unknown) => e instanceof pd.CobrosSinConexionError && e.motivo === "sin_conexion",
  );
  assert.equal(await s.duenio.auditLog.count({ where: { action: "mp-modo-legado" } }), 0);

  env.MP_MODO_LEGADO = "1";
  env.MP_ACCESS_TOKEN = "APP_USR-global-del-despliegue";
  try {
    const cfg = await pd.configCobrosPorDefecto.configDe(s.base.a.id);
    assert.deepEqual(cfg.config, { credenciales: { accessToken: "APP_USR-global-del-despliegue" } });
  } finally {
    delete env.MP_MODO_LEGADO;
    delete env.MP_ACCESS_TOKEN;
  }
  const filas = await s.duenio.auditLog.findMany({ where: { action: "mp-modo-legado" }, select: { tenantId: true, entity: true } });
  assert.deepEqual(filas, [{ tenantId: s.base.a.id, entity: "ConfigCobros" }]);
});

test("P1-C4: con conexión, cada negocio cobra con el token de SU conexión (ni el global ni el del otro)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const c = await conectar(s);
  const pd = await import("@/lib/pagos-dispatch");
  const { conexionDelNegocio } = await import("@/integraciones/conexiones.server");
  assert.equal((await conexionDelNegocio(s.base.a.id, "mercadopago"))?.conexionId, c.a);
  assert.equal((await conexionDelNegocio(s.base.b.id, "mercadopago"))?.conexionId, c.b);
  env.MP_MODO_LEGADO = "1";
  env.MP_ACCESS_TOKEN = "APP_USR-global-del-despliegue";
  try {
    assert.deepEqual((await pd.configCobrosPorDefecto.configDe(s.base.a.id)).config, { credenciales: { accessToken: TOKEN_A } });
    assert.deepEqual((await pd.configCobrosPorDefecto.configDe(s.base.b.id)).config, { credenciales: { accessToken: TOKEN_B } });
  } finally {
    delete env.MP_MODO_LEGADO;
    delete env.MP_ACCESS_TOKEN;
  }
  assert.equal(await s.duenio.auditLog.count({ where: { action: "mp-modo-legado" } }), 1, "con conexión no se audita legado de nuevo");
});

test("P1-C5: aviso firmado por la conexión de A cobra el pedido de A; doble envío y aviso nuevo del mismo pago → un asiento; B intacto", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const c = await conectar(s);
  const { base, duenio } = s;
  const pedidoA = base.a.pedidos[0];
  const pagoId = "990001";
  const pagos: Record<string, PagoMP> = {
    [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: `gsg:${base.a.slug}:pedido:${pedidoA}` } as PagoMP,
  };
  const antesB = await fotoDe(duenio, base.b.id);
  const lecturas: string[] = [];

  // Llega por la URL de B (host engañoso): el negocio sale de la conexión que firmó, no del host.
  const r1 = await enviar(aviso(pagoId, SECRETO_A, "req-a-1", base.b.host), pagos, lecturas);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.deepEqual(lecturas, [`${base.a.id}/${c.a}/${pagoId}`], "el pago se lee con la conexión de A");
  const pedido = await duenio.order.findUniqueOrThrow({ where: { id: pedidoA }, select: { paid: true, paymentMethod: true } });
  assert.equal(pedido.paid, true);
  assert.equal(pedido.paymentMethod, "MERCADOPAGO");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.a.id, orderId: pedidoA } }), 1);

  // Doble envío del MISMO aviso: en serie y dos en paralelo → deduplicado, el handler no vuelve a correr.
  const r2 = await enviar(aviso(pagoId, SECRETO_A, "req-a-1"), pagos, lecturas);
  assert.equal(r2.status, 200);
  assert.equal((r2.body.resultado as { duplicados: number }).duplicados, 1);
  const par = await Promise.all([1, 2].map(() => enviar(aviso(pagoId, SECRETO_A, "req-a-1"), pagos, lecturas)));
  for (const x of par) assert.equal(x.status, 200, JSON.stringify(x.body));
  assert.equal(lecturas.length, 1, "un solo handler para el mismo aviso");

  // Un aviso NUEVO del mismo pago (otro x-request-id): entra, pero el cobro es idempotente por pago.
  const r3 = await enviar(aviso(pagoId, SECRETO_A, "req-a-2"), pagos, lecturas);
  assert.equal(r3.status, 200, JSON.stringify(r3.body));
  assert.equal(await duenio.cashMovement.count({ where: { orderId: pedidoA } }), 1, "un solo asiento por payment_id");
  const eventos = await duenio.eventoIntegracion.findMany({ where: { tenantId: base.a.id }, select: { conexionId: true, idExterno: true, estado: true } });
  assert.deepEqual(eventos.map((e) => e.idExterno).sort(), [`pago:${pagoId}:req-a-1`, `pago:${pagoId}:req-a-2`]);
  assert.ok(eventos.every((e) => e.conexionId === c.a));

  // Cero cruce: nada de B tocado, nada con el tenant de B.
  assert.deepEqual(await fotoDe(duenio, base.b.id), antesB);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.b.id, orderId: { in: base.a.pedidos } } }), 0);
});

test("P1-C5: el aviso de B por su conexión cobra en B; la firma de A con un pago de B → sin cobro, auditado en A", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const c = await conectar(s);
  const { base, duenio } = s;
  const [pedidoB1, pedidoB2] = base.b.pedidos;
  const lecturas: string[] = [];
  const pagos: Record<string, PagoMP> = {
    "990010": { id: "990010", estado: "approved", monto: TOTAL, externalReference: `gsg:${base.b.slug}:pedido:${pedidoB1}` } as PagoMP,
    "990011": { id: "990011", estado: "approved", monto: TOTAL, externalReference: `gsg:${base.b.slug}:pedido:${pedidoB2}` } as PagoMP,
  };
  const r = await enviar(aviso("990010", SECRETO_B, "req-b-1", base.a.host), pagos, lecturas);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(lecturas, [`${base.b.id}/${c.b}/990010`]);
  assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: pedidoB1 }, select: { paid: true } })).paid, true);
  assert.equal(await duenio.eventoIntegracion.count({ where: { tenantId: base.a.id, idExterno: { startsWith: "pago:990010:" } } }), 0);

  // Firmado con el secreto de A, el pago dice ser de B: se lee con la cuenta de A y no se cobra nada de B.
  const auditAntesB = await duenio.auditLog.count({ where: { tenantId: base.b.id } });
  const x = await enviar(aviso("990011", SECRETO_A, "req-a-x"), pagos, lecturas);
  assert.equal(x.status, 200, JSON.stringify(x.body));
  assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: pedidoB2 }, select: { paid: true } })).paid, false);
  const filas = await duenio.auditLog.findMany({ where: { entityId: "990011" }, select: { tenantId: true, action: true, channel: true } });
  assert.deepEqual(filas, [{ tenantId: base.a.id, action: "rechazado", channel: "webhook" }]);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.b.id } }), auditAntesB);
});

test("P1-C5: firma que no es de ninguna conexión → 401 sin efecto (sin legado, sin host)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await conectar(s);
  const { base, duenio } = s;
  const antes = await Promise.all([fotoDe(duenio, base.a.id), fotoDe(duenio, base.b.id)]);
  const lecturas: string[] = [];
  const r = await enviar(aviso("990020", "whsec-de-nadie", "req-z", base.a.host), {}, lecturas);
  assert.equal(r.status, 401);
  assert.deepEqual(lecturas, []);
  assert.deepEqual(await Promise.all([fotoDe(duenio, base.a.id), fotoDe(duenio, base.b.id)]), antes);
});
