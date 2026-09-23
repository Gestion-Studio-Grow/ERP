// `ajustarEnTx` (la persistencia de mermas y recuentos) EJECUTADO contra un doble de
// transacción: el recuento contra el stock que había a la hora del conteo, la fila "sin
// diferencia", el costo guardado en cada fila, el bloqueo antes de leer y el tope de merma.
// El doble hace lo que hace Postgres con estas consultas; que el tope deshaga lo escrito lo hace
// la transacción real (`insertStockAdjustment` la abre), y eso se midió contra la base de QA.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ajustarEnTx, TopeDeMermaSuperado } from "./adjustment-insert";
import { leerLineasDeAjuste } from "./adjustment-core";
import type { LedgerTx } from "./ledger";

type Mov = { productId: string; type: string; qty: number; unitCost: number | null; createdAt: Date; reason?: string | null };

const hora = (hhmm: string) => new Date(`2026-09-23T${hhmm}:00.000-03:00`);

function mundo(productos: { id: string; name: string; stock: number; costo: number | null }[], movs: Mov[] = []) {
  const stock = new Map(productos.map((p) => [p.id, p.stock]));
  const escritos: Record<string, unknown>[] = [];
  const orden: string[] = [];
  const tx = {
    $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = partes.join("?");
      if (sql.includes("FOR UPDATE")) {
        orden.push("bloqueo");
        assert.equal(valores[0], "t-qa", "el bloqueo lleva el negocio escrito a mano");
        return [];
      }
      orden.push("costos");
      return productos.map((p) => ({ id: p.id, catalogo: null, ultimo: p.costo }));
    },
    product: {
      findMany: async () => {
        orden.push("stock");
        return productos.map((p) => ({ id: p.id, name: p.name, unit: "kg", stock: stock.get(p.id)! }));
      },
      updateMany: async (a: { where: { id: string; stock?: { gte: number } }; data: { stock: number | { increment: number } } }) => {
        const actual = stock.get(a.where.id)!;
        if (a.where.stock && actual < a.where.stock.gte) return { count: 0 };
        stock.set(a.where.id, typeof a.data.stock === "number" ? a.data.stock : actual + a.data.stock.increment);
        return { count: 1 };
      },
      findUnique: async (a: { where: { id: string } }) => ({ stock: stock.get(a.where.id)! }),
      findFirst: async (a: { where: { id: string } }) => ({ stock: stock.get(a.where.id)! }),
    },
    stockMovement: {
      findMany: async (a: { where: { createdAt: { gt: Date } } }) => {
        orden.push("movimientos");
        return movs.filter((m) => m.createdAt > a.where.createdAt.gt);
      },
      create: async (a: { data: Record<string, unknown> }) => {
        escritos.push(a.data);
        return a.data;
      },
    },
  };
  return { tx: tx as unknown as LedgerTx, stock, escritos, orden };
}

test("criterio de aceptación, con la persistencia real: cuenta 10:00, venta 10:05, guarda 10:10 → −0,5 y el stock queda en 8,5", async () => {
  // 10 kg en el sistema a las 10:00; se cuentan 9,5. A las 10:05 se vende 1 kg (queda 9).
  const w = mundo([{ id: "vacio", name: "Vacío", stock: 9, costo: 6543 }], [
    { productId: "vacio", type: "VENTA", qty: -1, unitCost: 6543, createdAt: hora("10:05") },
  ]);
  // El teléfono (atrasado 3 minutos) tipeó a las 09:57 de SU reloj y guardó a las 10:07 del suyo.
  const items = leerLineasDeAjuste("COUNT", ["vacio"], ["9,5"], {
    horas: [String(hora("09:57").getTime())],
    enviadoA: String(hora("10:07").getTime()),
    ahora: hora("10:10"),
  });
  const r = await ajustarEnTx(w.tx, "t-qa", { motivo: "RECUENTO", note: null, createdBy: "user:enc", items });
  assert.deepEqual(r.lineas, [{ productId: "vacio", nombre: "Vacío", unidad: "kg", teorico: 10, delta: -0.5, costo: 6543 }]);
  assert.equal(w.stock.get("vacio"), 8.5);
  assert.equal(w.escritos.length, 1);
  assert.equal(w.escritos[0].qty, -0.5);
  assert.equal(w.escritos[0].unitCost, 6543, "el faltante queda valuado con el costo del día");
  assert.equal(w.escritos[0].reason, "Recuento");
  assert.deepEqual(w.orden.slice(0, 2), ["bloqueo", "stock"], "se bloquean las filas ANTES de leer el stock");
});

test("recuento que coincide: fila en 0 con su saldo, sin tocar el stock", async () => {
  const w = mundo([{ id: "lomo", name: "Lomo", stock: 4, costo: 9000 }]);
  const r = await ajustarEnTx(w.tx, "t-qa", { motivo: "RECUENTO", note: "heladera 2", createdBy: "user:enc", items: [{ productId: "lomo", value: 4 }] });
  assert.equal(r.applied, 0);
  assert.equal(w.stock.get("lomo"), 4);
  assert.equal(w.escritos.length, 1);
  assert.equal(w.escritos[0].qty, 0);
  assert.equal(w.escritos[0].balanceAfter, 4);
  assert.equal(w.escritos[0].reason, "Recuento — heladera 2");
});

test("merma: resta, guarda el costo; una merma no bloquea filas ni lee movimientos", async () => {
  const w = mundo([{ id: "vacio", name: "Vacío", stock: 20, costo: 6543 }]);
  const r = await ajustarEnTx(w.tx, "t-qa", {
    motivo: "VENCIMIENTO",
    note: null,
    createdBy: "user:enc",
    items: [{ productId: "vacio", value: 2 }],
    topePesos: 50_000,
  });
  assert.equal(r.pesosDeBaja, 13086);
  assert.equal(w.stock.get("vacio"), 18);
  assert.equal(w.escritos[0].unitCost, 6543);
  assert.equal(w.orden.includes("bloqueo"), false);
  assert.equal(w.orden.includes("movimientos"), false);
});

test("tope: la carga que lo pasa se rechaza con un mensaje SIN montos; la dueña no tiene tope", async () => {
  const carga = { motivo: "VENCIMIENTO" as const, note: null, createdBy: "user:enc", items: [{ productId: "vacio", value: 10 }] };
  const w = mundo([{ id: "vacio", name: "Vacío", stock: 100, costo: 6543 }]);
  await assert.rejects(ajustarEnTx(w.tx, "t-qa", { ...carga, topePesos: 50_000 }), (err: unknown) => {
    assert.ok(err instanceof TopeDeMermaSuperado);
    assert.equal(err.pesos, 65430);
    assert.equal(err.tope, 50_000);
    assert.doesNotMatch(err.message, /\$|\d/, "el mensaje propio no dice cuánto vale la carga");
    return true;
  });
  const duenia = mundo([{ id: "vacio", name: "Vacío", stock: 100, costo: 6543 }]);
  const r = await ajustarEnTx(duenia.tx, "t-qa", { ...carga, topePesos: null });
  assert.equal(r.pesosDeBaja, 65430);
  assert.equal(duenia.stock.get("vacio"), 90);
});

test("un producto que no es del negocio o está borrado frena todo el ajuste", async () => {
  const w = mundo([{ id: "vacio", name: "Vacío", stock: 5, costo: 6543 }]);
  await assert.rejects(
    ajustarEnTx(w.tx, "t-qa", {
      motivo: "MERMA",
      note: null,
      createdBy: "user:enc",
      items: [
        { productId: "vacio", value: 1 },
        { productId: "de-otro-negocio", value: 1 },
      ],
    }),
    /ya no existe o fue dado de baja/,
  );
  assert.equal(w.escritos.length, 0);
});
