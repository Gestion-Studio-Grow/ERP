// ============================================================================
// R1 · UNA FACTURA POR COBRO — los cuatro disparadores cruzados, contra Postgres (app_rls + RLS)
// ============================================================================
//
// Una seña de $5.000 por el link de Mercado Pago de un turno de $15.000 podía terminar con 0, 1 o
// 2 facturas: el aviso de MP facturaba el turno entero, completar el turno sumaba la seña otra vez
// (o no facturaba el resto), y el extracto sólo reconocía el cobro si coincidía el total.
// Acá corre el código real de cada camino:
//   1. el aviso de MP (`procesarNotificacionPago` del plugin → `facturarCobroMPDelTurno`),
//   2. completar el turno (`facturarAppointment`),
//   3. «Sincronizar Mercado Pago» (la ingesta real del negocio),
//   4. el extracto del banco (`emitirPropuestas`),
// y al final cada cobro tiene UNA factura y la seña está sumada UNA vez. ARCA en modo prueba (stub).
// Además: la transferencia de un tercero (una seña) no se pierde como «cuenta propia».

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { runInTenantContext } from "@/lib/tenant-context";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import type { PagoMP } from "@/plugins/mercadopago";

const HOY = fechaFiscalDelDia();
const laBase = baseEfimeraDelArchivo();

// El ARCA de prueba numera por negocio: cada escenario usa SU negocio (a o b) para no chocar.
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
  env.INTEGRACIONES_MASTER_KEY ??= randomBytes(32).toString("base64");
  const duenio = await prismaComoDuenio(base);
  const n = base[cual];
  // Desde el pase N2 (P1-C4) Mercado Pago es una conexión del negocio, no una variable del despliegue.
  const { crearConexion } = await import("@/integraciones/conexiones.server");
  await crearConexion(n.id, "mercadopago", { cuentaExterna: `mp-r1-${cual}`, credenciales: { access_token: `APP_USR-r1-${cual}`, webhook_secret: `secreto-r1-${cual}` }, conectadaPor: "cli" });
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
    const total = Number(cobrado._sum.amount ?? 0);
    await duenio.payment.upsert({
      where: { appointmentId: turnoId },
      create: { tenantId: n.id, appointmentId: turnoId, amount: total, method, status: "APPROVED" },
      update: { amount: total },
    });
  };

  const pagoMP = (id: string, monto: number, externalReference: string, extra: Partial<PagoMP> = {}): PagoMP => ({
    id,
    estado: "approved",
    monto,
    externalReference,
    fechaAcreditacion: HOY,
    descripcion: `Cobro ${id}`,
    ...extra,
  });

  /** 1. El aviso de MP, con el handler REAL del plugin y el cableado del Core para un turno. */
  async function avisoDeMP(pago: PagoMP) {
    const { procesarNotificacionPago, StubMercadoPagoClient } = await import("@/plugins/mercadopago");
    const { facturarCobroMPDelTurno, facturarAppointment } = await import("@/lib/invoice-from-appointment");
    const cuenta = new StubMercadoPagoClient();
    cuenta.simularPago(pago);
    return runInTenantContext(n.id, () =>
      procesarNotificacionPago(
        { type: "payment", paymentId: pago.id, tenantId: n.id },
        {
          clientePara: () => cuenta,
          // El mismo cableado que src/lib/mercadopago-dispatch.ts.
          facturar: (aid, tid, p) => (p ? facturarCobroMPDelTurno(aid, tid, p) : facturarAppointment(aid, tid)),
        },
      ),
    );
  }
  /** 2. Completar el turno (lo que corre «Completar» con facturar). */
  async function completar(turnoId: string) {
    const { facturarAppointment } = await import("@/lib/invoice-from-appointment");
    return runInTenantContext(n.id, () => facturarAppointment(turnoId, n.id));
  }
  /** 3. «Sincronizar Mercado Pago» con la ingesta real del negocio. */
  async function sincronizar(pagos: PagoMP[]) {
    const { crearEntornoReal } = await import("@/lib/mercadopago-auto");
    const { sincronizarPagos, StubMercadoPagoClient } = await import("@/plugins/mercadopago");
    const cuenta = new StubMercadoPagoClient();
    for (const p of pagos) cuenta.simularPago(p);
    return runInTenantContext(n.id, async () => {
      const { deps, reconciliacion } = await crearEntornoReal(n.id);
      for (const p of pagos) reconciliacion.recordarPago(p);
      return sincronizarPagos({ ...deps, client: cuenta });
    });
  }
  /** 4. El extracto del banco: créditos listos para emitir y la emisión real. */
  async function extracto(creditos: { monto: number; referencia?: string }[]) {
    const imp = await duenio.importacionBancaria.create({
      data: { tenantId: n.id, nombreArchivo: "extracto.csv", mapeoJson: {}, origen: "banco", archivo: Buffer.from("fecha;monto\n") },
    });
    const hashes: string[] = [];
    for (const c of creditos) {
      const hash = `h-${randomUUID()}`;
      hashes.push(hash);
      await duenio.movimientoImportado.create({
        data: {
          tenantId: n.id,
          importacionId: imp.id,
          hash,
          fecha: HOY,
          monto: c.monto.toFixed(2),
          descripcion: c.referencia ? `Transferencia MP ${c.referencia}` : "Transferencia recibida",
          referencia: c.referencia ?? null,
          clasificacion: "venta",
          estadoPropuesta: "auto",
        },
      });
    }
    const { emitirPropuestas } = await import("@/lib/bancos-glue");
    return { resultado: await emitirPropuestas(n.id, "auto"), hashes };
  }

  const facturas = () =>
    duenio.invoice.findMany({
      where: { tenantId: n.id, status: { not: "REJECTED" } },
      select: { id: true, total: true, status: true, appointmentId: true, mpPaymentId: true },
      orderBy: { createdAt: "asc" },
    });
  const cobro = (clave: string) =>
    duenio.cobroFacturado.findUnique({ where: { tenantId_clave: { tenantId: n.id, clave } }, select: { invoiceId: true, importe: true } });
  /** Opción B (CH, 06/11/2026): las facturas de los cobros del libro del turno, por medio. */
  const deCobrosDelLibro = async (turnoId: string) => {
    const filas = await duenio.cobroFacturado.findMany({
      where: { tenantId: n.id, appointmentId: turnoId, clave: { startsWith: "turno:cobro:" } },
      select: { clave: true, invoiceId: true, importe: true },
    });
    const medios = await duenio.collection.findMany({ where: { tenantId: n.id, originId: turnoId }, select: { id: true, method: true } });
    return filas.map((f) => ({
      invoiceId: f.invoiceId,
      importe: Number(f.importe),
      method: medios.find((m) => f.clave === `turno:cobro:${m.id}`)?.method,
    }));
  };
  return { n, duenio, crearTurno, cobrarEnElLibro, pagoMP, avisoDeMP, completar, sincronizar, extracto, facturas, cobro, deCobrosDelLibro };
}

const total = (fs: { total: unknown }[]) => fs.reduce((a, f) => a + Number(f.total), 0);


// ── ADVERSARIAL (certificador): carrera aviso de MP ↔ factura del cobro del libro ──
test("ADV · intercalado: el aviso de MP mira, la recepción anota y factura la seña, el aviso sigue → ¿dos facturas?", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.crearTurno();
  const senia = p.pagoMP(`mp-adv-${randomUUID().slice(0, 6)}`, 5000, turno.id);
  const antes = (await p.facturas()).length;
  const fpc = await import("@/lib/facturacion/factura-por-cobro");
  const { facturarCobroMPDelTurno } = await import("@/lib/invoice-from-appointment");
  const { facturarPagoMP } = await import("@/lib/invoice-from-mp");
  const { vincularCobro } = await import("@/lib/facturacion/cobros-facturados");
  await runInTenantContext(p.n.id, () =>
    facturarCobroMPDelTurno(turno.id, p.n.id, senia, {
      facturarPagoMP,
      vincularCobro,
      // El aviso consulta (código real) y, ANTES de seguir, la recepción toca «Llegó la seña» por MP.
      facturaDeCobroParaPagoMP: async (tid, aid, monto) => {
        const r = await fpc.facturaDeCobroParaPagoMP(tid, aid, monto);
        await p.cobrarEnElLibro(turno.id, 5000, "MERCADOPAGO");
        await fpc.facturarCobrosDelTurno(turno.id, p.n.id);
        return r;
      },
    }),
  );
  const nuevas = (await p.facturas()).slice(antes);
  assert.deepEqual(nuevas.map((f) => Number(f.total)), [5000], `seña de $5.000 facturada ${nuevas.length} veces`);
});

test("ADV · Promise.all: aviso de MP y factura del cobro a la vez, 8 turnos", async (t) => {
  const p = await preparar(t, "b");
  if (!p) return;
  const fpc = await import("@/lib/facturacion/factura-por-cobro");
  let dobles = 0;
  for (let i = 0; i < 8; i++) {
    const turno = await p.crearTurno();
    const senia = p.pagoMP(`mp-par-${randomUUID().slice(0, 6)}`, 5000, turno.id);
    await p.cobrarEnElLibro(turno.id, 5000, "MERCADOPAGO");
    await Promise.all([p.avisoDeMP(senia), runInTenantContext(p.n.id, () => fpc.facturarCobrosDelTurno(turno.id, p.n.id))]);
    const n = await p.duenio.invoice.count({
      where: { tenantId: p.n.id, status: { not: "REJECTED" }, cobrosFacturados: { some: { appointmentId: turno.id } } },
    });
    if (n > 1) dobles++;
  }
  assert.equal(dobles, 0, `${dobles}/8 turnos con la seña facturada dos veces`);
});

test("ADV · control secuencial (sin carrera): 1 factura en ambos órdenes", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const fpc = await import("@/lib/facturacion/factura-por-cobro");
  for (const avisoPrimero of [true, false]) {
    const turno = await p.crearTurno();
    const senia = p.pagoMP(`mp-seq-${randomUUID().slice(0, 6)}`, 5000, turno.id);
    await p.cobrarEnElLibro(turno.id, 5000, "MERCADOPAGO");
    if (avisoPrimero) await p.avisoDeMP(senia);
    await runInTenantContext(p.n.id, () => fpc.facturarCobrosDelTurno(turno.id, p.n.id));
    if (!avisoPrimero) await p.avisoDeMP(senia);
    const cuantas: number = await p.duenio.invoice.count({
      where: { tenantId: p.n.id, status: { not: "REJECTED" }, cobrosFacturados: { some: { appointmentId: turno.id } } },
    });
    assert.equal(cuantas, 1, `avisoPrimero=${avisoPrimero}: ${cuantas} facturas`);
  }
});

// ── Anular un cobro de MP cubierto por la factura del PAGO de MP (`mp:<pago>`): nota de crédito ──
test("anular un cobro de MP cubierto por la factura del pago (mp:<pago>): nota de crédito por esa parte; sin ella, no se anula", async (t) => {
  const p = await preparar(t, "b");
  if (!p) return;
  const fpc = await import("@/lib/facturacion/factura-por-cobro");
  const { anularCobroTurnoInTx, AnulacionRechazada } = await import("@/lib/turnos/anulacion");
  const { tenantTransaction } = await import("@/lib/rls");
  const turno = await p.crearTurno();
  // Un pago de MP de $10.000 que la recepción anotó en dos cobros de $5.000.
  await p.cobrarEnElLibro(turno.id, 5000, "MERCADOPAGO");
  await p.cobrarEnElLibro(turno.id, 5000, "MERCADOPAGO");
  await p.avisoDeMP(p.pagoMP(`mp-nc-${randomUUID().slice(0, 6)}`, 10000, turno.id));
  await runInTenantContext(p.n.id, () => fpc.facturarCobrosDelTurno(turno.id, p.n.id));
  const delTurno = () =>
    p.duenio.invoice.findMany({
      where: { tenantId: p.n.id, comprobanteAsociadoId: null, status: { not: "REJECTED" }, cobrosFacturados: { some: { appointmentId: turno.id } } },
      select: { id: true, total: true, status: true },
    });
  const fs = await delTurno();
  assert.deepEqual(fs.map((f) => [Number(f.total), f.status]), [[10000, "AUTHORIZED"]], "la factura del pago cubre los dos cobros");
  const [c1] = await p.duenio.collection.findMany({ where: { tenantId: p.n.id, originId: turno.id }, orderBy: { createdAt: "asc" }, select: { id: true } });

  const anular = (collectionId: string, conNota: boolean) =>
    runInTenantContext(p.n.id, () =>
      tenantTransaction(
        (tx) =>
          anularCobroTurnoInTx(tx, p.n.id, {
            collectionId,
            appointmentId: turno.id,
            precio: 15000,
            motivo: "Se anotó dos veces",
            actor: `user:${p.n.duenia.id}`,
            diaCerradoHasta: null,
            esDiaCerrado: () => false,
            diaDe: () => HOY,
            withSchema: false,
            ...(conNota ? { notaDeCredito: fpc.notaDeCreditoDelCobroInTx } : {}),
          }),
        { tenantId: p.n.id },
      ),
    );
  // Sin la nota: el cobro está facturado (por el pago) y no se anula.
  await assert.rejects(anular(c1.id, false), (e: unknown) => e instanceof AnulacionRechazada && e.motivo === "facturado");
  // Con la nota: nota de crédito por $5.000 (la parte de ese cobro) contra la factura del pago.
  const r = await anular(c1.id, true);
  const notas = await p.duenio.invoice.findMany({ where: { tenantId: p.n.id, comprobanteAsociadoId: fs[0].id }, select: { id: true, total: true } });
  assert.deepEqual(notas.map((n) => Number(n.total)), [5000]);
  assert.ok(r.applied && r.notaDeCreditoId === notas[0].id);
  // El otro cobro sigue cubierto por los $5.000 que quedan: no sale otra factura.
  await runInTenantContext(p.n.id, () => fpc.facturarCobrosDelTurno(turno.id, p.n.id));
  assert.equal((await delTurno()).length, 1);
  // Un cobro nuevo de MP ya no lo cubre la parte acreditada: se factura.
  await p.cobrarEnElLibro(turno.id, 5000, "MERCADOPAGO");
  await runInTenantContext(p.n.id, () => fpc.facturarCobrosDelTurno(turno.id, p.n.id));
  assert.deepEqual((await delTurno()).map((f) => Number(f.total)).sort(), [10000, 5000].sort());
});
