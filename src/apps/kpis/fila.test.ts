// La fila de números del Inicio, ejecutada: orden de llegada, el techo de espera, que el tope
// de 1,5 s mida la consulta y no el turno, y el caso medido en el laboratorio (muchos números
// contra un pool chico) reproducido con un pool falso.

import { test } from "node:test";
import assert from "node:assert/strict";
import { appPorId } from "@/apps/registro";
import {
  cargarKpiCon,
  crearFila,
  enParaleloDelPool,
  FilaVencida,
  NO_SE_PUDO,
  type DepsKpi,
  type LoaderKpi,
  type NegocioKpi,
} from "./nucleo.server";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NEGOCIO: NegocioKpi = {
  db: {} as NegocioKpi["db"],
  tenantId: "t-qa",
  hoy: "2026-09-24",
  ahora: new Date("2026-09-24T15:00:00.000Z"),
  esMostrador: true,
  sustantivo: { uno: "corte", varios: "cortes" },
};

type Linea = { nivel: "info" | "warn"; ctx: Record<string, unknown> | undefined };

function deps(loaders: Record<string, LoaderKpi>, extra: Partial<DepsKpi> = {}) {
  const log: Linea[] = [];
  const d: DepsKpi = {
    loaders,
    negocio: async () => NEGOCIO,
    log: {
      info: (_s, _m, ctx) => log.push({ nivel: "info", ctx }),
      warn: (_s, _m, ctx) => log.push({ nivel: "warn", ctx }),
    },
    reloj: () => performance.now(),
    ...extra,
  };
  return { d, log };
}

// Pool falso: cada número toma una conexión, consulta y la suelta. Es la forma de lo medido con
// la base (todas las consultas cortas, esperando conexión).
function poolFalso(conexiones: number) {
  let libres = conexiones;
  const cola: (() => void)[] = [];
  return {
    async usar<T>(fn: () => Promise<T>): Promise<T> {
      if (libres > 0) libres--;
      else await new Promise<void>((r) => cola.push(r));
      try {
        return await fn();
      } finally {
        const s = cola.shift();
        if (s) s();
        else libres++;
      }
    },
  };
}

test("la fila deja pasar de a N, en orden de llegada, y un lugar se suelta una sola vez", async () => {
  const fila = crearFila(2);
  const orden: string[] = [];
  const a = await fila.entrar();
  const b = await fila.entrar();
  const c = fila.entrar().then((s) => (orden.push("c"), s));
  const d = fila.entrar().then((s) => (orden.push("d"), s));
  await dormir(5);
  assert.deepEqual(orden, [], "con los dos lugares ocupados nadie más pasa");

  a();
  a(); // soltar dos veces no inventa un lugar
  const soltarC = await c;
  await dormir(5);
  assert.deepEqual(orden, ["c"], "pasa el primero que llegó, y sólo uno");

  b();
  await d;
  assert.deepEqual(orden, ["c", "d"]);
  soltarC();
});

test("techo de espera: el que no consigue lugar a tiempo se rinde y sale de la fila", async () => {
  const pendientes: (() => void)[] = [];
  const temporizador = { poner: (fn: () => void) => (pendientes.push(fn), pendientes.length), sacar: () => undefined };
  const fila = crearFila(1, 5000, temporizador);
  const ocupado = await fila.entrar();
  const tarde = fila.entrar();
  pendientes[0](); // vence el techo
  await assert.rejects(tarde, FilaVencida);
  // El que se rindió ya no está en la fila: el lugar que se suelta queda libre para el próximo.
  ocupado();
  const otro = await fila.entrar();
  otro();
});

test("el tope de 1,5 s mide la consulta, no el turno: esperar en la fila no es tardar", async () => {
  const pedidos = appPorId("pedidos");
  const caja = appPorId("caja-del-dia");
  const lento: LoaderKpi = async () => {
    await dormir(30);
    return { valor: "3" };
  };
  const { d, log } = deps({ pedidos: lento, "caja-del-dia": lento }, { topeMs: 45, fila: crearFila(1) });
  const [r1, r2] = await Promise.all([cargarKpiCon(pedidos, "OWNER", d), cargarKpiCon(caja, "OWNER", d)]);
  // Juntos tardan ~60 ms, más que el tope de 45: sin separar la espera, el segundo se rendía.
  assert.deepEqual(r1, { estado: "ok", valor: "3" });
  assert.deepEqual(r2, { estado: "ok", valor: "3" });
  const segundo = log.find((l) => l.ctx?.kpi === "caja-del-dia")?.ctx;
  assert.ok((segundo?.espera as number) >= 20, `esperó ${segundo?.espera} ms su turno`);
  assert.ok((segundo?.ms as number) < 45, `y consultó en ${segundo?.ms} ms`);
});

test("si el tope vence, el lugar sigue ocupado hasta que la consulta termina (la conexión sigue en uso)", async () => {
  const pedidos = appPorId("pedidos");
  const caja = appPorId("caja-del-dia");
  let terminoLaLenta = 0;
  let arrancoLaSegunda = 0;
  const { d, log } = deps(
    {
      pedidos: async () => {
        await dormir(60);
        terminoLaLenta = performance.now();
        return { valor: "1" };
      },
      "caja-del-dia": async () => {
        arrancoLaSegunda = performance.now();
        return { valor: "2" };
      },
    },
    { topeMs: 20, fila: crearFila(1) },
  );
  const [r1, r2] = await Promise.all([cargarKpiCon(pedidos, "OWNER", d), cargarKpiCon(caja, "OWNER", d)]);
  assert.deepEqual(r1, { estado: "error", motivo: NO_SE_PUDO });
  assert.equal(log.find((l) => l.ctx?.kpi === "pedidos")?.ctx?.estado, "tope");
  assert.deepEqual(r2, { estado: "ok", valor: "2" });
  assert.ok(arrancoLaSegunda >= terminoLaLenta, "la segunda consulta no se superpone con la que sigue abierta");
});

test("un número que se rinde en la fila no consulta y queda con '—', logueado como 'fila'", async () => {
  const pedidos = appPorId("pedidos");
  let llamado = 0;
  const fila = {
    entrar: () => Promise.reject(new FilaVencida(5000)),
  };
  const { d, log } = deps({ pedidos: async () => (llamado++, { valor: "3" }) }, { fila });
  assert.deepEqual(await cargarKpiCon(pedidos, "OWNER", d), { estado: "error", motivo: NO_SE_PUDO });
  assert.equal(llamado, 0);
  assert.equal(log[0].nivel, "warn");
  assert.equal(log[0].ctx?.estado, "fila");
  assert.equal(log[0].ctx?.ms, 0);
});

test("el caso del laboratorio: 30 números contra un pool de 5 → sin fila hay topes, con fila del pool ninguno", async () => {
  const apps = [appPorId("pedidos")];
  async function inicio(fila: boolean) {
    const pool = poolFalso(5);
    const loaders = { pedidos: (() => pool.usar(async () => (await dormir(20), { valor: "1" }))) as LoaderKpi };
    // 30 tiles: el mismo loader, pedido 30 veces (react.cache no corre acá).
    const { d, log } = deps(loaders, { topeMs: 80, ...(fila ? { fila: crearFila(enParaleloDelPool(undefined)) } : {}) });
    await Promise.all(Array.from({ length: 30 }, () => cargarKpiCon(apps[0], "OWNER", d)));
    return log.filter((l) => l.ctx?.estado === "tope").length;
  }
  // Sin fila: 30 × 20 ms / 5 ≈ 120 ms de cola; los últimos pasan el tope de 80.
  assert.ok((await inicio(false)) > 0, "sin fila, los últimos números esperan conexión adentro del tope");
  assert.equal(await inicio(true), 0, "con la fila del tamaño del pool, ninguno llega al tope");
});

test("dos Inicios a la vez contra el MISMO pool: con una fila por request hay topes, con la de la instancia ninguno", async () => {
  const app = appPorId("pedidos");
  async function dosInicios(filaDe: () => ReturnType<typeof crearFila>) {
    const pool = poolFalso(5); // uno por instancia, como el de Prisma
    const loaders = { pedidos: (() => pool.usar(async () => (await dormir(60), { valor: "1" }))) as LoaderKpi };
    const inicio = (fila: ReturnType<typeof crearFila>) => {
      const { d, log } = deps(loaders, { topeMs: 100, fila });
      return Promise.all(Array.from({ length: 10 }, () => cargarKpiCon(app, "OWNER", d))).then(() => log);
    };
    const logs = await Promise.all([inicio(filaDe()), inicio(filaDe())]);
    return logs.flat().filter((l) => l.ctx?.estado === "tope").length;
  }
  // Por request: cada Inicio deja pasar 5, son 10 números contra 5 conexiones y la mitad espera
  // una consulta entera (60 ms) ADENTRO del tope: 120 ms > 100. Con la fila de la instancia la
  // espera queda afuera y cada número mide sus 60 ms.
  assert.ok((await dosInicios(() => crearFila(5))) > 0, "una fila por request no alcanza con dos Inicios");
  const compartida = crearFila(5);
  assert.equal(await dosInicios(() => compartida), 0, "la fila de la instancia acompaña al pool");
});

test("la fila toma el tamaño del pool de la misma variable y con el mismo default (5)", () => {
  assert.equal(enParaleloDelPool(undefined), 5);
  assert.equal(enParaleloDelPool(""), 5);
  assert.equal(enParaleloDelPool("0"), 5);
  assert.equal(enParaleloDelPool("abc"), 5);
  assert.equal(enParaleloDelPool("8"), 8);
  assert.equal(enParaleloDelPool("1"), 1);
});
