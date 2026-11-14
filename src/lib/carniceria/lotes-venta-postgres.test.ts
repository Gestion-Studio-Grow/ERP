// T3 · LOTES contra una base de verdad con la migración cárnica APLICADA (Postgres del arnés o
// PGlite: `node scripts/qa/p1-pglite.mjs src/lib/carniceria/lotes-venta-postgres.test.ts`).
//
// Se aplica prisma/pending-gate2/CarniceriaRubro.sql (dos veces: es idempotente) sobre la base
// efímera y se recorre el circuito real: alta de lote (`crearLoteEnTx`) → venta por peso
// (`insertOrder`, la misma del mostrador) → baja de stock y movimiento VENTA. Y la guarda: un
// corte con todos sus lotes vencidos no se vende y no se graba NADA (ni pedido ni stock).
// Nunca toca Neon: el arnés exige un servidor local. Con PGlite la RLS no se aplica (superusuario):
// el aislamiento que se prueba acá es el `tenantId` escrito en cada consulta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const SQL = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/CarniceriaRubro.sql"), "utf8");

function diaMas(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test("lotes: migración aplicada → alta de lote → venta por peso → baja de stock; vencido no se vende", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;

  // La migración, como la correría psql (consulta simple: varias sentencias y bloques DO). Dos veces.
  const { Client } = await import("pg");
  const pg = new Client({ connectionString: base.urlDuenio });
  await pg.connect();
  try {
    await pg.query(SQL);
    await pg.query(SQL);
  } finally {
    await pg.end();
  }

  const { tenantTransaction } = await import("@/lib/rls");
  const { crearLoteEnTx, controlarLotesVencidosEnTx } = await import("./lotes-registro");
  const { listarLotes } = await import("./lotes-loader");
  const { insertOrder } = await import("@/lib/order-core");
  const { RechazoDeDominio } = await import("@/lib/rechazo-de-dominio");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const hoy = todayInBusinessTz();

  const corte = (name: string, stock: number) =>
    duenio.product.create({
      data: { tenantId: a.id, name, unit: "kg", saleUnit: "WEIGHT", pricePerKg: 20000, price: 20000, stock, trackStock: true, active: true },
      select: { id: true },
    });
  const vacio = await corte("Vacío al vacío", 10);
  const matambre = await corte("Matambre al vacío", 5);

  const lote = (productId: string, codigo: string, vence: string) =>
    tenantTransaction(
      (tx) =>
        crearLoteEnTx(tx, a.id, {
          id: randomUUID(),
          codigo,
          productId,
          supplierId: null,
          envasado: diaMas(hoy, -20),
          vence,
          netWeightKg: 4.2,
          packages: 3,
          unitCost: 12000,
          note: null,
          actor: `user:${a.duenia.id}`,
        }),
      { tenantId: a.id },
    );
  await lote(vacio.id, "L-001", diaMas(hoy, 10));
  await lote(matambre.id, "L-002", diaMas(hoy, -1));

  // La lectura del negocio A ve sus dos lotes (FEFO: el vencido primero); B no ve ninguno.
  const deA = await listarLotes(a.id, true);
  assert.deepEqual(deA.map((l) => l.code), ["L-002", "L-001"]);
  assert.equal(deA[1].netWeightKg, 4.2);
  assert.equal(deA[1].unitCost, 12000);
  assert.deepEqual(await listarLotes(b.id, true), []);

  // Adentro de un pedido de Next del negocio A (como el mostrador): el alta resuelve el negocio.
  const venta = async (productId: string, qty: number, conGuarda: boolean) => {
    const r = await ejecutarAccion({ negocio: a }, () => alta(productId, qty, conGuarda));
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: Awaited<ReturnType<typeof alta>> }).valor;
  };
  const alta = (productId: string, qty: number, conGuarda: boolean) =>
    insertOrder(
      a.id,
      {
        channel: "COUNTER",
        fulfillment: "PICKUP",
        customerName: "Mostrador",
        customerPhone: "",
        address: null,
        notes: null,
        scheduledFor: null,
        paid: false,
        paymentMethod: null,
        items: [{ productId, qty }],
      },
      { lotesVencidos: conGuarda ? { hoy } : null },
    );
  const stockDe = async (id: string) => (await duenio.product.findUniqueOrThrow({ where: { id }, select: { stock: true } })).stock;
  const pedidosDeA = () => duenio.order.count({ where: { tenantId: a.id } });

  // Venta por peso del corte con lote vigente: baja el stock y deja el movimiento VENTA.
  const vendida = await venta(vacio.id, 1.25, true);
  assert.ok(vendida.id);
  assert.equal(await stockDe(vacio.id), 8.75);
  const mov = await duenio.stockMovement.findFirst({ where: { tenantId: a.id, productId: vacio.id, type: "VENTA" } });
  assert.ok(mov, "la venta asentó su movimiento");

  // El corte con su único lote vencido: rechazo con motivo, y no se grabó nada.
  const antes = await pedidosDeA();
  await assert.rejects(venta(matambre.id, 0.8, true), (err: unknown) => err instanceof RechazoDeDominio && /L-002/.test((err as Error).message));
  assert.equal(await stockDe(matambre.id), 5);
  assert.equal(await pedidosDeA(), antes, "sin pedido grabado");

  // Lote retirado: deja de contar y el corte vuelve a venderse (sin lotes disponibles = como siempre).
  const { cambiarEstadoEnTx } = await import("./lotes-registro");
  const loteVencido = deA.find((l) => l.code === "L-002")!;
  await tenantTransaction((tx) => cambiarEstadoEnTx(tx, a.id, loteVencido.id, "WITHDRAWN"), { tenantId: a.id });
  await venta(matambre.id, 0.8, true);
  assert.equal(await stockDe(matambre.id), 4.2);

  // La guarda lee sólo el negocio que vende: con el negocio B, el lote vencido de A no existe.
  await lote(vacio.id, "L-003", diaMas(hoy, -3));
  await tenantTransaction((tx) => controlarLotesVencidosEnTx(tx, b.id, [{ productId: vacio.id, name: "Vacío" }], hoy), { tenantId: b.id });
});
