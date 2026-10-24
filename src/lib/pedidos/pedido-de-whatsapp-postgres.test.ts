// ============================================================================
// PEDIDO DESDE WHATSAPP — el alta REAL contra Postgres efímero (Magra, tanda 2 · 2B)
// ============================================================================
//
// Lo que propone el lector del chat se graba con `createOrder` (el alta de siempre, con la sesión
// de la dueña y RLS `app_rls`). Acá se prueba lo que la pantalla no puede garantizar sola:
//   · MG-052: el total que la pantalla muestra como ESTIMADO es el que graba la base
//     ($15.000 de picada a $9.800/kg → 1,531 kg → $15.003,80), y la nota dice «a ajustar al pesar»;
//   · E08: un pedido para OTRO DÍA de un corte por kilo sin stock suficiente se anota igual con el
//     mostrador boutique prendido; para hoy, por unidad, o en un negocio sin el interruptor, frena
//     como siempre y no graba nada;
//   · MG-053: «Confirmar por WhatsApp» deja constancia con el total de la BASE; con el id de un
//     pedido de otro negocio no deja nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { interpretarPedidoDeWhatsApp, notaDelPedidoDeWhatsApp, sumarDias } from "./interpretar-whatsapp";

const laBase = baseEfimeraDelArchivo();

test("pedido de WhatsApp: total estimado = base, faltante a futuro avisa sólo con el boutique, constancia acotada al negocio", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { createOrder } = await import("@/lib/order-actions");
  const { registrarConfirmacionDeWhatsApp } = await import("@/app/admin/(dashboard)/vender/acciones-pedido-whatsapp");

  // El negocio A tiene el mostrador boutique (fila de la consola); B no.
  await duenio.auditLog.create({
    data: { tenantId: base.a.id, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId: "mostrador-boutique", channel: "operador", changes: {} },
  });
  const crear = (tenantId: string, name: string, extra: Record<string, unknown>) =>
    duenio.product.create({ data: { tenantId, name, unit: "kg", active: true, ...extra } as never });
  const picada = await crear(base.a.id, "Picada", { saleUnit: "WEIGHT", pricePerKg: 9800, trackStock: false });
  const vacioA = await crear(base.a.id, "Vacío", { saleUnit: "WEIGHT", pricePerKg: 28600, trackStock: true, stock: 0.8 });
  const chorizoA = await crear(base.a.id, "Chorizo", { saleUnit: "UNIT", price: 1900, trackStock: true, stock: 1 });
  const vacioB = await crear(base.b.id, "Vacío", { saleUnit: "WEIGHT", pricePerKg: 28600, trackStock: true, stock: 0.8 });

  const hoy = dateStrInBusinessTz(new Date());
  const manana = sumarDias(hoy, 1);
  let n = 0;
  const pedido = (lineas: [string, string][], o: Record<string, string> = {}) => {
    const fd = new FormData();
    const campos: Record<string, string> = {
      channel: "ONLINE",
      fulfillment: "PICKUP",
      customerName: "Ana",
      customerPhone: "11 5555-1234",
      scheduledFor: `${manana}T17:00`,
      idempotencyKey: `whatsapp-${++n}`,
      conTicket: "1",
      ...o,
    };
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    for (const [p, q] of lineas) {
      fd.append("productId", p);
      fd.append("quantity", q);
    }
    return fd;
  };
  const alta = async (negocio: typeof base.a, fd: FormData) => {
    const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () => createOrder(fd));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: Awaited<ReturnType<typeof createOrder>> }).valor;
  };
  const contar = (tenantId: string) => duenio.order.count({ where: { tenantId } });
  const stock = async (id: string) => Number((await duenio.product.findFirst({ where: { id }, select: { stock: true } }))?.stock);

  // 1 · MG-052: lo que propone el lector, grabado tal cual. El total de la base es el estimado.
  const propuesta = interpretarPedidoDeWhatsApp("$15.000 de picada", [{ id: picada.id, name: "Picada", saleUnit: "WEIGHT", price: null, pricePerKg: 9800 }], { hoy });
  const [r] = propuesta.renglones;
  assert.deepEqual([r.cantidad, r.totalEstimado, r.aAjustar], [1.531, 15003.8, true]);
  const nota = notaDelPedidoDeWhatsApp({ franja: "Mañana tarde (17 a 20 h)", renglones: [{ nombre: "Picada", aAjustar: true, pidio: r.pidio }] });
  const r1 = await alta(base.a, pedido([[picada.id, String(r.cantidad)]], { notes: nota }));
  assert.ok(r1?.ok && r1.venta, JSON.stringify(r1));
  assert.equal(r1.venta.total, r.totalEstimado);
  const grabado = await duenio.order.findFirst({ where: { id: r1.venta.id }, select: { status: true, paid: true, notes: true, channel: true } });
  assert.deepEqual(
    [grabado?.status, grabado?.paid, grabado?.channel],
    ["PENDING", false, "ONLINE"],
    "entra a la bandeja como pedido sin cobrar",
  );
  assert.match(grabado?.notes ?? "", /A ajustar al pesar: Picada \(pidió \$15\.000\)/);

  // 2 · E08: para mañana, 2 kg de vacío con 0,8 kg en stock → se anota (boutique prendido).
  const r2 = await alta(base.a, pedido([[vacioA.id, "2"]]));
  assert.equal(r2?.ok, true, JSON.stringify(r2));
  assert.equal(await stock(vacioA.id), -1.2, "el negativo es el aviso de envasar");

  // 3 · … para HOY frena como siempre, y no graba nada.
  const antes = await contar(base.a.id);
  const r3 = await alta(base.a, pedido([[vacioA.id, "2"]], { scheduledFor: `${hoy}T23:00` }));
  assert.equal(r3?.ok, false, JSON.stringify(r3));
  //   … por unidad, aunque sea para mañana, también (lo que se cuenta, si dice cero es cero).
  const r4 = await alta(base.a, pedido([[chorizoA.id, "2"]]));
  assert.equal(r4?.ok, false, JSON.stringify(r4));
  //   … sin horario, frena.
  const r5 = await alta(base.a, pedido([[vacioA.id, "5"]], { scheduledFor: "" }));
  assert.equal(r5?.ok, false, JSON.stringify(r5));
  assert.equal(await contar(base.a.id), antes, "los frenos no grabaron");

  // 4 · El negocio B, sin el mostrador boutique: el pedido a futuro frena como hoy.
  const antesB = await contar(base.b.id);
  const r6 = await alta(base.b, pedido([[vacioB.id, "2"]]));
  assert.equal(r6?.ok, false, JSON.stringify(r6));
  assert.equal(await contar(base.b.id), antesB);
  assert.equal(await stock(vacioB.id), 0.8);

  // 5 · MG-053: la constancia, con el total de la base; desde otro negocio no deja nada.
  const filas = () =>
    duenio.auditLog.findMany({ where: { entity: "Order", action: "whatsapp", entityId: r1.venta!.id }, select: { tenantId: true, changes: true } });
  await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => registrarConfirmacionDeWhatsApp(r1.venta!.id));
  assert.equal((await filas()).length, 0, "un id de otro negocio no deja constancia");
  await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => registrarConfirmacionDeWhatsApp(r1.venta!.id));
  const [fila, ...otras] = await filas();
  assert.equal(otras.length, 0);
  assert.equal(fila.tenantId, base.a.id);
  assert.deepEqual(fila.changes, { tipo: "pedido-confirmado", code: r1.venta.code, total: 15003.8 });
});
