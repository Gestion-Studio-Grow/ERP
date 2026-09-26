import { test } from "node:test";
import assert from "node:assert/strict";
import { vueltaAFiscal, escritoEnFiscal, TOPE_ESCRITO } from "./fiscal-vuelta";

const leer = (url: string) => new URL(url, "http://x").searchParams;

test("un CUIT mal escrito vuelve a la pestaña Fiscal con el error y lo que se escribió", () => {
  const url = vueltaAFiscal("t-1", { error: "El CUIT no es válido", cuit: "20-1234" });
  assert.ok(url.startsWith("/operador/tenants/t-1?"));
  const q = leer(url);
  assert.equal(q.get("pestana"), "fiscal");
  assert.equal(q.get("error"), "El CUIT no es válido");
  assert.equal(q.get("cuit"), "20-1234");
  assert.equal(q.get("pv"), null);
});

test("un punto de venta mal escrito vuelve con su valor en `pv`", () => {
  const q = leer(vueltaAFiscal("t-1", { error: "no", pv: "abc" }));
  assert.equal(q.get("pestana"), "fiscal");
  assert.equal(q.get("pv"), "abc");
  assert.equal(q.get("cuit"), null);
});

test("guardar bien también vuelve a Fiscal, sin eco de lo escrito", () => {
  const q = leer(vueltaAFiscal("t-1", { ok: "CUIT guardado" }));
  assert.equal(q.get("pestana"), "fiscal");
  assert.equal(q.get("ok"), "CUIT guardado");
  assert.equal(q.get("error"), null);
  assert.equal(q.get("cuit"), null);
});

test("caracteres raros no rompen la dirección y el id va codificado", () => {
  const url = vueltaAFiscal("a/b", { error: "x&y=z#", cuit: "20 & 3" });
  assert.ok(url.startsWith("/operador/tenants/a%2Fb?"));
  const q = leer(url);
  assert.equal(q.get("error"), "x&y=z#");
  assert.equal(q.get("cuit"), "20 & 3");
});

test("lo escrito se recorta: un texto enorme no viaja entero en la dirección", () => {
  const q = leer(vueltaAFiscal("t-1", { error: "no", cuit: "9".repeat(500) }));
  assert.equal(q.get("cuit")?.length, TOPE_ESCRITO);
});

test("la ficha sólo repone lo escrito cuando vino con un error", () => {
  assert.deepEqual(escritoEnFiscal({ error: "no", cuit: "20-1", pv: "x" }), { cuit: "20-1", pv: "x" });
  assert.deepEqual(escritoEnFiscal({ ok: "listo", cuit: "20-1" }), { cuit: undefined, pv: undefined });
  assert.deepEqual(escritoEnFiscal({ error: "no", cuit: ["a", "b"] }), { cuit: "a", pv: undefined });
  assert.equal(escritoEnFiscal({ error: "no", cuit: "9".repeat(80) }).cuit?.length, TOPE_ESCRITO);
});
