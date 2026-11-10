// Reseteos pendientes declarados en código (GSG-SEG-014): el runner puro sobre un puerto en memoria.
import { test } from "node:test";
import assert from "node:assert/strict";
import { correrResetsPendientes, RESETEOS_PENDIENTES, type PendientesPort, type ResetPendiente } from "./claves-pendientes";

const P: ResetPendiente = { clave: "k-1", slug: "beauty-spa", motivo: "prueba" };

/** Puerto que simula la base: una auditoría con las claves ya hechas y un mail que acierta o falla. */
function puerto(opts: { negocios?: Record<string, string>; mailFalla?: () => boolean } = {}) {
  const hechas = new Set<string>();
  const resets: string[] = [];
  const p: PendientesPort = {
    buscarNegocio: async (slug) => (opts.negocios ?? { "beauty-spa": "t-ch" })[slug] ?? null,
    resetearSiFalta: async (tenantId, x) => {
      if (hechas.has(x.clave)) return { estado: "ya-estaba" };
      if (opts.mailFalla?.()) return { estado: "fallo", error: "No salió el mail" }; // no queda nada escrito
      hechas.add(x.clave);
      resets.push(tenantId);
      return { estado: "hecho", enviadaA: "c***@x.test" };
    },
  };
  return { p, resets };
}

test("la entrada de Carolina está declarada, con clave única y el slug de CH Estética", () => {
  const ch = RESETEOS_PENDIENTES.find((x) => x.slug === "beauty-spa");
  assert.ok(ch);
  assert.equal(ch.clave, "2026-11-10-beauty-spa-owner");
  assert.equal(new Set(RESETEOS_PENDIENTES.map((x) => x.clave)).size, RESETEOS_PENDIENTES.length);
});

test("IDEMPOTENTE: la primera corrida resetea; las siguientes no vuelven a resetear", async () => {
  const { p, resets } = puerto();
  assert.deepEqual(await correrResetsPendientes(p, [P]), [{ clave: "k-1", estado: "hecho", enviadaA: "c***@x.test" }]);
  assert.deepEqual(await correrResetsPendientes(p, [P]), [{ clave: "k-1", estado: "ya-estaba" }]);
  assert.deepEqual(await correrResetsPendientes(p, [P]), [{ clave: "k-1", estado: "ya-estaba" }]);
  assert.deepEqual(resets, ["t-ch"]);
});

test("MAIL CAÍDO: queda en fallo y la corrida del día siguiente lo completa", async () => {
  let caido = true;
  const { p, resets } = puerto({ mailFalla: () => caido });
  assert.equal((await correrResetsPendientes(p, [P]))[0].estado, "fallo");
  assert.deepEqual(resets, []);
  caido = false;
  assert.equal((await correrResetsPendientes(p, [P]))[0].estado, "hecho");
  assert.equal((await correrResetsPendientes(p, [P]))[0].estado, "ya-estaba");
  assert.deepEqual(resets, ["t-ch"]);
});

test("un negocio que no existe en esta base no se inventa; los demás siguen", async () => {
  const { p } = puerto();
  const r = await correrResetsPendientes(p, [{ ...P, clave: "k-0", slug: "no-existe" }, P]);
  assert.deepEqual(r.map((x) => x.estado), ["sin-negocio", "hecho"]);
});

test("un error inesperado no frena a los demás y no filtra el detalle", async () => {
  const { p } = puerto();
  const roto: PendientesPort = {
    ...p,
    resetearSiFalta: async (t, x) => {
      if (x.clave === "k-roto") throw new Error("detalle interno con datos");
      return p.resetearSiFalta(t, x);
    },
  };
  const r = await correrResetsPendientes(roto, [{ ...P, clave: "k-roto" }, P]);
  assert.deepEqual(r[0], { clave: "k-roto", estado: "fallo", error: "Error" });
  assert.equal(r[1].estado, "hecho");
});

test("una clave repetida en la lista no se corre dos veces", async () => {
  const { p, resets } = puerto();
  const r = await correrResetsPendientes(p, [P, { ...P, slug: "otro" }]);
  assert.equal(r[1].estado, "fallo");
  assert.deepEqual(resets, ["t-ch"]);
});
