// Los números del Inicio de las apps de finanzas de gestión, EJECUTADOS contra una base falsa
// que anota cada consulta: que hagan UNA (regla 8 de la arquitectura), que filtren por el
// negocio, que el `where` sea el de la pantalla y qué texto sale de filas dadas. Viven acá (y
// no en src/apps/kpis) porque son del frente de finanzas: sus lecturas están en src/lib/reports.

import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { LOADERS_FINANZAS, comisiones, flujoDeFondos, libroIva, margen, reportes, retenciones } from "@/apps/kpis/finanzas.server";
import type { ContextoLoader, DbKpi } from "@/apps/kpis/nucleo.server";
import { appPorId } from "@/apps/registro";
import { partesDelKpi } from "@/apps/visibles";
import { whereVentasDelPeriodo } from "./ventas-mostrador-lectura";
import { whereExtractoDelMes } from "./retenciones";
import { whereLibroCompleto } from "./flujo-lectura";
import { whereProductosDeStock } from "@/lib/inventory/valuation";

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
              if (r instanceof Error) throw r;
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
    monto: false,
    ...extra,
  };
}

const dia = (d: string) => businessWallTimeToUtc(d, "12:00");
const dec = (n: number) => ({ toNumber: () => n });

test("UNA consulta cada una y todas filtran por el negocio; fiado, cuentas a pagar y resultado no tienen número", async () => {
  const mias = { comisiones, flujoDeFondos, libroIva, margen, reportes, retenciones };
  for (const [nombre, loader] of Object.entries(mias)) {
    for (const esMostrador of [true, false]) {
      for (const monto of [true, false]) {
        const { db, llamadas } = dbFalsa();
        await loader(ctx(db, { esMostrador, monto }));
        assert.ok(llamadas.length <= 1, `${nombre} hizo ${llamadas.length} consultas: ${llamadas.map((l) => `${l.modelo}.${l.op}`).join(", ")}`);
        for (const l of llamadas) assert.equal(l.args.where?.tenantId, "t-qa", `${nombre}: ${l.modelo}.${l.op} sin el negocio`);
      }
    }
  }
  // Su número cruza tablas sin relación (la cuenta y sus pagos; ventas, costo y gastos): no sale
  // de una operación. Van al Inicio sin número hasta que plataforma decida (finanzas.server.ts).
  for (const id of ["cuentas-a-cobrar", "cuentas-a-pagar", "resultado-del-mes"]) {
    assert.equal(LOADERS_FINANZAS[id], undefined, `${id} no debería tener loader`);
  }
  assert.equal(appPorId("resultado-del-mes").kpi, undefined, "sin loader, el catálogo no le declara número");
});

test("Margen: los que tienen el precio de lista por debajo del costo, en alerta; con la consulta de la pantalla", async () => {
  const productos = [
    // $12.100 el kilo contra $11.000 de costo: como se cobra NO pierde (a un inscripto, sin IVA, sí: eso lo muestra la pantalla).
    { id: "a", name: "Vacío", saleUnit: "WEIGHT", price: null, pricePerKg: 12100, stockMovements: [{ unitCost: 11000, createdAt: dia("2026-09-01") }], purchaseItems: [] },
    // $4.000 contra $5.000: pierde en cualquier condición.
    { id: "b", name: "Chorizo", saleUnit: "WEIGHT", price: null, pricePerKg: 4000, stockMovements: [{ unitCost: 5000, createdAt: dia("2026-09-01") }], purchaseItems: [] },
    // Con precio y sin costo.
    { id: "c", name: "Morcilla", saleUnit: "WEIGHT", price: null, pricePerKg: 3000, stockMovements: [], purchaseItems: [] },
  ];
  const { db, llamadas } = dbFalsa({ "product.findMany": productos });
  assert.deepEqual(await margen(ctx(db)), {
    valor: "1",
    detalle: "corte con el precio por debajo del costo",
    alerta: { valor: "1", texto: "corte con el precio por debajo del costo" },
  });
  assert.equal(llamadas.length, 1, "sin la lectura de la condición fiscal");
  assert.deepEqual(llamadas[0].args.where, whereProductosDeStock("t-qa"));

  const sano = dbFalsa({ "product.findMany": [productos[0]] });
  assert.deepEqual(await margen(ctx(sano.db)), { valor: "0", detalle: "cortes con el precio por debajo del costo" });
  const sinCosto = dbFalsa({ "product.findMany": [productos[2]] });
  assert.deepEqual(await margen(ctx(sinCosto.db)), { sinDato: "Faltan costos: 1 corte con precio y sin costo" });
  assert.deepEqual(await margen(ctx(dbFalsa().db)), { sinDato: "Todavía no hay cortes con precio y costo" });
});

test("Flujo: la plata de hoy según el libro, con la consulta de la pantalla; en negativo, en alerta", async () => {
  const { db, llamadas } = dbFalsa({
    "cashMovement.groupBy": [
      { type: "VENTA", _sum: { amount: 100000 } },
      { type: "EGRESO", _sum: { amount: 20000 } },
      { type: "APERTURA", _sum: { amount: 5000 } },
    ],
  });
  assert.deepEqual(await flujoDeFondos(ctx(db)), { valor: "$80.000", detalle: "de plata hoy, según el libro de caja" });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].args.where, whereLibroCompleto("t-qa"));

  const rojo = dbFalsa({
    "cashMovement.groupBy": [
      { type: "VENTA", _sum: { amount: 1000 } },
      { type: "RETIRO", _sum: { amount: 3392 } },
    ],
  });
  assert.deepEqual(await flujoDeFondos(ctx(rojo.db)), {
    valor: "-$2.392",
    detalle: "de plata hoy, según el libro de caja",
    alerta: { valor: "-$2.392", texto: "el libro de caja está en negativo" },
  });
});

test("Retenciones: retenciones y percepciones del mes por tipo, el impuesto al cheque aparte; sin extracto, '—' con el porqué", async () => {
  const { db, llamadas } = dbFalsa({
    "movimientoImportado.findMany": [
      { id: "1", fecha: "20260902", descripcion: "RET. SIRCREB", monto: dec(-9000) },
      { id: "2", fecha: "20260903", descripcion: "IMP. DEB. LEY 25413", monto: dec(-1200) },
      { id: "3", fecha: "20260904", descripcion: "Acreditación", monto: dec(50000) },
    ],
  });
  assert.deepEqual(await retenciones(ctx(db)), {
    valor: "$9.000",
    detalle: "retenciones y percepciones de septiembre (Ingresos Brutos $9.000) · impuesto al cheque $1.200 aparte",
  });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].args.where, whereExtractoDelMes("t-qa", "2026-09"));
  assert.deepEqual(await retenciones(ctx(dbFalsa().db)), { sinDato: "Todavía no subiste el extracto del banco de septiembre" });
});

test("Comisiones: lo que falta liquidar y a cuántos profesionales", async () => {
  const turno = (id: string, prof: string, monto: number) => ({
    id,
    serviceId: "s",
    startsAt: dia("2026-09-10"),
    priceAtBooking: monto,
    professionalId: prof,
    professional: { name: prof, commissionPercent: 40, serviceCommissions: [] },
    payment: { status: "APPROVED", amount: monto },
    collections: [],
    service: { price: monto },
  });
  const { db } = dbFalsa({ "appointment.findMany": [turno("1", "Ana", 10000), turno("2", "Beto", 5000)] });
  assert.deepEqual(await comisiones(ctx(db, { esMostrador: false })), { valor: "$6.000", detalle: "a liquidar a 2 profesionales" });
  assert.deepEqual(await comisiones(ctx(dbFalsa().db, { esMostrador: false })), { valor: "$0", detalle: "nada para liquidar" });
});

test("Reportes en un mostrador: las ventas cobradas del período, con el where de la pantalla", async () => {
  const { db, llamadas } = dbFalsa({ "order.aggregate": { _count: { _all: 42 }, _sum: { total: 1230000 } } });
  assert.deepEqual(await reportes(ctx(db)), { valor: "$1.230.000", detalle: "vendido en el mostrador en 42 ventas, últimos 90 días" });
  assert.deepEqual(llamadas[0].args.where, whereVentasDelPeriodo("t-qa", "2026-09-23", 90).where);
});

test("Libro IVA: la dueña ve el IVA del mes (el catálogo declara la parte de plata); a un monotributista, sin número", async () => {
  const app = appPorId("libro-iva");
  assert.deepEqual(partesDelKpi(app, "OWNER"), { numero: true, monto: true }, "sin `monto` declarado, el botón no mostraba nunca el IVA");
  assert.equal(partesDelKpi(app, "RECEPTION")?.numero, false);
  const ri = dbFalsa({ "invoice.groupBy": [{ tipoComprobante: 6, _sum: { iva: 21000 } }] });
  assert.deepEqual(await libroIva(ctx(ri.db, { monto: true })), { valor: "$21.000", detalle: "IVA de septiembre a pagar, sólo de comprobantes" });
  const mono = dbFalsa({ "invoice.groupBy": [{ tipoComprobante: 11, _sum: { iva: 0 } }] });
  assert.equal(await libroIva(ctx(mono.db, { monto: true })), null);
});
