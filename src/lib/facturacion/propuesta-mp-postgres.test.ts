// ============================================================================
// Propuesta de MP → contrato v1.1, en Postgres efímero (app como `app_rls`).
//  · El mismo pago guardado dos veces A LA VEZ (aviso + respaldo) → UNA propuesta.
//  · Esa propuesta emitida desde la bandeja y el mismo pago facturado por el camino automático, a la
//    vez → UNA factura, atada a la clave `mp:<id>` del libro (antes la bandeja usaba `banco:mp:<id>`).
//  · La bandeja la muestra con el estado del contrato (stub de ARCA → AUTORIZADO).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { runInTenantContext } from "@/lib/tenant-context";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

const laBase = baseEfimeraDelArchivo();

test("mismo mp:payment:<id> dos veces → una propuesta, una factura y el estado v1.1 en la bandeja", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO;
  delete env.MP_ACCESS_TOKEN;
  delete env.MP_MODO_LEGADO;
  env.INTEGRACIONES_MASTER_KEY ??= randomBytes(32).toString("base64");
  const duenio = await prismaComoDuenio(base);
  const n = base.a;
  const { crearConexion } = await import("@/integraciones/conexiones.server");
  await crearConexion(n.id, "mercadopago", { cuentaExterna: "mp-prop-a", credenciales: { access_token: "APP_USR-prop-a", webhook_secret: "secreto-prop-a" }, conectadaPor: "cli" });
  const tenant = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: n.id }, data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, modules: [...new Set([...tenant.modules, "arca"])] } });

  const { normalizarPago } = await import("@/plugins/mercadopago/http");
  const id = `prop-${randomUUID().slice(0, 8)}`;
  const pago = normalizarPago({ id, status: "approved", operation_type: "regular_payment", transaction_amount: 4321, date_approved: `${fechaFiscalDelDia().replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}T10:00:00-03:00` });
  const { armarPropuestaMP } = await import("./propuesta-mp");
  const { guardarPropuestaMP } = await import("@/lib/mercadopago-respaldo.server");
  const armada = armarPropuestaMP(pago, { tipo: "proponer", importe: 4321 }, new Date())!;

  const creadas = await Promise.all([guardarPropuestaMP(n.id, armada), guardarPropuestaMP(n.id, armada)]);
  assert.deepEqual(creadas.filter(Boolean).length, 1, "una sola de las dos la crea");
  assert.equal(await duenio.movimientoImportado.count({ where: { tenantId: n.id, hash: `mp:${id}` } }), 1);
  assert.equal(await duenio.movimientoImportado.count({ where: { tenantId: n.id, hash: `mp:payment:${id}` } }), 0);

  const antes = await duenio.invoice.count({ where: { tenantId: n.id } });
  const { emitirPropuestas } = await import("@/lib/bancos-glue");
  const { facturarPagoMP } = await import("@/lib/invoice-from-mp");
  await Promise.allSettled([emitirPropuestas(n.id, "auto"), runInTenantContext(n.id, () => facturarPagoMP(pago, n.id))]);
  // Una segunda pasada de la bandeja tampoco duplica.
  await emitirPropuestas(n.id, "auto");
  assert.equal(await duenio.invoice.count({ where: { tenantId: n.id } }), antes + 1, "una sola factura para el pago");
  const libro = await duenio.cobroFacturado.findMany({ where: { tenantId: n.id, clave: { in: [`mp:${id}`, `banco:mp:${id}`] } }, select: { clave: true, invoiceId: true } });
  assert.ok(libro.some((c) => c.clave === `mp:${id}`), "la clave del pago está en el libro");
  assert.equal(new Set(libro.map((c) => c.invoiceId)).size, 1, "todas las claves del cobro apuntan a la MISMA factura");

  // Con la factura atada, la bandeja muestra el estado del contrato.
  const mov = await duenio.movimientoImportado.findFirstOrThrow({ where: { tenantId: n.id, hash: `mp:${id}` }, select: { estadoPropuesta: true, invoiceId: true } });
  if (mov.estadoPropuesta === "emitida" && mov.invoiceId) {
    const { hechosDeLasFacturas } = await import("./hechos-comprobantes.server");
    const { estadoEnBandeja } = await import("./propuesta-mp");
    const { prisma } = await import("@/lib/prisma");
    const hechos = await runInTenantContext(n.id, () => hechosDeLasFacturas(prisma, n.id, [mov.invoiceId!]));
    const v = estadoEnBandeja("emitida", hechos.get(mov.invoiceId) ?? null, new Date());
    assert.equal(v.de, "comprobante");
    assert.ok(["AUTORIZADO", "EN_COLA", "EMITIENDO"].includes(v.estado), `estado ${v.estado}`);
    // Otro negocio no ve los hechos de esa factura.
    const ajenos = await runInTenantContext(base.b.id, () => hechosDeLasFacturas(prisma, base.b.id, [mov.invoiceId!]));
    assert.equal(ajenos.size, 0);
  }
});
