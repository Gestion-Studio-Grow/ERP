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
  return { n, duenio, crearTurno, cobrarEnElLibro, pagoMP, avisoDeMP, completar, sincronizar, extracto, facturas, cobro };
}

const total = (fs: { total: unknown }[]) => fs.reduce((a, f) => a + Number(f.total), 0);

test("R1 · seña por MP, completar el turno, sincronizar y extracto: una factura por cobro y la seña sumada una vez", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.crearTurno();
  const senia = p.pagoMP(`mp-senia-${randomUUID().slice(0, 6)}`, 5000, turno.id);

  // 1. Llega el aviso de MP de la seña (link del turno): se factura ESA seña, no el turno.
  const r1 = await p.avisoDeMP(senia);
  assert.equal(r1.facturado, true);
  let fs = await p.facturas();
  assert.equal(fs.length, 1);
  assert.equal(Number(fs[0].total), 5000, "el aviso factura la seña, no el precio del turno");
  assert.equal(fs[0].appointmentId, null, "la seña no toma el lugar de la factura del turno");
  const facturaSenia = fs[0].id;
  // Un aviso repetido (MP reintenta) no factura de nuevo.
  await p.avisoDeMP(senia);
  assert.equal((await p.facturas()).length, 1);

  // La recepción anota la seña en el libro (por MP) y cobra el saldo en efectivo al terminar.
  await p.cobrarEnElLibro(turno.id, 5000, "MERCADOPAGO");
  await p.cobrarEnElLibro(turno.id, 10000, "EFECTIVO");

  // 2. Completar el turno: factura el RESTO ($10.000), no los $15.000 otra vez.
  const facturaTurno = await p.completar(turno.id);
  fs = await p.facturas();
  assert.equal(fs.length, 2);
  const delTurno = fs.find((f) => f.id === facturaTurno);
  assert.equal(Number(delTurno?.total), 10000);
  assert.equal(delTurno?.appointmentId, turno.id);
  assert.equal(total(fs), 15000, "lo facturado es lo cobrado: la seña sumada una sola vez");
  // Completar dos veces no factura de más.
  assert.equal(await p.completar(turno.id), facturaTurno);

  // 3. «Sincronizar Mercado Pago» trae el mismo pago: no emite otra factura.
  const s = await p.sincronizar([senia]);
  assert.equal(s.facturados, 0);
  assert.equal((await p.facturas()).length, 2);

  // 4. El extracto: la acreditación de la seña (con la referencia del pago) y un crédito suelto.
  const { resultado, hashes } = await p.extracto([{ monto: 5000, referencia: senia.id }, { monto: 7000 }]);
  assert.equal(resultado.yaFacturadas, 1, "la seña se reconoce por la referencia del pago, no por el total");
  assert.equal(resultado.emitidas, 1, "el crédito suelto se factura una vez");
  fs = await p.facturas();
  assert.equal(fs.length, 3);
  assert.equal(total(fs), 22000);

  // El libro de cobros facturados: cada cobro, una factura.
  assert.equal((await p.cobro(`mp:${senia.id}`))?.invoiceId, facturaSenia);
  assert.equal((await p.cobro(`turno:${turno.id}`))?.invoiceId, facturaTurno);
  assert.equal((await p.cobro(`banco:${hashes[0]}`))?.invoiceId, facturaSenia, "la acreditación quedó atada a la factura de la seña");
  const suelto = await p.cobro(`banco:${hashes[1]}`);
  assert.ok(suelto && suelto.invoiceId !== facturaSenia && suelto.invoiceId !== facturaTurno);
  // Volver a emitir el extracto no emite nada.
  const { emitirPropuestas } = await import("@/lib/bancos-glue");
  const otra = await emitirPropuestas(p.n.id, "auto");
  assert.equal(otra.emitidas, 0);
  assert.equal((await p.facturas()).length, 3);
});

test("R1 · completar ANTES del aviso de MP: el turno factura todo lo cobrado y el aviso tardío no emite otra", async (t) => {
  const p = await preparar(t, "b");
  if (!p) return;
  const turno = await p.crearTurno();
  const senia = p.pagoMP(`mp-tarde-${randomUUID().slice(0, 6)}`, 5000, turno.id);
  await p.cobrarEnElLibro(turno.id, 5000, "MERCADOPAGO");
  await p.cobrarEnElLibro(turno.id, 10000, "EFECTIVO");
  const facturaTurno = await p.completar(turno.id);
  let fs = await p.facturas();
  assert.equal(fs.length, 1);
  assert.equal(Number(fs[0].total), 15000);

  // El aviso llega tarde: la seña ya está adentro de la factura del turno.
  const r = await p.avisoDeMP(senia);
  assert.equal(r.invoiceId, facturaTurno);
  fs = await p.facturas();
  assert.equal(fs.length, 1, "no hay una segunda factura por la seña");
  assert.equal((await p.cobro(`mp:${senia.id}`))?.invoiceId, facturaTurno);

  // Y el extracto la reconoce por la referencia del pago.
  const { resultado } = await p.extracto([{ monto: 5000, referencia: senia.id }]);
  assert.equal(resultado.yaFacturadas, 1);
  assert.equal(resultado.emitidas, 0);
  assert.equal((await p.facturas()).length, 1);
});

test("R1 · seña por MP que la recepción NO anotó en el libro: completar factura sólo lo cobrado en el mostrador", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const turno = await p.crearTurno();
  const senia = p.pagoMP(`mp-sinlibro-${randomUUID().slice(0, 6)}`, 5000, turno.id);
  const antes = (await p.facturas()).length;
  await p.avisoDeMP(senia);
  await p.cobrarEnElLibro(turno.id, 10000, "EFECTIVO");
  await p.completar(turno.id);
  const nuevas = (await p.facturas()).slice(antes);
  assert.deepEqual(nuevas.map((f) => Number(f.total)).sort((x, y) => x - y), [5000, 10000]);
});

test("R1 · dos disparadores a la vez sobre el mismo pago (aviso y extracto): una sola factura", async (t) => {
  const p = await preparar(t, "b");
  if (!p) return;
  const pago = p.pagoMP(`mp-carrera-${randomUUID().slice(0, 6)}`, 3210, "");
  const antes = (await p.facturas()).length;
  const { facturarPagoMP } = await import("@/lib/invoice-from-mp");
  const [x, y] = await Promise.all([
    runInTenantContext(p.n.id, () => facturarPagoMP(pago, p.n.id)),
    runInTenantContext(p.n.id, () => facturarPagoMP(pago, p.n.id)),
  ]);
  assert.equal(x, y);
  assert.equal((await p.facturas()).length, antes + 1);
});

test("R1 · money_transfer: la de un tercero (una seña) va a revisión y no se pierde; la de la cuenta propia no se factura", async (t) => {
  const p = await preparar(t, "a");
  if (!p) return;
  const { normalizarPago } = await import("@/plugins/mercadopago/http");
  const tercero = normalizarPago({
    id: `tr-tercero-${randomUUID().slice(0, 6)}`,
    status: "approved",
    operation_type: "money_transfer",
    transaction_amount: 5000,
    collector_id: 111,
    payer: { id: 222, first_name: "Marta" },
    date_approved: "2026-10-22T10:00:00-03:00",
  });
  const propia = normalizarPago({
    id: `tr-propia-${randomUUID().slice(0, 6)}`,
    status: "approved",
    operation_type: "money_transfer",
    transaction_amount: 80000,
    collector_id: 111,
    payer: { id: 111 },
    date_approved: "2026-10-22T10:00:00-03:00",
  });
  const fondeo = normalizarPago({ id: `fondeo-${randomUUID().slice(0, 6)}`, status: "approved", operation_type: "account_fund", transaction_amount: 9000 });
  assert.equal(tercero.cuentaPropia, false);
  assert.equal(propia.cuentaPropia, true);
  assert.equal(fondeo.cuentaPropia, true);

  const antes = (await p.facturas()).length;
  const r = await p.sincronizar([tercero, propia, fondeo].map((x) => ({ ...x, fechaAcreditacion: HOY })));
  assert.equal(r.aRevisar, 1, "la transferencia del tercero queda para que una persona la confirme");
  assert.equal(r.noFacturables, 2, "la propia y el fondeo no son ventas");
  assert.equal(r.facturados, 0);
  assert.equal((await p.facturas()).length, antes);
  const mov = await p.duenio.movimientoImportado.findFirst({
    where: { tenantId: p.n.id, referencia: tercero.id },
    select: { estadoPropuesta: true, clasificacion: true },
  });
  assert.equal(mov?.estadoPropuesta, "revision");
  assert.notEqual(mov?.clasificacion, "transferencia_propia");
});
