// "¿La casa tiene locales?" se pregunta UNA vez por pedido y la comparten los seis botones de la
// red (locales.server.ts). Se ejecuta la decisión con una memoria por pedido inyectada (lo que
// hace `react.cache` durante el render) y se compara contra la pregunta suelta de siempre:
// mismas respuestas en los seis botones, una sola consulta en vez de seis, y dos negocios
// nunca comparten respuesta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { crearLoadersLocales, SIN_LOCALES, type LectorRed, type PreguntaLocales } from "./locales.server";
import type { ContextoLoader } from "./nucleo.server";
import type { ResultadoRed } from "@/lib/multilocal/multilocal-actions";

const IDS = ["mis-locales", "ventas-por-local", "cajas-de-los-locales", "stock-por-local", "catalogo-de-la-marca", "traslados"];

const RED: ResultadoRed = {
  ok: true,
  casa: "MAGRA",
  hoy: "2026-09-24",
  red: [],
  sinLeer: [],
  resumen: {
    locales: 2,
    cobradoHoy: 1000,
    cajasSinCerrar: 1,
    pendienteMasViejo: "2026-09-22",
    stockBajo: { productos: 3, locales: 1 },
    stockNegativo: { productos: 0, locales: 0 },
    semana: { actual: 5000, anterior: 4000, destacado: { alias: "Canning", cambio: 0.25 } },
    sinPuntoDeVenta: 0,
  },
};
const lector: LectorRed = {
  red: async () => RED,
  stock: async () => ({ ok: false, error: "sin stock en esta prueba" }),
  catalogo: async () => ({ ok: false, error: "sin catálogo en esta prueba" }),
  traslados: async () => ({ ok: false, error: "sin traslados en esta prueba" }),
};

/** Una base falsa que cuenta: por negocio, cuántos locales activos tiene. */
function base(localesPorNegocio: Record<string, number>) {
  const consultas: string[] = [];
  const db = {
    carteraCliente: {
      count: async ({ where }: { where: { tenantId: string; estado: string } }) => {
        consultas.push(where.tenantId);
        assert.equal(where.estado, "activa");
        return localesPorNegocio[where.tenantId] ?? 0;
      },
    },
  };
  return { db: db as never, consultas };
}

function ctx(db: never, tenantId: string): ContextoLoader {
  return { db, tenantId, hoy: "2026-09-24", ahora: new Date("2026-09-24T15:00:00Z"), esMostrador: true, sustantivo: { uno: "corte", varios: "cortes" }, monto: true };
}

/** Lo que hace `react.cache` en un render: misma clave (db, negocio) → misma promesa. */
function memoriaDelPedido(): PreguntaLocales {
  const memo = new Map<string, Promise<boolean>>();
  const clavesDb = new WeakMap<object, number>();
  let bases = 0;
  return (c) => {
    if (!clavesDb.has(c.db as object)) clavesDb.set(c.db as object, ++bases);
    const k = `${clavesDb.get(c.db as object)}|${c.tenantId}`;
    if (!memo.has(k)) memo.set(k, c.db.carteraCliente.count({ where: { tenantId: c.tenantId, estado: "activa" } }).then((n: number) => n > 0));
    return memo.get(k)!;
  };
}

/** La pregunta suelta, como estaba antes: una consulta por botón. */
const suelta: PreguntaLocales = async (c) => (await c.db.carteraCliente.count({ where: { tenantId: c.tenantId, estado: "activa" } })) > 0;

test("los seis botones dicen lo mismo con la pregunta compartida que con la suelta, y consultan una vez", async () => {
  for (const locales of [0, 2]) {
    const antes = base({ casa: locales });
    const despues = base({ casa: locales });
    const conSuelta = crearLoadersLocales(lector, suelta);
    const conMemoria = crearLoadersLocales(lector, memoriaDelPedido());
    const a = await Promise.all(IDS.map((id) => conSuelta[id](ctx(antes.db, "casa"))));
    const b = await Promise.all(IDS.map((id) => conMemoria[id](ctx(despues.db, "casa"))));
    assert.deepEqual(b, a, `con ${locales} locales`);
    assert.equal(antes.consultas.length, 6);
    assert.equal(despues.consultas.length, 1);
    if (locales === 0) for (const d of b) assert.deepEqual(d, { sinDato: SIN_LOCALES });
  }
});

test("dos negocios en el mismo pedido no comparten la respuesta", async () => {
  const { db, consultas } = base({ casa: 2, otra: 0 });
  const loaders = crearLoadersLocales(lector, memoriaDelPedido());
  const deLaCasa = await loaders["mis-locales"](ctx(db, "casa"));
  const deLaOtra = await loaders["mis-locales"](ctx(db, "otra"));
  assert.ok(deLaCasa && "valor" in deLaCasa);
  assert.deepEqual(deLaOtra, { sinDato: SIN_LOCALES });
  assert.deepEqual(consultas.sort(), ["casa", "otra"]);
});

test("el loader real (fuera de un render, sin memoria de pedido) sigue preguntando con el negocio en el where", async () => {
  const { db, consultas } = base({ casa: 0 });
  const loaders = crearLoadersLocales(lector);
  for (const id of IDS) assert.deepEqual(await loaders[id](ctx(db, "casa")), { sinDato: SIN_LOCALES });
  assert.ok(consultas.length >= 1 && consultas.every((t) => t === "casa"));
});
