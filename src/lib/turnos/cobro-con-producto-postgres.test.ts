/**
 * Cobro único turno + productos (Venta y agenda simples, T1), EJECUTADO contra Postgres con RLS,
 * con la Server Action real y la sesión de la recepción:
 *
 *   · apagado · sin el interruptor, la acción no hace nada (y lo dice);
 *   · A prendido · turno $18.000 + 1 crema $6.000 en UNA tx: 1 Collection del turno, 1 Order,
 *     stock −1 (movimiento VENTA), asiento del cobro y asiento de la venta, turno COMPLETED;
 *   · stock que no alcanza · nada escrito (ni cobro, ni orden, ni stock, ni turno);
 *   · doble envío (seguido y a la vez) con la misma clave · un solo cobro y una sola orden;
 *   · B · no ve los productos de A, no cobra el turno de A, no vende un producto de A;
 *   · caja cerrada (DB-5) · rechazo con el motivo y nada escrito;
 *   · reenvío con la misma clave · idéntico → ok con el total GRABADO; con otros productos → ok:false
 *     con lo que sí se cobró y nada nuevo escrito, en A y en B;
 *   · producto por unidad con 0,001 → rechazo y nada escrito, en A y en B.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const HORA = 3_600_000;

type Negocio = {
  turno: (clienta: string) => Promise<string>;
  producto: (nombre: string, stock: number, precio?: number) => Promise<string>;
};
type Sembrado = { base: BaseEfimera; a: Negocio; b: Negocio };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "3", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  let n = 0;
  const negocio = async (tenantId: string): Promise<Negocio> => {
    const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
    const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 30, price: 18000 } });
    const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
    return {
      turno: async (clienta) => {
        const clientId = (await duenio.client.create({ data: { tenantId, name: clienta, phone: `114000500${n}` } })).id;
        const startsAt = new Date(Date.now() - 24 * HORA - n++ * 24 * HORA);
        const a = await duenio.appointment.create({
          data: {
            tenantId,
            clientId,
            professionalId: caro.id,
            serviceId: servicio.id,
            boxId: box.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + HORA / 2),
            status: "CONFIRMED",
            priceAtBooking: 18000,
          },
        });
        return a.id;
      },
      producto: async (nombre, stock, precio = 6000) =>
        (await duenio.product.create({ data: { tenantId, name: nombre, price: precio, stock, trackStock: true, saleUnit: "UNIT" } })).id,
    };
  };
  sembrado = { base, a: await negocio(base.a.id), b: await negocio(base.b.id) };
  return sembrado;
}

async function prender(s: Sembrado, negocio: NegocioDePrueba) {
  const duenio = await prismaComoDuenio(s.base);
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { VENTA_AGENDA_SIMPLE } = await import("@/cambios/interruptores");
  await duenio.auditLog.create({ data: filaDeInterruptor({ tenantId: negocio.id, interruptor: VENTA_AGENDA_SIMPLE, accion: "encender", operador: "test" }) });
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

function campos(appointmentId: string, productos: { productId: string; qty: number }[], clave = randomUUID()) {
  return fd({ appointmentId, method: "EFECTIVO", productos: JSON.stringify(productos), clave, facturar: "false" });
}

async function como<R>(negocio: NegocioDePrueba, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion({ negocio, usuario: negocio.recepcion }, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió (¿tiró crudo?): ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

/** Todo lo que el cobro pudo escribir para ese turno y ese producto, mirado como dueño de la base. */
async function foto(s: Sembrado, appointmentId: string, productId: string) {
  const duenio = await prismaComoDuenio(s.base);
  const [turno, cobros, producto, items] = await Promise.all([
    duenio.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { status: true } }),
    duenio.collection.findMany({ where: { appointmentId }, select: { id: true, amount: true, method: true } }),
    duenio.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } }),
    duenio.orderItem.findMany({ where: { productId }, select: { orderId: true } }),
  ]);
  const ordenes = [...new Set(items.map((i) => i.orderId))];
  const [libroTurno, libroVenta, movimientos] = await Promise.all([
    duenio.cashMovement.findMany({ where: { collectionId: { in: cobros.map((c) => c.id) } }, select: { amount: true } }),
    duenio.cashMovement.findMany({ where: { orderId: { in: ordenes } }, select: { amount: true } }),
    duenio.stockMovement.findMany({ where: { productId, type: "VENTA" }, select: { qty: true } }),
  ]);
  return {
    status: turno.status,
    cobros: cobros.map((c) => c.amount.toNumber()),
    ordenes: ordenes.length,
    stock: producto.stock,
    libroTurno: libroTurno.map((m) => Number(m.amount)),
    libroVenta: libroVenta.map((m) => Number(m.amount)),
    ventasDeStock: movimientos.map((m) => m.qty),
  };
}

test("apagado · sin el interruptor, no cobra ni vende nada", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarTurnoConProductos } = await import("./cobro-con-producto-actions");
  const turno = await s.a.turno("Apagada");
  const crema = await s.a.producto("Crema apagada", 5);
  const r = await como(s.base.a, () => cobrarTurnoConProductos(campos(turno, [{ productId: crema, qty: 1 }])));
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /no está prendido/);
  assert.deepEqual(await foto(s, turno, crema), { status: "CONFIRMED", cobros: [], ordenes: 0, stock: 5, libroTurno: [], libroVenta: [], ventasDeStock: [] });
  // Prendido de acá en adelante, en los dos negocios.
  await prender(s, s.base.a);
  await prender(s, s.base.b);
});

test("A prendido · turno + crema en una tx: 1 cobro, 1 orden, stock −1, dos asientos, COMPLETED", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarTurnoConProductos } = await import("./cobro-con-producto-actions");
  const turno = await s.a.turno("Lucía");
  const crema = await s.a.producto("Crema", 5);
  const r = await como(s.base.a, () => cobrarTurnoConProductos(campos(turno, [{ productId: crema, qty: 1 }])));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.ok && r.total, 24000);
  assert.deepEqual(await foto(s, turno, crema), {
    status: "COMPLETED",
    cobros: [18000],
    ordenes: 1,
    stock: 4,
    libroTurno: [18000],
    libroVenta: [6000],
    ventasDeStock: [-1],
  });
});

test("stock que no alcanza · nada escrito (ni cobro, ni orden, ni stock, ni turno)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarTurnoConProductos } = await import("./cobro-con-producto-actions");
  const turno = await s.a.turno("Marta");
  const serum = await s.a.producto("Sérum", 1);
  const r = await como(s.base.a, () => cobrarTurnoConProductos(campos(turno, [{ productId: serum, qty: 2 }])));
  assert.equal(r.ok, false);
  assert.deepEqual(await foto(s, turno, serum), { status: "CONFIRMED", cobros: [], ordenes: 0, stock: 1, libroTurno: [], libroVenta: [], ventasDeStock: [] });
});

test("doble envío · seguido y a la vez, con la misma clave → un cobro y una orden", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarTurnoConProductos } = await import("./cobro-con-producto-actions");
  const esperado = { status: "COMPLETED", cobros: [18000], ordenes: 1, stock: 9, libroTurno: [18000], libroVenta: [6000], ventasDeStock: [-1] };

  const t1 = await s.a.turno("Seguido");
  const p1 = await s.a.producto("Crema seguido", 10);
  const clave1 = randomUUID();
  const r1 = await como(s.base.a, () => cobrarTurnoConProductos(campos(t1, [{ productId: p1, qty: 1 }], clave1)));
  const r2 = await como(s.base.a, () => cobrarTurnoConProductos(campos(t1, [{ productId: p1, qty: 1 }], clave1)));
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.deepEqual(await foto(s, t1, p1), esperado);

  const t2 = await s.a.turno("A la vez");
  const p2 = await s.a.producto("Crema a la vez", 10);
  const clave2 = randomUUID();
  const rs = await Promise.all([
    como(s.base.a, () => cobrarTurnoConProductos(campos(t2, [{ productId: p2, qty: 1 }], clave2))),
    como(s.base.a, () => cobrarTurnoConProductos(campos(t2, [{ productId: p2, qty: 1 }], clave2))),
  ]);
  assert.ok(rs.some((r) => r.ok), JSON.stringify(rs));
  assert.deepEqual(await foto(s, t2, p2), esperado);
});

test("B · no ve los productos de A, no cobra el turno de A ni vende un producto de A", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarTurnoConProductos, productosParaElTurno } = await import("./cobro-con-producto-actions");
  const turnoA = await s.a.turno("De A");
  const cremaA = await s.a.producto("Crema de A", 5);
  const turnoB = await s.b.turno("De B");
  const cremaB = await s.b.producto("Crema de B", 5);

  const lista = await como(s.base.b, () => productosParaElTurno());
  assert.equal(lista.ok, true);
  const ids = lista.ok ? lista.productos.map((p) => p.id) : [];
  assert.ok(ids.includes(cremaB));
  assert.ok(!ids.includes(cremaA), "B ve un producto de A");

  const ajeno = await como(s.base.b, () => cobrarTurnoConProductos(campos(turnoA, [{ productId: cremaB, qty: 1 }])));
  assert.deepEqual(ajeno, { ok: false, error: "Ese turno ya no existe. Recargá la agenda." });
  const productoAjeno = await como(s.base.b, () => cobrarTurnoConProductos(campos(turnoB, [{ productId: cremaA, qty: 1 }])));
  assert.equal(productoAjeno.ok, false);

  const vacio = { cobros: [], ordenes: 0, stock: 5, libroTurno: [], libroVenta: [], ventasDeStock: [] };
  assert.deepEqual(await foto(s, turnoA, cremaA), { status: "CONFIRMED", ...vacio });
  assert.deepEqual(await foto(s, turnoB, cremaB), { status: "CONFIRMED", ...vacio });
});

test("reenvío con la misma clave · idéntico → total real; otros productos → ok:false y nada nuevo (A y B)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarTurnoConProductos } = await import("./cobro-con-producto-actions");
  for (const [negocio, n] of [[s.base.a, s.a], [s.base.b, s.b]] as const) {
    const turno = await n.turno("Reenvío");
    const p1 = await n.producto("Crema reenvío", 5);
    const p2 = await n.producto("Sérum reenvío", 5, 9000);
    const clave = randomUUID();
    const r1 = await como(negocio, () => cobrarTurnoConProductos(campos(turno, [{ productId: p1, qty: 1 }], clave)));
    assert.deepEqual(r1.ok && r1.total, 24000, JSON.stringify(r1));

    const igual = await como(negocio, () => cobrarTurnoConProductos(campos(turno, [{ productId: p1, qty: 1 }], clave)));
    assert.equal(igual.ok, true, JSON.stringify(igual));
    assert.equal(igual.ok && igual.total, 24000);
    assert.equal(igual.ok && igual.orderCode, r1.ok ? r1.orderCode : -1);

    const otros = await como(negocio, () =>
      cobrarTurnoConProductos(campos(turno, [{ productId: p1, qty: 1 }, { productId: p2, qty: 1 }], clave)),
    );
    assert.deepEqual(otros, { ok: false, error: "Ese cobro ya se hizo con otros productos: $24.000. Si falta algo, sumalo como venta aparte." });

    const otroMedio = await como(negocio, () =>
      cobrarTurnoConProductos(fd({ appointmentId: turno, method: "TRANSFERENCIA", productos: JSON.stringify([{ productId: p1, qty: 1 }]), clave, facturar: "false" })),
    );
    assert.equal(otroMedio.ok, false);

    assert.deepEqual(await foto(s, turno, p1), { status: "COMPLETED", cobros: [18000], ordenes: 1, stock: 4, libroTurno: [18000], libroVenta: [6000], ventasDeStock: [-1] });
    assert.deepEqual(await foto(s, turno, p2), { status: "COMPLETED", cobros: [18000], ordenes: 0, stock: 5, libroTurno: [18000], libroVenta: [], ventasDeStock: [] });
  }
});

test("producto por unidad con 0,001 · rechazo y nada escrito (A y B)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarTurnoConProductos } = await import("./cobro-con-producto-actions");
  for (const [negocio, n] of [[s.base.a, s.a], [s.base.b, s.b]] as const) {
    const turno = await n.turno("Milésima");
    const p = await n.producto("Crema milésima", 5);
    const r = await como(negocio, () => cobrarTurnoConProductos(campos(turno, [{ productId: p, qty: 0.001 }])));
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /entero/);
    assert.deepEqual(await foto(s, turno, p), { status: "CONFIRMED", cobros: [], ordenes: 0, stock: 5, libroTurno: [], libroVenta: [], ventasDeStock: [] });
  }
});

// Último: cierra la caja de hoy del negocio A.
test("misma clave en OTRO turno del mismo negocio · se cobra de verdad, nunca ok sin cobro (A y B)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarTurnoConProductos } = await import("./cobro-con-producto-actions");
  for (const [negocio, n] of [[s.base.a, s.a], [s.base.b, s.b]] as const) {
    const t1 = await n.turno("Clave viajera 1");
    const t2 = await n.turno("Clave viajera 2");
    const p1 = await n.producto("Crema viajera 1", 5);
    const p2 = await n.producto("Crema viajera 2", 5);
    const clave = randomUUID();
    const r1 = await como(negocio, () => cobrarTurnoConProductos(campos(t1, [{ productId: p1, qty: 1 }], clave)));
    assert.equal(r1.ok && r1.total, 24000, JSON.stringify(r1));
    const r2 = await como(negocio, () => cobrarTurnoConProductos(campos(t2, [{ productId: p2, qty: 1 }], clave)));
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.equal(r2.ok && r2.total, 24000);
    assert.notEqual(r2.ok && r2.orderCode, r1.ok && r1.orderCode, "el turno 2 tiene su propia orden");
    assert.deepEqual(await foto(s, t2, p2), { status: "COMPLETED", cobros: [18000], ordenes: 1, stock: 4, libroTurno: [18000], libroVenta: [6000], ventasDeStock: [-1] });
    assert.deepEqual(await foto(s, t1, p1), { status: "COMPLETED", cobros: [18000], ordenes: 1, stock: 4, libroTurno: [18000], libroVenta: [6000], ventasDeStock: [-1] });
  }
});

test("caja cerrada (DB-5) · el cobro con productos se rechaza con el motivo y no escribe nada", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const { cobrarTurnoConProductos } = await import("./cobro-con-producto-actions");
  const turno = await s.a.turno("Olga");
  const crema = await s.a.producto("Crema del cierre", 5);
  await duenio.auditLog.create({
    data: { tenantId: s.base.a.id, actor: "user:test", action: "caja.cierre-diario", entity: "CierreDiario", entityId: todayInBusinessTz(), changes: {} },
  });
  const r = await como(s.base.a, () => cobrarTurnoConProductos(campos(turno, [{ productId: crema, qty: 1 }])));
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /ya está cerrada/);
  assert.deepEqual(await foto(s, turno, crema), { status: "CONFIRMED", cobros: [], ordenes: 0, stock: 5, libroTurno: [], libroVenta: [], ventasDeStock: [] });
});
