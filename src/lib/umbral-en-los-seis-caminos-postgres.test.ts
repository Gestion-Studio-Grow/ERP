// ============================================================================
// ENG-024 · El umbral de identificación y el IVA del inscripto en los 6 caminos que emiten
// ============================================================================
//
// Cada camino que crea una factura (pedido, turno, Mercado Pago, facturita, bancos, API externa)
// corre con su código real contra una base efímera con RLS: `createInvoice` encola el envío y el
// despacho real (`procesarEnviosDelNegocio`, ARCA en modo stub) aplica la decisión del plugin.
//
//  · Consumidor final sin identificar desde el umbral de la RG 5700 ($10.000.000, la tabla de
//    vigencias de `lib/fiscal/vigencias.ts`): la factura queda RECHAZADA con el motivo, sin CAE.
//    Antes de COMPROBANTE lo frenaba ARCA (o nadie, en el stub).
//  · Responsable Inscripto con el IVA como 21 % parejo sobre el total: RECHAZADA con el motivo.
//    Sólo alcanzable donde el camino deja inyectar el perfil fiscal (pedido, turno, MP): el
//    perfil real no puede dar inscripto (la columna de la condición no existe, fiscal.ts:236-246).
//
// El umbral no se inventa acá: sale de la misma tabla que usa la decisión.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, vigenteEn } from "@/lib/fiscal/vigencias";
import { runInTenantContext } from "@/lib/tenant-context";

const laBase = baseEfimeraDelArchivo();

const MOTIVO_UMBRAL = /ARCA exige identificar al consumidor final/;
const MOTIVO_IVA = /21 % parejo sobre el total/;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, {
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
    ARCA_INVOICING_ENABLED: "true",
  });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { fechaFiscalDelDia } = await import("@/lib/libros/fecha-fiscal");
  const hoy = fechaFiscalDelDia();
  const vig = vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, hoy);
  assert.ok(vig, "la tabla de vigencias tiene que tener un umbral vigente hoy");
  const umbral = vig.valor;
  // Perfil fiscal real del negocio A: CUIT válido, punto de venta 1, homologación.
  await operatorPrisma.tenant.update({
    where: { id: base.a.id },
    data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true },
  });
  const factura = (id: string | null) => {
    assert.ok(id, "el camino tiene que haber creado la factura");
    return operatorPrisma.invoice.findUniqueOrThrow({
      where: { id },
      select: { status: true, cae: true, rechazoMotivo: true, tenantId: true },
    });
  };
  const rechazadaPor = async (id: string | null, motivo: RegExp, negocio = base.a) => {
    const f = await factura(id);
    assert.equal(f.tenantId, negocio.id);
    assert.equal(f.status, "REJECTED", `quedó ${f.status}: ${f.rechazoMotivo ?? ""}`);
    assert.equal(f.cae, null);
    assert.match(f.rechazoMotivo ?? "", motivo);
  };
  const { getFiscalProfile } = await import("@/lib/fiscal");
  const perfilInscripto: typeof getFiscalProfile = async (tenantId) => ({
    ...(await getFiscalProfile(tenantId)),
    condicionIva: "RESPONSABLE_INSCRIPTO",
  });
  // Los caminos sin sesión (worker, webhook, API externa) corren con el negocio explícito, como
  // en producción.
  const enA = <T,>(fn: () => Promise<T>) => runInTenantContext(base.a.id, fn);
  return { base, operatorPrisma, hoy, umbral, factura, rechazadaPor, perfilInscripto, enA };
}

test("pedido (facturarOrden): sin identificar desde el umbral no emite y deja el motivo; un peso menos, emite", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma, umbral } = p;
  const { facturarOrden } = await import("@/lib/invoice-from-order");
  const [enElUmbral, debajo] = base.a.pedidos;
  await operatorPrisma.order.update({ where: { id: enElUmbral }, data: { paid: true, total: umbral } });
  await operatorPrisma.order.update({ where: { id: debajo }, data: { paid: true, total: umbral - 1 } });

  await p.rechazadaPor(await p.enA(() => facturarOrden(enElUmbral, base.a.id)), MOTIVO_UMBRAL);

  // Control: el mismo camino, debajo del umbral, sí emite (la regla es el umbral, no el camino).
  const ok = await p.factura(await p.enA(() => facturarOrden(debajo, base.a.id)));
  assert.equal(ok.status, "AUTHORIZED", ok.rechazoMotivo ?? "");
  assert.ok(ok.cae);
});

test("pedido (facturarOrden) con emisor inscripto e IVA parejo: no emite y deja el motivo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma } = p;
  const inv = await import("@/lib/invoice-from-order");
  const { createInvoice } = await import("@/lib/invoice-core");
  const { procesarEnviosDelNegocio } = await import("@/lib/arca-dispatch");
  const pedido = base.a.pedidos[2];
  await operatorPrisma.order.update({ where: { id: pedido }, data: { paid: true, total: 1210 } });
  const id = await p.enA(() => inv.facturarOrden(pedido, base.a.id, {
    leerOrden: (orderId, tenantId) =>
      operatorPrisma.order.findFirst({ where: { id: orderId, tenantId }, select: { total: true } }),
    getFiscalProfile: p.perfilInscripto,
    createInvoice,
    procesarEnviosDelNegocio,
  }));
  await p.rechazadaPor(id, MOTIVO_IVA);
});

test("turno (facturarAppointment): sin identificar desde el umbral no emite; inscripto con IVA parejo tampoco", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma, umbral } = p;
  const { facturarAppointment } = await import("@/lib/invoice-from-appointment");
  const { createInvoice } = await import("@/lib/invoice-core");
  const { procesarEnviosDelNegocio } = await import("@/lib/arca-dispatch");
  const a = base.a;
  const box = await operatorPrisma.box.create({ data: { tenantId: a.id, name: "Gabinete 1" } });
  const prof = await operatorPrisma.professional.create({ data: { tenantId: a.id, name: "Lucía" } });
  const serv = await operatorPrisma.service.create({
    data: { tenantId: a.id, name: "Tratamiento", durationMin: 60, price: 1000 },
  });
  const turno = async (monto: number, hora: number) => {
    const ap = await operatorPrisma.appointment.create({
      data: {
        tenantId: a.id,
        clientId: a.clientes[0],
        professionalId: prof.id,
        serviceId: serv.id,
        boxId: box.id,
        startsAt: new Date(Date.UTC(2026, 8, 24, hora)),
        endsAt: new Date(Date.UTC(2026, 8, 24, hora + 1)),
        status: "COMPLETED",
      },
    });
    await operatorPrisma.payment.create({
      data: { tenantId: a.id, appointmentId: ap.id, amount: monto, method: "EFECTIVO", status: "APPROVED" },
    });
    return ap.id;
  };

  const enElUmbral = await turno(umbral, 12);
  await p.rechazadaPor(await p.enA(() => facturarAppointment(enElUmbral, a.id)), MOTIVO_UMBRAL);

  const conInscripto = await turno(1210, 15);
  const id = await p.enA(() => facturarAppointment(conInscripto, a.id, {
    leerTurno: (appointmentId, tenantId) =>
      operatorPrisma.appointment.findFirst({
        where: { id: appointmentId, tenantId },
        include: { service: true, payment: true },
      }),
    marcarPago: (paymentId, invoiceId) =>
      operatorPrisma.payment.update({ where: { id: paymentId }, data: { comprobanteNro: invoiceId } }),
    getFiscalProfile: p.perfilInscripto,
    createInvoice,
    procesarEnviosDelNegocio,
  }));
  await p.rechazadaPor(id, MOTIVO_IVA);
});

test("Mercado Pago (facturarPagoMP): sin identificar desde el umbral no emite; inscripto con IVA parejo tampoco", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, umbral } = p;
  const { facturarPagoMP } = await import("@/lib/invoice-from-mp");
  const { createInvoice } = await import("@/lib/invoice-core");
  const { procesarEnviosDelNegocio } = await import("@/lib/arca-dispatch");
  const pago = (id: string, monto: number) => ({
    id,
    estado: "approved" as const,
    monto,
    externalReference: `ref-${id}`,
  });

  await p.rechazadaPor(await p.enA(() => facturarPagoMP(pago("mp-umbral", umbral), base.a.id)), MOTIVO_UMBRAL);

  const id = await p.enA(() => facturarPagoMP(pago("mp-inscripto", 1210), base.a.id, {
    getFiscalProfile: p.perfilInscripto,
    createInvoice,
    procesarEnviosDelNegocio,
  }));
  await p.rechazadaPor(id, MOTIVO_IVA);
});

test("facturita (emitirFacturitaAction, Server Action real): sin identificar desde el umbral no emite y deja el motivo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma, umbral } = p;
  const { emitirFacturitaAction } = await import("@/lib/facturita-actions");
  // En el negocio B: el tope de 5 facturas por mes de facturita no carga con las que los otros
  // tests dejan en A.
  const b = base.b;
  await operatorPrisma.tenant.update({
    where: { id: b.id },
    data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, blueprintId: "facturita" },
  });
  const salida = await ejecutarAccion({ negocio: b, usuario: b.duenia }, () =>
    emitirFacturitaAction({ descripcion: "Mesa de roble", total: umbral }),
  );
  assert.equal(salida.tipo, "respuesta");
  const r = salida.tipo === "respuesta" ? salida.valor : null;
  // La pantalla recibe el rechazo en el momento, con el motivo (antes: ok:true y «Factura
  // emitida» con la factura rechazada).
  assert.ok(r && !r.ok, JSON.stringify(r));
  assert.match(r.error, /^ARCA no autorizó la factura: /);
  assert.match(r.error, MOTIVO_UMBRAL);
  assert.ok(r.invoiceId, "el rechazo dice qué factura quedó rechazada");
  await p.rechazadaPor(r.invoiceId, MOTIVO_UMBRAL, b);

  // Control: un peso menos, emite y la respuesta es ok.
  const ok = await ejecutarAccion({ negocio: b, usuario: b.duenia }, () =>
    emitirFacturitaAction({ descripcion: "Mesa de pino", total: umbral - 1 }),
  );
  const rOk = ok.tipo === "respuesta" ? ok.valor : null;
  assert.ok(rOk && rOk.ok, JSON.stringify(rOk));
  assert.equal((await p.factura(rOk.invoiceId)).status, "AUTHORIZED");
});

test("bancos (emitirPropuestasAction, Server Action real): un movimiento sin identificar desde el umbral no emite y deja el motivo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma, umbral, hoy } = p;
  const { emitirPropuestasAction } = await import("@/lib/bancos-actions");
  const imp = await operatorPrisma.importacionBancaria.create({
    data: { tenantId: base.a.id, nombreArchivo: "extracto.csv", origen: "banco", archivo: Buffer.from("fecha;monto"), mapeoJson: {} },
  });
  const mov = await operatorPrisma.movimientoImportado.create({
    data: {
      tenantId: base.a.id,
      importacionId: imp.id,
      hash: "mov-umbral",
      fecha: hoy,
      monto: umbral,
      descripcion: "Transferencia recibida",
      clasificacion: "venta",
      estadoPropuesta: "auto",
    },
  });
  const salida = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () =>
    emitirPropuestasAction([mov.id]),
  );
  assert.equal(salida.tipo, "respuesta");
  const despues = await operatorPrisma.movimientoImportado.findUniqueOrThrow({ where: { id: mov.id } });
  await p.rechazadaPor(despues.invoiceId, MOTIVO_UMBRAL);
});

test("API externa (createExternalOrder): un pedido sin identificar desde el umbral no emite y deja el motivo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, operatorPrisma, umbral } = p;
  const { createExternalOrder } = await import("@/lib/external-orders");
  const prod = await operatorPrisma.product.create({
    data: { tenantId: base.a.id, name: "Pala de carbono", price: umbral, active: true },
  });
  const r = await p.enA(() => createExternalOrder(base.a.id, {
    customer: { name: "Comprador", phone: "1155550000" },
    items: [{ productId: prod.id, quantity: 1 }],
    payment: { paid: true, method: "TRANSFERENCIA" },
    externalRef: "woo-umbral-1",
    invoice: true,
  }));
  const f = await operatorPrisma.invoice.findFirstOrThrow({ where: { tenantId: base.a.id, orderId: r.id } });
  await p.rechazadaPor(f.id, MOTIVO_UMBRAL);
});
