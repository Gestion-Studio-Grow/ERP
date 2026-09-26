// ============================================================================
// El cron de ARCA sin una conexión que vea todo: despacha los envíos de TODOS los negocios, cada
// uno parado en el suyo. Contra Postgres real con RLS.
// ============================================================================
//
// ENG-027 (2026-09-25) exigía que la conexión del operador salteara RLS para que el cron viera los
// envíos de todos los negocios; si no, el cron fallaba con "procesador de ARCA sin acceso" y
// `/api/ready` respondía 503. En producción esa conexión está sujeta a RLS (26/09/2026) y no se le
// da un rol exento (src/lib/operator-db.ts): el cron no despachaba nada. Ahora recorre los negocios
// de `Tenant` y toma cada envío parado en el suyo (src/lib/arca-dispatch.ts).
//
// Acá la conexión de la consola cae a la de la app (`app_rls`: se saca `OPERATOR_DATABASE_URL`, el
// caso de ENG-027, que en la base es lo mismo que la consola de producción) y se ejecutan de verdad
// `processArcaOutbox`, la ruta del cron y `/api/ready`:
//   · el cron encuentra el envío de cada negocio y lo despacha en su negocio;
//   · la falla de ARCA de un negocio queda en SU envío y no toca el del otro;
//   · `/api/ready` no marca "no listo" por la conexión de la consola.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
/** Un pago por venta en todo el archivo: la factura es idempotente por su origen. */
let venta = 0;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  delete env.OPERATOR_DATABASE_URL; // la consola cae a DATABASE_URL (app_rls)
  Object.assign(env, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
    ARCA_MODO: "",
    ARCA_INVOICING_ENABLED: "true",
    CRON_SECRET: "secreto-de-prueba",
  });
  const invoiceCore = await import("@/lib/invoice-core");
  const dispatch = await import("@/lib/arca-dispatch");
  const { operatorPrisma } = await import("@/lib/operator-db");
  const duenio = await prismaComoDuenio(base);
  await duenio.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

  // El simulador de ARCA por defecto arranca cada envío en el número 1: cada test factura con su
  // propio punto de venta para no chocar con lo que autorizó el anterior (la base es del archivo).
  const facturar = (tenantId: string, puntoVenta: number) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1000,
      iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
      total: 1210,
      ivaPorProducto: true, // ENG-024: IVA de cada producto; sin esto un inscripto no emite.
      vencimientoPago: "20260924",
      origin: { type: "MP_PAYMENT" as const, id: `mp_cron_rls_${++venta}` },
    });
  const envioDe = (invoiceId: string) =>
    duenio.outboxEvent.findFirstOrThrow({
      where: { payload: { path: ["invoiceId"], equals: invoiceId } },
      select: { tenantId: true, attempts: true, lastError: true, processedAt: true, payload: true },
    });
  const estadoDe = async (invoiceId: string) =>
    (await duenio.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { status: true } })).status;
  return { base, duenio, invoiceCore, dispatch, operatorPrisma, facturar, envioDe, estadoDe };
}

test("cron de ARCA con la consola sujeta a RLS: encuentra el envío de cada negocio y lo despacha en el suyo; la falla de A queda en A y B se autoriza", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  assert.equal(await p.operatorPrisma.outboxEvent.count(), 0, "la conexión de la consola no ve envíos sin negocio: está sujeta a RLS");
  const [A, B] = [p.base.a.id, p.base.b.id];
  const deA = await p.facturar(A, 1);
  const deB = await p.facturar(B, 1);

  // ARCA no contesta para A (error pasajero); para B, el simulador de siempre.
  const deps = {
    clientePara: async (tenantId: string) => {
      if (tenantId === A) throw new Error("ARCA no contestó (simulado para A)");
      return p.dispatch.clientePara(tenantId);
    },
    numeroUsadoPorOtraFactura: p.invoiceCore.numeroUsadoPorOtraFactura,
  };
  const r = await p.dispatch.processArcaOutbox(20, deps);
  assert.deepEqual(r, { procesados: 1, autorizados: 1, rechazados: 0, fallidos: 1, descartados: 0 });

  // A: su envío sigue pendiente, con el intento y el motivo anotados en SU fila, y sin reserva.
  const envioA = await p.envioDe(deA);
  assert.equal(envioA.tenantId, A);
  assert.equal(envioA.processedAt, null);
  assert.equal(envioA.attempts, 1);
  assert.match(envioA.lastError ?? "", /ARCA no contestó \(simulado para A\)/);
  assert.equal((envioA.payload as { reserva?: unknown }).reserva, undefined, "la reserva se soltó");
  assert.equal(await p.estadoDe(deA), "PENDING");

  // B: autorizada y su envío cerrado, sin rastro de la falla de A.
  const envioB = await p.envioDe(deB);
  assert.equal(envioB.tenantId, B);
  assert.notEqual(envioB.processedAt, null);
  assert.equal(envioB.attempts, 0);
  assert.equal(envioB.lastError, null);
  assert.equal(await p.estadoDe(deB), "AUTHORIZED");

  // La próxima corrida reintenta el de A (ARCA ya contesta) y no vuelve a tocar el de B.
  const r2 = await p.dispatch.processArcaOutbox(20);
  assert.deepEqual(r2, { procesados: 1, autorizados: 1, rechazados: 0, fallidos: 0, descartados: 0 });
  assert.equal(await p.estadoDe(deA), "AUTHORIZED");
  assert.deepEqual(await p.envioDe(deB), envioB);
});

test("la ruta del cron sin OPERATOR_DATABASE_URL responde ok y despacha lo de los dos negocios; /api/ready 200 con la facturación encendida o apagada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [deA, deB] = [await p.facturar(p.base.a.id, 2), await p.facturar(p.base.b.id, 2)];

  const { GET: cron } = await import("@/app/api/cron/arca-outbox/route");
  const { NextRequest } = await import("next/server");
  const rc = await cron(
    new NextRequest("http://negocio-a.erp.test/api/cron/arca-outbox", { headers: { authorization: "Bearer secreto-de-prueba" } }),
  );
  assert.equal(rc.status, 200);
  assert.deepEqual(await rc.json(), { ok: true, procesados: 2, autorizados: 2, rechazados: 0, fallidos: 0, descartados: 0 });
  assert.equal(await p.estadoDe(deA), "AUTHORIZED");
  assert.equal(await p.estadoDe(deB), "AUTHORIZED");

  const { GET: ready } = await import("@/app/api/ready/route");
  const encendida = await ready(new Request("http://negocio-a.erp.test/api/ready"));
  assert.equal(encendida.status, 200, `con la facturación encendida: ${await encendida.clone().text()}`);
  process.env.ARCA_INVOICING_ENABLED = "false";
  t.after(() => void (process.env.ARCA_INVOICING_ENABLED = "true"));
  const apagada = await ready(new Request("http://negocio-a.erp.test/api/ready"));
  assert.equal(apagada.status, 200);
});
