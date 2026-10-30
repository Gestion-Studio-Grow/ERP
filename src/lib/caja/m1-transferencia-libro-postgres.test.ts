// N2 · M1-C2 contra Postgres: «vender por transferencia → aparece en su columna del libro», con la
// venta REAL (`createOrder`). Desde el pase del 30/10 `CashMethod.TRANSFERENCIA` viene con la migración
// 20261030120000_m1_enums_caja, así que la base efímera ya lo trae: el asiento va a `TRANSFERENCIA`.
// Lo de ANTES del pase (transferencias guardadas en `MP`) se simula con un asiento viejo insertado a
// mano sobre un pedido cobrado por transferencia: la hoja nueva lo separa por el medio de origen y lo
// cuenta en Transferencia (F2: lo del período); el total del libro no cambia. B no se toca.
// (El estado «sin el valor en la base» quedó en la historia: lo cubren los unitarios de
// `cashMethodFromPaymentMethod` y del cierre de siempre en m1-caja-medios.test.ts.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres: venta por transferencia a su columna, lo viejo guardado en MP separado, sin mezclar negocios", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { createOrder } = await import("@/lib/order-actions");
  const { getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const { olvidarSchemaProbe } = await import("@/lib/schema-probe");
  const { olvidarTransferenciaEnElLibro } = await import("@/lib/caja/transferencia-en-el-libro");
  const { todayInBusinessTz } = await import("@/lib/datetime");

  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };
  const corte = await duenio.product.create({
    data: { tenantId: a.id, name: "Bife", saleUnit: "UNIT", price: 5_000, unit: "u", trackStock: true, stock: 10 },
  });
  const venta = (clave: string) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ channel: "COUNTER", fulfillment: "PICKUP", customerName: "Mostrador", paid: "on", paymentMethod: "TRANSFERENCIA", idempotencyKey: clave })) fd.set(k, v);
    fd.append("productId", corte.id);
    fd.append("quantity", "1");
    return createOrder(fd);
  };
  const libro = (tenantId: string) =>
    duenio.cashMovement.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { type: true, method: true, amount: true } });
  const libroDeB = await libro(b.id);

  // N2_enums.sql sigue siendo idempotente sobre una base que ya tiene los valores de M1.
  const sql = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/N2_enums.sql"), "utf8");
  for (const paso of sql.split("\n").filter((l) => /^ALTER TYPE/.test(l.trim()))) await duenio.$executeRawUnsafe(paso);
  olvidarSchemaProbe();
  olvidarTransferenciaEnElLibro();

  // ── Lo de antes del pase: una transferencia guardada en MP ─────────────────
  const viejo = a.pedidos[0];
  await duenio.order.update({ where: { id: viejo }, data: { paymentMethod: "TRANSFERENCIA", paid: true, total: 5_000 } });
  await duenio.cashMovement.create({
    data: { tenantId: a.id, type: "VENTA", method: "MP", amount: 5_000, orderId: viejo, reason: "Venta (antes del pase)", createdBy: `user:${a.duenia.id}`, occurredAt: new Date() },
  });

  // ── Venta real por transferencia: a su columna ────────────────────────────
  const despues = await como(a, a.duenia, () => venta("transf:con-enum"));
  assert.ok(despues && despues.ok, JSON.stringify(despues));
  assert.deepEqual(
    (await libro(a.id)).map((m) => [m.type, m.method, Number(m.amount)]),
    [["VENTA", "MP", 5_000], ["VENTA", "TRANSFERENCIA", 5_000]],
    "la nueva va a su columna; la de antes queda en MP",
  );
  // El reintento con la misma clave no asienta dos veces.
  const otraVez = await como(a, a.duenia, () => venta("transf:con-enum"));
  assert.ok(otraVez && otraVez.ok, JSON.stringify(otraVez));
  assert.equal((await libro(a.id)).length, 2, "un solo asiento por venta");

  const hoy = todayInBusinessTz();
  const hojaCon = await como(a, a.duenia, () => getCierreDiarioData(hoy));
  assert.ok(hojaCon.columnas.includes("TRANSFERENCIA"));
  assert.equal(hojaCon.preview.porColumna.TRANSFERENCIA.expected, 10_000, "la del libro + la vieja guardada en MP (lo del período)");
  assert.equal(hojaCon.preview.porColumna.MP.expected, 0);
  assert.equal(hojaCon.preview.total.expected, 10_000, "el total del libro no cambia");
  assert.deepEqual(hojaCon.mediosDelLibro, ["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"], "con el valor, el de siempre la cuenta aparte");

  // ── B no se mezcló ─────────────────────────────────────────────────────────
  assert.deepEqual(await libro(b.id), libroDeB, "el libro de B no cambió");
});
