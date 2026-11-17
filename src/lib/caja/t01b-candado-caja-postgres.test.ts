// ============================================================================
// MIA-075 · T01b · todo asiento de caja dentro del candado, contra Postgres real: base efímera migrada, rol app_rls
// sin BYPASSRLS, las Server Actions y los servicios reales, y `cerrarDia` real del otro lado.
//
// La carrera (cert. MIA-064, corrección 4): el cierre del día corre en Serializable y saca su foto en la primera
// sentencia, ANTES de esperar el candado `cierre-dia:<negocio>`. Un asiento que confirma mientras el cierre espera no
// entra en esa foto: el cierre cierra sin contarlo (asienta un sobrante o un faltante falso) y el libro queda con una
// fila en un día cerrado. T01 lo cerró para Proyectos (`transaccionQueAsienta`); acá se prueba cada otro camino que
// escribe en `CashMovement`.
//
// Cada caso, con dos conexiones más que la app:
//   1. `h` toma el candado del negocio (como un cierre que todavía no confirmó);
//   2. arranca el `cerrarDia` real: saca su foto y queda esperando el candado (visto en `pg_locks`);
//   3. arranca el camino real que asienta (o borra) en la caja;
//   4. `h` suelta. El cierre corre con la foto del paso 2.
// Invariante (escrito a mano antes de correr, R7): lo que el libro tiene del día es lo que el cierre contó, y el
// camino que no entró lo dice con «cerrada». Sin candado en el camino, el asiento confirma en el paso 3 y el cierre no
// lo ve: el libro tiene una fila más (o una menos, si borró) que lo que el cierre contó. Con candado, el camino espera
// detrás del cierre, ve el día cerrado y se rechaza: libro y cierre coinciden.
// Segunda vuelta, «asiento primero» (sólo se llega con la primera en verde, que no escribió nada): se reabre el día y el
// MISMO camino entra primero en la fila del candado, el cierre detrás. El asiento confirma y el cierre, que sacó su foto
// antes, tiene que contarlo igual: eso lo da Serializable en los dos lados (el ciclo aborta al cierre y su reintento lo
// ve). Con el asiento en Read Committed el cierre no lo cuenta.
//
// Reloj fijado: `Date` vale AHORA en todo el archivo.
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
/** 17/11/2026 a las 15:00 en Buenos Aires: el día de caja es «2026-11-17». */
const AHORA = Date.parse("2026-11-17T18:00:00Z");
const HOY = "2026-11-17";
/** Fin del 17/11 en Buenos Aires (00:00 del 18/11, UTC−3). */
const FIN_DE_HOY = new Date("2026-11-18T03:00:00Z");
const MARCA_DEL_CIERRE = "cierre-diario:";

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  mock.timers.enable({ apis: ["Date"], now: AHORA });
  t.after(() => mock.timers.reset());
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(usuarioId: string, fn: () => Promise<R>, negocio: NegocioDePrueba = a): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const enSesion = <R>(fn: () => Promise<R>) => como(a.duenia.id, fn);
  // Cada caso arranca con el libro de A vacío, el día abierto y sin turno: el cierre cuenta sólo lo del caso.
  await duenio.auditLog.deleteMany({ where: { tenantId: a.id, entity: { in: ["CierreDiario", "CierreMes"] } } });
  await duenio.cashMovement.deleteMany({ where: { tenantId: a.id } });
  await duenio.cashSession.updateMany({ where: { tenantId: a.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date(AHORA) } });
  return { base, duenio, a, b, form, como, enSesion };
}

type P = NonNullable<Awaited<ReturnType<typeof preparar>>>;

/** Las filas del libro de A hasta el fin de hoy, sin los ajustes que escribe el propio cierre. */
const filasDelDia = (p: P) =>
  p.duenio.cashMovement.count({ where: { tenantId: p.a.id, occurredAt: { lt: FIN_DE_HOY }, NOT: { createdBy: { startsWith: MARCA_DEL_CIERRE } } } });

/**
 * La carrera del encabezado. `asentar` corre el camino real; vuelve lo que el camino respondió (o el error, como texto).
 * Falla si el libro y el cierre no coinciden, o si el camino que no entró no dice «cerrada».
 */
async function carreraConElCierre(p: P, t: import("node:test").TestContext, que: string, asentar: () => Promise<unknown>) {
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const abrir = async () => {
    const c = new pg.Client({ connectionString: p.base.urlDuenio });
    await c.connect();
    t.after(() => c.end().catch(() => {}));
    return c;
  };
  const h = await abrir();
  const espia = await abrir();
  const esperando = async () =>
    (await espia.query(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`)).rows[0].n as number;
  const antes = await filasDelDia(p);

  await h.query("BEGIN");
  await h.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`cierre-dia:${p.a.id}`]);
  let soltado = false;
  const soltar = async () => {
    if (!soltado) await h.query("COMMIT");
    soltado = true;
  };
  t.after(soltar);

  // 2. El cierre real saca su foto y espera el candado.
  const cierre = p.enSesion(() => cerrarDia(p.form({ day: HOY, declarado_EFECTIVO: "0", declarado_MP: "0", declarado_TARJETA: "0", note: "Carrera T01b" })));
  cierre.catch(() => {});
  for (let i = 0; i < 400 && (await esperando()) < 1; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(await esperando(), 1, "el cierre del día quedó esperando el candado");

  // 3. El camino real. Sin candado confirma ya; con candado queda segundo en la fila.
  let termino = false;
  const asiento = asentar().then(
    (v) => ({ respuesta: v as unknown }),
    (e: unknown) => ({ respuesta: `error: ${e instanceof Error ? e.message : String(e)}` }),
  ).finally(() => (termino = true));
  for (let i = 0; i < 400 && !termino && (await esperando()) < 2; i++) await new Promise((r) => setTimeout(r, 25));

  // 4. Suelta: el cierre corre con la foto del paso 2.
  await soltar();
  const rc = await cierre;
  assert.equal(rc?.ok, true, `el cierre del día confirma: ${JSON.stringify(rc)}`);
  const { respuesta } = await asiento;
  const registro = await p.duenio.auditLog.findFirst({ where: { tenantId: p.a.id, action: "caja.cierre-diario", entityId: HOY }, select: { changes: true } });
  const contados = (registro?.changes as { movimientos?: number } | null)?.movimientos;
  const enElLibro = await filasDelDia(p);
  const texto = typeof respuesta === "string" ? respuesta : String(JSON.stringify(respuesta));
  assert.equal(
    enElLibro,
    contados,
    `${que}: el libro tiene ${enElLibro} movimientos hasta hoy (antes ${antes}) y el cierre contó ${contados}. Respuesta del camino: ${texto}`,
  );
  assert.equal(enElLibro, antes, `${que}: con el día cerrado por delante, el libro queda como estaba. Respuesta: ${texto}`);
  assert.match(texto, /cerrad/i, `${que}: el rechazo dice que el día está cerrado: ${texto}`);
  assert.doesNotMatch(texto, /"ok":true/, `${que}: no responde éxito sin haber asentado`);

  // Segunda vuelta: asiento primero. El día se reabre (sin los ajustes del cierre de la primera vuelta).
  await p.duenio.auditLog.deleteMany({ where: { tenantId: p.a.id, entity: "CierreDiario" } });
  await p.duenio.cashMovement.deleteMany({ where: { tenantId: p.a.id, createdBy: { startsWith: MARCA_DEL_CIERRE } } });
  const h2 = await abrir();
  await h2.query("BEGIN");
  await h2.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`cierre-dia:${p.a.id}`]);
  let soltado2 = false;
  const soltar2 = async () => {
    if (!soltado2) await h2.query("COMMIT");
    soltado2 = true;
  };
  t.after(soltar2);
  let termino2 = false;
  const asiento2 = asentar().then(
    (v) => ({ respuesta: v as unknown }),
    (e: unknown) => ({ respuesta: `error: ${e instanceof Error ? e.message : String(e)}` }),
  ).finally(() => (termino2 = true));
  for (let i = 0; i < 400 && !termino2 && (await esperando()) < 1; i++) await new Promise((r) => setTimeout(r, 25));
  if (termino2) {
    await soltar2();
    assert.fail(`${que}: el camino no esperó el candado del cierre: ${JSON.stringify((await asiento2).respuesta)}`);
  }
  const cierre2 = p.enSesion(() => cerrarDia(p.form({ day: HOY, declarado_EFECTIVO: "0", declarado_MP: "0", declarado_TARJETA: "0", note: "Carrera T01b, asiento primero" })));
  cierre2.catch(() => {});
  for (let i = 0; i < 400 && (await esperando()) < 2; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(await esperando(), 2, "el cierre del día quedó en la fila detrás del asiento");
  await soltar2();
  const r2 = (await asiento2).respuesta;
  const texto2 = typeof r2 === "string" ? r2 : String(JSON.stringify(r2));
  const rc2 = await cierre2;
  assert.equal(rc2?.ok, true, `el cierre del día confirma: ${JSON.stringify(rc2)}`);
  const registro2 = await p.duenio.auditLog.findFirst({ where: { tenantId: p.a.id, action: "caja.cierre-diario", entityId: HOY }, select: { changes: true } });
  const contados2 = (registro2?.changes as { movimientos?: number } | null)?.movimientos;
  const enElLibro2 = await filasDelDia(p);
  assert.notEqual(enElLibro2, antes, `${que}, asiento primero: el camino entró. Respuesta: ${texto2}`);
  assert.doesNotMatch(texto2, /cerrad/i, `${que}, asiento primero: no se rechaza: ${texto2}`);
  assert.equal(enElLibro2, contados2, `${que}, asiento primero: el libro tiene ${enElLibro2} movimientos hasta hoy y el cierre contó ${contados2}`);
  return respuesta;
}

// ─── Libro de caja a mano (`libro-caja-actions.ts`) ─────────────────────────────

test("T01b · libro a mano, cargar: un ingreso que llega con el cierre del día en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { addLibroEntry } = await import("@/lib/libro-caja-actions");
  await carreraConElCierre(p, t, "addLibroEntry", () =>
    p.enSesion(() => addLibroEntry({ ok: false, error: "" } as never, p.form({ type: "INGRESO", method: "EFECTIVO", amount: "300", detail: "Carrera T01b · libro", date: HOY, viewMonth: HOY.slice(0, 7), confirm: "1" }))),
  );
});

test("T01b · libro a mano, borrar: un borrado que llega con el cierre del día en marcha no saca una fila que el cierre contó", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { deleteLibroEntry } = await import("@/lib/libro-caja-actions");
  const fila = await p.duenio.cashMovement.create({
    data: { tenantId: p.a.id, type: "INGRESO", method: "EFECTIVO", amount: 300, reason: "Carrera T01b · a borrar", occurredAt: new Date(AHORA - 3_600_000), createdBy: `user:${p.a.duenia.id}` },
    select: { id: true },
  });
  await carreraConElCierre(p, t, "deleteLibroEntry", () => p.enSesion(() => deleteLibroEntry({ ok: false, error: "" } as never, p.form({ id: fila.id }))));
  // La primera vuelta no la borró (lo verifica la carrera); la segunda, con el borrado primero en la fila, sí.
  assert.equal(await p.duenio.cashMovement.count({ where: { id: fila.id } }), 0, "asiento primero: el borrado entró y el cierre lo contó así");
});

// ─── Los otros caminos que asientan en la caja ──────────────────────────────────
// Cada uno por su punto de entrada real (la acción o el servicio que abre la transacción). Lo que hace falta
// antes (pedidos, turnos, compras) se siembra como dueño de la base y confirma ANTES de la carrera.
//
// Sin caso acá (medido con esta misma carrera): los caminos que ya corren en Serializable y leen la frontera del
// día (`lastClosedDayTx`) —cobro de cuenta corriente, pago a cuenta y cheque rechazado de vouchers, anular cobro de
// turno, reintegro de devolución a proveedor—. El ciclo SSI frontera↔libro aborta el cierre, que se reintenta y
// cuenta el asiento: libro y cierre coinciden. Tampoco el arqueo del turno: con el turno abierto en su foto, el
// cierre no cierra.

let n = 0;

/** El formulario de una venta de mostrador cobrada: 1 kg de un corte a `precio` el kilo. */
async function formDeVenta(p: P, precio: number, medio = "EFECTIVO", extra: [string, string][] = []) {
  n += 1;
  const corte = await p.duenio.product.create({ data: { tenantId: p.a.id, name: `Corte T01b ${n}`, saleUnit: "WEIGHT", pricePerKg: precio, unit: "kg", trackStock: false } });
  const fd = p.form({ channel: "COUNTER", fulfillment: "PICKUP", customerName: "Mostrador", paid: "on", paymentMethod: medio, idempotencyKey: `t01b-venta-${n}` });
  for (const [k, v] of [["productId", corte.id], ["quantity", "1"], ...extra]) fd.append(k, v);
  return { fd, corte };
}

/** Una venta de mostrador cobrada en efectivo por la acción real, ANTES de la carrera: el pedido y su VENTA. */
async function vender(p: P, precio: number) {
  const { createOrder } = await import("@/lib/order-actions");
  const { fd, corte } = await formDeVenta(p, precio);
  const r = await p.enSesion(() => createOrder(fd));
  assert.ok(r?.ok, JSON.stringify(r));
  const orden = await p.duenio.order.findFirstOrThrow({ where: { tenantId: p.a.id, items: { some: { productId: corte.id } } }, select: { id: true } });
  return { id: orden.id, corte };
}

/** Box, servicio y profesional de A (una vez por archivo: la base es la misma para todos los casos). */
let catalogo: { boxId: string; serviceId: string } | null = null;
async function turno(p: P, o: { status: "PENDING" | "COMPLETED"; cobrado?: boolean; comision?: boolean }) {
  catalogo ??= await (async () => {
    const box = await p.duenio.box.create({ data: { tenantId: p.a.id, name: "Box T01b" } });
    const s = await p.duenio.service.create({ data: { tenantId: p.a.id, name: "Masaje T01b", durationMin: 60, price: 18_000 } });
    return { boxId: box.id, serviceId: s.id };
  })();
  n += 1;
  const prof = await p.duenio.professional.create({
    data: { tenantId: p.a.id, name: `Prof T01b ${n}`, boxId: catalogo.boxId, commissionPercent: o.comision ? 40 : undefined, services: { connect: [{ id: catalogo.serviceId }] } },
  });
  const clienta = await p.duenio.client.create({ data: { tenantId: p.a.id, name: `Clienta T01b ${n}`, phone: `1170${String(n).padStart(6, "0")}` } });
  const inicio = new Date(AHORA - 3 * 3_600_000);
  const a = await p.duenio.appointment.create({
    data: { tenantId: p.a.id, clientId: clienta.id, professionalId: prof.id, serviceId: catalogo.serviceId, boxId: catalogo.boxId, startsAt: inicio, endsAt: new Date(inicio.getTime() + 3_600_000), status: o.status, priceAtBooking: 18_000 },
  });
  if (o.cobrado) {
    await p.duenio.payment.create({ data: { tenantId: p.a.id, appointmentId: a.id, amount: 18_000, method: "EFECTIVO", status: "APPROVED" } });
    await p.duenio.collection.create({ data: { tenantId: p.a.id, originType: "APPOINTMENT", originId: a.id, appointmentId: a.id, amount: 18_000, method: "EFECTIVO", collectedBy: "test" } });
  }
  return { turnoId: a.id, profId: prof.id };
}

test("T01b · venta de mostrador: una venta en efectivo que llega con el cierre del día en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { createOrder } = await import("@/lib/order-actions");
  const { fd } = await formDeVenta(p, 5_000);
  await carreraConElCierre(p, t, "createOrder (mostrador, efectivo)", () => p.enSesion(() => createOrder(fd)));
});

test("T01b · cobro de turno: el cobro al terminar el turno que llega con el cierre en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { terminarYCobrarDividido } = await import("@/lib/turnos/cobro-actions");
  const { turnoId } = await turno(p, { status: "PENDING" });
  const pagos = JSON.stringify([{ metodo: "EFECTIVO", monto: 10_000 }, { metodo: "MERCADOPAGO", monto: 8_000 }]);
  await carreraConElCierre(p, t, "terminarYCobrarDividido", () => p.enSesion(() => terminarYCobrarDividido(p.form({ appointmentId: turnoId, pagos, vino: "on" }))));
});

test("T01b · pago mixto: la venta con dos medios que llega con el cierre en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { createOrder } = await import("@/lib/order-actions");
  const mixto: [string, string][] = [["pagado", "1"], ["pago.medio", "EFECTIVO"], ["pago.monto", "3000.00"], ["pago.medio", "MERCADOPAGO"], ["pago.monto", "2000.00"]];
  const { fd } = await formDeVenta(p, 5_000, "EFECTIVO", mixto);
  await carreraConElCierre(p, t, "createOrder (pago mixto)", () => p.enSesion(() => createOrder(fd)));
});

test("T01b · saldo del pedido: el cobro del saldo de un pedido que pesó más, con el cierre en marcha, no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { cobrarPedido } = await import("@/lib/order-actions");
  n += 1;
  const o = await p.duenio.order.create({ data: { tenantId: p.a.id, code: 900 + n, customerName: "Pedido T01b", customerPhone: "", subtotal: 1_000, total: 1_000 }, select: { id: true } });
  await p.duenio.collection.create({ data: { tenantId: p.a.id, originType: "ORDER", originId: o.id, orderId: o.id, amount: 400, method: "MERCADOPAGO", collectedBy: "test" } });
  await carreraConElCierre(p, t, "cobrarPedido (saldo)", () =>
    p.enSesion(() => cobrarPedido(null, p.form({ id: o.id, paymentMethod: "EFECTIVO", pagado: "1", paid: "on" }))),
  );
});

test("T01b · anular venta: la anulación de una venta cobrada que llega con el cierre en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { anularVenta } = await import("@/lib/order-actions");
  const { id } = await vender(p, 7_200);
  await carreraConElCierre(p, t, "anularVenta", () => p.enSesion(() => anularVenta(null, p.form({ id, motivo: "se pesó mal" }))));
});

/** Una orden de taller de A, con vehículo, lista para cobrar. */
async function ordenDeTaller(p: P) {
  n += 1;
  const v = await p.duenio.tallerVehiculo.create({ data: { tenantId: p.a.id, clientId: p.a.clientes[0], patente: `TB${100 + n}CD` } });
  return p.duenio.tallerOrden.create({ data: { tenantId: p.a.id, numero: 500 + n, vehiculoId: v.id, clientId: p.a.clientes[0], token: `t01b-${p.a.id}-${n}` }, select: { id: true } });
}

test("T01b · taller, cobrar: el cobro de una orden que llega con el cierre en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { registrarPago } = await import("@/lib/taller/acciones");
  const orden = await ordenDeTaller(p);
  await carreraConElCierre(p, t, "taller registrarPago", () => p.enSesion(() => registrarPago(p.form({ ordenId: orden.id, medio: "EFECTIVO", monto: "5000" }))));
});

test("T01b · taller, anular cobro: la contrapartida que llega con el cierre en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { registrarPago, anularPago } = await import("@/lib/taller/acciones");
  const orden = await ordenDeTaller(p);
  await p.enSesion(() => registrarPago(p.form({ ordenId: orden.id, medio: "EFECTIVO", monto: "5000" })));
  const pago = await p.duenio.tallerPago.findFirstOrThrow({ where: { ordenId: orden.id }, select: { id: true } });
  await carreraConElCierre(p, t, "taller anularPago", () => p.enSesion(() => anularPago(p.form({ id: pago.id, motivo: "medio equivocado" }))));
});

test("T01b · ajuste por peso: la devolución de un pedido cobrado que pesó menos, con el cierre en marcha, no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { updateOrderItems } = await import("@/lib/order-actions");
  const { id, corte } = await vender(p, 10_000);
  await p.duenio.order.update({ where: { id }, data: { status: "PENDING" } }); // en curso: se puede pesar
  const fd = p.form({ id });
  fd.append("productId", corte.id);
  fd.append("quantity", "0.5");
  await carreraConElCierre(p, t, "updateOrderItems (pesó menos)", () => p.enSesion(() => updateOrderItems({ ok: false, error: "" } as never, fd)));
});

test("T01b · compra pagada: el egreso de una compra en efectivo que llega con el cierre en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { insertStockPurchase } = await import("@/lib/stock/purchase-core");
  n += 1;
  const prod = await p.duenio.product.create({ data: { tenantId: p.a.id, name: `Bife T01b ${n}`, saleUnit: "UNIT", price: 6_000, stock: 0, trackStock: true } });
  await carreraConElCierre(p, t, "insertStockPurchase (pagada)", () =>
    p.enSesion(() =>
      insertStockPurchase(p.a.id, {
        kind: "COMPRA", supplier: "Proveedor T01b", notes: null, createdBy: `user:${p.a.duenia.id}`,
        items: [{ productId: prod.id, qty: 2, unitCost: 500 }], pago: { estado: "PAGADA", method: "EFECTIVO" },
      }),
    ),
  );
});

test("T01b · comisiones: la liquidación pagada en efectivo que llega con el cierre en marcha no queda fuera de lo contado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { settleCommissions } = await import("@/lib/commission-actions");
  const { profId } = await turno(p, { status: "COMPLETED", cobrado: true, comision: true });
  // Responde con una redirección: se corre con `ejecutarAccion` y se devuelve lo que salió.
  await carreraConElCierre(p, t, "settleCommissions", () =>
    ejecutarAccion({ negocio: p.a, usuario: { id: p.a.duenia.id } }, () => settleCommissions(p.form({ professionalId: profId, method: "EFECTIVO" }))),
  );
});
