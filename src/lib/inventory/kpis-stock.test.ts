// Los números de Stock y compras del Inicio (src/apps/kpis/logistica.server.ts), EJECUTADOS
// contra una base falsa que anota cada consulta: cuántas hace cada uno, que todas filtren por
// el negocio, que el `where` sea el de la pantalla y qué número sale de filas dadas.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOADERS_LOGISTICA,
  devolucionesAProveedor,
  inicioDelMes,
  inventario,
  mermas,
  movimientos,
  proveedores,
  recibirMercaderia,
  recuento,
  resumirMermasDelMes,
} from "@/apps/kpis/logistica.server";
import type { ContextoLoader, DbKpi } from "@/apps/kpis/nucleo.server";
import { buildReason } from "@/lib/stock/adjustment-core";
import { whereAjustesDelPeriodo } from "@/lib/stock/merma-core";
import { whereCompras } from "@/lib/stock/purchase-core";
import { whereDevoluciones } from "@/lib/stock/supplier-return";
import { whereProveedoresActivos } from "@/lib/suppliers/supplier";
import { whereEnNegativo, whereProductosDeStock } from "./valuation";
import { desdeRecuentoReciente, whereSinContarDesde } from "@/lib/inventario/recuento";
import { whereVentasCobradas } from "@/lib/order-anulacion";

type Llamada = { modelo: string; op: string; args: { where?: Record<string, unknown> } & Record<string, unknown> };

function dbFalsa(respuestas: Record<string, unknown> = {}) {
  const llamadas: Llamada[] = [];
  const vacio = (op: string): unknown => {
    if (op === "count") return 0;
    if (op === "aggregate") return { _count: { _all: 0 }, _sum: {} };
    if (op === "groupBy" || op === "findMany") return [];
    return null;
  };
  const db = new Proxy(
    {},
    {
      get: (_, modelo) =>
        new Proxy(
          {},
          {
            get: (__, op) => async (args: Llamada["args"]) => {
              llamadas.push({ modelo: String(modelo), op: String(op), args });
              const r = respuestas[`${String(modelo)}.${String(op)}`];
              if (typeof r === "function") return (r as (a: unknown) => unknown)(args);
              return r === undefined ? vacio(String(op)) : r;
            },
          },
        ),
    },
  );
  return { db: db as unknown as DbKpi, llamadas };
}

function ctx(db: DbKpi, extra: Partial<ContextoLoader> = {}): ContextoLoader {
  return {
    db,
    tenantId: "t-qa",
    hoy: "2026-09-23",
    ahora: new Date("2026-09-23T15:00:00.000Z"),
    esMostrador: true,
    sustantivo: { uno: "corte", varios: "cortes" },
    monto: true,
    ...extra,
  };
}

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);

/**
 * Mermas es la excepción declarada a la regla 8 (ver loaders.test.ts): los ajustes, quiénes son
 * recepción y, sólo con plata, la venta del mes. Sin reports:read, dos.
 */
function consultasEsperadas(id: string, monto: boolean): number {
  if (id === "mermas") return monto ? 3 : 2;
  return 1;
}

test("cada número de stock hace UNA consulta con el negocio (regla 8), salvo Mermas con su excepción", async () => {
  for (const [id, loader] of Object.entries(LOADERS_LOGISTICA)) {
    for (const monto of [true, false]) {
      for (const esMostrador of [true, false]) {
        const { db, llamadas } = dbFalsa();
        await loader(ctx(db, { monto, esMostrador }));
        assert.ok(llamadas.length <= consultasEsperadas(id, monto), `${id}: ${llamadas.length} consultas`);
        for (const l of llamadas) assert.equal(l.args.where?.tenantId, "t-qa", `${id}: ${l.modelo}.${l.op} sin el negocio`);
      }
    }
  }
});

test("Stock: bajo el mínimo (sólo los que controlan stock), sin costo, y el valorizado sólo con reports:read", async () => {
  const sin = { stockMovements: [], purchaseItems: [] };
  const productos = [
    // bajo el mínimo, con costo de un despiece (REPOSICION): $6.543 × 2 = $13.086
    { id: "a", name: "Vacío", unit: "kg", stock: 2, lowStockAt: 5, trackStock: true, stockMovements: [{ unitCost: 6543, createdAt: d("2026-09-10") }], purchaseItems: [] },
    { id: "b", name: "Entraña", unit: "kg", stock: 5, lowStockAt: 5, trackStock: true, ...sin }, // en el mínimo, sin costo
    { id: "c", name: "Bolsas", unit: "u", stock: 1, lowStockAt: 5, trackStock: false, ...sin }, // no controla stock: no cuenta
    { id: "d", name: "Lomo", unit: "kg", stock: 40, lowStockAt: 5, trackStock: true, stockMovements: [], purchaseItems: [{ unitCost: 9000, purchase: { createdAt: d("2026-06-01") } }] },
  ];
  const { db, llamadas } = dbFalsa({ "product.findMany": productos });
  assert.deepEqual(await inventario(ctx(db)), {
    valor: "2",
    detalle: "cortes bajo el mínimo · 2 sin costo",
    monto: "$373.086 valorizado",
  });
  assert.deepEqual(llamadas[0].args.where, whereProductosDeStock("t-qa"), "el where de la pantalla de Stock");

  const recepcion = dbFalsa({ "product.findMany": productos });
  const dato = await inventario(ctx(recepcion.db, { monto: false }));
  assert.ok(dato && "valor" in dato && dato.monto === undefined, "sin reports:read no viaja la plata");
});

test("Movimientos: los productos en negativo, en alerta para 'Para atender hoy'", async () => {
  const { db, llamadas } = dbFalsa({ "product.count": 2 });
  assert.deepEqual(await movimientos(ctx(db)), {
    valor: "2",
    detalle: "cortes en negativo",
    alerta: { valor: "2", texto: "cortes en negativo — recontar" },
  });
  assert.deepEqual(llamadas[0].args.where, whereEnNegativo("t-qa"), "el where de la cola de la pantalla");
  assert.deepEqual(await movimientos(ctx(dbFalsa().db)), { valor: "0", detalle: "cortes en negativo" });
});

test("Recuento: sin contar hace más de 30 días, con el where de la planilla", async () => {
  const { db, llamadas } = dbFalsa({ "product.count": 12 });
  assert.deepEqual(await recuento(ctx(db)), { valor: "12", detalle: "cortes sin contar hace más de 30 días" });
  assert.deepEqual(llamadas[0].args.where, whereSinContarDesde("t-qa", desdeRecuentoReciente(new Date("2026-09-23T15:00:00.000Z"))));
});

test("Mermas: 'vencido' de 2 kg cargada por recepción → '$13.086 a costo (2,6 % de la venta) · 1 por recepción'", async () => {
  const movs = [
    { productId: "vacio", qty: -2, reason: buildReason("VENCIMIENTO", "lote del lunes"), createdBy: "user:recep", unitCost: 6543 },
    { productId: "lomo", qty: -1, reason: buildReason("RECUENTO", null), createdBy: "user:duena", unitCost: 9000 }, // faltante: no es merma
    { productId: "lomo", qty: 0, reason: buildReason("RECUENTO", null), createdBy: "user:duena", unitCost: 9000 }, // sin diferencia
  ];
  const { db, llamadas } = dbFalsa({
    "stockMovement.findMany": movs,
    "user.findMany": [{ id: "recep" }],
    "order.aggregate": { _sum: { total: 500000 } },
  });
  assert.deepEqual(await mermas(ctx(db)), {
    valor: "1",
    detalle: "cargada este mes · 1 por recepción",
    monto: "$13.086 a costo (2,6 % de la venta)",
  });
  assert.equal(llamadas.length, 3, "los ajustes, quiénes son recepción y la venta del mes");
  const de = (modelo: string) => llamadas.find((l) => l.modelo === modelo)?.args.where;
  assert.deepEqual(de("stockMovement"), whereAjustesDelPeriodo("t-qa", inicioDelMes("2026-09-23")), "el where del tablero de merma");
  assert.deepEqual(de("user"), { tenantId: "t-qa", role: "RECEPTION" }, "recepción es el ROL, no 'cualquiera que no sea la dueña'");
  assert.deepEqual(de("order"), whereVentasCobradas("t-qa", inicioDelMes("2026-09-23")), "la venta del mes con el where de Ventas del día");

  // Recepción no ve plata: ni el monto ni el porcentaje, y la venta del mes ni se lee.
  const sinPlata = dbFalsa({ "stockMovement.findMany": movs, "user.findMany": [{ id: "recep" }] });
  assert.deepEqual(await mermas(ctx(sinPlata.db, { monto: false })), { valor: "1", detalle: "cargada este mes · 1 por recepción" });
  assert.ok(!sinPlata.llamadas.some((l) => l.modelo === "order"), "sin reports:read no se lee la venta");

  // Una merma de la dueña (o de una profesional) no es "por recepción".
  const deLaDuena = dbFalsa({
    "stockMovement.findMany": [{ ...movs[0], createdBy: "user:duena" }],
    "user.findMany": [{ id: "recep" }],
  });
  assert.deepEqual(await mermas(ctx(deLaDuena.db, { monto: false })), { valor: "1", detalle: "cargada este mes · 0 por recepción" });

  // Sin venta cobrada en el mes no hay porcentaje (dividir por 0 no es un dato).
  const sinVenta = dbFalsa({ "stockMovement.findMany": movs, "user.findMany": [] });
  assert.deepEqual(await mermas(ctx(sinVenta.db)), { valor: "1", detalle: "cargada este mes · 0 por recepción", monto: "$13.086 a costo" });

  // Una merma sin costo guardado no vale $0: se cuenta aparte.
  assert.deepEqual(resumirMermasDelMes([{ ...movs[0], unitCost: null }]), { cargadas: 1, pesos: 0, sinCosto: 1, porRecepcion: 0 });
  const viejo = dbFalsa({ "stockMovement.findMany": [{ ...movs[0], unitCost: null }] });
  assert.deepEqual(await mermas(ctx(viejo.db)), {
    valor: "1",
    detalle: "cargada este mes · 0 por recepción",
    monto: "$0 a costo · 1 sin costo",
  });

  // Sin mermas en el mes, el número es 0 y no dice "0 por recepción".
  assert.deepEqual(await mermas(ctx(dbFalsa().db, { monto: false })), { valor: "0", detalle: "cargadas este mes" });
});

test("Recibir mercadería: recepciones del mes, las que no tienen proveedor de la lista, y lo comprado", async () => {
  const { db, llamadas } = dbFalsa({
    "stockPurchase.groupBy": [
      { supplierId: "p1", _count: { _all: 3 }, _sum: { totalCost: 300000 } },
      { supplierId: null, _count: { _all: 1 }, _sum: { totalCost: 50000 } },
    ],
  });
  assert.deepEqual(await recibirMercaderia(ctx(db)), {
    valor: "4",
    detalle: "recepciones este mes · 1 sin proveedor de la lista",
    monto: "$350.000 comprado",
  });
  assert.deepEqual(llamadas[0].args.where, whereCompras("t-qa", inicioDelMes("2026-09-23")));
  assert.deepEqual(whereCompras("t-qa", inicioDelMes("2026-09-23")), { tenantId: "t-qa", kind: "COMPRA", createdAt: { gte: inicioDelMes("2026-09-23") } });
});

test("Proveedores: activos y sin CUIT en UN conteo, con el where de la lista", async () => {
  const p = dbFalsa({ "supplier.aggregate": { _count: { _all: 2, taxId: 1 } } });
  assert.deepEqual(await proveedores(ctx(p.db)), { valor: "2", detalle: "proveedores · 1 sin CUIT" });
  assert.equal(p.llamadas[0].op, "aggregate");
  assert.deepEqual(p.llamadas[0].args.where, whereProveedoresActivos("t-qa"));
  const todos = dbFalsa({ "supplier.aggregate": { _count: { _all: 1, taxId: 1 } } });
  assert.deepEqual(await proveedores(ctx(todos.db)), { valor: "1", detalle: "proveedor" });
});

test("Devoluciones: lo devuelto en el mes a costo de la compra, con el where del historial", async () => {
  const dv = dbFalsa({ "stockMovement.findMany": [{ qty: -2.5, unitCost: 6543 }, { qty: -1, unitCost: null }] });
  assert.deepEqual(await devolucionesAProveedor(ctx(dv.db)), { valor: "$16.358", detalle: "devuelto este mes" });
  assert.deepEqual(dv.llamadas[0].args.where, whereDevoluciones("t-qa", inicioDelMes("2026-09-23")));
  assert.deepEqual(whereDevoluciones("t-qa", inicioDelMes("2026-09-23")), {
    tenantId: "t-qa",
    type: "DEVOLUCION_PROVEEDOR",
    createdAt: { gte: inicioDelMes("2026-09-23") },
  });
});
