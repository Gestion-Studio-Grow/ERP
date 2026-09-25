import { test } from "node:test";
import assert from "node:assert/strict";
import { noEncontradaPara } from "./no-encontrada-core";

test("consola del operador: siempre la hoja nueva con la vuelta a Negocios, prendido o no", () => {
  for (const nuevo of [true, false]) {
    const d = noEncontradaPara("/operador/tenants/no-existe-123", nuevo);
    assert.equal(d?.superficie, "operador");
    assert.deepEqual(d?.enlaces[0], { href: "/operador", etiqueta: "Volver a Negocios" });
  }
  assert.equal(noEncontradaPara("/operador", false)?.superficie, "operador");
});

test("panel de un negocio con el interruptor APAGADO (CH hoy): el 404 de siempre", () => {
  for (const r of ["/admin/no-existe", "/contador", "/contador/x", "/facturita/app/x"]) {
    assert.equal(noEncontradaPara(r, false), null, r);
  }
});

test("panel de un negocio con el diseño nuevo: siempre hay un camino de vuelta", () => {
  assert.deepEqual(noEncontradaPara("/admin/no-existe", true)?.enlaces, [
    { href: "/admin", etiqueta: "Volver al inicio del panel" },
  ]);
  const contador = noEncontradaPara("/contador", true);
  assert.equal(contador?.enlaces[0].href, "/admin", "la dueña que abrió /contador vuelve a su panel");
  assert.ok(contador?.enlaces.some((e) => e.href === "/contador"));
  assert.equal(noEncontradaPara("/facturita/app/nada", true)?.enlaces[0].href, "/facturita/app");
});

test("vidriera y rutas que sólo se parecen: el 404 de siempre", () => {
  for (const r of ["/", "/tienda/x", "/administracion", "/operadores", "/contadores", null, undefined, ""]) {
    assert.equal(noEncontradaPara(r, true), null, String(r));
  }
});
