// ============================================================================
// ENG-012 · Cada negocio procesa sólo sus propios envíos a ARCA, contra Postgres real con RLS.
// ============================================================================
//
// Con `OPERATOR_DATABASE_URL` apuntando al rol dueño (el caso medido en la auditoría: esa
// conexión ve los envíos de TODOS los negocios), la acción "Procesar facturación pendiente" del
// panel de A se ejecuta TAL CUAL (Server Action real, sesión real de la dueña de A, ARCA en modo
// simulado por defecto). Antes tomaba también los envíos de B y los contaba en el resumen de A.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
    ARCA_MODO: "", // simulado (stub): lo que se mide es qué envíos se toman, no ARCA
  });
  assert.equal(process.env.OPERATOR_DATABASE_URL, base.urlDuenio, "el operador es el rol dueño: ve todos los negocios");
  prepararAccionesDeServidor();
  const { operatorPrisma } = await import("@/lib/operator-db");
  const invoiceCore = await import("@/lib/invoice-core");
  const facturacion = await import("@/lib/facturacion-actions");
  await operatorPrisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

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
      ivaPorProducto: true, // ENG-024: IVA de cada producto; sin esto un inscripto no emite.
      vencimientoPago: "20260924",
      origin: { type: "MP_PAYMENT" as const, id: `mp_eng012_${++venta}` },
    });
  const enviosDe = (tenantId: string) =>
    operatorPrisma.outboxEvent.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
      select: { id: true, attempts: true, lastError: true, processedAt: true, payload: true },
    });
  return { base, operatorPrisma, facturacion, facturar, enviosDe };
}

test("ENG-012 · la acción de A procesa sólo los envíos de A: los de B quedan intactos y el resumen cuenta sólo los de A", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = [p.base.a, p.base.b];
  // Uno de A y dos de B. (Con ARCA simulado por defecto, cada envío arma un simulador nuevo que
  // arranca en el número 1: un segundo envío del mismo negocio choca con el primero. Es previo a
  // este cambio y está anotado en BACKLOG; acá no cambia lo que se mide.)
  const deA = [await p.facturar(a.id)];
  const deB = [await p.facturar(b.id), await p.facturar(b.id)];
  const enviosDeBAntes = await p.enviosDe(b.id);

  const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => p.facturacion.procesarFacturacionPendiente());
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  assert.deepEqual(r.valor, { procesados: 1, autorizados: 1, rechazados: 0, fallidos: 0, descartados: 0 });

  assert.deepEqual(await p.enviosDe(b.id), enviosDeBAntes, "intentos, error, fecha de proceso y payload de B sin cambio");
  for (const id of deB) {
    assert.equal((await p.operatorPrisma.invoice.findUniqueOrThrow({ where: { id } })).status, "PENDING");
  }
  for (const id of deA) {
    assert.equal((await p.operatorPrisma.invoice.findUniqueOrThrow({ where: { id } })).status, "AUTHORIZED");
  }

  // Y al revés: la acción de B toma el suyo y nada de A.
  const enviosDeAAntes = await p.enviosDe(a.id);
  const rb = await ejecutarAccion({ negocio: b, usuario: b.duenia }, () => p.facturacion.procesarFacturacionPendiente());
  assert.equal(rb.tipo, "respuesta");
  if (rb.tipo !== "respuesta") return;
  // El resumen de B cuenta sus dos envíos y nada más (el segundo choca con el simulador por defecto).
  assert.equal(rb.valor.autorizados, 1);
  assert.equal(rb.valor.procesados + rb.valor.fallidos + rb.valor.descartados, 2);
  assert.deepEqual(await p.enviosDe(a.id), enviosDeAAntes);
  await p.operatorPrisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
});

test("ENG-012 · la acción de A no toma un envío de B aunque sea el único pendiente (0 procesados, B sin intentos)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = [p.base.a, p.base.b];
  await p.facturar(b.id);
  const antes = await p.enviosDe(b.id);
  const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => p.facturacion.procesarFacturacionPendiente());
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  assert.deepEqual(r.valor, { procesados: 0, autorizados: 0, rechazados: 0, fallidos: 0, descartados: 0 });
  assert.deepEqual(await p.enviosDe(b.id), antes);
  await p.operatorPrisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });
});
