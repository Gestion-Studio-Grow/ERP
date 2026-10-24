// EL REPARTO CONTRA POSTGRES (Magra, tanda 2 · 2C) — con el rol de la app (app_rls, sin BYPASSRLS)
// y RLS encendido, ejecutando las Server Actions REALES con la sesión de la dueña:
//
//   · «Salió el cadete» (`salioElReparto`): marca en la calle SÓLO los Listos; el doble toque no
//     marca de nuevo; un id de otro negocio frena todo sin grabar nada; apagado el interruptor, no hace nada.
//   · MG-056 «Rendición» (`rendirPedido`): Efectivo $20.000, Efectivo $18.000 y MP $25.000 → los tres
//     cobrados con su medio y entregados; el LIBRO suma $38.000 en efectivo y $25.000 en MP; rendir
//     otra vez no asienta nada; con otro medio, la regla de siempre lo rechaza.
//   · «Volvió» (a Listos, sin plata), «Lo dejó sin cobrar» (A cobrar), «Ya pagó» que no estaba pago (rechazo).
//   · La bandeja (`leerAvisados`): los que están en la calle viajan como «En reparto».
//   · Aislamiento: desde B, rendir un pedido de A no toca nada.
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

test("reparto contra Postgres: salida, rendición por medio al libro, volvió / sin cobrar, doble toque, interruptor y aislamiento", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.update({ where: { id: base.a.id }, data: { blueprintId: "carniceria", modules: ["pos", "catalog", "clients"] } });
  await duenio.tenant.update({ where: { id: base.b.id }, data: { blueprintId: "carniceria", modules: ["pos", "catalog", "clients"] } });
  // El interruptor «mostrador-boutique», como lo prende la consola del operador, SÓLO en A.
  await duenio.auditLog.create({
    data: { tenantId: base.a.id, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId: "mostrador-boutique", channel: "operador", changes: {} },
  });

  const { createOrder } = await import("@/lib/order-actions");
  const { salioElReparto, rendirPedido } = await import("./acciones");
  const { leerAvisados } = await import("../tablero.server");
  const sesionA = { negocio: base.a, usuario: base.a.duenia };
  const sesionB = { negocio: base.b, usuario: base.b.duenia };

  const producto = (tenantId: string, name: string, price: number) =>
    duenio.product.create({ data: { tenantId, name, saleUnit: "UNIT", price, unit: "u", trackStock: false } });
  const cajas = await Promise.all([
    producto(base.a.id, "Caja UAT 20", 20000),
    producto(base.a.id, "Caja UAT 18", 18000),
    producto(base.a.id, "Caja UAT 25", 25000),
    producto(base.a.id, "Caja UAT 9", 9000),
    producto(base.a.id, "Caja UAT 7", 7000),
  ]);
  let n = 0;
  const envio = async (productId: string, estado: "READY" | "PREPARING" = "READY") => {
    const clave = `reparto-uat-${++n}`;
    const r = valor(
      await ejecutarAccion(sesionA, () =>
        createOrder(
          formulario([
            ["channel", "ONLINE"],
            ["fulfillment", "DELIVERY"],
            ["customerName", `Clienta UAT ${n}`],
            ["customerPhone", `11 5555 000${n}`],
            ["address", `Calle ${n}`],
            ["idempotencyKey", clave],
            ["productId", productId],
            ["quantity", "1"],
          ]),
        ),
      ),
    );
    assert.equal(r?.ok, true, JSON.stringify(r));
    const o = await duenio.order.findFirstOrThrow({ where: { tenantId: base.a.id, idempotencyKey: clave } });
    await duenio.order.update({ where: { id: o.id }, data: { status: estado } });
    return o;
  };
  const [o20, o18, o25, o9, o7] = [await envio(cajas[0].id), await envio(cajas[1].id), await envio(cajas[2].id), await envio(cajas[3].id), await envio(cajas[4].id, "PREPARING")];
  assert.deepEqual([o20.total, o18.total, o25.total], [20000, 18000, 25000]);
  const marcas = (tenantId: string) => duenio.auditLog.count({ where: { tenantId, entity: "Order", action: "reparto" } });
  const ids = (os: { id: string }[]) => os.map((o): [string, string] => ["id", o.id]);

  // ── Desde B, con un pedido de A en la hoja: B no tiene el interruptor → no hace nada. ──
  const deB = valor(await ejecutarAccion(sesionB, () => salioElReparto(formulario(ids([o20])))));
  assert.equal(deB.ok, false);
  assert.equal(await marcas(base.a.id), 0);
  // ── Desde A, con un id inventado en la hoja: no sale ninguno. ──
  const conAjeno = valor(await ejecutarAccion(sesionA, () => salioElReparto(formulario([...ids([o20, o18]), ["id", "orden-de-otro-negocio"]]))));
  assert.equal(conAjeno.ok, false);
  assert.equal(await marcas(base.a.id), 0, "nada grabado");

  // ── «Salió el cadete»: salen los cuatro Listos; el que se arma no sale y se dice. ──
  const salida = valor(
    await ejecutarAccion(sesionA, () => salioElReparto(formulario([...ids([o20, o18, o25, o9, o7]), ["franja", "17–19 h"], ["cadete", "Juan"]]))),
  );
  assert.ok(salida.ok, JSON.stringify(salida));
  assert.deepEqual(salida.salieron.sort(), [o20.code, o18.code, o25.code, o9.code].sort());
  assert.match(salida.mensaje, new RegExp(`no están listos: #${o7.code}`));
  assert.equal(await marcas(base.a.id), 4);
  // Doble toque: nada nuevo.
  const otraVez = valor(await ejecutarAccion(sesionA, () => salioElReparto(formulario(ids([o20, o18])))));
  assert.ok(otraVez.ok);
  assert.deepEqual(otraVez.salieron, []);
  assert.equal(await marcas(base.a.id), 4);

  // ── La bandeja los ve «En reparto» (la misma consulta de los avisos). ──
  // El mostrador boutique lo decide la página (comercio + interruptor) y se lo pasa: no se relee.
  const avisados = valor(await ejecutarAccion(sesionA, () => leerAvisados([o20.id, o18.id, o25.id, o9.id], { boutique: true })));
  assert.deepEqual([...(avisados.repartos?.keys() ?? [])].sort(), [o20.id, o18.id, o25.id, o9.id].sort());
  const avisadosB = valor(await ejecutarAccion(sesionB, () => leerAvisados([o20.id], { boutique: false })));
  assert.equal(avisadosB.repartos, undefined, "apagado: el Map de siempre");
  assert.equal(avisadosB.size, 0, "y un pedido de otro negocio no se ve");

  // ── MG-056: la rendición ──
  const rendir = (o: { id: string }, pares: [string, string][], sesion = sesionA) =>
    ejecutarAccion(sesion, () => rendirPedido(formulario([["id", o.id], ...pares])));
  const efectivo = (monto: string): [string, string][] => [["resultado", "cobrado"], ["paymentMethod", "EFECTIVO"], ["pagado", "1"], ["paid", "on"], ["recibido", monto]];

  // Desde B, un pedido de A: rechazo y nada tocado.
  const robo = valor(await rendir(o20, efectivo("20000.00"), sesionB));
  assert.equal(robo?.ok, false);
  assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: o20.id } })).paid, false);

  const r20 = valor(await rendir(o20, efectivo("20000.00")));
  assert.equal(r20?.ok, true, JSON.stringify(r20));
  const r18 = valor(await rendir(o18, efectivo("20000.00")));
  assert.ok(r18?.ok && r18.vuelto === 2000, JSON.stringify(r18));
  const r25 = valor(await rendir(o25, [["resultado", "cobrado"], ["paymentMethod", "MERCADOPAGO"], ["pagado", "1"], ["paid", "on"]]));
  assert.equal(r25?.ok, true, JSON.stringify(r25));

  for (const o of [o20, o18, o25]) {
    const f = await duenio.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.deepEqual([f.status, f.paid], ["DELIVERED", true], `#${o.code} cobrado y entregado`);
  }
  assert.equal((await duenio.order.findUniqueOrThrow({ where: { id: o25.id } })).paymentMethod, "MERCADOPAGO");
  const libro = async () => {
    const filas = await duenio.cashMovement.findMany({
      where: { tenantId: base.a.id, orderId: { in: [o20.id, o18.id, o25.id] }, type: "VENTA" },
      select: { method: true, amount: true },
    });
    const suma: Record<string, number> = {};
    for (const f of filas) suma[f.method] = (suma[f.method] ?? 0) + Number(f.amount);
    return { suma, filas: filas.length };
  };
  const antes = await libro();
  assert.deepEqual(antes.suma, { EFECTIVO: 38000, MP: 25000 }, "el libro (columna MP del arqueo) suma $38.000 en efectivo y $25.000 en MP");

  // Rendir otra vez (el doble toque, o el reintento sin señal): «ya estaba rendido», nada asentado.
  const re = valor(await rendir(o20, efectivo("20000.00")));
  assert.ok(re?.ok && re.mensaje?.includes("ya estaba rendido"), JSON.stringify(re));
  assert.deepEqual(await libro(), antes);

  // Las marcas de lo rendido traen lo que entró por cada medio (la suma de la pantalla).
  const { leerDatosDelReparto } = await import("./datos.server");
  const datos = valor(await ejecutarAccion(sesionA, () => leerDatosDelReparto(base.a.id)));
  const { resumenDeLaRendicion } = await import("./reparto-core");
  const resumen = resumenDeLaRendicion(datos.rendidosHoy);
  assert.equal(resumen.efectivo, 38000);
  assert.deepEqual(resumen.porMedio.map((m) => [m.medio, m.monto]), [["EFECTIVO", 38000], ["MERCADOPAGO", 25000]]);
  assert.deepEqual(datos.envios.filter((e) => e.salida).map((e) => e.code), [o9.code], "en la calle queda sólo el de $9.000");

  // ── «Ya pagó» que no estaba pago: rechazo. «Volvió»: vuelve a Listos, sin plata. ──
  const yaPago = valor(await rendir(o9, [["resultado", "ya-pago"]]));
  assert.equal(yaPago?.ok, false);
  const volvio = valor(await rendir(o9, [["resultado", "volvio"], ["motivo", "No estaba"]]));
  assert.equal(volvio?.ok, true, JSON.stringify(volvio));
  const f9 = await duenio.order.findUniqueOrThrow({ where: { id: o9.id } });
  assert.deepEqual([f9.status, f9.paid], ["READY", false]);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.a.id, orderId: o9.id } }), 0);
  const fuera = valor(await rendir(o9, [["resultado", "a-cobrar"]]));
  assert.equal(fuera?.ok, false, "volvió: ya no está en la calle, no se rinde");

  // Sale de nuevo y lo deja sin cobrar → Entregado · a cobrar, sin asiento.
  assert.ok(valor(await ejecutarAccion(sesionA, () => salioElReparto(formulario(ids([o9]))))).ok);
  const sinCobrar = valor(await rendir(o9, [["resultado", "a-cobrar"]]));
  assert.equal(sinCobrar?.ok, true, JSON.stringify(sinCobrar));
  const g9 = await duenio.order.findUniqueOrThrow({ where: { id: o9.id } });
  assert.deepEqual([g9.status, g9.paid], ["DELIVERED", false]);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.a.id, orderId: o9.id } }), 0);
});
