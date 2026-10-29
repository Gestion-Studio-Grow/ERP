// Certificación adversarial P1 (plata + seguridad) llevada al repo: Postgres efímero del arnés con
// RLS (negocios A y B). Cada caso reprodujo una falla del dictamen y queda como regresión:
//   ADV-C2 ruta /c/{token} sin handler de MP · ADV-dedupe evento "recibido" abandonado (lease) ·
//   ADV-concurrencia un solo asiento · ADV-tope el tope cuenta conexiones, no negocios ·
//   ADV-reconexion una conexión activa por negocio en "url-por-conexion" ·
//   ADV-reconexion-misma-cuenta la misma cuentaExterna en el mismo negocio reconecta (vuelta 3).
// La KEK se genera en memoria; la red de MP se simula (fetch / leerPago), nada sale afuera.

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
const SECRETO_A = "whsec-adv-A-5b2e9d1c7a40";
const SECRETO_B = "whsec-adv-B-81f3c6a0e2d7";

type Duenio = Awaited<ReturnType<typeof prismaComoDuenio>>;
interface Estado {
  base: BaseEfimera;
  duenio: Duenio;
  c: { a: string; b: string; tokenA: string };
}
let estado: Estado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Estado | null> {
  if (estado) return estado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(env, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "3000" });
  for (const v of ["MP_ACCESS_TOKEN", "MP_MODO_LEGADO", "MP_WEBHOOK_SECRET", "MP_WEBHOOK_SECRETS", "ARCA_INVOICING_ENABLED"]) delete env[v];
  env.INTEGRACIONES_MASTER_KEY = randomBytes(32).toString("base64");
  const duenio = await prismaComoDuenio(base);
  for (const n of [base.a, base.b]) {
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: { push: "mercadopago" } } });
    await duenio.order.updateMany({ where: { tenantId: n.id }, data: { total: TOTAL } });
  }
  const { crearConexion } = await import("@/integraciones/conexiones.server");
  const ca = await crearConexion(base.a.id, "mercadopago", {
    cuentaExterna: "mp-adv-a",
    credenciales: { access_token: "APP_USR-a", webhook_secret: SECRETO_A },
    conectadaPor: "cli",
  });
  const cb = await crearConexion(base.b.id, "mercadopago", {
    cuentaExterna: "mp-adv-b",
    credenciales: { access_token: "APP_USR-b", webhook_secret: SECRETO_B },
    conectadaPor: "cli",
  });
  estado = { base, duenio, c: { a: ca.conexionId, b: cb.conexionId, tokenA: ca.token! } };
  return estado;
}

function firmados(paymentId: string, secreto: string, requestId: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", secreto).update(buildManifest(paymentId, requestId, ts)).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId, "content-type": "application/json" };
}
const cuerpo = (id: string) => JSON.stringify({ type: "payment", action: "payment.updated", data: { id } });

function avisoViejo(paymentId: string, secreto: string, requestId: string): Request {
  return new Request(`https://erp-ch.vercel.app/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, {
    method: "POST",
    headers: firmados(paymentId, secreto, requestId),
    body: cuerpo(paymentId),
  });
}

/** Webhook viejo con TODO real salvo la red de MP (leerPago). */
async function enviarViejo(req: Request, pagos: Record<string, PagoMP>, lecturas: string[]) {
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

const pagado = async (d: Duenio, id: string) => (await d.order.findUniqueOrThrow({ where: { id }, select: { paid: true } })).paid;

test("ADV-C2: la URL por conexión de PRODUCCIÓN (route.ts) no acredita el pago, y su evento bloquea al webhook viejo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { base, duenio, c } = s;
  const pedido = base.a.pedidos[0];
  const pagoId = "880001";
  const pagos = { [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: `gsg:${base.a.slug}:pedido:${pedido}` } as PagoMP };

  // La URL que crearConexion entrega para configurar en MP: /api/integraciones/c/{token}, con los deps de producción.
  // Sólo la red de MP se simula (fetch): el token con el que se lee el pago tiene que ser el de la conexión de A.
  const fetchOriginal = globalThis.fetch;
  const autorizaciones: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith("https://api.mercadopago.com/v1/payments/")) return fetchOriginal(url, init);
    autorizaciones.push(String((init?.headers as Record<string, string>)?.Authorization));
    const id = u.split("/").pop();
    if (id !== pagoId) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ id: pagoId, status: "approved", transaction_amount: TOTAL, external_reference: pagos[pagoId].externalReference }), { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = fetchOriginal;
  });
  const { POST } = await import("@/app/api/integraciones/c/[token]/route");
  const r = await POST(
    new Request(`https://erp-ch.vercel.app/api/integraciones/c/${c.tokenA}?data.id=${pagoId}&type=payment`, {
      method: "POST",
      headers: firmados(pagoId, SECRETO_A, "req-prod-1"),
      body: cuerpo(pagoId),
    }),
    { params: Promise.resolve({ token: c.tokenA }) },
  );
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  assert.deepEqual(autorizaciones, ["Bearer APP_USR-a"], "el pago se lee con el token de la conexión de A");
  const ev = await duenio.eventoIntegracion.findFirst({ where: { tenantId: base.a.id, idExterno: `pago:${pagoId}:req-prod-1` }, select: { estado: true } });
  const pagadoTrasRuta = await pagado(duenio, pedido);

  // MP reintenta / el mismo aviso entra por el webhook viejo (misma conexión, misma clave) → "duplicado".
  const lecturas: string[] = [];
  const r2 = await enviarViejo(avisoViejo(pagoId, SECRETO_A, "req-prod-1"), pagos, lecturas);
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.ok(
    pagadoTrasRuta && (await pagado(duenio, pedido)),
    `pedido pagado por MP y NO acreditado: la ruta de producción dejó el evento "${ev?.estado}" (depsDeProduccion().manejadores = {}) ` +
      `y el reenvío por el webhook viejo dio ${JSON.stringify(r2.body.resultado)}, lecturas=${lecturas.length}`,
  );
});

test("ADV-dedupe: un evento que quedó 'recibido' (corte/timeout entre el insert y el handler) bloquea para siempre el reintento", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { base, duenio, c } = s;
  const pedido = base.a.pedidos[1];
  const pagoId = "880002";
  const pagos = { [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: `gsg:${base.a.slug}:pedido:${pedido}` } as PagoMP };
  // Estado que deja una función serverless cortada por timeout después del create y antes del handler.
  await duenio.eventoIntegracion.create({
    data: { tenantId: base.a.id, conexionId: c.a, direccion: "entrada", tipo: "pago.acreditado", idExterno: `pago:${pagoId}:req-corte`, intentos: 1, createdAt: new Date(Date.now() - 3600_000) },
  });
  const lecturas: string[] = [];
  const r = await enviarViejo(avisoViejo(pagoId, SECRETO_A, "req-corte"), pagos, lecturas);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(await pagado(duenio, pedido), `el reintento de MP se tomó como duplicado (${JSON.stringify(r.body.resultado)}): pago nunca acreditado`);
});

test("ADV-concurrencia: dos avisos NUEVOS del mismo pago (otro x-request-id) en paralelo → un solo asiento", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { base, duenio } = s;
  const pedido = base.a.pedidos[2];
  const pagoId = "880003";
  const pagos = { [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: `gsg:${base.a.slug}:pedido:${pedido}` } as PagoMP };
  const lecturas: string[] = [];
  const rs = await Promise.all(["req-p-1", "req-p-2", "req-p-3"].map((rid) => enviarViejo(avisoViejo(pagoId, SECRETO_A, rid), pagos, lecturas)));
  for (const r of rs) assert.ok(r.status === 200 || r.status === 500, JSON.stringify(r.body));
  assert.equal(await duenio.cashMovement.count({ where: { orderId: pedido } }), 1, "un solo asiento por payment_id");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.b.id, orderId: pedido } }), 0);
});

test("ADV-tope: con más de 20 negocios con el módulo MP (sin conexión), la conexión de un negocio nuevo queda invisible y su aviso válido se rechaza", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { base, duenio } = s;
  const extras: string[] = [];
  for (let i = 0; i < 20; i++) {
    const n = await duenio.tenant.create({
      data: { name: `Extra ${i}`, slug: `adv-extra-${i}-${randomBytes(3).toString("hex")}`, modules: ["mercadopago"], createdAt: new Date(Date.UTC(1971, 0, 1 + i)) },
      select: { id: true },
    });
    extras.push(n.id);
  }
  try {
    const { conexionesDelConector } = await import("@/integraciones/conexiones.server");
    const vistas = await conexionesDelConector("mercadopago");
    const quien = (id: string) => (id === base.a.id ? "A" : id === base.b.id ? "B" : "?");
    // Hay DOS conexiones activas (A y B), muy por debajo del tope de 20: las dos tienen que verse.
    const pagos = {
      "880004": { id: "880004", estado: "approved", monto: TOTAL, externalReference: `gsg:${base.b.slug}:pedido:${base.b.pedidos[0]}` } as PagoMP,
      "880014": { id: "880014", estado: "approved", monto: TOTAL, externalReference: `gsg:${base.a.slug}:pedido:${base.a.pedidos[2]}` } as PagoMP,
    };
    const lecturas: string[] = [];
    const rB = await enviarViejo(avisoViejo("880004", SECRETO_B, "req-tope-b"), pagos, lecturas);
    const rA = await enviarViejo(avisoViejo("880014", SECRETO_A, "req-tope-a"), pagos, lecturas);
    assert.ok(
      rA.status === 200 && rB.status === 200,
      `conexionesDelConector ve ${JSON.stringify(vistas?.map((v) => quien(v.tenantId)))} (corta en 21 NEGOCIOS, no en conexiones); ` +
        `aviso válido de A → ${rA.status} ${JSON.stringify(rA.body)}, de B → ${rB.status} ${JSON.stringify(rB.body)}`,
    );
  } finally {
    await duenio.tenant.deleteMany({ where: { id: { in: extras } } });
  }
});

test("ADV-reconexion: el negocio vuelve a conectar MP (misma app → mismo webhook_secret, o doble clic en dos puestos) → todos sus avisos 401 'ambigua'", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { base, duenio } = s;
  const { crearConexion } = await import("@/integraciones/conexiones.server");
  // Dos puestos a la vez, sin cuentaExterna (opcional en url-por-conexion): no hay unique que lo frene.
  const dos = await Promise.allSettled(
    [1, 2].map(() => crearConexion(base.b.id, "mercadopago", { credenciales: { access_token: "APP_USR-b", webhook_secret: SECRETO_B }, conectadaPor: "puesto" })),
  );
  const creadas = dos.filter((x) => x.status === "fulfilled").length;
  const pedido = base.b.pedidos[1];
  const pagoId = "880005";
  const pagos = { [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: `gsg:${base.b.slug}:pedido:${pedido}` } as PagoMP };
  const lecturas: string[] = [];
  const r = await enviarViejo(avisoViejo(pagoId, SECRETO_B, "req-recon-1"), pagos, lecturas);
  assert.ok(
    r.status === 200 && (await pagado(duenio, pedido)),
    `conexiones de MP activas de B: ${await duenio.integracionConexion.count({ where: { tenantId: base.b.id, conector: "mercadopago" } })} ` +
      `(alta en paralelo: ${creadas} de 2); el aviso legítimo de B da ${r.status} ${JSON.stringify(r.body)} y el pago no se acredita`,
  );
});

test("ADV-reconexion-misma-cuenta: el negocio reconecta la MISMA cuenta de MP (misma cuentaExterna) → reconecta idempotente; otro negocio sigue rechazado", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { base, duenio, c } = s;
  const m = await import("@/integraciones/conexiones.server");
  // Dos puestos reconectan la misma cuenta a la vez (doble clic o alta por OAuth repetida).
  const dos = await Promise.allSettled(
    [1, 2].map((i) =>
      m.crearConexion(base.a.id, "mercadopago", {
        cuentaExterna: "mp-adv-a",
        credenciales: { access_token: `APP_USR-a-nuevo-${i}`, webhook_secret: SECRETO_A },
        conectadaPor: "puesto",
      }),
    ),
  );
  const rechazos = dos.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => String((x.reason as { motivo?: string })?.motivo ?? x.reason));
  assert.deepEqual(rechazos, [], `reconectar la misma cuenta en el mismo negocio no puede fallar: ${rechazos.join(", ")}`);
  const hechas = dos.map((x) => (x as PromiseFulfilledResult<Awaited<ReturnType<typeof m.crearConexion>>>).value);
  assert.deepEqual(hechas.map((h) => [h.conexionId, h.reconectada]), [[c.a, true], [c.a, true]], "se reusa la conexión de A");

  const filas = await duenio.integracionConexion.findMany({ where: { tenantId: base.a.id, conector: "mercadopago" }, select: { id: true, estado: true } });
  assert.deepEqual(filas.filter((f) => f.estado !== "desconectada").map((f) => f.id), [c.a], "una sola activa");
  assert.equal(await duenio.integracionCredencial.count({ where: { conexionId: c.a } }), 2, "sin credenciales viejas colgadas");

  // El token viejo ya no entra; el último que se entregó, sí, con el token nuevo de la cuenta.
  assert.equal(await m.conexionPorToken(c.tokenA), null, "el token anterior deja de existir");
  const vigente = (await Promise.all(hechas.map(async (h) => ((await m.conexionPorToken(h.token!)) ? h : null)))).filter(Boolean);
  assert.equal(vigente.length, 1, "sólo el token de la última reconexión resuelve");
  const tokenNuevo = await m.leerCredencial(base.a.id, c.a, "access_token");
  assert.ok(tokenNuevo?.startsWith("APP_USR-a-nuevo-"), "el access_token es el de la reconexión");

  // La misma cuenta en OTRO negocio sigue rechazada, sin dejar nada a medias.
  const antesB = await duenio.integracionConexion.count({ where: { tenantId: base.b.id } });
  await assert.rejects(
    m.crearConexion(base.b.id, "mercadopago", { cuentaExterna: "mp-adv-a", credenciales: { access_token: "APP_USR-x", webhook_secret: "whsec-x-0000" } }),
    (e: unknown) => e instanceof m.ConexionError && e.motivo === "cuenta_en_uso",
  );
  assert.equal(await duenio.integracionConexion.count({ where: { tenantId: base.b.id } }), antesB);
  const filaA = await duenio.integracionConexion.findUniqueOrThrow({ where: { id: c.a }, select: { tenantId: true, estado: true } });
  assert.deepEqual([filaA.tenantId, filaA.estado], [base.a.id, "conectada"], "la conexión de A sigue de A");
  c.tokenA = vigente[0]!.token!;
});
