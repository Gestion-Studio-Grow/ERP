// «RINDIÓ TODO» / «LO DEJÓ SIN COBRAR» CONTRA «COBRÓ» DEL OTRO PUESTO (CERT-magra-tpractica, alta)
// — contra Postgres, con el rol de la app (app_rls) y las Server Actions REALES.
//
// Dos puestos sobre el MISMO envío: el puesto 2 rinde «a cobrar» (lee el pedido sin cobrar)
// mientras el puesto 1 lo rinde «Cobró» en efectivo. La intercalación se fuerza con un candado de
// fila sobre el pedido desde la conexión del dueño: la entrega del puesto 2 espera y el cobro del
// puesto 1 se encola detrás. Antes del arreglo la única marca decía «a cobrar» (efectivo 0 en el
// resumen) con el pedido cobrado en el libro, y al puesto 1 le contestaba «ya estaba rendido».
// Ahora `marcarRendidoUnaVez` relee pedido y libro dentro del candado: UNA marca, «cobrado» con el
// efectivo del libro.
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
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("carrera dos puestos: «Rindió todo» (a cobrar) vs «Cobró» efectivo del mismo envío", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const tenantA = base.a.id;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.update({ where: { id: base.a.id }, data: { blueprintId: "carniceria", modules: ["pos", "catalog", "clients"] } });
  await duenio.auditLog.create({
    data: { tenantId: base.a.id, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId: "mostrador-boutique", channel: "operador", changes: {} },
  });
  const { createOrder } = await import("@/lib/order-actions");
  const { salioElReparto, rendirPedido, rendirTodoComoSalio } = await import("../acciones");
  const { leerDatosDelReparto } = await import("../datos.server");
  const { resumenDeLaRendicion, leerMarcaDeReparto } = await import("../reparto-core");
  const sesionA = { negocio: base.a, usuario: base.a.duenia };
  const prod = await duenio.product.create({ data: { tenantId: base.a.id, name: "Caja carrera", saleUnit: "UNIT", price: 9000, unit: "u", trackStock: false } });

  let n = 0;
  const envio = async () => {
    const clave = `carrera-${++n}`;
    const r = valor(
      await ejecutarAccion(sesionA, () =>
        createOrder(
          formulario([
            ["channel", "ONLINE"], ["fulfillment", "DELIVERY"], ["customerName", `Clienta C ${n}`], ["customerPhone", `11 5555 20${n}`],
            ["address", `Calle C ${n}`], ["idempotencyKey", clave], ["productId", prod.id], ["quantity", "1"],
          ]),
        ),
      ),
    );
    assert.equal(r?.ok, true, JSON.stringify(r));
    const o = await duenio.order.findFirstOrThrow({ where: { tenantId: base.a.id, idempotencyKey: clave } });
    await duenio.order.update({ where: { id: o.id }, data: { status: "READY" } });
    return o;
  };
  const marcas = async (orderId: string) =>
    (await duenio.auditLog.findMany({ where: { tenantId: base.a.id, entity: "Order", action: "reparto", entityId: orderId }, select: { changes: true } }))
      .map((f) => leerMarcaDeReparto(f.changes))
      .filter((m) => m?.tipo === "rendido");

  async function carrera(puesto2: (id: string, reparto: string) => Promise<unknown>) {
    const o = await envio();
    assert.ok(valor(await ejecutarAccion(sesionA, () => salioElReparto(formulario([["id", o.id]])))).ok);
    const reparto = valor(await ejecutarAccion(sesionA, () => leerDatosDelReparto(tenantA))).envios.find((e: { id: string }) => e.id === o.id)?.salida?.reparto as string;
    assert.ok(reparto);

    let soltar!: () => void;
    const suelto = new Promise<void>((r) => (soltar = r));
    let tomado!: () => void;
    const yaTomado = new Promise<void>((r) => (tomado = r));
    const candado = duenio.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(`SELECT 1 FROM "Order" WHERE id = $1 FOR UPDATE`, o.id);
        tomado();
        await suelto;
      },
      { timeout: 30000, maxWait: 30000 },
    );
    await yaTomado;
    const p2 = ejecutarAccion(sesionA, () => puesto2(o.id, reparto));
    await dormir(800); // el puesto 2 ya leyó «sin cobrar» y espera en la entrega
    const p1 = ejecutarAccion(sesionA, () =>
      rendirPedido(formulario([["id", o.id], ["resultado", "cobrado"], ["paymentMethod", "EFECTIVO"], ["pagado", "1"], ["paid", "on"], ["recibido", "9000.00"]])),
    );
    await dormir(800); // el cobro del puesto 1 encolado detrás
    soltar();
    await candado;
    const [s2, s1] = await Promise.all([p2, p1]);

    const pedido = await duenio.order.findUniqueOrThrow({ where: { id: o.id } });
    const ventas = await duenio.cashMovement.count({ where: { tenantId: tenantA, orderId: o.id, type: "VENTA" } });
    const ms = await marcas(o.id);
    const datos = valor(await ejecutarAccion(sesionA, () => leerDatosDelReparto(tenantA)));
    const fila = datos.rendidosHoy.find((r: { id: string }) => r.id === o.id);
    const resumenSolo = resumenDeLaRendicion(fila ? [fila] : []);
    const diag = JSON.stringify({ s1, s2, paid: pedido.paid, status: pedido.status, ventas, ms, resumenSolo });
    t.diagnostic(diag);
    // Lo que tiene que pasar si el pedido quedó cobrado en efectivo en este reparto:
    assert.equal(ms.length, 1, `una marca: ${diag}`);
    assert.ok(pedido.paid && ventas === 1, `el cobro del puesto 1 entra una vez: ${diag}`);
    assert.equal(fila?.resultado, "cobrado", `cobrado en el libro y la rendición dice otra cosa: ${diag}`);
    assert.equal(resumenSolo.efectivo, 9000, `el efectivo del cadete falta en el resumen: ${diag}`);
    assert.equal(resumenSolo.aCobrar.cantidad, 0, `figura a cobrar un pedido ya cobrado: ${diag}`);
  }

  await t.test("A · «Rindió todo» contra «Cobró» del otro puesto", () =>
    carrera((id, reparto) => rendirTodoComoSalio(formulario([["reparto", reparto], ["id", id]]))),
  );
  await t.test("B · rama vecina: «Lo dejó sin cobrar» contra «Cobró» (antes del diff mandaba la última marca)", () =>
    carrera((id) => rendirPedido(formulario([["id", id], ["resultado", "a-cobrar"]]))),
  );
});
