// El núcleo del número del botón, ejecutado con las apps REALES del registro y loaders
// falsos: qué ve cada rol (la plata pide reports:read), el tope, el '—' con motivo y el log
// de milisegundos. Sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { appPorId } from "@/apps/registro";
import {
  cargarKpiCon,
  conTope,
  fallasForzadas,
  NO_SE_PUDO,
  pluralDe,
  TopeKpiVencido,
  type ContextoLoader,
  type DatoKpi,
  type DepsKpi,
  type LoaderKpi,
  type NegocioKpi,
} from "./nucleo.server";

const NEGOCIO: NegocioKpi = {
  db: {} as NegocioKpi["db"],
  tenantId: "t-qa",
  hoy: "2026-09-23",
  ahora: new Date("2026-09-23T15:00:00.000Z"),
  esMostrador: true,
  sustantivo: { uno: "corte", varios: "cortes" },
};

type LineaLog = { nivel: "info" | "warn"; ctx: Record<string, unknown> | undefined };

function deps(loaders: Record<string, LoaderKpi>, extra: Partial<DepsKpi> = {}) {
  const log: LineaLog[] = [];
  let t = 0;
  const d: DepsKpi = {
    loaders,
    negocio: async () => NEGOCIO,
    log: {
      info: (_s, _m, ctx) => log.push({ nivel: "info", ctx }),
      warn: (_s, _m, ctx) => log.push({ nivel: "warn", ctx }),
    },
    // Cada lectura del reloj avanza 7 ms: el log tiene que decir cuánto tardó.
    reloj: () => (t += 7),
    ...extra,
  };
  return { d, log };
}

/** Un loader que devuelve plata SIEMPRE y anota con qué `monto` lo llamaron. */
function loaderConPlata(recibido: boolean[]): LoaderKpi {
  return async (ctx: ContextoLoader): Promise<DatoKpi> => {
    recibido.push(ctx.monto);
    return { valor: "Abierta", detalle: "desde las 9:10", monto: "$ 50.000" };
  };
}

test("los montos no aparecen sin reports:read: recepción ve la caja abierta, no la plata", async () => {
  const caja = appPorId("caja-del-dia");
  assert.equal(caja.kpi?.monto?.capability, "reports:read", "la caja declara su plata con reports:read");

  const recibido: boolean[] = [];
  const { d } = deps({ "caja-del-dia": loaderConPlata(recibido) });

  const recepcion = await cargarKpiCon(caja, "RECEPTION", d);
  assert.deepEqual(recepcion, { estado: "ok", valor: "Abierta", detalle: "desde las 9:10" });
  assert.equal(recibido[0], false, "al loader se le dice que no lea la plata");

  const duenia = await cargarKpiCon(caja, "OWNER", d);
  assert.deepEqual(duenia, { estado: "ok", valor: "Abierta", detalle: "desde las 9:10", monto: "$ 50.000" });
  assert.equal(recibido[1], true);
});

test("un número que es todo plata (Reportes) no se calcula para quien no tiene reports:read", async () => {
  const reportes = appPorId("reportes");
  let llamado = 0;
  const { d } = deps({
    reportes: async () => {
      llamado++;
      return { valor: "$ 1.000.000" };
    },
  });
  assert.equal(await cargarKpiCon(reportes, "RECEPTION", d), null);
  assert.equal(await cargarKpiCon(reportes, "PROFESSIONAL", d), null);
  assert.equal(llamado, 0, "ni se consulta");
  assert.deepEqual(await cargarKpiCon(reportes, "OWNER", d), { estado: "ok", valor: "$ 1.000.000" });
});

test("un loader que falla deja su tile en '— No se pudo calcular ahora' y lo loguea con los ms", async () => {
  const pedidos = appPorId("pedidos");
  const { d, log } = deps({
    pedidos: async () => {
      throw new Error("se cayó la conexión");
    },
  });
  const r = await cargarKpiCon(pedidos, "OWNER", d);
  assert.deepEqual(r, { estado: "error", motivo: NO_SE_PUDO });
  assert.equal(NO_SE_PUDO, "No se pudo calcular ahora");
  assert.equal(log.length, 1);
  assert.equal(log[0].nivel, "warn");
  assert.equal(log[0].ctx?.kpi, "pedidos");
  assert.equal(log[0].ctx?.estado, "error");
  assert.equal(log[0].ctx?.error, "se cayó la conexión");
  assert.equal(typeof log[0].ctx?.ms, "number");
});

test("tope: un número que no llega a tiempo se rinde y no frena al resto", async () => {
  const pedidos = appPorId("pedidos");
  const { d, log } = deps(
    { pedidos: () => new Promise<DatoKpi>(() => {}) }, // nunca contesta
    { topeMs: 20, reloj: () => performance.now() },
  );
  const r = await cargarKpiCon(pedidos, "OWNER", d);
  assert.deepEqual(r, { estado: "error", motivo: NO_SE_PUDO });
  assert.equal(log[0].ctx?.estado, "tope");
  assert.ok((log[0].ctx?.ms as number) >= 15, `tardó ${log[0].ctx?.ms} ms`);
});

test("el tope de verdad es 1,5 s y conTope deja pasar lo que llega a tiempo", async () => {
  const { TOPE_KPI_MS } = await import("./nucleo.server");
  assert.equal(TOPE_KPI_MS, 1500);
  assert.equal(await conTope(Promise.resolve(3), 50), 3);
  await assert.rejects(conTope(new Promise(() => {}), 10), TopeKpiVencido);
});

test("si leer el negocio falla, falla ese tile y nada más (no tira)", async () => {
  const pedidos = appPorId("pedidos");
  const { d } = deps(
    { pedidos: async () => ({ valor: "3" }) },
    {
      negocio: async () => {
        throw new Error("sin tenant");
      },
    },
  );
  assert.deepEqual(await cargarKpiCon(pedidos, "OWNER", d), { estado: "error", motivo: NO_SE_PUDO });
});

test("falla forzada (QA): el tile muestra el error sin tocar el loader", async () => {
  const pedidos = appPorId("pedidos");
  let llamado = 0;
  const loaders = {
    pedidos: async () => {
      llamado++;
      return { valor: "3" };
    },
  };
  const forzada = deps(loaders, { fallaForzada: fallasForzadas("caja-del-dia, pedidos") }).d;
  assert.deepEqual(await cargarKpiCon(pedidos, "OWNER", forzada), { estado: "error", motivo: NO_SE_PUDO });
  const todas = deps(loaders, { fallaForzada: fallasForzadas("*") }).d;
  assert.deepEqual(await cargarKpiCon(pedidos, "OWNER", todas), { estado: "error", motivo: NO_SE_PUDO });
  assert.equal(llamado, 0);
  assert.equal(fallasForzadas(undefined), undefined);
  assert.equal(fallasForzadas("  "), undefined);
  const normal = deps(loaders, { fallaForzada: fallasForzadas("otra-app") }).d;
  assert.deepEqual(await cargarKpiCon(pedidos, "OWNER", normal), { estado: "ok", valor: "3" });
});

test("sin dato: '—' con el motivo, nunca un 0", async () => {
  const reportes = appPorId("reportes");
  const { d, log } = deps({ reportes: async () => ({ sinDato: "Las ventas del mostrador se ven en el libro de caja" }) });
  assert.deepEqual(await cargarKpiCon(reportes, "OWNER", d), {
    estado: "sin-dato",
    motivo: "Las ventas del mostrador se ven en el libro de caja",
  });
  assert.equal(log[0].nivel, "info");
  assert.equal(log[0].ctx?.estado, "sin-dato");
});

test("sin número: app sin KPI, KPI sin loader todavía, o loader que dice que acá no aplica", async () => {
  const { d } = deps({ "caja-del-dia": async () => null });
  // Datos del negocio no declara número.
  assert.equal(await cargarKpiCon(appPorId("datos-del-negocio"), "OWNER", d), null);
  // Clientes declara número pero todavía no tiene loader: va sin número, no con 0.
  assert.equal(await cargarKpiCon(appPorId("clientes"), "OWNER", d), null);
  // La caja de una estética no tiene cajón: el loader devuelve null.
  assert.equal(await cargarKpiCon(appPorId("caja-del-dia"), "OWNER", d), null);
});

test("la alerta pasa tal cual: es lo que sube a 'Para atender hoy'", async () => {
  const { d } = deps({
    pedidos: async () => ({ valor: "3", detalle: "abiertos", alerta: { valor: "1", texto: "entregado sin cobrar" } }),
  });
  assert.deepEqual(await cargarKpiCon(appPorId("pedidos"), "RECEPTION", d), {
    estado: "ok",
    valor: "3",
    detalle: "abiertos",
    alerta: { valor: "1", texto: "entregado sin cobrar" },
  });
});

test("pluralDe: el sustantivo del rubro en plural", () => {
  assert.equal(pluralDe("corte"), "cortes");
  assert.equal(pluralDe("producto"), "productos");
  assert.equal(pluralDe("palas"), "palas");
  assert.equal(pluralDe(""), "productos");
});
