// ============================================================================
// Webhook de Mercado Pago con DOS negocios (Tanda S1, contra Postgres con RLS)
// ============================================================================
//
// El aviso real (`atenderAvisoMP`: firma, resolución del negocio por `external_reference`,
// `runInTenantContext`, cobro del pedido con `cobrarPedidoPorAvisoDePago`, auditoría) contra una
// base efímera con dos negocios ("magra" = A, "breakpoint" = B). Lo único falso es la cuenta de
// Mercado Pago (la red): `leerPago` devuelve el pago que el test arma.
//
//  · un aviso de A cobra el pedido de A y no toca NINGUNA fila de B (consulta cruzada = 0);
//  · el reenvío (en serie y en paralelo) no duplica el cobro: un solo asiento;
//  · una referencia de B que llega por la URL de A → 200 sin efecto + AuditLog `rechazado` en B;
//  · sin referencia → 200 sin efecto.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { buildManifest } from "@/plugins/mercadopago/signature";
import type { PagoMP } from "@/plugins/mercadopago";

const laBase = baseEfimeraDelArchivo();
const TOTAL = 5000;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  delete env.MP_ACCESS_TOKEN;
  delete env.ARCA_INVOICING_ENABLED; // facturación APAGADA: el cobro del pedido no depende de ella
  delete env.MP_WEBHOOK_SECRET;
  const duenio = await prismaComoDuenio(base);
  for (const n of [base.a, base.b]) {
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: { push: "mercadopago" } } });
    await duenio.order.updateMany({ where: { tenantId: n.id }, data: { total: TOTAL } });
  }
  return { base, duenio };
}

const secretos = (base: BaseEfimera) => ({ [base.a.slug]: "sec-a", [base.b.slug]: "sec-b" });

function aviso(paymentId: string, secreto: string, host: string): Request {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", secreto).update(buildManifest(paymentId, "req-x", ts)).digest("hex");
  return new Request(`https://${host}/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, {
    method: "POST",
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-x", host },
    body: JSON.stringify({ type: "payment", action: "payment.updated", data: { id: paymentId } }),
  });
}

async function enviar(base: BaseEfimera, req: Request, pagos: Record<string, PagoMP>) {
  const { atenderAvisoMP, DEPS_AVISO_MP } = await import("@/lib/mercadopago-dispatch");
  const r = await atenderAvisoMP(req, {
    ...DEPS_AVISO_MP,
    env: { ...process.env, MP_WEBHOOK_SECRETS: JSON.stringify(secretos(base)) },
    leerPago: async (id) => {
      const p = pagos[id];
      if (!p) throw new Error(`pago ${id} inexistente`);
      return p;
    },
    limitar: () => null,
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

/** Todo lo de B que un aviso podría tocar. */
async function fotoDeB(duenio: Awaited<ReturnType<typeof prismaComoDuenio>>, base: BaseEfimera) {
  const [pedidos, movimientos, auditoria] = await Promise.all([
    duenio.order.findMany({ where: { tenantId: base.b.id }, select: { id: true, paid: true, paymentMethod: true }, orderBy: { id: "asc" } }),
    duenio.cashMovement.count({ where: { tenantId: base.b.id } }),
    duenio.auditLog.count({ where: { tenantId: base.b.id } }),
  ]);
  return { pedidos, movimientos, auditoria };
}

test("aviso de A cobra el pedido de A, B no cambia, y el reenvío no duplica el cobro", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const pedidoA = base.a.pedidos[0];
  const pagoId = "880001";
  const pagos: Record<string, PagoMP> = {
    [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: `gsg:${base.a.slug}:pedido:${pedidoA}` } as PagoMP,
  };
  const antesB = await fotoDeB(duenio, base);

  // Llega por la URL genérica del despliegue: el negocio sale de la referencia, no del host.
  const r1 = await enviar(base, aviso(pagoId, "sec-a", "erp-ch.vercel.app"), pagos);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const pedido = await duenio.order.findUniqueOrThrow({ where: { id: pedidoA }, select: { paid: true, paymentMethod: true, tenantId: true } });
  assert.equal(pedido.paid, true);
  assert.equal(pedido.paymentMethod, "MERCADOPAGO");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.a.id, orderId: pedidoA } }), 1);

  // Reenvío en serie y dos en paralelo: sigue habiendo UN asiento.
  const r2 = await enviar(base, aviso(pagoId, "sec-a", "erp-ch.vercel.app"), pagos);
  assert.equal(r2.status, 200);
  const par = await Promise.all([
    enviar(base, aviso(pagoId, "sec-a", base.a.host), pagos),
    enviar(base, aviso(pagoId, "sec-a", "erp-ch.vercel.app"), pagos),
  ]);
  for (const x of par) assert.equal(x.status, 200, JSON.stringify(x.body));
  assert.equal(await duenio.cashMovement.count({ where: { orderId: pedidoA } }), 1);

  // Consulta cruzada: nada de B tocado, nada de A escrito con el tenant de B.
  assert.deepEqual(await fotoDeB(duenio, base), antesB);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.b.id, orderId: { in: base.a.pedidos } } }), 0);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.b.id, entityId: { in: [pagoId, pedidoA] } } }), 0);
});

test("referencia de B que llega por la URL de A → 200 sin efecto y AuditLog rechazado en B", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const pedidoB = base.b.pedidos[0];
  const pagoId = "880002";
  const pagos: Record<string, PagoMP> = {
    [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: `gsg:${base.b.slug}:pedido:${pedidoB}` } as PagoMP,
  };
  const r = await enviar(base, aviso(pagoId, "sec-b", base.a.host), pagos);
  assert.equal(r.status, 200);
  assert.equal(r.body.rechazado, "host-de-otro-negocio");
  const pedido = await duenio.order.findUniqueOrThrow({ where: { id: pedidoB }, select: { paid: true } });
  assert.equal(pedido.paid, false);
  const filas = await duenio.auditLog.findMany({ where: { entityId: pagoId }, select: { tenantId: true, action: true, channel: true } });
  assert.deepEqual(filas, [{ tenantId: base.b.id, action: "rechazado", channel: "webhook" }]);
});

test("firmado con el secreto de A para un pago de B → 401, sin cobro", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const pedidoB = base.b.pedidos[1];
  const pagoId = "880003";
  const pagos: Record<string, PagoMP> = {
    [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: `gsg:${base.b.slug}:pedido:${pedidoB}` } as PagoMP,
  };
  const r = await enviar(base, aviso(pagoId, "sec-a", "erp-ch.vercel.app"), pagos);
  assert.equal(r.status, 401);
  assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: pedidoB }, select: { paid: true } })).paid, false);
});

test("sin external_reference con dos negocios → 200 sin efecto", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const pagoId = "880004";
  const movAntes = await duenio.cashMovement.count();
  const r = await enviar(base, aviso(pagoId, "sec-a", "erp-ch.vercel.app"), {
    [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: "" } as PagoMP,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.rechazado, "referencia-ausente");
  assert.equal(await duenio.cashMovement.count(), movAntes);
});

// ── Vuelta 3: el EMISOR. El link que genera la pantalla lleva el negocio (QA de S1, paso 1) ──────

test("QA S1 paso 1: el link real de un pedido de A lleva gsg:<A>:pedido:<id> y su aviso lo cobra en A; B no cambia", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const env = process.env as Record<string, string | undefined>;
  delete env.MP_MODO; // stub
  env.MP_SIMULAR_AVISOS = "1"; // en stub, el link de un pedido sólo se ofrece con el simulador
  const { ejecutarAccion } = await import("@/test/accion-de-servidor");
  const { generarLinkDePagoDePedido } = await import("@/lib/cobros-actions");
  const { ACCION_LINK_DE_PAGO } = await import("@/app/admin/(dashboard)/pedidos/link-de-pago");
  const pedidoA = base.a.pedidos[2];
  const fd = new FormData();
  fd.set("id", pedidoA);
  const salida = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => generarLinkDePagoDePedido(null, fd));
  assert.equal(salida.tipo, "respuesta");
  assert.ok(salida.tipo === "respuesta" && salida.valor?.ok, JSON.stringify(salida));
  const fila = await duenio.auditLog.findFirstOrThrow({
    where: { tenantId: base.a.id, entity: "Order", entityId: pedidoA, action: ACCION_LINK_DE_PAGO },
    select: { changes: true },
  });
  const ref = (fila.changes as { referenciaMP?: string } | null)?.referenciaMP;
  assert.equal(ref, `gsg:${base.a.slug}:pedido:${pedidoA}`);

  const antesB = await fotoDeB(duenio, base);
  const pagoId = "880005";
  const pagos: Record<string, PagoMP> = { [pagoId]: { id: pagoId, estado: "approved", monto: TOTAL, externalReference: ref } as PagoMP };
  const r = await enviar(base, aviso(pagoId, "sec-a", "erp-ch.vercel.app"), pagos);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: pedidoA }, select: { paid: true } })).paid, true);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.a.id, orderId: pedidoA } }), 1);
  assert.deepEqual(await fotoDeB(duenio, base), antesB);
});

test("link manual: A no puede escribir una referencia gsg: de B; la suya sale con su negocio", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  delete (process.env as Record<string, string | undefined>).MP_MODO; // stub
  const { ejecutarAccion } = await import("@/test/accion-de-servidor");
  const { generarCobro } = await import("@/lib/cobros-actions");
  const conRef = (referencia: string) => {
    const fd = new FormData();
    fd.set("concepto", "Seña");
    fd.set("monto", "1000");
    fd.set("referenciaExterna", referencia);
    return ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => generarCobro(fd));
  };
  const spoof = await conRef(`gsg:${base.b.slug}:pedido:${base.b.pedidos[0]}`);
  assert.ok(spoof.tipo === "respuesta" && spoof.valor.ok === false, JSON.stringify(spoof));
  assert.equal(await duenio.auditLog.count({ where: { entity: "PaymentLink", changes: { path: ["referenciaExterna"], string_contains: "gsg:" } } }), 0);

  const turno = await conRef("apt_1");
  assert.ok(turno.tipo === "respuesta" && turno.valor.ok, JSON.stringify(turno));
  const fila = await duenio.auditLog.findFirstOrThrow({
    where: { tenantId: base.a.id, entity: "PaymentLink", action: "create" },
    orderBy: { createdAt: "desc" },
    select: { changes: true },
  });
  assert.equal((fila.changes as { referenciaMP?: string }).referenciaMP, `gsg:${base.a.slug}:turno:apt_1`);
});

// ── Vuelta 3: ¿S1 encuentra el negocio con RLS? (pregunta del certificador de P1) ─────────────────
// La resolución de S1 lee SÓLO `Tenant` (basePrisma: slug, subdominio, primerosDos), que está fuera
// de RLS a propósito (prisma/rls/0001_enable_rls.sql: «EXCLUIDA a propósito: "Tenant"») y que
// `app_rls` puede leer (0002_app_role.sql: GRANT SELECT … ON ALL TABLES). No necesita funciones
// SECURITY DEFINER. La búsqueda por CONEXIÓN de P1 sí: sin el GUC del negocio, `app_rls` no ve
// ninguna fila de `IntegracionConexion`. `SET LOCAL ROLE app_rls` hace que la prueba valga también
// cuando el servidor de prueba conecta como superusuario (PGlite).

test("RLS: como app_rls y SIN negocio en el GUC, S1 encuentra el Tenant por slug/subdominio; la conexión de P1 no se ve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  await duenio.integracionConexion.create({ data: { tenantId: base.a.id, conector: "mercadopago", cuentaExterna: "999000111", estado: "conectada" } });
  const pg = (await import("pg")).default;
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE app_rls");
    const quien = await c.query("SELECT current_user AS u, current_setting('app.current_tenant_id', true) AS guc");
    assert.equal(quien.rows[0].u, "app_rls");
    assert.ok(!quien.rows[0].guc, "sin negocio en el GUC");
    // Las tres lecturas de depsResolverDesdeBase / del webhook de WhatsApp.
    const porSlug = await c.query('SELECT id FROM "Tenant" WHERE slug = $1', [base.a.slug]);
    assert.deepEqual(porSlug.rows, [{ id: base.a.id }]);
    const porSub = await c.query('SELECT id FROM "Tenant" WHERE subdomain = $1', [base.b.slug]);
    assert.deepEqual(porSub.rows, [{ id: base.b.id }]);
    const dos = await c.query('SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 2');
    assert.equal(dos.rows.length, 2);
    // Lo que S1 NO hace y P1 sí: buscar la conexión por cuenta sin saber el negocio → 0 filas.
    const conexion = await c.query('SELECT "tenantId" FROM "IntegracionConexion" WHERE conector = $1 AND "cuentaExterna" = $2', ["mercadopago", "999000111"]);
    assert.equal(conexion.rows.length, 0, "app_rls sin GUC no ve IntegracionConexion");
    // …y con el GUC del negocio dueño, sí (la policy filtra, no falta el permiso).
    await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [base.a.id]);
    const conGuc = await c.query('SELECT "tenantId" FROM "IntegracionConexion" WHERE conector = $1 AND "cuentaExterna" = $2', ["mercadopago", "999000111"]);
    assert.deepEqual(conGuc.rows, [{ tenantId: base.a.id }]);
    await c.query("ROLLBACK");
  } finally {
    await c.end();
    await duenio.integracionConexion.deleteMany({ where: { cuentaExterna: "999000111" } });
  }
});
