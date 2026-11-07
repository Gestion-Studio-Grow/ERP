// ============================================================================
// Opción B de CH (decisión del dueño, 06/11/2026): UNA FACTURA POR CADA COBRO DEL TURNO, contra
// Postgres (app_rls + RLS), con ARCA en modo prueba (stub).
// ============================================================================
//
// Antes la factura salía al completar el turno por lo cobrado hasta ahí y el saldo cobrado después
// no se facturaba nunca (EVENTUALIDADES #15). Ahora la seña se factura al cobrarla y el saldo al
// cobrarlo. Corre el código real: `facturarAppointment` (el disparo de cada cobro y el de completar),
// `facturarCobrosDelTurno` y `anularCobroTurnoInTx` con la nota de crédito inyectada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { runInTenantContext } from "@/lib/tenant-context";

const laBase = baseEfimeraDelArchivo();

async function preparar(t: import("node:test").TestContext, cual: "a" | "b") {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "3", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const duenio = await prismaComoDuenio(base);
  const n = base[cual];
  const tenant = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
  await duenio.tenant.update({
    where: { id: n.id },
    data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, modules: [...new Set([...tenant.modules, "arca"])] },
  });
  const box = await duenio.box.create({ data: { tenantId: n.id, name: `Gabinete ${randomUUID().slice(0, 4)}` } });
  const prof = await duenio.professional.create({ data: { tenantId: n.id, name: "Lucía" } });
  const serv = await duenio.service.create({ data: { tenantId: n.id, name: "Depilación definitiva", durationMin: 60, price: 40000 } });

  const crearTurno = (status: "CONFIRMED" | "COMPLETED" = "CONFIRMED") =>
    duenio.appointment.create({
      data: {
        tenantId: n.id,
        clientId: n.clientes[0],
        professionalId: prof.id,
        serviceId: serv.id,
        boxId: box.id,
        startsAt: new Date(Date.now() - 2 * 3600_000),
        endsAt: new Date(Date.now() - 3600_000),
        status,
        priceAtBooking: 40000,
      },
    });
  /** Un cobro en el libro del turno y el `Payment` agregado (lo que deja `aplicarCobroTurnoInTx`). */
  const cobrar = async (turnoId: string, monto: number, method: "EFECTIVO" | "TRANSFERENCIA" = "EFECTIVO") => {
    const c = await duenio.collection.create({
      data: { tenantId: n.id, originType: "APPOINTMENT", originId: turnoId, appointmentId: turnoId, amount: monto.toFixed(2), method, collectedBy: `user:${n.duenia.id}` },
      select: { id: true },
    });
    const suma = await duenio.collection.aggregate({ where: { tenantId: n.id, originId: turnoId }, _sum: { amount: true } });
    const amount = Number(suma._sum.amount ?? 0);
    await duenio.payment.upsert({
      where: { appointmentId: turnoId },
      create: { tenantId: n.id, appointmentId: turnoId, amount, method, status: "APPROVED" },
      update: { amount, method },
    });
    return c.id;
  };
  /** El disparo de un cobro (`facturarDespuesDelCobro`) y el de completar el turno. */
  const despuesDelCobro = async (turnoId: string) => {
    const { facturarAppointment } = await import("@/lib/invoice-from-appointment");
    return runInTenantContext(n.id, () => facturarAppointment(turnoId, n.id, undefined, { soloCobros: true }));
  };
  const completar = async (turnoId: string) => {
    const { facturarAppointment } = await import("@/lib/invoice-from-appointment");
    return runInTenantContext(n.id, () => facturarAppointment(turnoId, n.id));
  };
  /** Las facturas del turno: las de sus cobros (libro) y la del camino de antes (`appointmentId`). */
  const facturasDelTurno = (turnoId: string) =>
    duenio.invoice.findMany({
      where: { tenantId: n.id, comprobanteAsociadoId: null, OR: [{ appointmentId: turnoId }, { cobrosFacturados: { some: { appointmentId: turnoId } } }] },
      select: { id: true, total: true, status: true },
      orderBy: { createdAt: "asc" },
    });
  return { base, n, duenio, crearTurno, cobrar, despuesDelCobro, completar, facturasDelTurno };
}

const totales = (fs: { total: unknown }[]) => fs.map((f) => Number(f.total));

test("opción B · seña $10.000 al reservar + saldo $30.000 al completar: dos facturas, $10.000 y $30.000", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.crearTurno();

  // La seña: su factura sale al cobrarla.
  await p.cobrar(turno.id, 10000, "TRANSFERENCIA");
  const facturaSenia = await p.despuesDelCobro(turno.id);
  assert.ok(facturaSenia, "la seña se factura al cobrarla");
  assert.deepEqual(totales(await p.facturasDelTurno(turno.id)), [10000]);

  // El saldo al completar: otra factura, por el saldo (no por el total ni por lo cobrado hasta ahí).
  await p.cobrar(turno.id, 30000);
  await p.duenio.appointment.update({ where: { id: turno.id }, data: { status: "COMPLETED" } });
  const facturaSaldo = await p.completar(turno.id);
  assert.ok(facturaSaldo && facturaSaldo !== facturaSenia);
  assert.deepEqual(totales(await p.facturasDelTurno(turno.id)), [10000, 30000]);

  // `Payment.comprobanteNro` no se marca: si se marcara, el saldo del próximo turno así no saldría.
  const pago = await p.duenio.payment.findUniqueOrThrow({ where: { appointmentId: turno.id }, select: { comprobanteNro: true } });
  assert.equal(pago.comprobanteNro, null);
});

test("opción B · saldo cobrado DESPUÉS de completar (lo que antes no se facturaba nunca): sale su factura", async (t) => {
  const p = await preparar(t, "b");
  if (!p) return;
  const turno = await p.crearTurno("COMPLETED");
  await p.cobrar(turno.id, 10000);
  await p.completar(turno.id); // «Dejar saldo a cobrar»: factura lo cobrado hasta ahí
  await p.cobrar(turno.id, 30000);
  await p.despuesDelCobro(turno.id);
  assert.deepEqual(totales(await p.facturasDelTurno(turno.id)), [10000, 30000]);
});

test("opción B · reintento y doble disparo a la vez: un cobro, una sola factura", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.crearTurno();
  await p.cobrar(turno.id, 10000);
  await p.cobrar(turno.id, 30000);
  // Dos disparos simultáneos (doble clic, cobro y completar a la vez) y un reintento después.
  await Promise.all([p.despuesDelCobro(turno.id), p.completar(turno.id)]);
  await p.despuesDelCobro(turno.id);
  await p.completar(turno.id);
  assert.deepEqual(totales(await p.facturasDelTurno(turno.id)), [10000, 30000]);
  const filas = await p.duenio.cobroFacturado.count({ where: { tenantId: p.n.id, appointmentId: turno.id } });
  assert.equal(filas, 2, "una fila del libro por cobro");
});

test("opción B · aislamiento: otro negocio no factura ni ve los cobros de este turno", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.crearTurno();
  await p.cobrar(turno.id, 10000);
  const otro = p.base.b.id;
  const { facturarCobrosDelTurno } = await import("@/lib/facturacion/factura-por-cobro");
  const r = await runInTenantContext(otro, () => facturarCobrosDelTurno(turno.id, otro));
  assert.deepEqual(r, { modo: "sin-libro" }, "desde el otro negocio el turno no tiene cobros (RLS + tenantId)");
  assert.equal(await p.duenio.invoice.count({ where: { tenantId: otro, cobrosFacturados: { some: { appointmentId: turno.id } } } }), 0);
  assert.deepEqual(totales(await p.facturasDelTurno(turno.id)), [], "y no le facturó nada a este");
});

test("opción B · turno ya facturado por el camino de antes: no se toca (el saldo no suma otra factura)", async (t) => {
  const p = await preparar(t, "b");
  if (!p) return;
  const turno = await p.crearTurno("COMPLETED");
  await p.cobrar(turno.id, 10000);
  // La factura única del turno, como la dejaba el código anterior (origen APPOINTMENT).
  const { createInvoice } = await import("@/lib/invoice-core");
  const vieja = await runInTenantContext(p.n.id, () =>
    createInvoice({
      tenantId: p.n.id,
      concepto: 2,
      fecha: "20261105",
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 10000,
      iva: [],
      total: 10000,
      servicioDesde: "20261105",
      servicioHasta: "20261105",
      vencimientoPago: "20261105",
      origin: { type: "APPOINTMENT", id: turno.id },
    }),
  );
  await p.cobrar(turno.id, 30000);
  assert.equal(await p.despuesDelCobro(turno.id), vieja);
  assert.equal(await p.completar(turno.id), vieja);
  assert.deepEqual(totales(await p.facturasDelTurno(turno.id)), [10000]);
});

test("opción B · anular un cobro con factura autorizada: nota de crédito en la misma transacción; sin ella, no se anula", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.crearTurno();
  const senia = await p.cobrar(turno.id, 10000);
  const saldo = await p.cobrar(turno.id, 30000);
  await p.completar(turno.id);
  const fs = await p.facturasDelTurno(turno.id);
  assert.deepEqual(totales(fs), [10000, 30000]);
  assert.deepEqual(fs.map((f) => f.status), ["AUTHORIZED", "AUTHORIZED"], "el ARCA de prueba las autorizó");

  const { anularCobroTurnoInTx, AnulacionRechazada } = await import("@/lib/turnos/anulacion");
  const { notaDeCreditoDelCobroInTx } = await import("@/lib/facturacion/factura-por-cobro");
  const { tenantTransaction } = await import("@/lib/rls");
  const anular = (collectionId: string, conNota: boolean) =>
    runInTenantContext(p.n.id, () =>
      tenantTransaction(
        (tx) =>
          anularCobroTurnoInTx(tx, p.n.id, {
            collectionId,
            appointmentId: turno.id,
            precio: 40000,
            motivo: "Se cobró de más",
            actor: `user:${p.n.duenia.id}`,
            diaCerradoHasta: null,
            esDiaCerrado: () => false,
            diaDe: () => "2026-11-06",
            withSchema: false,
            ...(conNota ? { notaDeCredito: notaDeCreditoDelCobroInTx } : {}),
          }),
        { tenantId: p.n.id },
      ),
    );

  // Sin la nota inyectada: como antes, un cobro facturado no se anula.
  await assert.rejects(anular(saldo, false), (e: unknown) => e instanceof AnulacionRechazada && e.motivo === "facturado");

  // Con la nota: se anula el saldo y su factura queda cancelada por una nota de crédito por $30.000.
  const r = await anular(saldo, true);
  assert.equal(r.applied, true);
  const notas = await p.duenio.invoice.findMany({
    where: { tenantId: p.n.id, comprobanteAsociadoId: fs[1].id },
    select: { id: true, total: true },
  });
  assert.equal(notas.length, 1);
  assert.equal(Number(notas[0].total), 30000);
  assert.ok(r.applied && r.notaDeCreditoId === notas[0].id);
  // La factura de la seña no se tocó y nada se borró.
  assert.deepEqual(totales(await p.facturasDelTurno(turno.id)), [10000, 30000]);
  assert.equal(await p.duenio.invoice.count({ where: { tenantId: p.n.id, comprobanteAsociadoId: fs[0].id } }), 0);
  // Anular otra vez: idempotente, ninguna nota más.
  const otra = await anular(saldo, true);
  assert.equal(otra.applied, false);
  assert.equal(await p.duenio.invoice.count({ where: { tenantId: p.n.id, comprobanteAsociadoId: fs[1].id } }), 1);
  // Y el cobro anulado no se vuelve a facturar.
  await p.completar(turno.id);
  assert.deepEqual(totales(await p.facturasDelTurno(turno.id)), [10000, 30000]);
  void senia;
});
