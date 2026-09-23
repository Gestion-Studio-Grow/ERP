// La escritura del despiece (`registrarDespieceEnTx`), EJECUTADA contra un doble de transacción
// que anota cada sentencia y cada movimiento. Es un camino de plata: fija la valuación del
// stock (la pieza sale a su costo, cada corte entra con el suyo). Lo que se prueba:
//   · la pieza SALE del stock con −kilos, a costo de la pieza / kilos;
//   · cada corte con producto ENTRA con el costo del plan (valor relativo de venta), y la suma
//     de lo que entra vale lo que salió (con el centavo de redondeo declarado en despiece.ts);
//   · si el stock de la pieza no alcanza, no se escribe NADA (ni el despiece ni un movimiento);
//   · un producto de otro negocio no entra: todas las lecturas y escrituras llevan el negocio.

import { test } from "node:test";
import assert from "node:assert/strict";
import { registrarDespieceEnTx, DespieceInvalido, type DespieceNuevo } from "./despiece-registro";
import { MOTIVO_DESPIECE, planDelDespiece, esDeKilo, precioPorKiloDe } from "./despiece";

type Prod = {
  id: string;
  tenantId: string;
  name: string;
  unit: string;
  saleUnit: "WEIGHT" | "UNIT";
  price: number | null;
  pricePerKg: number | null;
  stock: number;
};

const T = "t-magra";
const PRODUCTOS: Prod[] = [
  { id: "media", tenantId: T, name: "Media res", unit: "kg", saleUnit: "WEIGHT", price: null, pricePerKg: 5000, stock: 150 },
  { id: "lomo", tenantId: T, name: "Lomo", unit: "kg", saleUnit: "WEIGHT", price: null, pricePerKg: 30000, stock: 2 },
  { id: "osobuco", tenantId: T, name: "Osobuco", unit: "kg", saleUnit: "WEIGHT", price: null, pricePerKg: 8000, stock: 0 },
  { id: "ajeno", tenantId: "t-otro", name: "Lomo", unit: "kg", saleUnit: "WEIGHT", price: null, pricePerKg: 30000, stock: 9 },
];

/**
 * Un doble de transacción. `stockAlEscribir` simula una venta entre la lectura y la escritura:
 * la lectura ve el stock de PRODUCTOS y la baja condicional ve éste.
 */
function deposito(opts: { costoPiezaPorKg?: number | null; stockAlEscribir?: Record<string, number> } = {}) {
  const leido = new Map(PRODUCTOS.map((p) => [p.id, p.stock]));
  const stock = new Map(leido);
  for (const [id, s] of Object.entries(opts.stockAlEscribir ?? {})) stock.set(id, s);
  const sentencias: { sql: string; values: unknown[] }[] = [];
  const movimientos: Record<string, unknown>[] = [];
  const negocios: unknown[] = [];
  const sql = (strings: TemplateStringsArray) => strings.join("?");
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      sentencias.push({ sql: sql(strings), values });
      return 1;
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const s = sql(strings);
      if (s.includes('MAX("code")')) {
        negocios.push(values[0]);
        return [{ code: 7 }];
      }
      if (s.includes('"catalogo"')) {
        negocios.push(values[0]);
        const ids = values.at(-1) as string[];
        return ids.map((id) => ({ id, catalogo: null, ultimo: id === "media" ? (opts.costoPiezaPorKg ?? null) : null }));
      }
      throw new Error(`consulta no esperada: ${s}`);
    },
    product: {
      findMany: async ({ where }: { where: { id: { in: string[] }; tenantId: string } }) => {
        negocios.push(where.tenantId);
        return PRODUCTOS.filter((p) => where.id.in.includes(p.id) && p.tenantId === where.tenantId).map((p) => ({
          ...p,
          stock: leido.get(p.id)!,
        }));
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; tenantId: string; stock?: { gte: number } };
        data: { stock: number | { increment: number } };
      }) => {
        negocios.push(where.tenantId);
        const p = PRODUCTOS.find((x) => x.id === where.id && x.tenantId === where.tenantId);
        if (!p) return { count: 0 };
        const actual = stock.get(p.id)!;
        if (where.stock && actual < where.stock.gte) return { count: 0 };
        stock.set(p.id, typeof data.stock === "number" ? data.stock : actual + data.stock.increment);
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { id: string } }) => ({ stock: stock.get(where.id)! }),
    },
    stockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        negocios.push(data.tenantId);
        movimientos.push(data);
        return data;
      },
    },
  };
  return { tx: tx as never, stock, sentencias, movimientos, negocios };
}

const DESPIECE: DespieceNuevo = {
  piezaId: "media",
  kilos: 100,
  costoTipeado: null,
  note: null,
  lineas: [
    { name: "Lomo", weightKg: 3, productId: "lomo" },
    { name: "Osobuco", weightKg: 5, productId: "osobuco" },
    { name: "Hueso", weightKg: 20, productId: null },
  ],
  actor: "user:duena",
};

test("la pieza sale a su costo y cada corte entra con el suyo (valor relativo), en una transacción", async () => {
  const d = deposito({ costoPiezaPorKg: 4500 });
  const r = await registrarDespieceEnTx(d.tx, T, DESPIECE);
  assert.equal(r.numero, 7);

  const [salida, ...entradas] = d.movimientos;
  const motivo = `${MOTIVO_DESPIECE}7 — Media res`;
  assert.deepEqual(
    { type: salida.type, productId: salida.productId, qty: salida.qty, unitCost: salida.unitCost, reason: salida.reason },
    { type: "AJUSTE", productId: "media", qty: -100, unitCost: 4500, reason: motivo },
    "la media res SALE del stock, a lo que costó",
  );
  assert.equal(d.stock.get("media"), 50);

  // Los mismos costos que la vista previa: se recalculan adentro con la misma regla.
  const plan = planDelDespiece({
    pieza: { productId: "media", nombre: "Media res", kilo: true, stock: 150 },
    kilos: 100,
    costoTipeado: null,
    costoVigentePiezaPorKg: 4500,
    cortes: DESPIECE.lineas.map((l) => {
      const p = PRODUCTOS.find((x) => x.id === l.productId);
      return { name: l.name, weightKg: l.weightKg, producto: p ? { id: p.id, nombre: p.name, kilo: esDeKilo(p), precioPorKg: precioPorKiloDe(p) } : null };
    }),
  });
  assert.ok(plan.ok);
  assert.deepEqual(
    entradas.map((m) => [m.type, m.productId, m.qty, m.unitCost, m.reason]),
    plan.entradas.map((e) => ["REPOSICION", e.productId, e.qty, e.unitCost, motivo]),
  );
  const [lomo, osobuco] = entradas.map((m) => m.unitCost as number);
  assert.ok(lomo > osobuco, "el lomo carga más costo por kilo que el osobuco (no parejo por kilo)");
  assert.equal(d.stock.get("lomo"), 5);
  assert.equal(d.stock.get("osobuco"), 5);

  // Lo que entra vale lo que salió: el reparto es por valor de venta, así que el hueso (sin
  // precio) no carga costo y el lomo y el osobuco se reparten los $450.000 de la pieza. Al stock
  // entra el costo por kilo redondeado: kilos × costo por kilo puede correrse un centavo.
  const repartido = plan.analisis.outputs.reduce((s, o) => s + (o.costShare ?? 0), 0);
  assert.equal(Math.round(repartido * 100), 45000000, `el reparto suma ${repartido}`);
  const alStock = entradas.reduce((s, m) => s + (m.qty as number) * (m.unitCost as number), 0);
  assert.ok(Math.abs(alStock - 450000) <= 0.02, `al stock entran ${alStock}`);

  // El despiece queda registrado con el negocio escrito a mano (SQL crudo) y todo lo demás
  // también lleva el negocio.
  const run = d.sentencias.find((s) => s.sql.includes('INSERT INTO "ProcessingRun"'))!;
  assert.equal(run.values[1], T);
  assert.equal(d.sentencias.filter((s) => s.sql.includes('INSERT INTO "ProcessingOutput"')).length, 3);
  for (const n of d.negocios) assert.equal(n, T);
});

test("si el stock de la pieza no alcanza, no se escribe nada", async () => {
  const d = deposito({ costoPiezaPorKg: 4500 });
  await assert.rejects(registrarDespieceEnTx(d.tx, T, { ...DESPIECE, kilos: 200, lineas: DESPIECE.lineas }), (e: unknown) => {
    assert.ok(e instanceof DespieceInvalido);
    assert.match(e.message, /Hay 150 kg de Media res/);
    return true;
  });
  assert.deepEqual(d.movimientos, []);
  assert.deepEqual(
    d.sentencias.map((s) => s.sql).filter((s) => !s.includes("pg_advisory_xact_lock")),
    [],
    "ni el despiece ni sus cortes",
  );
  assert.equal(d.stock.get("media"), 150);
});

test("una venta entre la lectura y la escritura: la baja condicional frena y no entra ningún corte", async () => {
  // La lectura vio 150 kg; al escribir quedan 60 (se vendieron 90 en el medio).
  const d = deposito({ costoPiezaPorKg: 4500, stockAlEscribir: { media: 60 } });
  await assert.rejects(registrarDespieceEnTx(d.tx, T, DESPIECE), /Sin stock suficiente de "Media res"/);
  // La transacción del llamador aborta todo; en el doble, lo que se ve es que ningún corte llegó a
  // entrar (la salida va primero) y que el stock no se tocó.
  assert.deepEqual(d.movimientos, []);
  assert.equal(d.stock.get("media"), 60);
  assert.equal(d.stock.get("lomo"), 2);
});

test("un corte con un producto de otro negocio no entra: se rechaza sin escribir", async () => {
  const d = deposito({ costoPiezaPorKg: 4500 });
  await assert.rejects(
    registrarDespieceEnTx(d.tx, T, { ...DESPIECE, lineas: [{ name: "Lomo", weightKg: 3, productId: "ajeno" }] }),
    /ya no existe/,
  );
  assert.deepEqual(d.movimientos, []);
  assert.equal(d.stock.get("ajeno"), 9);
});

test("sin costo de la pieza (ni tipeado ni vigente): se registra igual y los cortes entran sin costo", async () => {
  const d = deposito({ costoPiezaPorKg: null });
  await registrarDespieceEnTx(d.tx, T, DESPIECE);
  const [salida, ...entradas] = d.movimientos;
  // La salida sin costo se estampa con el costo vigente (ninguno): null, nunca $0.
  assert.equal(salida.unitCost, null);
  for (const e of entradas) assert.equal(e.unitCost, null);
});
