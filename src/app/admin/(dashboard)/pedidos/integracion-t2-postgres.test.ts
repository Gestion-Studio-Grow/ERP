// ============================================================================
// MAGRA TANDA 2 — LA INTEGRACIÓN contra Postgres efímero (2B + 2C + 2D juntos)
// ============================================================================
//
// Con el rol de la app (app_rls, sin BYPASSRLS) y RLS encendido, las Server Actions REALES con la
// sesión de la dueña:
//
//   · Bandeja y fiado (2C + 2D): con las cuentas corrientes prendidas, «Lo dejó sin cobrar» en la
//     rendición del cadete deja la deuda en la cuenta del cliente (UNA `AccountReceivable`), el
//     mensaje dice «quedó en la cuenta de…», el pedido sale de «A cobrar» y la rendición lo suma
//     aparte («fue a la cuenta»). Sin ficha, la entrega de siempre: «A cobrar».
//   · «Venderle» / «Repetir» (2D → Vender): `pedidoDeVentaDesdeLaFicha` trae la ficha y los renglones
//     (lo por kilo sin peso); una ficha de otro negocio, o un pedido de otro cliente, no trae nada.
//   · Pedido de WhatsApp (2B) → bandeja (2C): el pedido registrado cae en «Nuevos» con su franja y su
//     zona; «Confirmar por WhatsApp» NO cuenta como «avisado listo» (sí la constancia «pedido-listo»).
//
// Base efímera propia (src/test/base-efimera.ts); sin Postgres local, se saltea y lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";
import { CONFIG_MAGRA } from "@/app/tienda/envio-de-la-tienda.fixture";
import { dateStrInBusinessTz } from "@/lib/datetime";

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

function sumarDia(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

test("integración T2 contra Postgres: rendición al fiado, Venderle/Repetir acotados, pedido de WhatsApp en «Nuevos» sin contar como avisado", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  // La variable de siempre, apagada: lo que prende las cuentas corrientes en A es el interruptor.
  delete process.env.CUENTAS_CORRIENTES_ENABLED;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const modulos = ["pos", "catalog", "clients", "cuentas-a-cobrar"];
  for (const n of [base.a, base.b]) {
    await duenio.tenant.update({ where: { id: n.id }, data: { blueprintId: "carniceria", modules: modulos } });
  }
  const prender = (tenantId: string, entityId: string) =>
    duenio.auditLog.create({
      data: { tenantId, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId, channel: "operador", changes: {} },
    });
  await prender(base.a.id, "mostrador-boutique");
  await prender(base.a.id, "cuentas-corrientes");
  await prender(base.a.id, "inicio-por-apps");
  await prender(base.b.id, "mostrador-boutique");

  const { createOrder } = await import("@/lib/order-actions");
  const { salioElReparto, rendirPedido } = await import("./reparto/acciones");
  const { leerDatosDelReparto } = await import("./reparto/datos.server");
  const { resumenDeLaRendicion } = await import("./reparto/reparto-core");
  const { leerAvisados, armarTablero } = await import("./tablero.server");
  const { bandejaEnColumnas, columnaDelPedido } = await import("./pedidos-core");
  const { pedidoDeVentaDesdeLaFicha } = await import("@/lib/clientes/fiado.server");
  const { registrarConfirmacionDeWhatsApp } = await import("@/app/admin/(dashboard)/vender/acciones-pedido-whatsapp");
  const { guardarConfigEnviosEnTx } = await import("@/lib/envios/config");
  const duenaA = { negocio: base.a, usuario: base.a.duenia };
  const duenaB = { negocio: base.b, usuario: base.b.duenia };
  const ana = base.a.clientes[0];

  const vacio = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Vacío", saleUnit: "WEIGHT", pricePerKg: 28600, unit: "kg", trackStock: false },
  });
  const chorizo = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Chorizo", saleUnit: "UNIT", price: 1900, unit: "u", trackStock: false },
  });
  let code = 7000;
  const envioListo = (clientId: string | null, total: number) =>
    duenio.order.create({
      data: {
        tenantId: base.a.id,
        code: ++code,
        status: "READY",
        channel: "ONLINE",
        fulfillment: "DELIVERY",
        address: "Los Álamos 123",
        clientId,
        customerName: "Ana UAT",
        customerPhone: "11 5555 1234",
        subtotal: total,
        total,
        items: {
          create: [
            { tenantId: base.a.id, productId: vacio.id, name: "Vacío", saleUnit: "WEIGHT", quantity: 0.9, unitPrice: total / 0.9, lineTotal: total },
            { tenantId: base.a.id, productId: chorizo.id, name: "Chorizo", saleUnit: "UNIT", quantity: 6, unitPrice: 0, lineTotal: 0 },
          ],
        },
      },
      select: { id: true, code: true },
    });

  // ── 1 · Bandeja y fiado: «Lo dejó sin cobrar» con ficha → a la cuenta de Ana ─────────────────
  const conFicha = await envioListo(ana, 25700);
  const sinFicha = await envioListo(null, 9000);
  const salida = valor(
    await ejecutarAccion(duenaA, () => salioElReparto(formulario([["id", conFicha.id], ["id", sinFicha.id], ["franja", "17–19 h"]]))),
  );
  assert.ok(salida.ok, JSON.stringify(salida));
  const rendir = (id: string) => ejecutarAccion(duenaA, () => rendirPedido(formulario([["id", id], ["resultado", "a-cobrar"]])));

  const r1 = valor(await rendir(conFicha.id));
  assert.equal(r1?.ok, true, JSON.stringify(r1));
  assert.match(r1?.ok ? (r1.mensaje ?? "") : "", new RegExp(`Pedido #${conFicha.code} entregado sin cobrar: quedó en la cuenta de Ana UAT`));
  const o1 = await duenio.order.findUniqueOrThrow({ where: { id: conFicha.id }, select: { status: true, paid: true, paymentMethod: true } });
  assert.deepEqual(o1, { status: "DELIVERED", paid: true, paymentMethod: null }, "saldado contra la cuenta");
  const deudas = await duenio.accountReceivable.findMany({ where: { orderId: conFicha.id }, select: { amount: true, clientId: true, tenantId: true } });
  assert.deepEqual(deudas.map((d) => [Number(d.amount), d.clientId, d.tenantId]), [[25700, ana, base.a.id]]);
  assert.equal(columnaDelPedido({ status: o1.status, cobrado: o1.paid }), null, "no queda en «A cobrar»: está en la cuenta");
  assert.equal(await duenio.cashMovement.count({ where: { orderId: conFicha.id } }), 0, "no entró plata");
  // Rendir otra vez: «ya estaba rendido», y sigue habiendo UNA deuda.
  const r1b = valor(await rendir(conFicha.id));
  assert.ok(r1b?.ok && r1b.mensaje?.includes("ya estaba rendido"), JSON.stringify(r1b));
  assert.equal(await duenio.accountReceivable.count({ where: { orderId: conFicha.id } }), 1);

  // Sin ficha: la entrega de siempre, «A cobrar».
  const r2 = valor(await rendir(sinFicha.id));
  assert.equal(r2?.ok, true, JSON.stringify(r2));
  assert.match(r2?.ok ? (r2.mensaje ?? "") : "", /queda en «A cobrar» por \$/);
  const o2 = await duenio.order.findUniqueOrThrow({ where: { id: sinFicha.id }, select: { status: true, paid: true } });
  assert.equal(columnaDelPedido({ status: o2.status, cobrado: o2.paid }), "a-cobrar");
  assert.equal(await duenio.accountReceivable.count({ where: { orderId: sinFicha.id } }), 0);

  // La rendición lo cuenta aparte: lo que fue a la cuenta y lo que quedó a cobrar.
  const datos = valor(await ejecutarAccion(duenaA, () => leerDatosDelReparto(base.a.id)));
  const marcaConFicha = datos.rendidosHoy.find((r) => r.id === conFicha.id);
  assert.equal(marcaConFicha?.aCuenta, true);
  assert.equal(datos.rendidosHoy.find((r) => r.id === sinFicha.id)?.aCuenta, undefined);
  const resumen = resumenDeLaRendicion(datos.rendidosHoy);
  assert.deepEqual(resumen.aCuenta, { cantidad: 1, monto: 25700 });
  assert.deepEqual(resumen.aCobrar, { cantidad: 1, monto: 9000 });
  assert.equal(resumen.efectivo, 0);

  // ── 2 · «Venderle» / «Repetir» desde la ficha, acotados al negocio y al cliente ──────────────
  const repetir = valor(
    await ejecutarAccion(duenaA, () => pedidoDeVentaDesdeLaFicha({ cliente: ana, repetir: String(conFicha.code) })),
  );
  assert.equal(repetir?.cliente.id, ana);
  assert.deepEqual(
    repetir?.repetir?.renglones.map((r) => [r.productId, r.qtyText]),
    [
      [vacio.id, ""],
      [chorizo.id, "6"],
    ],
    "lo por kilo se pesa de nuevo; por unidad, la misma cantidad",
  );
  const soloCliente = valor(await ejecutarAccion(duenaA, () => pedidoDeVentaDesdeLaFicha({ cliente: ana })));
  assert.equal(soloCliente?.repetir, null);
  // El pedido sin ficha no es de Ana: no se repite.
  const ajeno = valor(await ejecutarAccion(duenaA, () => pedidoDeVentaDesdeLaFicha({ cliente: ana, repetir: String(sinFicha.code) })));
  assert.equal(ajeno?.repetir, null);
  // Desde B, la ficha de A no existe.
  const desdeB = valor(await ejecutarAccion(duenaB, () => pedidoDeVentaDesdeLaFicha({ cliente: ana, repetir: String(conFicha.code) })));
  assert.equal(desdeB, null);

  // ── 3 · Pedido de WhatsApp → «Nuevos», con franja y zona; confirmar no es «avisado listo» ─────
  await guardarConfigEnviosEnTx(duenio as never, base.a.id, { config: CONFIG_MAGRA, actor: "test", versionLeida: null });
  const hoy = dateStrInBusinessTz(new Date());
  const manana = sumarDia(hoy);
  const fd = formulario([
    ["channel", "ONLINE"],
    ["fulfillment", "DELIVERY"],
    ["customerName", "Ana"],
    ["customerPhone", "11 5555-1234"],
    ["address", "Los Álamos 123"],
    ["scheduledFor", `${manana}T17:00`],
    ["envioZona", "barrios"],
    ["idempotencyKey", "whatsapp-bandeja-1"],
    ["conTicket", "1"],
    ["productId", chorizo.id],
    ["quantity", "6"],
  ]);
  const alta = valor(await ejecutarAccion(duenaA, () => createOrder(fd)));
  assert.equal(alta?.ok, true, JSON.stringify(alta));
  const idWa = alta?.ok ? alta.venta?.id : undefined;
  assert.ok(idWa, "el alta devuelve el pedido");
  await ejecutarAccion(duenaA, () => registrarConfirmacionDeWhatsApp(idWa!));
  assert.equal(
    await duenio.auditLog.count({ where: { tenantId: base.a.id, entityId: idWa, action: "whatsapp" } }),
    1,
    "quedó la constancia de «Confirmar por WhatsApp»",
  );
  const leerOrden = () =>
    duenio.order.findUniqueOrThrow({
      where: { id: idWa },
      select: {
        id: true, code: true, createdAt: true, channel: true, customerName: true, customerPhone: true, fulfillment: true,
        scheduledFor: true, address: true, notes: true, status: true, paid: true, paymentMethod: true, total: true,
        subtotal: true, discount: true,
        items: { select: { productId: true, name: true, saleUnit: true, quantity: true, unitPrice: true, lineTotal: true } },
      },
    });
  const orden = await leerOrden();
  const tablero = armarTablero({
    abiertos: [orden],
    cerrados: [],
    comercio: true,
    hoy,
    local: { negocio: "Magra", direccion: null, horario: null },
    links: new Map(),
    cupones: new Map(),
    avisados: valor(await ejecutarAccion(duenaA, () => leerAvisados([], { boutique: true }))),
    boutique: true,
    ofrecerLink: false,
    simulacion: false,
    alcance: null,
  });
  const columnas = bandejaEnColumnas(tablero.abiertos);
  assert.deepEqual(columnas.nuevos.map((p) => p.id), [idWa], `«Nuevos» (estado ${orden.status})`);
  const enNuevos = columnas.nuevos[0];
  assert.ok(enNuevos.horario, "con su franja");
  assert.equal(enNuevos.horarioIso, orden.scheduledFor?.toISOString());
  assert.equal(enNuevos.zona, "Canning – barrios cerrados", "con su zona (del renglón «Envío · <zona>»)");

  // Listo: «Confirmar por WhatsApp» no lo da por avisado; la constancia «pedido-listo», sí.
  await duenio.order.update({ where: { id: idWa }, data: { status: "READY" } });
  const avisados = valor(await ejecutarAccion(duenaA, () => leerAvisados([idWa!], { boutique: true })));
  assert.equal(avisados.has(idWa!), false, "«pedido-confirmado» no es «avisado listo»");
  await duenio.auditLog.create({
    data: { tenantId: base.a.id, actor: "user:test", action: "whatsapp", entity: "Order", entityId: idWa!, changes: { tipo: "pedido-listo" } },
  });
  const avisados2 = valor(await ejecutarAccion(duenaA, () => leerAvisados([idWa!], { boutique: true })));
  assert.equal(avisados2.has(idWa!), true, "el aviso de listo, sí");
  // Desde B no se ve nada de A.
  const avisadosB = valor(await ejecutarAccion(duenaB, () => leerAvisados([idWa!], { boutique: true })));
  assert.equal(avisadosB.has(idWa!), false);
});
