// «RINDIÓ TODO COMO SALIÓ» CONTRA POSTGRES (Magra, tanda práctica) — con el rol de la app (app_rls,
// sin BYPASSRLS) y RLS encendido, ejecutando las Server Actions REALES con la sesión de la dueña:
//
//   · Una salida de 4 envíos se rinde de una vez como dice el LIBRO: el pagado antes de salir, «ya
//     pagó»; el cobrado mientras estaba en la calle, «cobrado» con los pagos del libro; los dos sin
//     cobrar, «a cobrar». No se asienta ninguna VENTA nueva: nunca un monto inventado.
//   · Doble envío (dos «Rindió todo» a la vez): UNA marca «rendido» por pedido y el resumen del día
//     suma una vez. Y el doble envío de la rendición de a uno, también una sola marca.
//   · Dos negocios: desde B, la salida de A no se rinde; un id de B en la salida de A frena todo;
//     apagado el interruptor en B, no hace nada; B no ve lo rendido de A.
//
// Base efímera propia (src/test/base-efimera.ts); sin Postgres local, se saltea y lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

function formulario(pares: [string, string][]): FormData {
  const fd = new FormData();
  for (const [n, v] of pares) fd.append(n, v);
  return fd;
}

function valor<T>(s: SalidaDeAccion<T>): T {
  assert.equal(s.tipo, "respuesta", JSON.stringify(s));
  return (s as { valor: T }).valor;
}

test("«Rindió todo como salió» contra Postgres: como dice el libro, doble envío con una marca y dos negocios", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  for (const n of [base.a, base.b]) {
    await duenio.tenant.update({ where: { id: n.id }, data: { blueprintId: "carniceria", modules: ["pos", "catalog", "clients"] } });
  }
  // El interruptor «mostrador-boutique» SÓLO en A.
  await duenio.auditLog.create({
    data: { tenantId: base.a.id, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId: "mostrador-boutique", channel: "operador", changes: {} },
  });

  const { createOrder, cobrarPedido } = await import("@/lib/order-actions");
  const { salioElReparto, rendirPedido, rendirTodoComoSalio } = await import("../acciones");
  const { leerDatosDelReparto } = await import("../datos.server");
  const { resumenDeLaRendicion, leerMarcaDeReparto } = await import("../reparto-core");
  const sesionA = { negocio: base.a, usuario: base.a.duenia };
  const sesionB = { negocio: base.b, usuario: base.b.duenia };
  const espera = () => new Promise((r) => setTimeout(r, 15));

  const producto = (tenantId: string, name: string, price: number) =>
    duenio.product.create({ data: { tenantId, name, saleUnit: "UNIT", price, unit: "u", trackStock: false } });
  const [p10, p11, p12, p13] = await Promise.all([10000, 11000, 12000, 13000].map((p) => producto(base.a.id, `Caja RT ${p}`, p)));
  const pB = await producto(base.b.id, "Caja RT B", 5000);

  let n = 0;
  const envio = async (sesion: typeof sesionA, tenantId: string, productId: string) => {
    const clave = `rendir-todo-${++n}`;
    const r = valor(
      await ejecutarAccion(sesion, () =>
        createOrder(
          formulario([
            ["channel", "ONLINE"],
            ["fulfillment", "DELIVERY"],
            ["customerName", `Clienta RT ${n}`],
            ["customerPhone", `11 5555 10${n}`],
            ["address", `Calle ${n}`],
            ["idempotencyKey", clave],
            ["productId", productId],
            ["quantity", "1"],
          ]),
        ),
      ),
    );
    assert.equal(r?.ok, true, JSON.stringify(r));
    const o = await duenio.order.findFirstOrThrow({ where: { tenantId, idempotencyKey: clave } });
    await duenio.order.update({ where: { id: o.id }, data: { status: "READY" } });
    return o;
  };
  const cobrar = (id: string, medio: "EFECTIVO" | "MERCADOPAGO") =>
    ejecutarAccion(sesionA, () => cobrarPedido(null, formulario([["id", id], ["paymentMethod", medio], ["pagado", "1"], ["paid", "on"]])));

  const oPago = await envio(sesionA, base.a.id, p10.id); // pagó por Mercado Pago ANTES de salir
  const oCalle = await envio(sesionA, base.a.id, p11.id); // se cobró en efectivo mientras estaba en la calle
  const oDebe1 = await envio(sesionA, base.a.id, p12.id); // salió a cobrar
  const oDebe2 = await envio(sesionA, base.a.id, p13.id); // salió a cobrar
  const oDeB = await envio(sesionB, base.b.id, pB.id);
  assert.equal(valor(await cobrar(oPago.id, "MERCADOPAGO"))?.ok, true);
  await espera();
  const salida = valor(await ejecutarAccion(sesionA, () => salioElReparto(formulario([oPago, oCalle, oDebe1, oDebe2].map((o): [string, string] => ["id", o.id])))));
  assert.ok(salida.ok, JSON.stringify(salida));
  await espera();
  assert.equal(valor(await cobrar(oCalle.id, "EFECTIVO"))?.ok, true);

  const datos0 = valor(await ejecutarAccion(sesionA, () => leerDatosDelReparto(base.a.id)));
  const reparto = datos0.envios.find((e) => e.id === oPago.id)?.salida?.reparto;
  assert.ok(reparto, "la salida tiene su id");
  const laSalida = (extra: [string, string][] = []) =>
    formulario([["reparto", reparto], ...[oPago, oCalle, oDebe1, oDebe2].map((o): [string, string] => ["id", o.id]), ...extra]);
  const ventas = (tenantId: string) => duenio.cashMovement.count({ where: { tenantId, type: "VENTA" } });
  const ventasAntes = await ventas(base.a.id);
  const marcasRendido = async (orderId: string) => {
    const filas = await duenio.auditLog.findMany({ where: { tenantId: base.a.id, entity: "Order", action: "reparto", entityId: orderId }, select: { changes: true } });
    return filas.filter((f) => leerMarcaDeReparto(f.changes)?.tipo === "rendido").length;
  };

  // ── Dos negocios: B tiene el interruptor apagado; un id de B en la salida de A frena todo. ──
  const deB = valor(await ejecutarAccion(sesionB, () => rendirTodoComoSalio(laSalida())));
  assert.equal(deB.ok, false);
  const conAjeno = valor(await ejecutarAccion(sesionA, () => rendirTodoComoSalio(laSalida([["id", oDeB.id]]))));
  assert.equal(conAjeno.ok, false, JSON.stringify(conAjeno));
  for (const o of [oPago, oCalle, oDebe1, oDebe2]) {
    assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: o.id } })).status, "READY", "no se rindió nada");
  }
  assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: oDeB.id } })).status, "READY", "el pedido de B, intacto");

  // ── Doble envío: dos «Rindió todo» A LA VEZ. ──
  const [r1, r2] = await Promise.all([
    ejecutarAccion(sesionA, () => rendirTodoComoSalio(laSalida())),
    ejecutarAccion(sesionA, () => rendirTodoComoSalio(laSalida())),
  ]);
  const v1 = valor(r1);
  const v2 = valor(r2);
  assert.ok(v1.ok && v2.ok, JSON.stringify([v1, v2]));
  const rendidosEnTotal = new Set([...(v1.ok ? v1.rendidos : []), ...(v2.ok ? v2.rendidos : [])]);
  assert.equal(rendidosEnTotal.size, 4, JSON.stringify([v1, v2]));

  for (const o of [oPago, oCalle, oDebe1, oDebe2]) {
    assert.equal(await marcasRendido(o.id), 1, `#${o.code}: UNA marca «rendido»`);
    assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: o.id } })).status, "DELIVERED");
  }
  assert.equal(await ventas(base.a.id), ventasAntes, "ningún asiento nuevo: nada inventado");
  assert.deepEqual(
    [(await duenio.order.findUniqueOrThrow({ where: { id: oDebe1.id } })).paid, (await duenio.order.findUniqueOrThrow({ where: { id: oDebe2.id } })).paid],
    [false, false],
    "los que salieron a cobrar quedan a cobrar",
  );

  const datos = valor(await ejecutarAccion(sesionA, () => leerDatosDelReparto(base.a.id)));
  const porPedido = new Map(datos.rendidosHoy.map((r) => [r.id, r]));
  assert.equal(porPedido.get(oPago.id)?.resultado, "ya-pago");
  assert.deepEqual([porPedido.get(oCalle.id)?.resultado, porPedido.get(oCalle.id)?.pagos], ["cobrado", [{ medio: "EFECTIVO", monto: 11000 }]], "lo del libro");
  assert.equal(porPedido.get(oDebe1.id)?.resultado, "a-cobrar");
  assert.equal(porPedido.get(oDebe2.id)?.resultado, "a-cobrar");
  assert.equal(datos.rendidosHoy.length, 4, "una fila por pedido");
  const resumen = resumenDeLaRendicion(datos.rendidosHoy);
  assert.deepEqual(
    [resumen.efectivo, resumen.cobrados, resumen.yaPagos, resumen.aCobrar.cantidad, resumen.aCobrar.monto],
    [11000, 1, 1, 2, 25000],
    "el resumen suma una vez",
  );

  // Un tercer envío tarde: ya estaban todos rendidos, nada nuevo.
  const tarde = valor(await ejecutarAccion(sesionA, () => rendirTodoComoSalio(laSalida())));
  assert.ok(tarde.ok && tarde.rendidos.length === 0, JSON.stringify(tarde));
  for (const o of [oPago, oCalle, oDebe1, oDebe2]) assert.equal(await marcasRendido(o.id), 1);

  // ── El doble envío de la rendición de a uno también deja UNA marca. ──
  const oUno = await envio(sesionA, base.a.id, p10.id);
  assert.ok(valor(await ejecutarAccion(sesionA, () => salioElReparto(formulario([["id", oUno.id]])))).ok);
  const efectivo: [string, string][] = [["id", oUno.id], ["resultado", "cobrado"], ["paymentMethod", "EFECTIVO"], ["pagado", "1"], ["paid", "on"], ["recibido", "10000.00"]];
  const dobles = await Promise.all([1, 2, 3].map(() => ejecutarAccion(sesionA, () => rendirPedido(formulario(efectivo)))));
  assert.ok(dobles.some((d) => valor(d)?.ok), JSON.stringify(dobles));
  assert.equal(await marcasRendido(oUno.id), 1, "una sola marca «rendido»");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.a.id, orderId: oUno.id, type: "VENTA" } }), 1, "la plata entra una vez");
  const conUno = resumenDeLaRendicion(valor(await ejecutarAccion(sesionA, () => leerDatosDelReparto(base.a.id))).rendidosHoy);
  assert.equal(conUno.efectivo, 11000 + 10000);

  // B no ve lo rendido de A, y su pedido sigue como estaba.
  const datosB = valor(await ejecutarAccion(sesionB, () => leerDatosDelReparto(base.b.id)));
  assert.equal(datosB.rendidosHoy.length, 0);
  assert.equal(await ventas(base.b.id), 0);
});
