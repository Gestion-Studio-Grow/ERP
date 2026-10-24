// EL COBRO DEL PIE CONTRA POSTGRES (Magra, tanda 1 · 1A) — con el rol de la app (app_rls, sin
// BYPASSRLS) y RLS encendido, ejecutando las Server Actions REALES con la sesión de la dueña:
//
//   · MG-001/002/005: `createOrder` con lo que escribe `PieDeCobro` al dividir → dos cobros
//     (`Collection`) y dos asientos que suman exacto, la venta con el medio principal, el ticket
//     con los dos medios; el reintento con la misma clave no graba nada.
//   · MG-004: el efectivo de más da vuelto y al libro va lo que se queda.
//   · MG-006: `entregarPedido` del pedido Listo con Efectivo + Transferencia (el resto) →
//     entregado, cobrado con dos cobros y medio principal Transferencia; devuelve la venta.
//   · MG-009/012: `cobrarPedido` en efectivo con «$30.000» → vuelto y `VentaTicket`; el segundo
//     toque no escribe otro asiento.
//   · MG-038: con la sesión de B, cobrar un pedido de A no toca nada.
//
// Base efímera propia (src/test/base-efimera.ts); sin Postgres local, se saltea y lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";
import type { OrderActionState } from "@/lib/order-actions";

const laBase = baseEfimeraDelArchivo();

type Pares = [string, string][];

function formulario(pares: Pares): FormData {
  const fd = new FormData();
  for (const [n, v] of pares) fd.append(n, v);
  return fd;
}

type Exito = Extract<OrderActionState, { ok: true }>;

/** La respuesta de la acción, que tiene que ser un sí. */
function exito(s: SalidaDeAccion<OrderActionState | null | undefined>): Exito {
  assert.ok(s.tipo === "respuesta" && s.valor?.ok, JSON.stringify(s));
  return s.valor as Exito;
}

/** La respuesta de la acción, que tiene que ser un no. */
function rechazo(s: SalidaDeAccion<OrderActionState | null | undefined>): void {
  assert.ok(s.tipo === "respuesta" && s.valor && !s.valor.ok, JSON.stringify(s));
}

const DIVIDIDO_36608: Pares = [
  ["paymentMethod", "EFECTIVO"],
  ["pagado", "1"],
  ["paid", "on"],
  ["pago.medio", "EFECTIVO"],
  ["pago.monto", "20000.00"],
  ["pago.medio", "MERCADOPAGO"],
  ["pago.monto", "16608.00"],
];

test("el pie de cobro contra Postgres: venta y pedido con pago dividido, vuelto, ticket, doble toque y aislamiento", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.update({ where: { id: base.a.id }, data: { blueprintId: "carniceria", modules: ["pos", "catalog", "clients"] } });
  const vacio = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Vacío UAT", saleUnit: "WEIGHT", pricePerKg: 28600, unit: "kg", trackStock: false },
  });
  const bondiola = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Bondiola UAT", saleUnit: "WEIGHT", pricePerKg: 25700, unit: "kg", trackStock: false },
  });

  const { createOrder, cobrarPedido, entregarPedido } = await import("@/lib/order-actions");
  const sesionA = { negocio: base.a, usuario: base.a.duenia };
  const sesionB = { negocio: base.b, usuario: base.b.duenia };
  const vacioPor = (kg: string): Pares => [["productId", vacio.id], ["quantity", kg]];
  // Ordenados por nombre del medio en JS: `orderBy` de un enum sigue el orden del enum, no el alfabético.
  const cobrosDe = async (orderId: string) =>
    (await duenio.collection.findMany({ where: { tenantId: base.a.id, orderId }, select: { method: true, amount: true, idempotencyKey: true } })).sort((x, y) =>
      String(x.method).localeCompare(String(y.method)),
    );
  const asientosDe = (ids: string[]) =>
    duenio.cashMovement.findMany({ where: { tenantId: base.a.id, collectionId: { in: ids } }, select: { type: true, method: true, amount: true } });

  // ── MG-001 / MG-002 / MG-005: venta de mostrador dividida ──────────────────────────────────
  const venta = formulario([["channel", "COUNTER"], ["idempotencyKey", "pie-uat-0001"], ["conTicket", "1"], ...vacioPor("1.28"), ...DIVIDIDO_36608]);
  const r1 = await ejecutarAccion(sesionA, () => createOrder(venta));
  const v1 = exito(r1).venta;
  assert.ok(v1, "devuelve la venta para el ticket");
  assert.equal(v1.total, 36608);
  assert.equal(v1.medio, null, "con varios medios el ticket muestra el detalle");
  assert.deepEqual(v1.pagos?.map((p) => [p.medio, p.monto]).sort(), [["EFECTIVO", 20000], ["MERCADOPAGO", 16608]]);
  const orden1 = await duenio.order.findUniqueOrThrow({ where: { id: v1.id } });
  assert.equal(orden1.paid, true);
  assert.equal(orden1.paymentMethod, "EFECTIVO", "MG-007: el principal es el de más plata");
  const cobros1 = await cobrosDe(v1.id);
  assert.deepEqual(
    cobros1.map((c) => [c.method, Number(c.amount), c.idempotencyKey]),
    [
      ["EFECTIVO", 20000, `pago-mixto:${v1.id}:EFECTIVO`],
      ["MERCADOPAGO", 16608, `pago-mixto:${v1.id}:MERCADOPAGO`],
    ],
  );
  const col1 = await duenio.collection.findMany({ where: { tenantId: base.a.id, orderId: v1.id }, select: { id: true } });
  const asientos1 = await asientosDe(col1.map((c) => c.id));
  assert.deepEqual(asientos1.map((a) => [a.type, a.method, Number(a.amount)]).sort(), [["VENTA", "EFECTIVO", 20000], ["VENTA", "MP", 16608]]);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.a.id, orderId: v1.id } }), 0, "sin el asiento único de la venta");

  // Doble toque: el mismo ticket (misma clave) no graba otra venta ni otro cobro.
  const r1b = await ejecutarAccion(sesionA, () =>
    createOrder(formulario([["channel", "COUNTER"], ["idempotencyKey", "pie-uat-0001"], ["conTicket", "1"], ...vacioPor("1.28"), ...DIVIDIDO_36608])),
  );
  exito(r1b);
  assert.equal(await duenio.order.count({ where: { tenantId: base.a.id, idempotencyKey: "pie-uat-0001" } }), 1);
  assert.equal((await cobrosDe(v1.id)).length, 2);

  // ── MG-004: efectivo de más ────────────────────────────────────────────────────────────────
  const r4 = await ejecutarAccion(sesionA, () =>
    createOrder(
      formulario([
        ["channel", "COUNTER"],
        ["idempotencyKey", "pie-uat-0004"],
        ...vacioPor("1.28"),
        ["paymentMethod", "EFECTIVO"],
        ["pagado", "1"],
        ["paid", "on"],
        ["pago.medio", "EFECTIVO"],
        ["pago.monto", "20000.00"],
        ["pago.medio", "MERCADOPAGO"],
        ["pago.monto", "16608.00"],
        ["recibido", "25000.00"],
      ]),
    ),
  );
  assert.equal(exito(r4).vuelto, 5000);

  // Lo que no suma el total no graba nada (el servidor no confía en la pantalla).
  const corto = await ejecutarAccion(sesionA, () =>
    createOrder(
      formulario([
        ["channel", "COUNTER"],
        ["idempotencyKey", "pie-uat-corto"],
        ...vacioPor("1.28"),
        ["paymentMethod", "EFECTIVO"],
        ["pagado", "1"],
        ["pago.medio", "EFECTIVO"],
        ["pago.monto", "20000.00"],
        ["pago.medio", "MERCADOPAGO"],
        ["pago.monto", "10000.00"],
      ]),
    ),
  );
  rechazo(corto);
  assert.equal(await duenio.order.count({ where: { tenantId: base.a.id, idempotencyKey: "pie-uat-corto" } }), 0);

  // ── MG-006: entregar y cobrar dividido un pedido Listo ─────────────────────────────────────
  const tomar = async (clave: string) => {
    const r = await ejecutarAccion(sesionA, () =>
      createOrder(
        formulario([
          ["channel", "ONLINE"],
          ["fulfillment", "PICKUP"],
          ["customerName", "Ana UAT"],
          ["customerPhone", "1155551234"],
          ["idempotencyKey", clave],
          ["productId", bondiola.id],
          ["quantity", "1"],
        ]),
      ),
    );
    exito(r);
    const o = await duenio.order.findFirstOrThrow({ where: { tenantId: base.a.id, idempotencyKey: clave } });
    assert.equal(o.paid, false);
    assert.equal(o.total, 25700);
    await duenio.order.update({ where: { id: o.id }, data: { status: "READY" } });
    return o;
  };
  const p128 = await tomar("pie-uat-p128");
  const r6 = await ejecutarAccion(sesionA, () =>
    entregarPedido(
      { ok: true },
      formulario([
        ["id", p128.id],
        ["paymentMethod", "TRANSFERENCIA"],
        ["pagado", "1"],
        ["paid", "on"],
        ["pago.medio", "EFECTIVO"],
        ["pago.monto", "10000.00"],
        ["pago.medio", "TRANSFERENCIA"],
        ["pago.monto", "15700.00"],
      ]),
    ),
  );
  assert.deepEqual(exito(r6).venta?.pagos?.map((p) => [p.medio, p.monto]).sort(), [["EFECTIVO", 10000], ["TRANSFERENCIA", 15700]]);
  const tras6 = await duenio.order.findUniqueOrThrow({ where: { id: p128.id } });
  assert.equal(tras6.status, "DELIVERED");
  assert.equal(tras6.paid, true);
  assert.equal(tras6.paymentMethod, "TRANSFERENCIA");
  assert.deepEqual((await cobrosDe(p128.id)).map((c) => [c.method, Number(c.amount)]), [["EFECTIVO", 10000], ["TRANSFERENCIA", 15700]]);

  // ── MG-009 / MG-012: cobrar en efectivo con un billete → vuelto y ticket; el segundo toque no escribe ──
  const p129 = await tomar("pie-uat-p129");
  const cobrarEfectivo = () =>
    ejecutarAccion(sesionA, () =>
      cobrarPedido(
        { ok: true },
        formulario([["id", p129.id], ["paymentMethod", "EFECTIVO"], ["pagado", "1"], ["paid", "on"], ["recibido", "30000.00"]]),
      ),
    );
  const r12 = await cobrarEfectivo();
  const c12 = exito(r12);
  assert.equal(c12.vuelto, 4300);
  assert.equal(c12.venta?.medio, "EFECTIVO");
  assert.equal(c12.venta?.total, 25700);
  const asientos129 = () => duenio.cashMovement.count({ where: { tenantId: base.a.id, orderId: p129.id } });
  assert.equal(await asientos129(), 1);
  const otraVez = await cobrarEfectivo();
  assert.match(exito(otraVez).mensaje ?? "", /ya estaba cobrado/);
  assert.equal(await asientos129(), 1, "el doble toque no asienta otra vez");

  // ── MG-038: con la sesión de B, un pedido de A no existe ───────────────────────────────────
  const p130 = await tomar("pie-uat-p130");
  const robo = await ejecutarAccion(sesionB, () =>
    cobrarPedido({ ok: true }, formulario([["id", p130.id], ...DIVIDIDO_36608.map(([n, v]): [string, string] => [n, v])])),
  );
  rechazo(robo);
  const tras130 = await duenio.order.findUniqueOrThrow({ where: { id: p130.id } });
  assert.equal(tras130.paid, false);
  assert.equal((await cobrosDe(p130.id)).length, 0);
});
