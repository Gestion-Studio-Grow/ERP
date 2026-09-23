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

/** Consultas por loader. Todas 1, salvo la frontera del cierre (ver finanzas.server.ts). */
const CONSULTAS_ESPERADAS: Record<string, number> = { "cierre-del-dia": 2 };

test("cada loader hace UNA consulta (la frontera del cierre, dos) y todas filtran por el negocio", async () => {
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

test("'Ventas de hoy' cuenta sólo lo cobrado (paid=true), sin anuladas, desde las 00:00 del negocio", async () => {
  const desde = businessWallTimeToUtc("2026-09-23", "00:00");
  const esperado = {
    tenantId: "t-qa",
    paid: true,
    status: { not: "CANCELLED" },
    createdAt: { gte: desde },
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

test("Stock: bajo el mínimo y en negativo con las reglas de la pantalla, con la palabra del rubro", async () => {
  const productos = [
    { id: "a", name: "Vacío", unit: "kg", stock: 2, lowStockAt: 5 }, // bajo el mínimo
    { id: "b", name: "Entraña", unit: "kg", stock: 5, lowStockAt: 5 }, // en el mínimo cuenta
    { id: "c", name: "Lomo", unit: "kg", stock: -1.3, lowStockAt: 2 }, // negativo (y bajo el mínimo)
    { id: "d", name: "Osobuco", unit: "kg", stock: 40, lowStockAt: 5 },
  ];
  const { db, llamadas } = dbFalsa({ "product.findMany": productos });
  assert.deepEqual(await inventario(ctx(db)), {
    valor: "3",
    detalle: "cortes bajo el mínimo",
    alerta: { valor: "1", texto: "corte en negativo" },
  });
  assert.deepEqual(llamadas[0].args.where, { tenantId: "t-qa", deletedAt: null, active: true });

  const velas = dbFalsa({ "product.findMany": [{ id: "x", name: "Vela", unit: "u", stock: 10, lowStockAt: 3 }] });
  assert.deepEqual(await inventario(ctx(velas.db, { sustantivo: { uno: "producto", varios: "productos" } })), {
    valor: "0",
    detalle: "productos bajo el mínimo",
  });
});

test("Reportes: el período y el where de la pantalla; en un mostrador, '—' con el porqué", async () => {
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

  const mostrador = dbFalsa();
  assert.deepEqual(await reportes(ctx(mostrador.db)), { sinDato: "Las ventas del mostrador se ven en el libro de caja" });
  assert.equal(mostrador.llamadas.length, 0);
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
  "agenda",
  "clientes",
  "lista-de-espera",
  "resenas",
  "recordatorios",
  "catalogo",
  "libro-de-caja",
  "cuentas-a-pagar",
  "cuentas-a-cobrar",
  "libro-iva",
  "recibir-mercaderia",
  "mermas",
  "lotes-y-vencimientos",
  "despiece",
  "devoluciones-a-proveedor",
].sort();

/** Loaders listos cuya app se registra más adelante (Vender llega en la ola 2). */
const ESPERAN_SU_APP = ["vender"];

test("cobertura: qué KPI del registro tienen loader, y qué loader espera su app", () => {
  const declarados = new Set(REGISTRO_APPS.flatMap((a) => (a.kpi ? [a.kpi.id] : [])));
  const conLoader = new Set(Object.keys(LOADERS_KPI));
  const faltan = [...declarados].filter((id) => !conLoader.has(id)).sort();
  assert.deepEqual(faltan, SIN_LOADER_TODAVIA, "si escribiste un loader, sacalo de SIN_LOADER_TODAVIA");
  const huerfanos = [...conLoader].filter((id) => !declarados.has(id)).sort();
  assert.deepEqual(huerfanos, ESPERAN_SU_APP, "un loader sin app en el registro nunca se muestra");
});
