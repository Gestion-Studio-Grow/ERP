// ============================================================================
// UN COBRO CON REFERENCIA: ni una factura perdida en silencio, ni dos por la misma venta.
// ============================================================================
//
// Lo que pasaba (db9e142): el sincronizado mandaba a NO_FACTURABLE —terminal— CUALQUIER pago con
// `external_reference`, sin mirar si detrás había un turno o un pedido. El link de cobro manual
// acepta texto libre ("Seña Maria depilación"): esas ventas quedaban sin factura para siempre, con
// un motivo falso ("Cobro atado a un turno"). Y un pedido sin factura cobrado por link tampoco se
// facturaba por ningún camino (el aviso no cobra pedidos).
//
// Acá corre el pipeline REAL del sincronizado (`sincronizarPagos` → `ClasificadorPorReglas` →
// conciliación) con el resolutor REAL del Core (`resolverReferenciasEnTx`) sobre una base falsa
// de DOS negocios que respeta el `where` (negocio + ids), y el aviso real con el MISMO resolutor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { StubMercadoPagoClient } from "@/plugins/mercadopago/stub";
import { ClasificadorPorReglas, AprendizajeEnMemoria } from "@/plugins/mercadopago/classifier";
import { ReconciliacionEnMemoria } from "@/plugins/mercadopago/reconciliation";
import { sincronizarPagos } from "@/plugins/mercadopago/ingest";
import { procesarNotificacionPago } from "@/plugins/mercadopago/handler";
import { referenciaDePedido, type ResolverReferencias } from "@/plugins/mercadopago/core-contract";
import { resolverReferenciasEnTx, estadoDeFacturacion, type DbReferencias } from "./mercadopago-referencias";

const T = "t_magra";
const OTRO = "t_shine";

type Factura = { id: string; status: string };
const PEDIDOS = [
  { id: "ord_fact", tenantId: T, code: 77, invoices: [{ id: "inv_77", status: "AUTHORIZED" }] as Factura[] },
  { id: "ord_sin", tenantId: T, code: 78, invoices: [] as Factura[] },
  { id: "ord_rech", tenantId: T, code: 79, invoices: [{ id: "inv_79", status: "REJECTED" }] as Factura[] },
  { id: "ord_ajeno", tenantId: OTRO, code: 5, invoices: [] as Factura[] },
];
const TURNOS = [
  { id: "appt_fact", tenantId: T, startsAt: new Date("2026-09-24T13:30:00Z"), payment: null, invoices: [{ id: "inv_a", status: "PENDING" }] as Factura[] },
  { id: "appt_marca", tenantId: T, startsAt: new Date("2026-09-24T14:30:00Z"), payment: { comprobanteNro: "inv_b" }, invoices: [] as Factura[] },
  { id: "appt_sin", tenantId: T, startsAt: new Date("2026-09-24T15:30:00Z"), payment: { comprobanteNro: null }, invoices: [] as Factura[] },
  { id: "appt_ajeno", tenantId: OTRO, startsAt: new Date("2026-09-24T15:30:00Z"), payment: null, invoices: [] as Factura[] },
];

/** La base falsa: filtra por negocio e ids como Postgres, y cuenta los viajes. */
function baseFalsa() {
  const viajes = { order: 0, appointment: 0 };
  const db: DbReferencias = {
    order: {
      findMany: async ({ where }) => {
        viajes.order++;
        return PEDIDOS.filter((o) => o.tenantId === where.tenantId && where.id.in.includes(o.id)).map(({ id, code, invoices }) => ({ id, code, invoices }));
      },
    },
    appointment: {
      findMany: async ({ where }) => {
        viajes.appointment++;
        return TURNOS.filter((a) => a.tenantId === where.tenantId && where.id.in.includes(a.id)).map(({ id, startsAt, payment, invoices }) => ({ id, startsAt, payment, invoices }));
      },
    },
  };
  const resolver: ResolverReferencias = (tenantId, refs) => resolverReferenciasEnTx(db, tenantId, refs);
  return { viajes, resolver };
}

const CASOS: { id: string; ref: string }[] = [
  { id: "libre", ref: "Seña Maria depilación" },
  { id: "prueba", ref: "PRUEBA-123" }, // forma de id, pero no hay turno con ese id
  { id: "turno_fact", ref: "appt_fact" },
  { id: "turno_marca", ref: "appt_marca" },
  { id: "turno_sin", ref: " appt_sin " },
  { id: "turno_ajeno", ref: "appt_ajeno" },
  { id: "pedido_ajeno", ref: referenciaDePedido("ord_ajeno") },
  { id: "pedido_fact", ref: referenciaDePedido("ord_fact") },
  { id: "pedido_sin", ref: referenciaDePedido("ord_sin") },
  { id: "pedido_rech", ref: referenciaDePedido("ord_rech") },
  { id: "suelta", ref: "" },
];

function cuenta() {
  const mp = new StubMercadoPagoClient();
  for (const c of CASOS) mp.simularPago({ id: c.id, estado: "approved", monto: 5000, externalReference: c.ref });
  return mp;
}

test("el sincronizado: texto libre, turno inexistente y pedido ajeno se facturan como antes; lo del negocio, según su factura", async () => {
  const { viajes, resolver } = baseFalsa();
  const facturados: string[] = [];
  const reconciliacion = new ReconciliacionEnMemoria();
  const r = await sincronizarPagos({
    tenantId: T,
    client: cuenta(),
    clasificador: new ClasificadorPorReglas({ aprendizaje: new AprendizajeEnMemoria() }),
    reconciliacion,
    resolverReferencias: resolver,
    facturar: async (pago) => (facturados.push(pago.id), `inv_${pago.id}`),
  });

  const estado = Object.fromEntries((await reconciliacion.listar()).map((x) => [x.paymentId, x]));
  // Lo que en db9e142 quedaba NO_FACTURABLE para siempre: sale su factura, como en db9e142^.
  assert.deepEqual(facturados.sort(), ["libre", "pedido_ajeno", "prueba", "suelta", "turno_ajeno"]);

  // Ya facturados: no sale una segunda, con el motivo VERDADERO.
  assert.equal(estado.turno_fact.estado, "NO_FACTURABLE");
  assert.equal(estado.turno_fact.motivo, "Ya facturado con el turno del 24/09/2026 10:30.");
  assert.equal(estado.turno_marca.estado, "NO_FACTURABLE", "la marca de facturarAppointment también cuenta");
  assert.equal(estado.pedido_fact.estado, "NO_FACTURABLE");
  assert.equal(estado.pedido_fact.motivo, "Ya facturado con el pedido #77.");

  // Existentes SIN factura: a la cola de revisión, nunca NO_FACTURABLE.
  assert.equal(estado.turno_sin.estado, "REVISAR");
  assert.match(estado.turno_sin.motivo ?? "", /^Cobro del turno del 24\/09\/2026 12:30 sin factura: facturalo desde el turno o aprobá la factura suelta\.$/);
  assert.equal(estado.pedido_sin.estado, "REVISAR");
  assert.equal(estado.pedido_sin.motivo, "Cobro del pedido #78 sin factura: facturalo desde Ventas del día («Facturar») o aprobá la factura suelta.");
  assert.equal(estado.pedido_rech.estado, "REVISAR", "una factura rechazada por ARCA no es una factura");
  assert.match(estado.pedido_rech.motivo ?? "", /ARCA rechazó/);

  assert.deepEqual(
    { facturados: r.facturados, noFacturables: r.noFacturables, aRevisar: r.aRevisar },
    { facturados: 5, noFacturables: 3, aRevisar: 3 },
  );
  // Una consulta de pedidos y una de turnos para TODA la página, no una por pago.
  assert.deepEqual(viajes, { order: 1, appointment: 1 });
});

test("ni una corrección aprendida ni una regla del comercio sacan factura suelta de un turno o pedido del negocio", async () => {
  const { resolver } = baseFalsa();
  const aprendizaje = new AprendizajeEnMemoria();
  await aprendizaje.registrar({ operacion: "pago", clasificacion: "FACTURABLE" });
  const facturados: string[] = [];
  const reconciliacion = new ReconciliacionEnMemoria();
  await sincronizarPagos({
    tenantId: T,
    client: cuenta(),
    clasificador: new ClasificadorPorReglas({
      aprendizaje,
      config: { reglasExtra: [{ id: "todo", descripcion: "todo se factura", cuando: () => true, clasificacion: "FACTURABLE" }] },
    }),
    reconciliacion,
    resolverReferencias: resolver,
    facturar: async (pago) => (facturados.push(pago.id), "x"),
  });
  for (const id of ["turno_fact", "turno_marca", "turno_sin", "pedido_fact", "pedido_sin", "pedido_rech"]) {
    assert.ok(!facturados.includes(id), id);
  }
});

test("sin resolutor, un pago CON referencia no se factura ni se descarta: va a revisión", async () => {
  const reconciliacion = new ReconciliacionEnMemoria();
  const facturados: string[] = [];
  const r = await sincronizarPagos({
    tenantId: T,
    client: cuenta(),
    clasificador: new ClasificadorPorReglas(),
    reconciliacion,
    facturar: async (pago) => (facturados.push(pago.id), "x"),
  });
  assert.deepEqual(facturados, ["suelta"]);
  assert.equal(r.noFacturables, 0, "nada se pierde en silencio");
  assert.equal(r.aRevisar, CASOS.length - 1);
});

test("el aviso usa el MISMO resolutor: sólo factura el turno que existe; lo demás va a la ingesta", async () => {
  const { resolver } = baseFalsa();
  const mp = cuenta();
  const facturadosComoTurno: string[] = [];
  const aviso = (paymentId: string) =>
    procesarNotificacionPago(
      { type: "payment", paymentId, tenantId: T },
      {
        clientePara: () => mp,
        facturar: async (id) => (facturadosComoTurno.push(id), `inv_${id}`),
        resolverReferencias: resolver,
      },
    );
  // Texto libre, turno inexistente, turno o pedido de OTRO negocio: venta directa, a la ingesta.
  for (const id of ["libre", "prueba", "turno_ajeno", "pedido_ajeno", "suelta"]) {
    const r = await aviso(id);
    assert.equal(r.aLaIngesta, true, id);
    assert.equal(r.facturado, false, id);
  }
  assert.deepEqual(facturadosComoTurno, [], "antes intentaba facturar un 'turno' con id 'Seña Maria depilación'");

  // El turno del negocio: se factura el turno (idempotente del lado del Core), no suelto.
  const turno = await aviso("turno_sin");
  assert.deepEqual([turno.facturado, turno.aLaIngesta], [true, undefined]);
  assert.deepEqual(facturadosComoTurno, ["appt_sin"]);

  // El pedido del negocio con el cobro de pedidos sin conectar: a la ingesta (que lo deja en
  // revisión si no tiene factura), en vez de quedar sin registrar.
  const pedido = await aviso("pedido_sin");
  assert.equal(pedido.aLaIngesta, true);
  assert.equal(pedido.facturado, false);
});

test("estadoDeFacturacion: una factura rechazada no cuenta; la marca del turno sí, salvo que apunte a la rechazada", () => {
  assert.deepEqual(estadoDeFacturacion([]), { facturada: false });
  assert.deepEqual(estadoDeFacturacion([{ id: "i", status: "PENDING" }]), { facturada: true });
  assert.deepEqual(estadoDeFacturacion([{ id: "i", status: "REJECTED" }]), { facturada: false, facturaRechazada: true });
  assert.deepEqual(estadoDeFacturacion([], "i"), { facturada: true });
  assert.deepEqual(estadoDeFacturacion([{ id: "i", status: "REJECTED" }], "i"), { facturada: false, facturaRechazada: true });
});

test("las reglas del dueño (el clasificador del sincronizado real) pasan la venta resuelta al paso 0", async () => {
  const { clasificadorConReglasDelDueno } = await import("./mercadopago-auto");
  const c = clasificadorConReglasDelDueno(new ClasificadorPorReglas(), {
    umbralIdentificacion: 1_000_000,
    capFacturasMes: 100,
    facturasDelMes: async () => 0,
  });
  const pago = { id: "p", estado: "approved" as const, monto: 5000, externalReference: "appt_sin" };
  const venta = { tipo: "turno" as const, id: "appt_sin", etiqueta: "del 24/09/2026 12:30", facturada: false };
  const r = await c.clasificar(pago, T, { venta });
  assert.deepEqual([r.clasificacion, r.reglaId], ["REVISAR", "cobro-sin-factura"], "sin pasarla, sería 'referencia-sin-verificar'");
  const libre = await c.clasificar({ ...pago, externalReference: "Seña" }, T, { venta: null });
  assert.equal(libre.clasificacion, "FACTURABLE");
});
