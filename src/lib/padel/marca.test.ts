// La piel pública del profe (matias-DISENO.md §1.2 · M-052): la paleta viaja como variables CSS
// y ningún hex queda fuera de una variable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { marcaProfe, varsCss, VARS_PADEL } from "./marca";

const HEX = /#[0-9a-f]{3,8}\b/i;

test("varsCss sólo devuelve variables --padel-*: ningún hex queda fuera de una variable", () => {
  const vars = varsCss(marcaProfe(null));
  for (const [clave, valor] of Object.entries(vars)) {
    assert.match(clave, /^--padel-[a-z-]+$/, `clave fuera de variable: ${clave}`);
    assert.equal(typeof valor, "string");
    // Un valor que no es un hex tiene que apuntar a otra variable (tema o piel), nunca a un color literal.
    if (!HEX.test(valor)) assert.match(valor, /var\(--/, `${clave} no es hex ni variable: ${valor}`);
    else assert.match(valor, /^#[0-9a-f]{3,8}$/i, `${clave} mezcla un hex con otra cosa: ${valor}`);
  }
});

test("varsCss pinta las siete de la cancha más las de texto y superficie", () => {
  const vars = varsCss(marcaProfe("cualquiera"));
  for (const v of Object.values(VARS_PADEL)) assert.ok(v in vars, `falta ${v}`);
  assert.equal(vars["--padel-peligro"], "var(--danger)");
  assert.equal(vars["--padel-peligro-suave"], "var(--danger-soft)");
});

test("un color mal cargado cae a la paleta neutra (no se inyecta cualquier cosa en el style)", () => {
  const base = marcaProfe(null);
  const vars = varsCss({ ...base, cancha: "red; background: url(x)", tinta: "#12" });
  assert.equal(vars["--padel-cancha"], base.cancha);
  assert.equal(vars["--padel-tinta"], base.tinta);
});

test("sin fila propia, el profe sale con la paleta neutra", () => {
  assert.deepEqual(marcaProfe("matiasconsoli"), marcaProfe(null));
  assert.equal(marcaProfe(null).logo, null);
});
