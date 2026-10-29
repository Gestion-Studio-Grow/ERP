// N2 · M1-C1 contra Postgres: «vender $5.000 con Débito → aparece en el libro», con la venta REAL
// (`createOrder`, el mismo camino del pie de Vender y del cuaderno), en los dos estados del enum:
//   · SIN N2_enums.sql: `tarjetaHabilitada()` false y el alta con DEBITO se rechaza (nada se graba);
//   · CON N2_enums.sql: true, el pedido queda cobrado con DEBITO (o CREDITO: D-C01, separados) y el
//     libro tiene la VENTA en la columna TARJETA; el reintento con la misma clave no duplica; B no se toca.
// (Reproduce la falla F2 de la certificación de M1: antes, el test insertaba el movimiento a mano.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres: venta real con Tarjeta, sin y con el valor en el enum, sin mezclar negocios", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { createOrder } = await import("@/lib/order-actions");
  const { tarjetaHabilitada } = await import("@/lib/caja-actions");
  const { hayValorEnum, olvidarSchemaProbe } = await import("@/lib/schema-probe");

  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };
  const corte = await duenio.product.create({
    data: { tenantId: a.id, name: "Bife", saleUnit: "UNIT", price: 5_000, unit: "u", trackStock: true, stock: 10 },
  });
  const venta = (clave: string, medio = "DEBITO") => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ channel: "COUNTER", fulfillment: "PICKUP", customerName: "Mostrador", paid: "on", paymentMethod: medio, idempotencyKey: clave })) fd.set(k, v);
    fd.append("productId", corte.id);
    fd.append("quantity", "1");
    return createOrder(fd);
  };
  const libro = (tenantId: string) => duenio.cashMovement.findMany({ where: { tenantId }, select: { type: true, method: true, amount: true, orderId: true } });
  const libroDeB = await libro(b.id);
  const pedidosDeA = await duenio.order.count({ where: { tenantId: a.id } });
  const pedidosDeB = await duenio.order.count({ where: { tenantId: b.id } });

  // ── SIN el valor en la base ────────────────────────────────────────────────
  olvidarSchemaProbe();
  assert.equal(await hayValorEnum("PaymentMethod", "DEBITO"), false);
  assert.equal(await como(a, a.duenia, () => tarjetaHabilitada()), false, "sin N2_enums.sql la tecla no se ofrece");
  const sinEnum = await como(a, a.duenia, () => venta("tarjeta:sin-enum"));
  assert.ok(sinEnum && !sinEnum.ok, `sin el valor, el alta con DEBITO se rechaza: ${JSON.stringify(sinEnum)}`);
  assert.equal(await duenio.order.count({ where: { tenantId: a.id } }), pedidosDeA, "no se grabó el pedido");
  assert.equal((await libro(a.id)).length, 0, "no se asentó nada en el libro");

  // ── CON N2_enums.sql aplicada ──────────────────────────────────────────────
  const sql = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/N2_enums.sql"), "utf8");
  for (const paso of sql.split("\n").filter((l) => /^ALTER TYPE/.test(l.trim()))) await duenio.$executeRawUnsafe(paso);
  olvidarSchemaProbe();
  assert.equal(await como(a, a.duenia, () => tarjetaHabilitada()), true, "con el valor en la base y en el cliente, Tarjeta se ofrece");
  const conEnum = await como(a, a.duenia, () => venta("tarjeta:con-enum"));
  assert.ok(conEnum && conEnum.ok, `vender $5.000 con Débito: ${JSON.stringify(conEnum)}`);
  const pedido = await duenio.order.findFirstOrThrow({ where: { tenantId: a.id, idempotencyKey: "tarjeta:con-enum" }, select: { id: true, paid: true, paymentMethod: true, total: true } });
  assert.deepEqual({ paid: pedido.paid, medio: pedido.paymentMethod, total: Number(pedido.total) }, { paid: true, medio: "DEBITO", total: 5_000 });
  assert.deepEqual(await libro(a.id), [{ type: "VENTA", method: "TARJETA", amount: 5_000, orderId: pedido.id }], "la venta aparece en el libro, columna Tarjeta");

  // El doble toque / reintento con la misma clave no cobra dos veces.
  const otraVez = await como(a, a.duenia, () => venta("tarjeta:con-enum"));
  assert.ok(otraVez && otraVez.ok, JSON.stringify(otraVez));
  assert.equal(await duenio.order.count({ where: { tenantId: a.id } }), pedidosDeA + 1, "un solo pedido");
  assert.equal((await libro(a.id)).length, 1, "un solo asiento");

  // Recepción también cobra con Crédito (toma pedidos) y la lectura de pedidos no se rompe con los valores.
  const deRecepcion = await como(a, a.recepcion, () => venta("tarjeta:recepcion", "CREDITO"));
  assert.ok(deRecepcion && deRecepcion.ok, JSON.stringify(deRecepcion));
  const medios = (await duenio.order.findMany({ where: { tenantId: a.id }, select: { paymentMethod: true } })).map((o) => o.paymentMethod).filter((m) => m !== null).sort();
  assert.deepEqual(medios, ["CREDITO", "DEBITO"], "D-C01: Débito y Crédito quedan separados en el pedido");
  assert.deepEqual((await libro(a.id)).map((m) => m.method), ["TARJETA", "TARJETA"], "y los dos van a la columna Tarjeta del libro");
  // Un medio que no existe (el TARJETA viejo de M1) se rechaza como cualquier otro.
  const viejo = await como(a, a.duenia, () => venta("tarjeta:viejo", "TARJETA"));
  assert.ok(viejo && !viejo.ok, JSON.stringify(viejo));

  // ── B no se mezcló ─────────────────────────────────────────────────────────
  assert.deepEqual(await libro(b.id), libroDeB, "el libro de B no cambió");
  assert.equal(await duenio.order.count({ where: { tenantId: b.id } }), pedidosDeB);
});
