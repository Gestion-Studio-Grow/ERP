// Los loaders de los números del Inicio, EJECUTADOS contra una base falsa que anota cada
// consulta: cuántas hace cada uno, que todas filtren por el negocio del request, que el
// `where` sea el de la pantalla, y qué número sale de filas dadas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRO_APPS } from "@/apps/registro";
import { wherePedidosAbiertos } from "@/lib/order-anulacion";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { bordesDelPeriodo } from "@/lib/report-ingresos";
import { DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
import { filtrosFacturacionMes } from "@/lib/bancos-glue";
import { whereVentasDelPeriodo } from "@/lib/reports/ventas-mostrador-lectura";
import { LOADERS_KPI } from "./loaders.server";
import { pedidos, vender, whereVentasDeHoy } from "./mostrador.server";
import { cajaDelDia, cierreDelDia, facturacion, reportes, resumirCierre } from "./finanzas.server";
import { inventario } from "./logistica.server";
import { campanias } from "./comercial.server";
import type { ContextoLoader, DbKpi } from "./nucleo.server";

type Llamada = { modelo: string; op: string; args: { where?: Record<string, unknown> } & Record<string, unknown> };

/**
 * Una base falsa: `db.<modelo>.<operación>(args)` anota la llamada y contesta lo que diga
 * `respuestas["modelo.operación"]` (un valor, una función de los args o un Error), o un
 * vacío razonable. Si un loader usara el `prisma` global en vez de `db`, no pasaría por acá
 * y el test que cuenta consultas lo vería.
 */
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
    monto: true,
    ...extra,
  };
}

/**
 * Consultas por loader (el máximo). Todas 1 (regla 8 de la arquitectura), salvo estas
 * excepciones, aceptadas por plataforma, cada una con su porqué en el loader:
 *   · cierre-del-dia, 2: la frontera del cierre es el corte inicial Y el último cierre, las dos
 *     lecturas de la pantalla (frontera-cierre.ts); ver finanzas.server.ts.
 *   · facturacion, 2: el total y los rechazados salen de un groupBy por estado, y "anuladas con
 *     factura" es un filtro por relación que un groupBy no expresa; ver finanzas.server.ts.
 *   · mermas, 3: los ajustes del mes, quiénes son recepción ("N por recepción") y, sólo con
 *     plata, la venta cobrada del mes ("% de la venta"), en paralelo; ver logistica.server.ts.
 *   · etiquetas-de-precio, 2: los cambios salen de la auditoría y "sigue en el catálogo con
 *     precio" del producto, sin relación entre las dos tablas; la segunda sólo con algo
 *     pendiente. Con la base vacía hace 1: el camino de 2 lo recorre su test, abajo.
 *   · para-contactar-hoy, 2: la bandeja misma = fichas con su actividad + constancias de
 *     contacto y permiso, en paralelo; ver comercial.server.ts.
 * Los cuatro de Mis locales hacen UNA con el `db` del request (¿hay locales?); la red de cada
 * local la lee su action en su propia transacción, fuera de este conteo (locales.server.ts).
 */
const CONSULTAS_ESPERADAS: Record<string, number> = {
  "cierre-del-dia": 2,
  facturacion: 2,
  mermas: 3,
  "etiquetas-de-precio": 2,
  "para-contactar-hoy": 2,
};

test("cada loader hace UNA consulta (salvo las excepciones declaradas) y todas filtran por el negocio", async () => {
  const ids = Object.keys(LOADERS_KPI);
  assert.ok(ids.length >= 10, `sólo ${ids.length} loaders: ¿se perdió un dominio?`);
  for (const id of ids) {
    for (const esMostrador of [true, false]) {
      for (const monto of [true, false]) {
        const { db, llamadas } = dbFalsa();
        await LOADERS_KPI[id](ctx(db, { esMostrador, monto }));
        const maximo = CONSULTAS_ESPERADAS[id] ?? 1;
        assert.ok(
          llamadas.length <= maximo,
          `${id} (mostrador=${esMostrador}, monto=${monto}) hizo ${llamadas.length} consultas: ${llamadas.map((l) => `${l.modelo}.${l.op}`).join(", ")}`,
        );
        for (const l of llamadas) {
          assert.equal(l.args.where?.tenantId, "t-qa", `${id}: ${l.modelo}.${l.op} sin el negocio en el where`);
        }
      }
    }
  }
});

test("Etiquetas con algo pendiente: 2 consultas (la excepción declarada), las dos con el negocio", async () => {
  const { db, llamadas } = dbFalsa({
    "auditLog.groupBy": [{ entityId: "p1", action: "cambio-de-precio", _max: { createdAt: new Date("2026-09-20T10:00:00Z") } }],
    "product.findMany": [{ id: "p1", deletedAt: null, saleUnit: "UNIT", price: 4000, pricePerKg: null }],
  });
  assert.deepEqual(await LOADERS_KPI["etiquetas-de-precio"](ctx(db)), { valor: "1", detalle: "precio cambió y no se reimprimió" });
  assert.equal(llamadas.length, CONSULTAS_ESPERADAS["etiquetas-de-precio"]);
  for (const l of llamadas) assert.equal(l.args.where?.tenantId, "t-qa");
});

test("Pedidos: '3 abiertos' con el where de la bandeja, y los entregados sin cobrar en alerta", async () => {
  const { db, llamadas } = dbFalsa({
    "order.groupBy": [
      { status: "PENDING", paid: false, _count: { _all: 1 } },
      { status: "READY", paid: true, _count: { _all: 1 } },
      { status: "DELIVERED", paid: false, _count: { _all: 1 } },
    ],
  });
  const dato = await pedidos(ctx(db));
  assert.deepEqual(dato, {
    valor: "3",
    detalle: "abiertos",
    alerta: { valor: "1", texto: "entregado sin cobrar" },
  });
  assert.deepEqual(llamadas[0].args.where, wherePedidosAbiertos("t-qa"), "el mismo where que getPosData");

  const vacia = dbFalsa();
  assert.deepEqual(await pedidos(ctx(vacia.db)), { valor: "0", detalle: "abiertos" }, "sin pedidos: 0 real, sin alerta");
});

test("'Ventas de hoy' cuenta sólo lo cobrado (paid=true CON medio: sin ventas a cuenta), sin anuladas, desde las 00:00 del negocio", async () => {
  const desde = businessWallTimeToUtc("2026-09-23", "00:00");
  const esperado = {
    tenantId: "t-qa",
    paid: true,
    status: { not: "CANCELLED" },
    createdAt: { gte: desde },
    // La venta a cuenta queda `paid` sin medio: vendida, no cobrada. Antes sumaba acá.
    paymentMethod: { not: null },
  };
  assert.deepEqual(whereVentasDeHoy("t-qa", desde), esperado);

  // Recepción (sin plata): cuenta y no suma.
  const sinPlata = dbFalsa({ "order.count": 42 });
  assert.deepEqual(await vender(ctx(sinPlata.db, { monto: false })), {
    valor: "42",
    detalle: "ventas cobradas hoy",
  });
  assert.equal(sinPlata.llamadas[0].op, "count");
  assert.deepEqual(sinPlata.llamadas[0].args.where, esperado);

  // Dueña: la misma cuenta y el total, en una sola consulta.
  const conPlata = dbFalsa({ "order.aggregate": { _count: { _all: 1 }, _sum: { total: 1230000 } } });
  const dato = await vender(ctx(conPlata.db));
  assert.equal(conPlata.llamadas.length, 1);
  assert.equal(conPlata.llamadas[0].op, "aggregate");
  assert.deepEqual(conPlata.llamadas[0].args.where, esperado);
  assert.ok(dato && "valor" in dato);
  assert.equal(dato.valor, "1");
  assert.equal(dato.detalle, "venta cobrada hoy");
  assert.match(dato.monto ?? "", /1\.230\.000/);
});

test("Caja del día: abierta con su hora o cerrada; en servicios no lleva número", async () => {
  const abierta = dbFalsa({ "cashSession.findFirst": { openedAt: new Date("2026-09-23T12:10:00.000Z") } });
  assert.deepEqual(await cajaDelDia(ctx(abierta.db)), { valor: "Abierta", detalle: "desde las 09:10" });
  assert.deepEqual(abierta.llamadas[0].args.where, { tenantId: "t-qa", status: "OPEN" });

  const cerrada = dbFalsa();
  assert.deepEqual(await cajaDelDia(ctx(cerrada.db)), {
    valor: "Cerrada",
    detalle: "abrila antes de cobrar en efectivo",
  });

  const servicios = dbFalsa();
  assert.equal(await cajaDelDia(ctx(servicios.db, { esMostrador: false })), null);
  assert.equal(servicios.llamadas.length, 0);
});

test("Cierre del día: días entre el último cierre y hoy; nunca cerrado no es alerta", () => {
  assert.deepEqual(resumirCierre(null, "2026-09-23"), {
    valor: "Sin cierres",
    detalle: "todavía no se cerró ningún día",
  });
  assert.deepEqual(resumirCierre("2026-09-22", "2026-09-23"), { valor: "Al día", detalle: "último cierre 22/09/2026" });
  assert.deepEqual(resumirCierre("2026-09-23", "2026-09-23"), { valor: "Al día", detalle: "último cierre 23/09/2026" });
  assert.deepEqual(resumirCierre("2026-09-21", "2026-09-23"), {
    valor: "21/09/2026",
    detalle: "último cierre",
    alerta: { valor: "1", texto: "día sin cerrar" },
  });
  // Cruza fin de mes: del 28/08 al 02/09 quedan 29, 30, 31 y 1.
  const cruce = resumirCierre("2026-08-28", "2026-09-02");
  assert.ok("alerta" in cruce);
  assert.deepEqual(cruce.alerta, { valor: "4", texto: "días sin cerrar" });
});

test("Cierre del día: lee la frontera de la pantalla (corte inicial y último cierre) con el db del tile", async () => {
  const { db, llamadas } = dbFalsa({ "auditLog.findFirst": { entityId: "2026-01-10" } });
  const dato = await cierreDelDia(ctx(db, { hoy: "2026-01-14" }));
  assert.deepEqual(dato, {
    valor: "10/01/2026",
    detalle: "último cierre",
    alerta: { valor: "3", texto: "días sin cerrar" },
  });
  assert.deepEqual(
    llamadas.map((l) => `${l.modelo}.${l.op}`).sort(),
    ["auditLog.findFirst", "cashMovement.findFirst"],
  );
});

test("Stock: bajo el mínimo (sólo lo que controla stock) y sin costo, con las reglas y el where de la pantalla", async () => {
  // Filas como las lee la pantalla de Stock: con `trackStock` y sus ingresos con costo
  // (registro de movimientos y líneas de compra), para el costo vigente único (stock/costo.ts).
  const sinIngresos = { stockMovements: [], purchaseItems: [] };
  const productos = [
    { id: "a", name: "Vacío", unit: "kg", stock: 2, lowStockAt: 5, trackStock: true, stockMovements: [{ unitCost: 6543, createdAt: new Date("2026-09-10T12:00:00.000Z") }], purchaseItems: [] }, // bajo el mínimo, con costo
    { id: "b", name: "Entraña", unit: "kg", stock: 5, lowStockAt: 5, trackStock: true, ...sinIngresos }, // en el mínimo cuenta; sin costo
    { id: "c", name: "Lomo", unit: "kg", stock: -1.3, lowStockAt: 2, trackStock: true, ...sinIngresos }, // negativo: bajo el mínimo (la alerta es de Movimientos)
    { id: "d", name: "Osobuco", unit: "kg", stock: 40, lowStockAt: 5, trackStock: true, ...sinIngresos }, // con stock y sin costo
    { id: "e", name: "Bolsas", unit: "u", stock: 1, lowStockAt: 5, trackStock: false, ...sinIngresos }, // no controla stock: no está "bajo"
  ];
  const { db, llamadas } = dbFalsa({ "product.findMany": productos });
  assert.deepEqual(await inventario(ctx(db, { monto: false })), {
    valor: "3",
    detalle: "cortes bajo el mínimo · 3 sin costo",
  });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].args.where, { tenantId: "t-qa", deletedAt: null, active: true });

  // Con reports:read, el stock valorizado a costo vigente: 2 kg × $6.543.
  const conPlata = dbFalsa({ "product.findMany": productos });
  const dato = await inventario(ctx(conPlata.db));
  assert.ok(dato && "monto" in dato);
  assert.equal(dato.monto, "$13.086 valorizado");

  const velas = dbFalsa({ "product.findMany": [{ id: "x", name: "Vela", unit: "u", stock: 10, lowStockAt: 3, trackStock: true, ...sinIngresos }] });
  assert.deepEqual(await inventario(ctx(velas.db, { monto: false, sustantivo: { uno: "producto", varios: "productos" } })), {
    valor: "0",
    detalle: "productos bajo el mínimo · 1 sin costo",
  });
});

test("Reportes: el período y el where de la pantalla; en un mostrador, las ventas cobradas del período", async () => {
  const { db, llamadas } = dbFalsa({ "payment.aggregate": { _sum: { amount: 250000 } } });
  const dato = await reportes(ctx(db, { esMostrador: false }));
  const { desde, hasta } = bordesDelPeriodo("2026-09-23", DEFAULT_REPORT_RANGE_DAYS, businessWallTimeToUtc);
  assert.deepEqual(llamadas[0].args.where, {
    tenantId: "t-qa",
    status: "APPROVED",
    createdAt: { gte: desde, lte: hasta },
  });
  assert.ok(dato && "valor" in dato);
  assert.match(dato.valor, /250\.000/);

  const mostrador = dbFalsa({ "order.aggregate": { _count: { _all: 3 }, _sum: { total: 45000 } } });
  assert.deepEqual(await reportes(ctx(mostrador.db)), { valor: "$45.000", detalle: "vendido en el mostrador en 3 ventas, últimos 90 días" });
  assert.deepEqual(mostrador.llamadas[0].args.where, whereVentasDelPeriodo("t-qa", "2026-09-23", DEFAULT_REPORT_RANGE_DAYS).where);
});

test("Facturación: el mes de la facturación automática y del contador, con los rechazados aparte", async () => {
  const { db, llamadas } = dbFalsa({
    "invoice.groupBy": [
      { status: "AUTHORIZED", _count: { _all: 11 } },
      { status: "REJECTED", _count: { _all: 1 } },
    ],
  });
  const ahora = new Date("2026-09-23T15:00:00.000Z");
  assert.deepEqual(await facturacion(ctx(db, { ahora })), {
    valor: "12",
    detalle: "comprobantes este mes · 1 rechazado por ARCA",
  });
  assert.deepEqual(llamadas[0].args.where, { tenantId: "t-qa", ...filtrosFacturacionMes(ahora).cupo });
});

test("Campañas: si la tabla no está en la base, '—' con el motivo; cualquier otro error sube", async () => {
  const sinTabla = dbFalsa({ "leadCampania.count": Object.assign(new Error("no existe"), { code: "P2021" }) });
  assert.deepEqual(await campanias(ctx(sinTabla.db)), { sinDato: "La campaña todavía no está habilitada en este negocio" });
  const caida = dbFalsa({ "leadCampania.count": new Error("se cayó") });
  await assert.rejects(campanias(ctx(caida.db)), /se cayó/);
});

/**
 * KPI declarados en el registro que todavía no tienen loader: van al Inicio sin número.
 * Medido el 2026-09-23. Esta lista sólo puede ACHICARSE: el frente dueño de cada app escribe
 * su loader en src/apps/kpis/<dominio>.server.ts y lo saca de acá.
 */
const SIN_LOADER_TODAVIA = [
  "libro-de-caja",
  "cuentas-a-pagar",
  "cuentas-a-cobrar",
  "lotes-y-vencimientos",
  "despiece",
].sort();

/** Loaders listos cuya app se registra más adelante. Vacía desde la ola 2 (Vender ya está). */
const ESPERAN_SU_APP: string[] = [];

test("cobertura: qué KPI del registro tienen loader, y qué loader espera su app", () => {
  const declarados = new Set(REGISTRO_APPS.flatMap((a) => (a.kpi ? [a.kpi.id] : [])));
  const conLoader = new Set(Object.keys(LOADERS_KPI));
  const faltan = [...declarados].filter((id) => !conLoader.has(id)).sort();
  assert.deepEqual(faltan, SIN_LOADER_TODAVIA, "si escribiste un loader, sacalo de SIN_LOADER_TODAVIA");
  const huerfanos = [...conLoader].filter((id) => !declarados.has(id)).sort();
  assert.deepEqual(huerfanos, ESPERAN_SU_APP, "un loader sin app en el registro nunca se muestra");
});
