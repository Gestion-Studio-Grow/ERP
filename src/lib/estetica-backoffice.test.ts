import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { esteticaBackoffice } from "./estetica-backoffice";

test("cada cliente con su estética; los locales de Magra, la de Magra; el resto, la del ERP", () => {
  assert.equal(esteticaBackoffice("breakpoint"), "breakpoint");
  assert.equal(esteticaBackoffice("beauty-spa"), "beauty-spa");
  assert.equal(esteticaBackoffice("magra"), "magra");
  assert.equal(esteticaBackoffice("magra-canning"), "magra");
  assert.equal(esteticaBackoffice("matiasconsoli"), "matiasconsoli");
  for (const otro of ["shinevelas", "adosmanos", "", null, undefined, "magrax"]) assert.equal(esteticaBackoffice(otro), null, String(otro));
});

test("cada estética tiene su bloque en globals.css", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const e of ["breakpoint", "beauty-spa", "magra", "matiasconsoli"]) assert.match(css, new RegExp(`\\[data-skin="fable"\\]\\[data-estetica="${e}"\\]`), e);
});
