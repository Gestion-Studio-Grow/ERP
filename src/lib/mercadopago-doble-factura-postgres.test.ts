// ============================================================================
// Un cobro de Mercado Pago, una sola factura: el turno cobrado por link y «Sincronizar Mercado
// Pago» (contra Postgres)
// ============================================================================
//
// El turno cobrado con el link de Mercado Pago (external_reference = id del turno) lo factura el
// aviso de MP por el turno (`facturarAppointment`, origen APPOINTMENT). Después, «Sincronizar
// Mercado Pago» trae el historial de la cuenta y lo pasaba entero por la ingesta de ventas
// sueltas: el clasificador lo daba por facturable (sólo mira el tipo de operación), la
// idempotencia sólo buscaba en los movimientos importados (el aviso del turno no escribe ahí) y
// `facturarPagoMP` emitía OTRA Factura C, origen MP_PAYMENT, con otra clave de unicidad. Dos CAE
// por un solo ingreso, y el sistema no emite nota de crédito para anular la segunda.
// Se ejecuta el código real: `facturarAppointment` (lo que corre el aviso del turno) y la ingesta
// real del negocio (`crearEntornoReal` → `sincronizarPagos`: clasificador con las reglas del
// dueño, conciliación en `MovimientoImportado`, `facturarPagoMP`, despacho a ARCA en modo stub)
// contra una base efímera con RLS. Lo único de mentira es la cuenta de Mercado Pago (la red).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { runInTenantContext } from "@/lib/tenant-context";

const laBase = baseEfimeraDelArchivo();

// El ARCA de prueba (stub) numera desde 1 en cada despacho: cada test usa su propio negocio para
// que la segunda factura de un mismo negocio no choque con el número de la primera.
async function preparar(t: import("node:test").TestContext, cual: "a" | "b") {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  delete env.MP_ACCESS_TOKEN;
  const { operatorPrisma } = await import("@/lib/operator-db");
  const a = base[cual];
  const tenant = await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await operatorPrisma.tenant.update({
    where: { id: a.id },
    data: {
      arcaCuit: "20111111112",
      arcaPuntoVenta: 1,
      arcaHomologacion: true,
      modules: [...new Set([...tenant.modules, "arca"])],
    },
  });
  const box = await operatorPrisma.box.create({ data: { tenantId: a.id, name: "Gabinete 1" } });
  const prof = await operatorPrisma.professional.create({ data: { tenantId: a.id, name: "Lucía" } });
  const serv = await operatorPrisma.service.create({ data: { tenantId: a.id, name: "Limpieza facial", durationMin: 60, price: 18000 } });

  /** Un turno cobrado con el link de Mercado Pago (el pago aprobado, su cobro en el libro). */
  async function turnoCobradoPorLink() {
    const turno = await operatorPrisma.appointment.create({
      data: {
        tenantId: a.id,
        clientId: a.clientes[0],
        professionalId: prof.id,
        serviceId: serv.id,
        boxId: box.id,
        startsAt: new Date("2026-09-24T13:00:00Z"),
        endsAt: new Date("2026-09-24T14:00:00Z"),
        status: "COMPLETED",
      },
    });
    await operatorPrisma.payment.create({
      data: { tenantId: a.id, appointmentId: turno.id, amount: 18000, method: "MERCADOPAGO", status: "APPROVED" },
    });
    await operatorPrisma.collection.create({
      data: {
        tenantId: a.id,
        originType: "APPOINTMENT",
        originId: turno.id,
        appointmentId: turno.id,
        amount: "18000.00",
        method: "MERCADOPAGO",
        collectedBy: `user:${a.duenia.id}`,
      },
    });
    return turno.id;
  }

  /** «Sincronizar Mercado Pago» con la ingesta real del negocio y la cuenta de MP simulada. */
  async function sincronizar(pagos: import("@/plugins/mercadopago").PagoMP[]) {
    const { crearEntornoReal } = await import("@/lib/mercadopago-auto");
    const { sincronizarPagos, StubMercadoPagoClient } = await import("@/plugins/mercadopago");
    const cuenta = new StubMercadoPagoClient();
    for (const p of pagos) cuenta.simularPago(p);
    return runInTenantContext(a.id, async () => {
      const { deps, reconciliacion } = await crearEntornoReal(a.id);
      for (const p of pagos) reconciliacion.recordarPago(p);
      return sincronizarPagos({ ...deps, client: cuenta });
    });
  }

  const facturas = () =>
    operatorPrisma.invoice.findMany({
      where: { tenantId: a.id },
      select: { id: true, status: true, cae: true, appointmentId: true, orderId: true, mpPaymentId: true, total: true },
      orderBy: { createdAt: "asc" },
    });
  const movimiento = (paymentId: string) =>
    operatorPrisma.movimientoImportado.findFirst({
      where: { tenantId: a.id, referencia: paymentId },
      select: { estadoPropuesta: true, motivoRevision: true, invoiceId: true },
    });
  return { base, a, operatorPrisma, turnoCobradoPorLink, sincronizar, facturas, movimiento };
}

const cobroMP = (id: string, externalReference: string, monto = 18000) => ({
  id,
  estado: "approved" as const,
  monto,
  externalReference,
  fechaAcreditacion: "20260924",
  descripcion: `Cobro ${id}`,
});

test("turno cobrado por link de Mercado Pago y facturado por el aviso: «Sincronizar Mercado Pago» no emite otra factura por el mismo cobro", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.turnoCobradoPorLink();

  // 1. El aviso de MP del turno: lo que corre `manejarNotificacionMP` para una referencia de turno.
  const { facturarAppointment } = await import("@/lib/invoice-from-appointment");
  const facturaDelTurno = await runInTenantContext(p.a.id, () => facturarAppointment(turno, p.a.id));
  assert.ok(facturaDelTurno, "el aviso del turno tiene que facturar");
  const antes = await p.facturas();
  assert.equal(antes.length, 1);
  assert.equal(antes[0].status, "AUTHORIZED");
  assert.ok(antes[0].cae);

  // 2. El dueño aprieta «Sincronizar Mercado Pago»: el historial trae ese mismo cobro.
  const r = await p.sincronizar([cobroMP("mp-turno-1", turno)]);

  const despues = await p.facturas();
  assert.equal(despues.length, 1, `un cobro, una factura: quedaron ${despues.length} (${despues.map((f) => f.mpPaymentId ?? f.appointmentId).join(", ")})`);
  assert.equal(despues[0].id, facturaDelTurno);
  assert.equal(despues[0].mpPaymentId, null);
  assert.equal(r.facturados, 0);
  assert.equal(r.noFacturables, 1);
  const mov = await p.movimiento("mp-turno-1");
  assert.equal(mov?.estadoPropuesta, "no_facturable");
  assert.equal(mov?.invoiceId, null);
  assert.match(mov?.motivoRevision ?? "", /turno/);

  // 3. Volver a sincronizar tampoco emite nada.
  const r2 = await p.sincronizar([cobroMP("mp-turno-1", turno)]);
  assert.equal(r2.saltados, 1);
  assert.equal((await p.facturas()).length, 1);
});

test("«Sincronizar Mercado Pago»: el cobro del link de un pedido no sale como venta suelta; la venta suelta sí, una sola vez", async (t) => {
  const p = await preparar(t, "b");
  if (!p) return;
  const { referenciaDePedido } = await import("@/plugins/mercadopago");

  const r = await p.sincronizar([
    cobroMP("mp-pedido-1", referenciaDePedido("ord_77"), 25000),
    cobroMP("mp-suelta-1", "", 1210),
  ]);

  const fs = await p.facturas();
  assert.equal(fs.length, 1, "sólo la venta suelta se factura desde la sincronización");
  assert.equal(fs[0].mpPaymentId, "mp-suelta-1");
  assert.equal(fs[0].status, "AUTHORIZED");
  assert.ok(fs[0].cae);
  assert.equal(String(fs[0].total), "1210");
  assert.equal(r.facturados, 1);
  assert.equal(r.noFacturables, 1);
  const pedido = await p.movimiento("mp-pedido-1");
  assert.equal(pedido?.estadoPropuesta, "no_facturable");
  assert.match(pedido?.motivoRevision ?? "", /pedido/);
  assert.equal((await p.movimiento("mp-suelta-1"))?.estadoPropuesta, "emitida");

  const r2 = await p.sincronizar([
    cobroMP("mp-pedido-1", referenciaDePedido("ord_77"), 25000),
    cobroMP("mp-suelta-1", "", 1210),
  ]);
  assert.equal(r2.saltados, 2);
  assert.equal((await p.facturas()).length, 1);
});
