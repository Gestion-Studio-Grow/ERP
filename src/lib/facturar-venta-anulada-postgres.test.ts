// ============================================================================
// ENG-023 · Del lado de la factura: un pedido anulado no se factura (contra Postgres)
// ============================================================================
//
// La anulación ya rechaza una venta con factura autorizada o en camino (porción 2). Faltaba la
// otra punta: `createInvoiceInTx` (invoice-core.ts) no miraba el pedido, así que
//   · `facturarOrden` facturaba un pedido CANCELLED, y
//   · una facturación y una anulación simultáneas podían terminar las dos: pedido anulado con
//     su factura viva.
// Ahora la facturación de un pedido toma la fila del pedido (FOR SHARE, sólo si no está
// anulado) antes de crear o reabrir la factura. Se ejecuta el código real (facturarOrden, las
// Server Actions `facturarVenta` y `anularVenta`) contra una base efímera con RLS; la otra
// transacción de cada carrera se sostiene abierta a mano para fijar el orden.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { runInTenantContext } from "@/lib/tenant-context";

const laBase = baseEfimeraDelArchivo();

/** Una puerta que el test abre cuando quiere. */
function puerta() {
  let abrir!: () => void;
  const abierta = new Promise<void>((r) => (abrir = r));
  return { abrir, abierta };
}

/** true si la promesa sigue sin resolverse después de `ms`: está esperando el bloqueo. */
async function sigueEsperando(p: Promise<unknown>, ms = 400): Promise<boolean> {
  const marca = Symbol("esperando");
  const r = await Promise.race([p.then(() => null, () => null), new Promise((ok) => setTimeout(() => ok(marca), ms))]);
  return r === marca;
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const { operatorPrisma } = await import("@/lib/operator-db");
  const tenant = await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: base.a.id }, select: { modules: true } });
  await operatorPrisma.tenant.update({
    where: { id: base.a.id },
    data: {
      arcaCuit: "20111111112",
      arcaPuntoVenta: 1,
      arcaHomologacion: true,
      modules: [...new Set([...tenant.modules, "arca"])],
    },
  });
  const cuentas = async (orderId: string) => ({
    facturas: await operatorPrisma.invoice.count({ where: { tenantId: base.a.id, orderId } }),
    envios: (await operatorPrisma.outboxEvent.findMany({ where: { tenantId: base.a.id } })).length,
  });
  return { base, operatorPrisma, cuentas };
}

test("facturar un pedido anulado no crea factura ni envío; con una rechazada, no la reabre", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma } = p;
  const { facturarOrden } = await import("@/lib/invoice-from-order");
  const { createInvoice, VentaAnuladaError } = await import("@/lib/invoice-core");
  const [anulado, anuladoConRechazada] = base.a.pedidos;
  const enviosAntes = (await p.cuentas(anulado)).envios;

  await operatorPrisma.order.update({ where: { id: anulado }, data: { paid: true, total: 1210, status: "CANCELLED" } });
  await assert.rejects(
    runInTenantContext(base.a.id, () => facturarOrden(anulado, base.a.id)),
    (e: unknown) => e instanceof VentaAnuladaError && /anulada/.test(e.message),
  );
  const tras = await p.cuentas(anulado);
  assert.equal(tras.facturas, 0, "ninguna factura para el pedido anulado");
  assert.equal(tras.envios, enviosAntes, "ningún envío a ARCA");

  // La anulación deja pasar una venta con la factura RECHAZADA (porción 2). Después, «Volver a
  // facturar» no puede reabrirla: la venta ya no existe como venta.
  await operatorPrisma.order.update({ where: { id: anuladoConRechazada }, data: { paid: true, total: 1210 } });
  const id = await runInTenantContext(base.a.id, () =>
    createInvoice({
      tenantId: base.a.id,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1210,
      iva: [{ alicuotaId: 3, base: 1210, importe: 0 }],
      total: 1210,
      vencimientoPago: "20260924",
      origin: { type: "ORDER", id: anuladoConRechazada },
    }),
  );
  await operatorPrisma.invoice.update({ where: { id }, data: { status: "REJECTED", rechazoMotivo: "10015: prueba" } });
  await operatorPrisma.outboxEvent.updateMany({ where: { tenantId: base.a.id, processedAt: null }, data: { processedAt: new Date() } });
  await operatorPrisma.order.update({ where: { id: anuladoConRechazada }, data: { status: "CANCELLED" } });
  const abiertosAntes = await operatorPrisma.outboxEvent.count({ where: { tenantId: base.a.id, processedAt: null } });

  await assert.rejects(
    runInTenantContext(base.a.id, () => facturarOrden(anuladoConRechazada, base.a.id, undefined, { reabrirSiRechazada: true })),
    VentaAnuladaError,
  );
  const f = await operatorPrisma.invoice.findUniqueOrThrow({ where: { id } });
  assert.equal(f.status, "REJECTED", "la factura rechazada no se reabrió");
  assert.equal(await operatorPrisma.outboxEvent.count({ where: { tenantId: base.a.id, processedAt: null } }), abiertosAntes);
});

test("anulación primero: «Facturar» espera el bloqueo del pedido y termina sin factura, con el motivo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma } = p;
  const { facturarVenta } = await import("@/lib/order-actions");
  const pedido = base.a.pedidos[2];
  await operatorPrisma.order.update({ where: { id: pedido }, data: { paid: true, total: 1210, status: "DELIVERED" } });

  // La anulación tomó la fila (su compare-and-set es este mismo UPDATE) y todavía no confirmó.
  const soltar = puerta();
  const tomada = puerta();
  const anulacion = operatorPrisma.$transaction(async (tx) => {
    await tx.order.updateMany({ where: { id: pedido, status: { not: "CANCELLED" } }, data: { status: "CANCELLED" } });
    tomada.abrir();
    await soltar.abierta;
  }, { timeout: 15_000 });
  await tomada.abierta;

  const fd = new FormData();
  fd.set("id", pedido);
  const facturacion = ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => facturarVenta(null, fd));
  assert.equal(await sigueEsperando(facturacion), true, "la facturación tiene que esperar a la anulación");
  soltar.abrir();
  await anulacion;

  const r = await facturacion;
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  assert.equal(r.valor?.ok, false, JSON.stringify(r.valor));
  assert.match(String((r.valor as { error?: string }).error), /La venta está anulada/);
  assert.equal((await p.cuentas(pedido)).facturas, 0, "el pedido anulado quedó sin factura");
});

test("facturación primero: «Anular venta» espera, ve la factura en camino y no anula", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma } = p;
  const { createInvoiceInTx } = await import("@/lib/invoice-core");
  const { anularVenta } = await import("@/lib/order-actions");
  // En el negocio B: un pedido sin historia de facturas (los de A los usan los otros tests).
  const b = base.b;
  const pedido = b.pedidos[0];
  await operatorPrisma.order.update({ where: { id: pedido }, data: { paid: true, total: 1210, status: "DELIVERED" } });

  // La facturación creó la factura (con la fila del pedido tomada) y todavía no confirmó.
  const soltar = puerta();
  const creada = puerta();
  const facturacion = operatorPrisma.$transaction(async (tx) => {
    await createInvoiceInTx(tx as never, {
      tenantId: b.id,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1210,
      iva: [{ alicuotaId: 3, base: 1210, importe: 0 }],
      total: 1210,
      vencimientoPago: "20260924",
      origin: { type: "ORDER", id: pedido },
    });
    creada.abrir();
    await soltar.abierta;
  }, { timeout: 15_000 });
  await creada.abierta;

  const fd = new FormData();
  fd.set("id", pedido);
  fd.set("motivo", "El cliente devolvió la mercadería");
  const anulacion = ejecutarAccion({ negocio: b, usuario: b.duenia }, () =>
    anularVenta({ ok: false, error: "" } as never, fd),
  );
  assert.equal(await sigueEsperando(anulacion), true, "la anulación tiene que esperar a la facturación");
  soltar.abrir();
  await facturacion;

  const r = await anulacion;
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  assert.equal(r.valor?.ok, false, JSON.stringify(r.valor));
  assert.match(String((r.valor as { error?: string }).error), /esperando la respuesta de ARCA/);
  const o = await operatorPrisma.order.findUniqueOrThrow({ where: { id: pedido }, select: { status: true } });
  assert.equal(o.status, "DELIVERED", "el pedido no quedó anulado");
  const facturas = await operatorPrisma.invoice.findMany({ where: { orderId: pedido }, select: { tenantId: true, status: true } });
  assert.deepEqual(facturas, [{ tenantId: b.id, status: "PENDING" }], "una sola factura, en camino");
});
