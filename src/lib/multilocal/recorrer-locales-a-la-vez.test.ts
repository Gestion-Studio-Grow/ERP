// La red se lee de a `LOCALES_A_LA_VEZ` locales (multilocal-core.ts, `recorrerLocales`). Se
// ejecuta contra la versión de antes (de a uno, copiada acá) con redes de 0 a 9 locales, demoras
// al azar y locales que fallan: el resultado tiene que ser EL MISMO (mismos leídos y fallidos, en
// el orden de la red), nunca más de tres transacciones abiertas a la vez, y cada transacción con
// el id de SU local.

import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES_A_LA_VEZ, localesDeLaRed, recorrerLocales, type FilaRed, type LocalDeLaRed, type PuertosRed } from "./multilocal-core";

/** La versión de antes: de a uno, en el orden de la red. */
async function recorrerDeAUno<T>(p: PuertosRed, casaId: string, recolectar: (tx: unknown, l: LocalDeLaRed) => Promise<T>) {
  const locales = await localesDeLaRed(p, casaId);
  const leidos: { local: LocalDeLaRed; dato: T }[] = [];
  const fallidos: { local: LocalDeLaRed; error: unknown }[] = [];
  for (const local of locales) {
    try {
      leidos.push({ local, dato: await p.enLocal(local.localTenantId, (tx) => recolectar(tx, local)) });
    } catch (error) {
      fallidos.push({ local, error });
    }
  }
  return { leidos, fallidos };
}

function red(n: number, semilla: number) {
  let x = semilla;
  const azar = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const filas: FilaRed[] = Array.from({ length: n }, (_, i) => ({ id: String(i), localTenantId: `t-${i}`, alias: `Local ${i}`, estado: "activa" }));
  const demora = new Map(filas.map((f) => [f.localTenantId, Math.floor(azar() * 8)]));
  const falla = new Set(filas.filter(() => azar() < 0.25).map((f) => f.localTenantId));
  const errores = new Map([...falla].map((id) => [id, new Error(`se cayó ${id}`)]));
  let abiertas = 0;
  let maximo = 0;
  const abiertasPorId: string[] = [];
  const p: PuertosRed = {
    filasDeLaRed: async () => filas,
    metaDeLocales: async (ids) => new Map(ids.map((id) => [id, { nombre: id, slug: id, subdomain: id, arcaCuit: null, arcaPuntoVenta: null }])),
    enLocal: async (id, fn) => {
      abiertas++;
      maximo = Math.max(maximo, abiertas);
      abiertasPorId.push(id);
      try {
        await new Promise((r) => setTimeout(r, demora.get(id)));
        if (errores.has(id)) throw errores.get(id);
        return await fn({ __local: id } as never);
      } finally {
        abiertas--;
      }
    },
  };
  return { p, maximo: () => maximo, abiertasPorId };
}

const recolectar = async (tx: unknown, local: LocalDeLaRed) => {
  // Cada transacción tiene que ser la de SU local.
  assert.equal((tx as { __local: string }).__local, local.localTenantId);
  return `${local.alias} leído`;
};

test("mismo resultado que de a uno, en el orden de la red, y nunca más de tres a la vez", async () => {
  assert.equal(LOCALES_A_LA_VEZ, 3);
  for (let n = 0; n <= 9; n++) {
    for (const semilla of [1, 7, 42]) {
      const antes = red(n, semilla);
      const ahora = red(n, semilla);
      const a = await recorrerDeAUno(antes.p, "t-casa", recolectar);
      const b = await recorrerLocales(ahora.p, "t-casa", recolectar);
      assert.deepEqual(b.leidos, a.leidos, `n=${n} semilla=${semilla}`);
      assert.deepEqual(b.fallidos, a.fallidos, `n=${n} semilla=${semilla}`);
      assert.ok(ahora.maximo() <= LOCALES_A_LA_VEZ, `n=${n}: ${ahora.maximo()} a la vez`);
      if (n >= 3) assert.equal(ahora.maximo(), 3, `n=${n}: con tres o más locales se usan las tres`);
      // Una transacción por local, cada una una sola vez.
      assert.deepEqual([...ahora.abiertasPorId].sort(), [...antes.abiertasPorId].sort());
      assert.equal(new Set(ahora.abiertasPorId).size, n);
    }
  }
});

test("de a uno si se pide de a uno (y un número raro cae en uno)", async () => {
  for (const aLaVez of [1, 0, -2, Number.NaN]) {
    const r = red(5, 3);
    await recorrerLocales(r.p, "t-casa", recolectar, aLaVez);
    assert.equal(r.maximo(), 1, `aLaVez=${aLaVez}`);
  }
});
