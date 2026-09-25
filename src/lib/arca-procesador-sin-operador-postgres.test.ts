// ============================================================================
// ENG-027 · Si falta la conexión del operador, el procesador de ARCA lo dice, contra Postgres
// real con RLS.
// ============================================================================
//
// Entorno de producción SIN `OPERATOR_DATABASE_URL`: la conexión del operador cae a
// `DATABASE_URL` (`app_rls`), que por RLS no ve los envíos de ningún negocio. Antes el
// procesador devolvía "0 procesados" y ninguna factura se autorizaba, sin aviso. Se ejecutan de
// verdad `processArcaOutbox`, la ruta del cron y `/api/ready`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  delete env.OPERATOR_DATABASE_URL; // el caso de ENG-027
  Object.assign(env, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
    ARCA_MODO: "",
    ARCA_INVOICING_ENABLED: "true",
    CRON_SECRET: "secreto-de-prueba",
  });
  const { PrismaClient } = await import("@/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const invoiceCore = await import("@/lib/invoice-core");
  const dispatch = await import("@/lib/arca-dispatch");
  const reserva = await import("@/lib/arca-reserva");
  const duenio = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.urlDuenio }) });
  base.alBorrar(() => duenio.$disconnect());
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
      ivaPorProducto: true, // ENG-024: IVA de cada producto; sin esto un inscripto no emite.
      vencimientoPago: "20260924",
      origin: { type: "MP_PAYMENT" as const, id: `mp_eng027_${++venta}` },
    });
  const pendientes = () =>
    duenio.outboxEvent.findMany({ where: { processedAt: null }, select: { tenantId: true, attempts: true } });
  return { base, duenio, dispatch, reserva, facturar, pendientes };
}

test("ENG-027 · sin OPERATOR_DATABASE_URL (app_rls): el procesador lanza un error de configuración, el cron responde error y /api/ready 503; con el rol dueño procesa los dos negocios", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.facturar(p.base.a.id);
  await p.facturar(p.base.b.id);

  // Criterio 1: no devuelve "0 procesados": lanza.
  await assert.rejects(p.dispatch.processArcaOutbox(), (err: unknown) => {
    assert.ok(err instanceof p.reserva.ProcesadorArcaSinAccesoError);
    assert.match(err.message, /^procesador de ARCA sin acceso: falta OPERATOR_DATABASE_URL/);
    return true;
  });
  assert.deepEqual(
    (await p.pendientes()).map((e) => e.attempts),
    [0, 0],
    "nadie tocó los pendientes",
  );

  // …y el cron responde error con el motivo.
  const { GET: cron } = await import("@/app/api/cron/arca-outbox/route");
  const { NextRequest } = await import("next/server");
  const pedidoCron = new NextRequest("http://negocio-a.erp.test/api/cron/arca-outbox", {
    headers: { authorization: "Bearer secreto-de-prueba" },
  });
  const rc = await cron(pedidoCron);
  assert.equal(rc.status, 500);
  assert.deepEqual(await rc.json(), { ok: false, error: "procesador de ARCA sin acceso" });

  // Criterio 3: /api/ready 503 con el motivo.
  const { GET: ready } = await import("@/app/api/ready/route");
  const rr = await ready(new Request("http://negocio-a.erp.test/api/ready"));
  assert.equal(rr.status, 503);
  const cuerpo = (await rr.json()) as { status: string; motivo: string };
  assert.equal(cuerpo.status, "not-ready");
  assert.equal(cuerpo.motivo, "procesador de ARCA sin acceso");
  assert.doesNotMatch(JSON.stringify(cuerpo), /app_rls|OutboxEvent/, "la respuesta pública no nombra roles ni tablas");

  // Criterio 2: con el rol dueño como operador, el mismo procesador toma los de los dos negocios.
  const r = await p.dispatch.processArcaOutbox(20, undefined, p.duenio);
  assert.deepEqual(r, { procesados: 2, autorizados: 2, rechazados: 0, fallidos: 0, descartados: 0 });
  assert.deepEqual(await p.pendientes(), []);
});

test("ENG-027 · con la facturación apagada /api/ready no mira el procesador (sigue 200 aunque falte el operador)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  process.env.ARCA_INVOICING_ENABLED = "false";
  t.after(() => void (process.env.ARCA_INVOICING_ENABLED = "true"));
  const { GET: ready } = await import("@/app/api/ready/route");
  const rr = await ready(new Request("http://negocio-a.erp.test/api/ready"));
  assert.equal(rr.status, 200);
});

test("ENG-027 · un rol que no es dueño ni tiene BYPASSRLS, puesto como OPERATOR_DATABASE_URL, también es error de configuración", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { PrismaClient } = await import("@/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const comoApp = new PrismaClient({ adapter: new PrismaPg({ connectionString: p.base.urlApp }) });
  t.after(() => comoApp.$disconnect());
  await assert.rejects(
    p.reserva.verificarAccesoDelOperador(comoApp, { OPERATOR_DATABASE_URL: p.base.urlApp }),
    /^ProcesadorArcaSinAccesoError: procesador de ARCA sin acceso: OPERATOR_DATABASE_URL usa el rol app_rls/,
  );
  await p.reserva.verificarAccesoDelOperador(p.duenio, { OPERATOR_DATABASE_URL: p.base.urlDuenio });
});
