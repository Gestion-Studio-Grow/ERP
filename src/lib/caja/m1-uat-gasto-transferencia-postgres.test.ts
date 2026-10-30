// UAT M1 (30/10/2026) contra Postgres: un gasto o una devolución por TRANSFERENCIA se carga a mano
// en su columna (`addLibroEntry`), no en «MP». Antes el alta sólo ofrecía Efectivo, «MP / Transf.» y
// Tarjeta: la devolución ensuciaba Mercado Pago en la hoja nueva y Transferencia nunca tenía egresos,
// así que el neto negativo de O2 no se podía dar. Con una venta real por transferencia de $11.500 y
// una devolución por transferencia de $40.000, Transferencia queda en −$28.500 (el neto del día),
// Mercado Pago no se mueve y el cierre con «-28.500» cuadra. B no se toca.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres: devolución por transferencia cargada a mano → su columna, neto negativo que cierra", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { createOrder } = await import("@/lib/order-actions");
  const { addLibroEntry } = await import("@/lib/libro-caja-actions");
  const { cerrarDia, getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
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
  const asado = await duenio.product.create({
    data: { tenantId: a.id, name: "Asado", saleUnit: "UNIT", price: 11_500, unit: "u", trackStock: true, stock: 10 },
  });
  const fd = form({ channel: "COUNTER", fulfillment: "PICKUP", customerName: "Mostrador", paid: "on", paymentMethod: "TRANSFERENCIA", idempotencyKey: "uat:transf" });
  fd.append("productId", asado.id);
  fd.append("quantity", "1");
  const venta = await como(a, a.duenia, () => createOrder(fd));
  assert.ok(venta && venta.ok, JSON.stringify(venta));

  const hoy = todayInBusinessTz();
  const alta = await como(a, a.duenia, () =>
    addLibroEntry(null, form({ date: hoy, detail: "Devolución por transferencia de la venta #8 del 29", type: "EGRESO", method: "TRANSFERENCIA", amount: "40.000" })),
  );
  assert.ok(alta?.ok, JSON.stringify(alta));
  const egreso = await duenio.cashMovement.findFirst({ where: { tenantId: a.id, type: "EGRESO" }, select: { method: true, amount: true } });
  assert.deepEqual([egreso?.method, Number(egreso?.amount)], ["TRANSFERENCIA", 40_000], "el egreso va a su columna, no a MP");

  const hoja = await como(a, a.duenia, () => getCierreDiarioData(hoy));
  assert.equal(hoja.preview.porColumna.TRANSFERENCIA.expected, -28_500, "neto del día: 11.500 − 40.000");
  assert.equal(hoja.preview.porColumna.MP.expected, 0, "Mercado Pago no se ensucia");

  const c = await como(a, a.duenia, () =>
    cerrarDia(form({ day: hoy, columnas: "x", declarado_EFECTIVO: "0", declarado_MP: "0", declarado_TRANSFERENCIA: "-28.500" })),
  );
  assert.ok(c && c.ok, JSON.stringify(c));
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: a.id, createdBy: { startsWith: "cierre-diario:" } } }), 0, "cuadra: sin ajuste");

  assert.deepEqual(await duenio.cashMovement.findMany({ where: { tenantId: b.id }, orderBy: { createdAt: "asc" } }), libroDeB, "el libro de B no cambió");
});
