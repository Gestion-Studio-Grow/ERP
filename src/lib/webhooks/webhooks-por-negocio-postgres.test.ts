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
    // Tanda P1: sin conexiones en la base, lo de S1 corre como camino legado (con el flag).
    env: { ...process.env, MP_MODO_LEGADO: "1", MP_WEBHOOK_SECRETS: JSON.stringify(secretos(base)) },
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
