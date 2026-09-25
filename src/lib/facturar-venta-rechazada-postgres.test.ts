// ============================================================================
// ENG-021 · «Facturar» sobre una venta cuya factura ARCA rechazó: se vuelve a facturar.
// ============================================================================
//
// Ejecuta la Server Action REAL `facturarVenta` (guardia, Prisma con RLS, auditoría) con la
// sesión de la dueña, contra Postgres efímero, con ARCA en modo stub (el de siempre sin
// credenciales). Antes, la acción devolvía la factura rechazada y la venta quedaba sin salida.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("facturarVenta sobre una venta con factura rechazada: la misma factura se reabre y termina autorizada; B no la ve", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: sin credenciales ni red
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { createInvoice, markInvoiceRejected } = await import("@/lib/invoice-core");
  const { facturarVenta } = await import("@/lib/order-actions");

  const a = base.a;
  const pedido = a.pedidos[0];
  const tenant = await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await operatorPrisma.tenant.update({
    where: { id: a.id },
    data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, modules: [...new Set([...tenant.modules, "arca"])] },
  });
  const venta = await operatorPrisma.order.update({ where: { id: pedido }, data: { paid: true, total: 1210 } });

  // La venta ya tiene una factura que ARCA rechazó (lo que dejaba un 600 antes de ENG-021).
  const id = await createInvoice({
    tenantId: a.id,
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
  // Lo que hacía el código anterior con un 600: factura rechazada y envío cerrado (juntos).
  const envio = (await operatorPrisma.outboxEvent.findMany({ where: { tenantId: a.id, processedAt: null } })).find(
    (e) => (e.payload as { invoiceId?: string }).invoiceId === id,
  );
  assert.ok(envio);
  assert.equal(await markInvoiceRejected(id, a.id, "600: ValidacionDeToken: token invalido", envio.id), true);
  await operatorPrisma.outboxEvent.updateMany({ where: { tenantId: a.id, processedAt: null }, data: { processedAt: new Date() } });

  const fd = () => {
    const f = new FormData();
    f.set("id", venta.id);
    return f;
  };

  // El negocio B no puede facturar (ni ver) la venta de A.
  const deB = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => facturarVenta(null, fd()));
  assert.equal(deB.tipo, "respuesta");
  if (deB.tipo === "respuesta") assert.equal(deB.valor?.ok, false);
  assert.equal((await operatorPrisma.invoice.findUniqueOrThrow({ where: { id } })).status, "REJECTED");

  const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => facturarVenta(null, fd()));
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  assert.equal(r.valor?.ok, true, JSON.stringify(r.valor));
  assert.equal(r.valor?.factura.estado, "facturada", r.valor?.factura.texto);

  const facturas = await operatorPrisma.invoice.findMany({ where: { tenantId: a.id, orderId: pedido } });
  assert.equal(facturas.length, 1, "una sola factura para la venta");
  assert.equal(facturas[0].id, id, "la misma fila, reabierta");
  assert.equal(facturas[0].status, "AUTHORIZED");
  assert.equal(facturas[0].rechazoMotivo, null);

  // Queda en la auditoría quién la volvió a facturar.
  const auditoria = await operatorPrisma.auditLog.findMany({ where: { tenantId: a.id, entityId: pedido, action: "facturar" } });
  assert.equal(auditoria.length, 1);
});
