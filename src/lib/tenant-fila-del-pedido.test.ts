// PLAT-005 (perf 4): una sola lectura de la fila `Tenant` por pedido, sin compartirla entre pedidos.
//
// 1) `crearFilaDelPedido` con un memo por pedido sobre AsyncLocalStorage (como Next le da a cada pedido
//    su caché de React): aislamiento entre negocios y fail-closed.
// 2) La medición del Inicio (`tenant-fila-del-pedido.medicion.ts`) en un proceso hijo con
//    `--conditions=react-server`, para que corra el `cache()` real de React. Local, sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { crearFilaDelPedido, type FilaDelNegocio } from "./tenant";

const pedido = new AsyncLocalStorage<Map<unknown, unknown>>();
/** Memo por pedido: fuera de un pedido no memoiza (como `cache()` fuera de un render). */
function memoPorPedido<F extends () => Promise<FilaDelNegocio | null>>(fn: F): F {
  return (() => {
    const m = pedido.getStore();
    if (!m) return fn();
    if (!m.has(fn)) m.set(fn, fn());
    return m.get(fn);
  }) as F;
}

const fila = (id: string): FilaDelNegocio => ({ id, slug: `s-${id}`, blueprintId: `bp-${id}`, modules: [id], accentPreset: id });

test("una lectura por pedido aunque varios lectores pidan la fila", async () => {
  const leidos: string[] = [];
  const leer = crearFilaDelPedido(async () => "t-a", async (id) => (leidos.push(id), fila(id)), memoPorPedido);
  await pedido.run(new Map(), async () => {
    const [x, y, z] = await Promise.all([leer(), leer(), leer()]);
    assert.equal(x, y);
    assert.equal(y, z);
  });
  assert.deepEqual(leidos, ["t-a"]);
});

test("aislamiento: dos negocios en pedidos distintos del mismo proceso no comparten la fila", async () => {
  const leidos: string[] = [];
  const negocio = new AsyncLocalStorage<string>();
  const leer = crearFilaDelPedido(
    async () => negocio.getStore()!,
    async (id) => {
      leidos.push(id);
      await new Promise((r) => setTimeout(r, 5)); // se pisan en el tiempo
      return fila(id);
    },
    memoPorPedido,
  );
  const enPedido = (id: string) => negocio.run(id, () => pedido.run(new Map(), async () => [await leer(), await leer()]));
  const [a, b] = await Promise.all([enPedido("t-a"), enPedido("t-b")]);
  assert.equal(a[0]?.id, "t-a");
  assert.equal(a[1]?.id, "t-a");
  assert.equal(b[0]?.id, "t-b");
  assert.equal(b[1]?.accentPreset, "t-b");
  assert.notEqual(a[0], b[0]);
  assert.deepEqual([...leidos].sort(), ["t-a", "t-b"]);

  // Un pedido nuevo del mismo negocio vuelve a leer: nada queda entre pedidos.
  await enPedido("t-a");
  assert.equal(leidos.length, 3);
});

test("fail-closed: si el negocio no se resuelve, tira lo mismo y no lee la fila", async () => {
  let lecturas = 0;
  const err = new Error("no hay tenant para el subdominio (fail-closed, ADR-015)");
  const leer = crearFilaDelPedido(async () => { throw err; }, async (id) => (lecturas++, fila(id)), memoPorPedido);
  await pedido.run(new Map(), async () => {
    await assert.rejects(leer(), (e) => e === err);
    await assert.rejects(leer(), (e) => e === err);
  });
  assert.equal(lecturas, 0);
});

test("fila ausente: null, como el findUnique de cada lector", async () => {
  const leer = crearFilaDelPedido(async () => "t-x", async () => null, memoPorPedido);
  assert.equal(await pedido.run(new Map(), () => leer()), null);
});

test("medición local del Inicio con el cache() real de React: 3 consultas a Tenant por pedido, sin cruces", () => {
  const raiz = path.resolve(__dirname, "../..");
  const salida = execFileSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", path.join(__dirname, "tenant-fila-del-pedido.medicion.ts")],
    { cwd: raiz, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] },
  );
  const r = JSON.parse(salida.trim().split("\n").pop()!);
  // Resolución por slug (1) + la fila del pedido (1) + rubro (1, `carniceria/rubro.ts`, fuera de
  // esta tarea). Antes eran 5: producto, color del equipo y gate por módulo leían cada uno aparte.
  for (const k of ["a", "b", "a2"]) assert.equal(r[k].consultasTenant, 3, `${k}: ${r[k].consultasTenant}`);
  assert.deepEqual([r.a.id, r.a.blueprintId, r.a.acento], ["t-a", "carniceria", "rosa"]);
  assert.deepEqual([r.b.id, r.b.blueprintId, r.b.acento], ["t-b", "servicios", "verde"]);
  assert.deepEqual(r.a2, r.a);
});
