// UAT M1 (orden del dueño 30/10/2026) contra Postgres: una devolución cargada a mano y la anulación
// de la misma venta sacan la plata dos veces. El sistema AVISA y pide confirmar, en los dos órdenes,
// y confirmado hace lo de siempre (src/lib/caja/doble-salida.ts):
//   · se anula la venta por transferencia de $11.500 y después se carga «Devolución» de $11.500 →
//     aviso «se anuló una venta por el mismo monto»; confirmado, se guarda;
//   · se carga a mano un egreso de $5.000 y después se anula la venta en efectivo de $5.000 →
//     aviso «se cargó a mano un egreso» (tipo sin-confirmar); confirmado, se anula.
// Sin nada parecido, ni el alta ni la anulación preguntan. B no se toca.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres: devolución a mano + anulación de la misma venta → avisa y confirma, en los dos órdenes", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { createOrder, anularVenta } = await import("@/lib/order-actions");
  const { addLibroEntry } = await import("@/lib/libro-caja-actions");
  const { olvidarSchemaProbe } = await import("@/lib/schema-probe");
  const { olvidarTransferenciaEnElLibro } = await import("@/lib/caja/transferencia-en-el-libro");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  olvidarSchemaProbe();
  olvidarTransferenciaEnElLibro();

  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const libroDeB = await duenio.cashMovement.findMany({ where: { tenantId: b.id }, orderBy: { createdAt: "asc" } });
  const vender = async (precio: number, medio: string, clave: string) => {
    const p = await duenio.product.create({ data: { tenantId: a.id, name: `Corte ${clave}`, saleUnit: "UNIT", price: precio, unit: "u", trackStock: false, stock: 0 } });
    const fd = form({ channel: "COUNTER", fulfillment: "PICKUP", customerName: "Mostrador", paid: "on", paymentMethod: medio, idempotencyKey: clave });
    fd.append("productId", p.id);
    fd.append("quantity", "1");
    const r = await como(a, a.duenia, () => createOrder(fd));
    assert.ok(r && r.ok, JSON.stringify(r));
    return (await duenio.order.findFirst({ where: { tenantId: a.id }, orderBy: { createdAt: "desc" }, select: { id: true } }))!.id;
  };
  const hoy = todayInBusinessTz();
  const egresos = () => duenio.cashMovement.count({ where: { tenantId: a.id, type: "EGRESO" } });

  // ── 1. Primero la anulación, después la devolución a mano ──────────────────
  const transf = await vender(11_500, "TRANSFERENCIA", "ds:transf");
  const anulada = await como(a, a.duenia, () => anularVenta(null, form({ id: transf, motivo: "se cobró de más" })));
  assert.ok(anulada?.ok, JSON.stringify(anulada));
  assert.equal(await egresos(), 1, "la anulación asienta su egreso");
  const devolucion = { date: hoy, detail: "Devolución al cliente", type: "EGRESO", method: "TRANSFERENCIA", amount: "11.500" };
  const aviso = await como(a, a.duenia, () => addLibroEntry(null, form(devolucion)));
  assert.ok(aviso && !aviso.ok && aviso.confirmable === "duplicado", JSON.stringify(aviso));
  assert.match(aviso.error, /se anuló una venta por el mismo monto/);
  assert.match(aviso.error, /saldría dos veces/);
  assert.equal(await egresos(), 1, "sin confirmar, no se guardó");
  const igual = await como(a, a.duenia, () => addLibroEntry(null, form({ ...devolucion, confirm: "1" })));
  assert.ok(igual?.ok, JSON.stringify(igual));
  assert.equal(await egresos(), 2, "confirmado, se guarda igual");

  // ── 2. Primero la devolución a mano, después la anulación ──────────────────
  const efectivo = await vender(5_000, "EFECTIVO", "ds:efectivo");
  const manual = await como(a, a.duenia, () => addLibroEntry(null, form({ date: hoy, detail: "Le devolví la plata del bife", type: "EGRESO", method: "EFECTIVO", amount: "5.000" })));
  assert.ok(manual?.ok, JSON.stringify(manual));
  const pregunta = await como(a, a.duenia, () => anularVenta(null, form({ id: efectivo, motivo: "devolución" })));
  assert.ok(pregunta && !pregunta.ok && pregunta.tipo === "sin-confirmar", JSON.stringify(pregunta));
  assert.match(pregunta.error, /se cargó a mano un egreso/);
  assert.equal((await duenio.order.findFirst({ where: { id: efectivo }, select: { status: true } }))?.status !== "CANCELLED", true, "sin confirmar, no se anuló");
  const anuladaIgual = await como(a, a.duenia, () => anularVenta(null, form({ id: efectivo, motivo: "devolución", confirmar: "1" })));
  assert.ok(anuladaIgual?.ok, JSON.stringify(anuladaIgual));
  assert.equal((await duenio.order.findFirst({ where: { id: efectivo }, select: { status: true } }))?.status, "CANCELLED");

  // ── 3. Sin nada parecido, no pregunta ─────────────────────────────────────
  const otra = await vender(7_200, "EFECTIVO", "ds:otra");
  const directa = await como(a, a.duenia, () => anularVenta(null, form({ id: otra, motivo: "se pesó mal" })));
  assert.ok(directa?.ok, JSON.stringify(directa));
  const gasto = await como(a, a.duenia, () => addLibroEntry(null, form({ date: hoy, detail: "Hielo", type: "EGRESO", method: "EFECTIVO", amount: "1.300" })));
  assert.ok(gasto?.ok, JSON.stringify(gasto));

  assert.deepEqual(await duenio.cashMovement.findMany({ where: { tenantId: b.id }, orderBy: { createdAt: "asc" } }), libroDeB, "el libro de B no cambió");
});
