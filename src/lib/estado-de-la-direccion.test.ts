// P0 ronda 2 (fail-open): «no sé si hay negocio» ya no es «hay negocio». Con la base caída, el sitio público manda a
// /sin-servicio (neutra, 503), nunca a la landing de CH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("estadoDeLaDireccion: negocio, sin negocio y base caída son tres estados distintos", async () => {
  const { estadoDeLaDireccion, DireccionSinNegocioError } = await import("./tenant");
  assert.equal(await estadoDeLaDireccion(async () => "t1"), "negocio");
  assert.equal(await estadoDeLaDireccion(async () => { throw new DireccionSinNegocioError("x.gsgapp.com.ar"); }), "sin-negocio");
  assert.equal(await estadoDeLaDireccion(async () => { throw new Error("ECONNREFUSED"); }), "sin-servicio");
});

test("el sitio público no trata la base caída como negocio, y la portada no lleva el copy de CH", () => {
  const layout = readFileSync("src/app/(site)/layout.tsx", "utf8");
  assert.match(layout, /estado === "sin-servicio"\) redirect\("\/sin-servicio"\)/);
  assert.ok(!/direccionConNegocio\(\)\.then\(\(ok\) => !ok, \(\) => false\)/.test(layout), "fail-open en el layout");
  const portada = readFileSync("src/app/(site)/page.tsx", "utf8");
  for (const fuga of ["La Alameda", "Haponiuk", "Carolina, Macarena", "Cabina de spa de CH"]) assert.ok(!portada.includes(fuga), fuga);
  const raiz = readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(!/\(\) => false\)/.test(raiz), "fail-open en la metadata raíz");
});
