// ============================================================================
// LOS NÚMEROS DE MIS LOCALES EN EL INICIO — ejecutados con una red dada.
// ============================================================================
//
// La pasada por la red se inyecta (un lector falso) y la base del request también (cuenta
// cuántas consultas hace y con qué negocio). Se prueba qué dice cada botón, que la plata sólo
// sale con reports:read, que sin locales se dice '—' con el motivo sin recorrer nada, y que el
// loader REAL se puede cargar y correr sin base cuando no hay locales (así los tests de la
// carpeta de números lo pueden ejecutar el día que se registre).

import { test } from "node:test";
import assert from "node:assert/strict";
import { crearLoadersLocales, LOADERS_LOCALES, SIN_LOCALES, textoCambio, type LectorRed } from "@/apps/kpis/locales.server";
import type { ContextoLoader, DatoKpi } from "@/apps/kpis/nucleo.server";
import type { ResultadoRed, ResultadoStock } from "./multilocal-actions";
import type { ResumenRed } from "./multilocal-core";

function ctx(locales: number, opts: { monto?: boolean } = {}) {
  const consultas: { modelo: string; where: Record<string, unknown> }[] = [];
  const db = {
    carteraCliente: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        consultas.push({ modelo: "carteraCliente.count", where });
        return locales;
      },
    },
  };
  const c: ContextoLoader = {
    db: db as never,
    tenantId: "t-casa",
    hoy: "2026-09-23",
    ahora: new Date("2026-09-23T15:00:00Z"),
    esMostrador: true,
    sustantivo: { uno: "corte", varios: "cortes" },
    monto: opts.monto ?? true,
  };
  return { c, consultas };
}

const RESUMEN: ResumenRed = {
  locales: 3,
  cobradoHoy: 125000,
  cajasSinCerrar: 2,
  pendienteMasViejo: "2026-09-21",
  stockBajo: { productos: 12, locales: 3 },
  stockNegativo: { productos: 1, locales: 1 },
  semana: { actual: 840000, anterior: 700000, destacado: { alias: "Canning", cambio: 0.12 } },
  sinPuntoDeVenta: 1,
};

function lector(red: ResultadoRed, stock?: ResultadoStock) {
  const llamadas: string[] = [];
  const l: LectorRed = {
    red: async () => {
      llamadas.push("red");
      return red;
    },
    stock: async () => {
      llamadas.push("stock");
      return stock ?? { ok: false, error: "sin stock" };
    },
  };
  return { l, llamadas };
}

const OK: ResultadoRed = { ok: true, casa: "MAGRA", hoy: "2026-09-23", red: [], resumen: RESUMEN };

const texto = (d: DatoKpi | null) => (d && "valor" in d ? `${d.valor} ${d.detalle ?? ""}`.trim() : d ? `— ${d.sinDato}` : "null");

test("sin locales vinculados: '—' con el motivo, UNA consulta con el negocio, y la red ni se recorre", async () => {
  const { l, llamadas } = lector(OK);
  const loaders = crearLoadersLocales(l);
  for (const id of ["mis-locales", "ventas-por-local", "cajas-de-los-locales", "stock-por-local"]) {
    const { c, consultas } = ctx(0);
    assert.deepEqual(await loaders[id](c), { sinDato: SIN_LOCALES }, id);
    assert.equal(consultas.length, 1);
    assert.deepEqual(consultas[0].where, { tenantId: "t-casa", estado: "activa" });
  }
  assert.deepEqual(llamadas, []);
});

test("Mis locales: locales y cajas sin cerrar para todos; lo cobrado hoy sólo con reports:read", async () => {
  const loaders = crearLoadersLocales(lector(OK).l);
  const conPlata = await loaders["mis-locales"](ctx(3).c);
  assert.equal(texto(conPlata), "3 locales · 2 con la caja sin cerrar");
  assert.ok(conPlata && "monto" in conPlata && /125\.000/.test(conPlata.monto ?? ""));
  const sinPlata = await loaders["mis-locales"](ctx(3, { monto: false }).c);
  assert.ok(sinPlata && !("monto" in sinPlata && sinPlata.monto));
  // No va a "Para atender hoy": el aviso lo da Cajas de los locales.
  assert.ok(conPlata && !("alerta" in conPlata && conPlata.alerta));
});

test("Ventas por local: la semana y el local que más cambió", async () => {
  const d = await crearLoadersLocales(lector(OK).l)["ventas-por-local"](ctx(3).c);
  assert.match(texto(d), /^\$ ?840\.000 esta semana · Canning \+12 % frente a la anterior$/);
  assert.equal(textoCambio(-0.083), "−8 %");
  const sinComparar = await crearLoadersLocales(lector({ ...OK, resumen: { ...RESUMEN, semana: { actual: 5, anterior: 0, destacado: null } } }).l)[
    "ventas-por-local"
  ](ctx(3).c);
  assert.match(texto(sinComparar), /esta semana$/);
});

test("Cajas de los locales: cuántas sin cerrar y desde cuándo, en 'Para atender hoy'; al día sin alerta", async () => {
  const d = await crearLoadersLocales(lector(OK).l)["cajas-de-los-locales"](ctx(3).c);
  assert.ok(d && "alerta" in d && d.alerta);
  assert.equal(d && "alerta" in d ? d.alerta?.texto : "", "locales con la caja sin cerrar desde el 21/09/2026");
  const alDia = await crearLoadersLocales(lector({ ...OK, resumen: { ...RESUMEN, cajasSinCerrar: 0, pendienteMasViejo: null } }).l)[
    "cajas-de-los-locales"
  ](ctx(3).c);
  assert.equal(texto(alDia), "Al día todas las cajas cerradas hasta ayer");
  assert.ok(alDia && !("alerta" in alDia && alDia.alerta));
});

test("Stock por local: con la palabra del rubro, y sin plata", async () => {
  const stock: ResultadoStock = {
    ok: true,
    casa: "MAGRA",
    columnas: [],
    filas: [],
    resumen: { stockBajo: { productos: 12, locales: 3 }, stockNegativo: { productos: 1, locales: 1 } },
    locales: 3,
  };
  const d = await crearLoadersLocales(lector(OK, stock).l)["stock-por-local"](ctx(3).c);
  assert.equal(texto(d), "12 cortes bajo el mínimo en 3 locales · 1 en negativo");
  assert.ok(d && !("monto" in d && d.monto));
});

test("si la red no se pudo leer, el botón dice el porqué (nunca un 0)", async () => {
  const d = await crearLoadersLocales(lector({ ok: false, error: "Falta aplicar una migración" }).l)["mis-locales"](ctx(3).c);
  assert.deepEqual(d, { sinDato: "Falta aplicar una migración" });
});

test("los loaders REALES corren sin base cuando no hay locales: una consulta, con el negocio", async () => {
  // Es lo que ejecuta el test de la carpeta de números (loaders.test.ts) con su base falsa, que
  // contesta 0 a todo `count`: ninguno puede importar las actions ni abrir una transacción.
  assert.deepEqual(Object.keys(LOADERS_LOCALES).sort(), ["cajas-de-los-locales", "mis-locales", "stock-por-local", "ventas-por-local"]);
  for (const [id, loader] of Object.entries(LOADERS_LOCALES)) {
    for (const monto of [true, false]) {
      const { c, consultas } = ctx(0, { monto });
      assert.deepEqual(await loader(c), { sinDato: SIN_LOCALES }, id);
      assert.deepEqual(consultas.map((q) => q.where.tenantId), ["t-casa"], id);
    }
  }
});
