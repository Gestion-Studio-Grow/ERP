// ============================================================================
// GSG-FACT-012 · LA DOBLE FACTURA POR TURNO: cierre con otro medio + aviso de Mercado Pago
// ============================================================================
//
// La recepción cierra el turno en EFECTIVO (cobro del libro → su factura, sin `appointmentId`) y
// después llega el aviso de MP de un pago con el turno como referencia. El aviso no veía esa factura
// (buscaba la del turno por `appointmentId` y, en el libro, sólo los cobros de MP) y emitía OTRA:
// el turno quedaba facturado dos veces. Ahora, bajo el candado del turno, si lo cobrado por otros
// medios ya cubre el turno (o el pago excede lo que falta), el aviso NO factura y deja un aviso de
// revisión en la agenda. Contra Postgres real (app_rls + RLS), ARCA en modo prueba (stub).

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { runInTenantContext } from "@/lib/tenant-context";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { ACCION_SENIA_MP_NO_REGISTRADA } from "@/lib/turnos/avisos-mp";
import type { PagoMP } from "@/plugins/mercadopago";

const HOY = fechaFiscalDelDia();
const laBase = baseEfimeraDelArchivo();

async function preparar(t: import("node:test").TestContext, cual: "a" | "b") {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "3", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  delete env.MP_ACCESS_TOKEN;
  delete env.MP_MODO_LEGADO;
  const duenio = await prismaComoDuenio(base);
  const n = base[cual];
  const tenant = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
  await duenio.tenant.update({
    where: { id: n.id },
    data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, modules: [...new Set([...tenant.modules, "arca"])] },
  });
  const box = await duenio.box.create({ data: { tenantId: n.id, name: `Gabinete ${randomUUID().slice(0, 4)}` } });
  const prof = await duenio.professional.create({ data: { tenantId: n.id, name: "Lucía" } });
  const serv = await duenio.service.create({ data: { tenantId: n.id, name: "Limpieza facial", durationMin: 60, price: 15000 } });

  const crearTurno = () =>
    duenio.appointment.create({
      data: {
        tenantId: n.id,
        clientId: n.clientes[0],
        professionalId: prof.id,
        serviceId: serv.id,
        boxId: box.id,
        startsAt: new Date(Date.now() - 2 * 3600_000),
        endsAt: new Date(Date.now() - 3600_000),
        status: "COMPLETED",
        priceAtBooking: 15000,
      },
    });
  /** Un cobro en el libro del turno (y el `Payment` agregado con lo cobrado). */
  const cobrarEnElLibro = async (turnoId: string, monto: number, method: "MERCADOPAGO" | "EFECTIVO") => {
    await duenio.collection.create({
      data: {
        tenantId: n.id,
        originType: "APPOINTMENT",
        originId: turnoId,
        appointmentId: turnoId,
        amount: monto.toFixed(2),
        method,
        collectedBy: `user:${n.duenia.id}`,
      },
    });
    const cobrado = await duenio.collection.aggregate({ where: { tenantId: n.id, appointmentId: turnoId }, _sum: { amount: true } });
    await duenio.payment.upsert({
      where: { appointmentId: turnoId },
      create: { tenantId: n.id, appointmentId: turnoId, amount: Number(cobrado._sum.amount ?? 0), method, status: "APPROVED" },
      update: { amount: Number(cobrado._sum.amount ?? 0) },
    });
  };
  const pagoMP = (monto: number, externalReference: string): PagoMP => ({
    id: `mp-f12-${randomUUID().slice(0, 8)}`,
    estado: "approved",
    monto,
    externalReference,
    fechaAcreditacion: HOY,
    descripcion: "Seña",
  });
  /** El aviso de MP, con el handler REAL del plugin y el cableado del Core (mercadopago-dispatch.ts). */
  async function avisoDeMP(pago: PagoMP) {
    const { procesarNotificacionPago, StubMercadoPagoClient } = await import("@/plugins/mercadopago");
    const { facturarCobroMPDelTurno, facturarAppointment } = await import("@/lib/invoice-from-appointment");
    const cuenta = new StubMercadoPagoClient();
    cuenta.simularPago(pago);
    return runInTenantContext(n.id, () =>
      procesarNotificacionPago(
        { type: "payment", paymentId: pago.id, tenantId: n.id },
        { clientePara: () => cuenta, facturar: (aid, tid, p) => (p ? facturarCobroMPDelTurno(aid, tid, p) : facturarAppointment(aid, tid)) },
      ),
    );
  }
  /** El cierre: la factura de los cobros del libro (lo que corre después de «Cobrar» / «Completar»). */
  async function cerrar(turnoId: string) {
    const { facturarAppointment } = await import("@/lib/invoice-from-appointment");
    return runInTenantContext(n.id, () => facturarAppointment(turnoId, n.id));
  }
  /** Las facturas vivas del turno: por su único (`appointmentId`) o por sus cobros facturados. */
  const facturasDelTurno = (turnoId: string) =>
    duenio.invoice.findMany({
      where: {
        tenantId: n.id,
        status: { not: "REJECTED" },
        OR: [{ appointmentId: turnoId }, { cobrosFacturados: { some: { appointmentId: turnoId } } }],
      },
      select: { id: true, total: true, mpPaymentId: true },
    });
  const avisos = (turnoId: string) =>
    duenio.auditLog.findMany({
      where: { tenantId: n.id, entity: "Appointment", entityId: turnoId, action: ACCION_SENIA_MP_NO_REGISTRADA },
      select: { changes: true },
    });
  return { n, crearTurno, cobrarEnElLibro, pagoMP, avisoDeMP, cerrar, facturasDelTurno, avisos };
}

test("cierre en EFECTIVO + aviso de MP aprobado con la referencia del turno → 1 sola factura y un aviso de revisión", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.crearTurno();
  await p.cobrarEnElLibro(turno.id, 15000, "EFECTIVO");
  await p.cerrar(turno.id);
  const pago = p.pagoMP(5000, turno.id);
  const r = await p.avisoDeMP(pago);
  const fs = await p.facturasDelTurno(turno.id);
  assert.deepEqual(fs.map((f) => Number(f.total)), [15000], `el turno quedó con ${fs.length} facturas: ${fs.map((f) => f.total).join(" + ")}`);
  assert.equal(r.facturado, false);
  const av = await p.avisos(turno.id);
  assert.equal(av.length, 1, "falta el aviso de revisión del pago de MP");
  assert.equal((av[0].changes as { pagoMP?: { id?: string } }).pagoMP?.id, pago.id);
  // MP reenvía el aviso: ni otra factura ni otro aviso.
  await p.avisoDeMP(pago);
  assert.equal((await p.facturasDelTurno(turno.id)).length, 1);
  assert.equal((await p.avisos(turno.id)).length, 1);
});

test("variante Promise.all(cierre, aviso) con el efectivo ya anotado, 6 turnos → como mucho 1 factura por turno", async (t) => {
  const p = await preparar(t, "b");
  if (!p) return;
  const dobles: string[] = [];
  for (let i = 0; i < 6; i++) {
    const turno = await p.crearTurno();
    await p.cobrarEnElLibro(turno.id, 15000, "EFECTIVO");
    await Promise.all([p.cerrar(turno.id), p.avisoDeMP(p.pagoMP(5000, turno.id))]);
    const fs: { total: unknown }[] = await p.facturasDelTurno(turno.id);
    if (fs.length > 1) dobles.push(fs.map((f) => Number(f.total)).join(" + "));
    else assert.deepEqual(fs.map((f) => Number(f.total)), [15000]);
  }
  assert.deepEqual(dobles, [], `${dobles.length}/6 turnos facturados dos veces`);
});

test("el pago de MP excede lo que falta (efectivo $12.000, MP $5.000) → no se factura y queda a revisión", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.crearTurno();
  await p.cobrarEnElLibro(turno.id, 12000, "EFECTIVO");
  await p.cerrar(turno.id);
  await p.avisoDeMP(p.pagoMP(5000, turno.id));
  assert.deepEqual((await p.facturasDelTurno(turno.id)).map((f) => Number(f.total)), [12000]);
  assert.equal((await p.avisos(turno.id)).length, 1);
});

test("control: efectivo por el saldo ($10.000) + seña por MP ($5.000) → dos facturas legítimas, sin aviso", async (t) => {
  const p = await preparar(t, "b");
  if (!p) return;
  const turno = await p.crearTurno();
  await p.cobrarEnElLibro(turno.id, 10000, "EFECTIVO");
  await p.cerrar(turno.id);
  await p.avisoDeMP(p.pagoMP(5000, turno.id));
  const totales = (await p.facturasDelTurno(turno.id)).map((f) => Number(f.total)).sort((a, b) => a - b);
  assert.deepEqual(totales, [5000, 10000]);
  assert.equal((await p.avisos(turno.id)).length, 0);
});
