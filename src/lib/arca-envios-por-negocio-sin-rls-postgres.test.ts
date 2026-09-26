// ============================================================================
// ENG-012 · «Autorizar los pendientes» cuenta sólo los pendientes del negocio, AUNQUE RLS esté
// apagado (QA vuelta 2, bloqueante 3).
// ============================================================================
//
// Con RLS apagado (`RLS_ENFORCEMENT` en off, lib/db.ts) la app no usa el cliente con RLS, y acá
// además se conecta con el rol dueño, que no pasa por las políticas de la base: si una consulta
// no filtra por negocio, ve los de todos. `quedan` (lo que devuelve «Autorizar») y `pendientes`
// (el número del botón) tienen que ser los del negocio igual, filtrando por negocio de forma
// explícita. Archivo aparte de ENG-012 porque el cliente se elige al importar (lib/db.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

test("sin RLS: lo que le queda a A y el número del botón no cuentan los pendientes de B", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    DATABASE_URL: base.urlDuenio, // el rol dueño: la base no filtra nada por negocio
    RLS_ENFORCEMENT: "off",
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
    ARCA_MODO: "",
  });
  prepararAccionesDeServidor();
  const { RLS_ENFORCEMENT } = await import("@/lib/prisma-base");
  assert.equal(RLS_ENFORCEMENT, false, "la app corre sin RLS");
  // Siembra y verificación como dueño de las tablas (ve todo): la consola ya no lo es (como producción).
  const duenio = await prismaComoDuenio(base);
  const invoiceCore = await import("@/lib/invoice-core");
  const facturacion = await import("@/lib/facturacion-actions");
  await duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

  let venta = 0;
  const facturar = (tenantId: string) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1000,
      iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
      total: 1210,
      ivaPorProducto: true,
      vencimientoPago: "20260924",
      origin: { type: "MP_PAYMENT" as const, id: `mp_sinrls_${++venta}` },
    });
  const pendientesDe = (tenantId: string) => duenio.invoice.count({ where: { tenantId, status: "PENDING" } });
  const [a, b] = [base.a, base.b];
  await facturar(a.id);
  for (let i = 0; i < 3; i++) await facturar(b.id);
  assert.equal(await pendientesDe(b.id), 3);

  const panel = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => facturacion.getPanelDeFacturacion({}));
  assert.equal(panel.tipo, "respuesta");
  if (panel.tipo !== "respuesta") return;
  assert.equal(panel.valor.fallo, false);
  assert.equal(panel.valor.estado.pendientes, 1, "el botón dice «Autorizar 1», no 1 + los 3 de B");

  const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => facturacion.procesarFacturacionPendiente());
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  assert.equal(r.valor.procesados, 1, "A mandó el suyo");
  assert.equal(r.valor.quedan, await pendientesDe(a.id), "lo que le queda a A es lo de A");
  assert.equal(r.valor.quedan, 0, "y no los 3 de B");
  assert.equal(await pendientesDe(b.id), 3, "B sigue con sus 3 pendientes, sin tocar");
  await duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
});
