// Tests del ledger de stock: la aritmética de signo (pura) y `recordMovement` ejecutado contra
// un doble de transacción (abajo), que es donde vive el riesgo de convertir una salida en
// entrada, de acumular error de coma flotante en el stock guardado o de perder el costo.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  movementDirection,
  signedDelta,
  round3,
  recordMovement,
  registrarConteoSinDiferencia,
  stockARedondear,
  llevaCostoEstampado,
  TOLERANCIA_STOCK,
  type LedgerTx,
} from "./ledger";

test("round3: redondea a 3 decimales (stock fraccional en kg)", () => {
  assert.equal(round3(0.1 + 0.2), 0.3);
  assert.equal(round3(1 / 3), 0.333);
});

test("movementDirection: entradas +1, salidas -1, ajuste 0 (lo define el delta)", () => {
  assert.equal(movementDirection("COMPRA"), 1);
  assert.equal(movementDirection("REPOSICION"), 1);
  assert.equal(movementDirection("VENTA"), -1);
  assert.equal(movementDirection("CONSUMO"), -1);
  assert.equal(movementDirection("AJUSTE"), 0);
});

test("signedDelta: el TIPO fija el signo — un qty negativo en VENTA sigue restando", () => {
  // Magnitud, no signo del input: no se puede "sumar" stock con una VENTA.
  assert.equal(signedDelta("VENTA", 5), -5);
  assert.equal(signedDelta("VENTA", -5), -5);
  assert.equal(signedDelta("CONSUMO", 2), -2);
  assert.equal(signedDelta("COMPRA", 10), 10);
  assert.equal(signedDelta("COMPRA", -10), 10);
  assert.equal(signedDelta("REPOSICION", 3), 3);
});

test("signedDelta: AJUSTE respeta el delta firmado declarado (recuento arriba o abajo)", () => {
  assert.equal(signedDelta("AJUSTE", 4), 4); // recuento hacia arriba
  assert.equal(signedDelta("AJUSTE", -4), -4); // merma / recuento hacia abajo
});

test("signedDelta: redondea a 3 decimales (venta por peso)", () => {
  assert.equal(signedDelta("VENTA", 0.756), -0.756);
  assert.equal(signedDelta("COMPRA", 2.5), 2.5);
});

// ── recordMovement contra un doble de transacción ───────────────────────────
//
// El doble hace respetar lo que hace respetar Postgres: el compare-and-set de la salida
// (`stock >= |delta|`) y la suma en binario de un Float (el `increment`). Se ejecuta el
// `recordMovement` REAL.

type Fila = Record<string, unknown>;

function mundo(stockInicial: number, costoVigente: number | null = 6543) {
  const m = { stock: stockInicial, movimientos: [] as Fila[], consultasDeCosto: 0, escrituras: [] as unknown[] };
  const tx = {
    product: {
      updateMany: async (args: { where: { stock?: { gte: number } }; data: { stock: number | { increment: number } } }) => {
        const min = args.where.stock?.gte;
        if (min !== undefined && m.stock < min) return { count: 0 };
        m.escrituras.push(args.data.stock);
        m.stock = typeof args.data.stock === "number" ? args.data.stock : m.stock + args.data.stock.increment;
        return { count: 1 };
      },
      findUnique: async () => ({ stock: m.stock }),
      findFirst: async () => ({ stock: m.stock }),
    },
    stockMovement: {
      create: async (args: { data: Fila }) => {
        m.movimientos.push(args.data);
        return args.data;
      },
    },
    $queryRaw: async () => {
      m.consultasDeCosto++;
      return [{ id: "vacio", catalogo: null, ultimo: costoVigente }];
    },
  };
  return { m, tx: tx as unknown as LedgerTx };
}

const base = { tenantId: "t-qa", productId: "vacio", createdBy: "user:u1", label: "Vacío" };

test("pendiente de la ola 1: 1,1 − 1,24 queda guardado en −0,14 (no en −0,1399999999999999)", async () => {
  const { m, tx } = mundo(1.1);
  const saldo = await recordMovement(tx, { ...base, type: "VENTA", qty: 1.24, allowNegative: true });
  assert.equal(1.1 - 1.24, -0.1399999999999999, "el error de coma flotante existe");
  assert.equal(m.stock, -0.14, "el stock guardado quedó redondeado a gramos");
  assert.equal(saldo, -0.14);
  assert.equal(m.movimientos[0].balanceAfter, -0.14);
  assert.deepEqual(m.escrituras, [{ increment: -1.24 }, -0.14], "la corrección es una segunda escritura en la misma transacción");
});

test("sin error de coma flotante no hay segunda escritura", async () => {
  const { m, tx } = mundo(10);
  await recordMovement(tx, { ...base, type: "COMPRA", qty: 2.5, unitCost: 6000 });
  assert.deepEqual(m.escrituras, [{ increment: 2.5 }]);
  assert.equal(stockARedondear(12.5), null);
  assert.equal(stockARedondear(-0.1399999999999999), -0.14);
  assert.equal(stockARedondear(-0), 0, "un −0 se guarda como 0");
});

test("el compare-and-set de la salida sigue: sin stock no sale, pero medio gramo de error de coma no la frena", async () => {
  const faltante = mundo(0.2);
  await assert.rejects(recordMovement(faltante.tx, { ...base, type: "VENTA", qty: 0.3 }), /Sin stock suficiente/);
  assert.equal(faltante.m.movimientos.length, 0);

  // 0,1 + 0,2 guardado de antes: 0,30000000000000004 > 0,3 pasa siempre; 0,29999999999999993 también.
  const casi = mundo(0.29999999999999993);
  await recordMovement(casi.tx, { ...base, type: "VENTA", qty: 0.3 });
  assert.equal(casi.m.stock, 0);
  assert.ok(TOLERANCIA_STOCK <= 0.0005, "la tolerancia no pasa del medio gramo");
});

test("toda SALIDA sin costo guarda el costo vigente; las entradas y las que ya traen costo, no se tocan", async () => {
  const venta = mundo(10, 6543);
  await recordMovement(venta.tx, { ...base, type: "VENTA", qty: 1 });
  assert.equal(venta.m.movimientos[0].unitCost, 6543);
  assert.equal(venta.m.consultasDeCosto, 1);

  const merma = mundo(10, 6543);
  await recordMovement(merma.tx, { ...base, type: "AJUSTE", qty: -2, reason: "Vencimiento" });
  assert.equal(merma.m.movimientos[0].unitCost, 6543);

  const conCosto = mundo(10);
  await recordMovement(conCosto.tx, { ...base, type: "DEVOLUCION_PROVEEDOR", qty: 1, unitCost: 6000 });
  assert.equal(conCosto.m.movimientos[0].unitCost, 6000);
  assert.equal(conCosto.m.consultasDeCosto, 0);

  const entrada = mundo(10);
  await recordMovement(entrada.tx, { ...base, type: "REPOSICION", qty: 1 });
  assert.equal(entrada.m.movimientos[0].unitCost, null, "una reposición sin costo no inventa uno");
  assert.equal(entrada.m.consultasDeCosto, 0);

  assert.equal(llevaCostoEstampado(-1, undefined), true);
  assert.equal(llevaCostoEstampado(-1, null), true);
  assert.equal(llevaCostoEstampado(1, undefined), false);
  assert.equal(llevaCostoEstampado(-1, 0), false, "un costo explícito (aunque sea 0) lo decidió el llamador");
});

test("un recuento que coincide deja su fila en 0 con el saldo, sin tocar el stock", async () => {
  const { m, tx } = mundo(4.35);
  const saldo = await registrarConteoSinDiferencia(tx, { ...base, reason: "Recuento", unitCost: 6543 });
  assert.equal(saldo, 4.35);
  assert.equal(m.escrituras.length, 0, "no escribe Product.stock");
  assert.deepEqual(
    { qty: m.movimientos[0].qty, type: m.movimientos[0].type, balanceAfter: m.movimientos[0].balanceAfter, reason: m.movimientos[0].reason },
    { qty: 0, type: "AJUSTE", balanceAfter: 4.35, reason: "Recuento" },
  );
});
