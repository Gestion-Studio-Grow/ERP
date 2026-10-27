// ============================================================================
// CARGAR VENTAS DEL CUADERNO — la acción REAL contra Postgres efímero (Magra, tanda 2 · 2E; MG-060)
// ============================================================================
//
// `cargarVentasDelCuaderno` → `createOrder` → `insertOrder`, con la sesión del Mostrador y RLS
// (`app_rls`), sobre una base efímera con dos negocios:
//   · 5 ventas del cuaderno de AYER con el día abierto → entran con SU hora: el pedido, el stock y el
//     asiento del libro quedan fechados a la hora en que se vendió; sin turno (el de hoy se abrió
//     después). Las de HOY entran al turno abierto (MG-060: «entran en la caja de hoy»);
//   · doble envío (recargar, tocar dos veces, dos a la vez) → no duplica pedido, stock ni caja;
//   · el día CERRADO → rechazo con su motivo, sin grabar nada;
//   · en el futuro, fuera de la ventana del rol, o con pago dividido → rechazo sin grabar;
//   · AISLAMIENTO: el otro negocio con el interruptor apagado no carga; con el interruptor prendido,
//     un producto del primero → rechazo, nada en ninguno de los dos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

const MIN = 60_000;
const DIA = 24 * 60 * MIN;

test("cargar ventas del cuaderno: con su hora, sin duplicar, día cerrado, futuro, ventana del rol y aislamiento", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { cargarVentasDelCuaderno } = await import("./acciones");
  const { createOrder } = await import("@/lib/order-actions");
  const { businessWallTimeToUtc, dateStrInBusinessTz, wallHourMinuteInBusinessTz } = await import("@/lib/datetime");
  const { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, CANAL_INTERRUPTOR, MOSTRADOR_BOUTIQUE } = await import("@/cambios/interruptores");
  const { CIERRE_DIARIO_ENTITY, CIERRE_DIARIO_ACTION } = await import("@/lib/caja/frontera-cierre");
  const { CUADERNO_APAGADO, CUADERNO_SOLO_VENTA_COBRADA } = await import("@/lib/cuaderno/hora-de-la-venta");

  const prender = (tenantId: string) =>
    duenio.auditLog.create({
      data: { tenantId, actor: "operator:test", action: ACCION_ENCENDER, entity: ENTIDAD_INTERRUPTOR, entityId: MOSTRADOR_BOUTIQUE, channel: CANAL_INTERRUPTOR },
    });
  await prender(base.a.id);

  const vacio = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Vacio", saleUnit: "WEIGHT", pricePerKg: 28600, unit: "kg", trackStock: true, stock: 20 },
  });
  const chorizo = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Chorizo", saleUnit: "UNIT", price: 1900, unit: "u", trackStock: true, stock: 50 },
  });

  const ahora = Date.now();
  const ayer = dateStrInBusinessTz(new Date(ahora - DIA));
  const haceCuatro = dateStrInBusinessTz(new Date(ahora - 4 * DIA));
  // El turno de HOY se abrió hace 3 horas: las ventas de ayer no son de su cajón.
  const turno = await duenio.cashSession.create({
    data: { tenantId: base.a.id, openedBy: `user:${base.a.recepcion.id}`, openingFloat: 0, openedAt: new Date(ahora - 3 * 60 * MIN) },
  });

  let n = 0;
  const clave = () => `cuaderno-test-${String(++n).padStart(4, "0")}`;
  const venta = (dia: string, hora: string, medio: string, renglones: { productId: string; cantidad: string }[], c = clave()) => ({
    clave: c,
    dia,
    hora,
    medio,
    renglones,
  });
  const cargar = async (negocio: typeof base.a, usuario: { id: string }, ventas: unknown[]) => {
    const r = await ejecutarAccion({ negocio, usuario }, () => cargarVentasDelCuaderno(ventas));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    const v = (r as { valor: Awaited<ReturnType<typeof cargarVentasDelCuaderno>> }).valor;
    assert.ok(v.ok, JSON.stringify(v));
    return v.resultados;
  };
  const foto = async (tenantId: string) => ({
    pedidos: await duenio.order.count({ where: { tenantId } }),
    caja: await duenio.cashMovement.count({ where: { tenantId } }),
    stock: await duenio.stockMovement.count({ where: { tenantId } }),
    vacio: (await duenio.product.findFirst({ where: { id: vacio.id }, select: { stock: true } }))?.stock,
    chorizo: (await duenio.product.findFirst({ where: { id: chorizo.id }, select: { stock: true } }))?.stock,
  });
  const mostrador = base.a.recepcion;

  // ── 1 · Cinco ventas del cuaderno de AYER, con el día abierto: entran con SU hora ──────────────
  const deAyer = [
    venta(ayer, "11:20", "EFECTIVO", [{ productId: vacio.id, cantidad: "1,1" }]),
    venta(ayer, "11:35", "MERCADOPAGO", [{ productId: chorizo.id, cantidad: "6" }]),
    venta(ayer, "12:10", "TRANSFERENCIA", [
      { productId: vacio.id, cantidad: "0,5" },
      { productId: chorizo.id, cantidad: "2" },
    ]),
    venta(ayer, "9:05", "EFECTIVO", [{ productId: chorizo.id, cantidad: "1" }]),
    venta(ayer, "13:40", "EFECTIVO", [{ productId: vacio.id, cantidad: "2" }]),
  ];
  const r1 = await cargar(base.a, mostrador, deAyer);
  assert.deepEqual(
    r1.map((x) => x.estado),
    ["grabada", "grabada", "grabada", "grabada", "grabada"],
    JSON.stringify(r1),
  );
  // Se grabaron en el orden en que se vendieron (09:05 primero), con su número de venta.
  assert.deepEqual(r1.map((x) => x.clave), [deAyer[3].clave, deAyer[0].clave, deAyer[1].clave, deAyer[2].clave, deAyer[4].clave]);
  const esperado: Record<string, { hora: string; total: number; medio: string }> = {
    [deAyer[0].clave]: { hora: "11:20", total: 31460, medio: "EFECTIVO" },
    [deAyer[1].clave]: { hora: "11:35", total: 11400, medio: "MERCADOPAGO" },
    [deAyer[2].clave]: { hora: "12:10", total: 18100, medio: "TRANSFERENCIA" },
    [deAyer[3].clave]: { hora: "09:05", total: 1900, medio: "EFECTIVO" },
    [deAyer[4].clave]: { hora: "13:40", total: 57200, medio: "EFECTIVO" },
  };
  for (const [k, e] of Object.entries(esperado)) {
    const o: { id: string; createdAt: Date; total: number; paid: boolean; paymentMethod: string | null; channel: string } | null = await duenio.order.findFirst({
      where: { tenantId: base.a.id, idempotencyKey: `cuaderno:${k}` },
      select: { id: true, createdAt: true, total: true, paid: true, paymentMethod: true, channel: true },
    });
    assert.ok(o, `la venta ${k} quedó grabada`);
    const cuando = businessWallTimeToUtc(ayer, e.hora);
    assert.equal(o.createdAt.toISOString(), cuando.toISOString(), `el pedido de las ${e.hora} quedó con su hora`);
    assert.deepEqual([o.total, o.paid, o.paymentMethod, o.channel], [e.total, true, e.medio, "COUNTER"]);
    const mov: { occurredAt: Date; sessionId: string | null; amount: number; type: string; method: string }[] = await duenio.cashMovement.findMany({ where: { tenantId: base.a.id, orderId: o.id }, select: { occurredAt: true, sessionId: true, amount: true, type: true, method: true } });
    assert.equal(mov.length, 1, "un solo asiento por venta");
    assert.equal(mov[0].occurredAt.toISOString(), cuando.toISOString(), "el libro la asienta el día y la hora en que se vendió");
    assert.deepEqual([mov[0].type, mov[0].amount, mov[0].method], ["VENTA", e.total, e.medio === "EFECTIVO" ? "EFECTIVO" : "MP"]);
    assert.equal(mov[0].sessionId, null, "ayer: no es plata del cajón del turno de hoy");
    const stock: { createdAt: Date; type: string }[] = await duenio.stockMovement.findMany({ where: { tenantId: base.a.id, orderId: o.id }, select: { createdAt: true, type: true } });
    assert.ok(stock.length >= 1);
    for (const s of stock) assert.equal(s.createdAt.toISOString(), cuando.toISOString(), "el stock baja en su día");
  }
  const tras1 = await foto(base.a.id);
  assert.ok(Math.abs((tras1.vacio ?? 0) - 16.4) < 1e-6, `vacío: ${tras1.vacio}`);
  assert.equal(tras1.chorizo, 41);
  // La auditoría dice cuándo se vendió y quién la cargó.
  const auditada = await duenio.auditLog.findFirst({ where: { tenantId: base.a.id, entity: "Order", action: "create" }, orderBy: { createdAt: "desc" }, select: { changes: true } });
  assert.match(JSON.stringify(auditada?.changes), /delCuaderno/);

  // ── 2 · Doble envío: recargar y volver a tocar «Cargar» no duplica nada ──────────────────────
  const r2 = await cargar(base.a, mostrador, deAyer);
  assert.deepEqual(new Set(r2.map((x) => x.estado)), new Set(["ya-estaba"]), JSON.stringify(r2));
  assert.deepEqual(await foto(base.a.id), tras1, "el reintento no grabó pedido, stock ni caja");
  //   … y dos toques a la vez con la misma venta: una sola.
  const doble = venta(ayer, "14:00", "EFECTIVO", [{ productId: chorizo.id, cantidad: "3" }]);
  const [d1, d2] = await Promise.all([cargar(base.a, mostrador, [doble]), cargar(base.a, mostrador, [doble])]);
  assert.deepEqual([d1[0].estado, d2[0].estado].sort(), ["grabada", "ya-estaba"], JSON.stringify([d1, d2]));
  const tras2 = await foto(base.a.id);
  assert.deepEqual([tras2.pedidos, tras2.caja, tras2.chorizo], [tras1.pedidos + 1, tras1.caja + 1, (tras1.chorizo ?? 0) - 3]);

  // ── 3 · MG-060: las de HOY entran al turno abierto (la caja de hoy) ──────────────────────────
  const recien = new Date(ahora - 5 * MIN);
  const { hour, minute } = wallHourMinuteInBusinessTz(recien);
  const hoyHora = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const deHoy = venta(dateStrInBusinessTz(recien), hoyHora, "EFECTIVO", [{ productId: vacio.id, cantidad: "1,24" }]);
  const r3 = await cargar(base.a, mostrador, [deHoy]);
  assert.equal(r3[0].estado, "grabada", JSON.stringify(r3));
  assert.match(r3[0].mensaje, /Venta #\d+/);
  const hoyMov = await duenio.cashMovement.findFirst({
    where: { tenantId: base.a.id, order: { idempotencyKey: `cuaderno:${deHoy.clave}` } },
    select: { sessionId: true, amount: true },
  });
  assert.deepEqual(hoyMov, { sessionId: turno.id, amount: 35464 }, "entra al cajón del turno que estaba abierto a esa hora");

  // ── 4 · Lo que no entra, sin grabar nada ─────────────────────────────────────────────────────
  const antes4 = await foto(base.a.id);
  const futuro = new Date(ahora + 40 * MIN);
  const fh = wallHourMinuteInBusinessTz(futuro);
  const r4 = await cargar(base.a, mostrador, [
    venta(dateStrInBusinessTz(futuro), `${String(fh.hour).padStart(2, "0")}:${String(fh.minute).padStart(2, "0")}`, "EFECTIVO", [{ productId: chorizo.id, cantidad: "1" }]),
    venta(haceCuatro, "11:00", "EFECTIVO", [{ productId: chorizo.id, cantidad: "1" }]),
  ]);
  const porClave = new Map(r4.map((x) => [x.clave, x]));
  const [rFuturo, rViejo] = [porClave.get(`cuaderno-test-${String(n - 1).padStart(4, "0")}`), porClave.get(`cuaderno-test-${String(n).padStart(4, "0")}`)];
  assert.equal(rFuturo?.estado, "rechazada");
  assert.match(rFuturo?.mensaje ?? "", /todav.a no pasaron/);
  assert.equal(rViejo?.estado, "rechazada");
  assert.match(rViejo?.mensaje ?? "", /las carga el due/);
  //   … el pago dividido no es del cuaderno (createOrder directo, con la hora).
  const fd = new FormData();
  for (const [k, v] of Object.entries({ channel: "COUNTER", fulfillment: "PICKUP", paid: "on", paymentMethod: "EFECTIVO", idempotencyKey: "cuaderno:dividido-1", occurredAt: `${ayer}T15:00` })) fd.set(k, v);
  fd.append("productId", chorizo.id);
  fd.append("quantity", "2");
  fd.append("pago.medio", "EFECTIVO");
  fd.append("pago.monto", "1900");
  fd.append("pago.medio", "MERCADOPAGO");
  fd.append("pago.monto", "1900");
  const dividido = await ejecutarAccion({ negocio: base.a, usuario: mostrador }, () => createOrder(fd));
  assert.deepEqual(dividido.tipo === "respuesta" ? dividido.valor : null, { ok: false, error: CUADERNO_SOLO_VENTA_COBRADA });
  assert.deepEqual(await foto(base.a.id), antes4, "nada de lo rechazado se grabó");
  //   … el Dueño sí carga la de hace cuatro días (su ventana es de 7).
  const r4b = await cargar(base.a, base.a.duenia, [venta(haceCuatro, "11:00", "EFECTIVO", [{ productId: chorizo.id, cantidad: "1" }])]);
  assert.equal(r4b[0].estado, "grabada", JSON.stringify(r4b));

  // ── 5 · Día CERRADO: la de ayer ya no entra, dice por qué y no graba nada ────────────────────
  await duenio.auditLog.create({
    data: { tenantId: base.a.id, actor: `user:${base.a.duenia.id}`, action: CIERRE_DIARIO_ACTION, entity: CIERRE_DIARIO_ENTITY, entityId: ayer, channel: "admin" },
  });
  const antes5 = await foto(base.a.id);
  const r5 = await cargar(base.a, mostrador, [
    venta(ayer, "16:30", "EFECTIVO", [{ productId: vacio.id, cantidad: "1" }]),
    venta(ayer, "17:00", "MERCADOPAGO", [{ productId: chorizo.id, cantidad: "1" }]),
  ]);
  for (const x of r5) {
    assert.equal(x.estado, "rechazada", JSON.stringify(x));
    assert.match(x.mensaje, /ya est. cerrado/);
  }
  assert.deepEqual(await foto(base.a.id), antes5, "con el día cerrado no se grabó pedido, stock ni caja");
  //   … y el reintento de una que YA estaba (de antes del cierre) sigue diciendo «ya estaba».
  const r5b = await cargar(base.a, mostrador, [deAyer[0]]);
  assert.equal(r5b[0].estado, "ya-estaba", JSON.stringify(r5b));

  // ── 6 · Aislamiento ───────────────────────────────────────────────────────────────────────────
  const antesA = await foto(base.a.id);
  const pedidosB = await duenio.order.count({ where: { tenantId: base.b.id } });
  //   B con el interruptor apagado: el campo de la hora se rechaza (CH queda igual).
  const r6 = await cargar(base.b, base.b.recepcion, [venta(ayer, "11:00", "EFECTIVO", [{ productId: chorizo.id, cantidad: "1" }])]);
  assert.deepEqual([r6[0].estado, r6[0].mensaje], ["rechazada", CUADERNO_APAGADO]);
  //   B con el interruptor prendido y un producto de A: rechazo, nada en ninguno de los dos.
  await prender(base.b.id);
  const r7 = await cargar(base.b, base.b.recepcion, [venta(dateStrInBusinessTz(recien), hoyHora, "EFECTIVO", [{ productId: chorizo.id, cantidad: "1" }])]);
  assert.equal(r7[0].estado, "rechazada", JSON.stringify(r7));
  assert.equal(await duenio.order.count({ where: { tenantId: base.b.id } }), pedidosB, "B no grabó nada");
  assert.deepEqual(await foto(base.a.id), antesA, "el stock y la caja de A no se tocaron");
  //   … y la clave de una venta de A, mandada desde B, no le devuelve la venta de A.
  const r8 = await cargar(base.b, base.b.recepcion, [{ ...deAyer[1], dia: dateStrInBusinessTz(recien), hora: hoyHora }]);
  assert.equal(r8[0].estado, "rechazada", JSON.stringify(r8));
  assert.doesNotMatch(r8[0].mensaje, /#\d+/, "no se filtra el número de una venta de otro negocio");

  // ── 7 · Sin sesión: no hay acción ─────────────────────────────────────────────────────────────
  const anonimo = await ejecutarAccion({ negocio: base.a }, () => cargarVentasDelCuaderno([deAyer[0]]));
  assert.notEqual(anonimo.tipo, "respuesta");
});
