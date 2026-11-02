import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enlaceCobrarUnaVenta } from "./cobrar-una-venta";

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("«Cobrar una venta»: en CH, para quien vende; la profesional y los demás negocios, no", () => {
  const esperado = { href: "/admin/pedidos?cobrar=1", etiqueta: "Cobrar una venta" };
  assert.deepEqual(enlaceCobrarUnaVenta("beauty-spa", "OWNER"), esperado);
  assert.deepEqual(enlaceCobrarUnaVenta("beauty-spa", "RECEPTION"), esperado);
  assert.equal(enlaceCobrarUnaVenta("beauty-spa", "PROFESSIONAL"), null);
  assert.equal(enlaceCobrarUnaVenta("magra", "OWNER"), null);
  assert.equal(enlaceCobrarUnaVenta("matiasconsoli", "OWNER"), null);
  assert.equal(enlaceCobrarUnaVenta(null, "OWNER"), null);
});

test("el enlace está en la Agenda y en Caja, en los dos diseños", () => {
  for (const f of ["../turnos/AgendaRenglon.tsx", "../turnos/page.tsx", "../caja/page.tsx", "../caja/CajaRenglon.tsx"]) {
    assert.match(fuente(f), /<Link href=\{cobrarVenta\.href\}/, f);
  }
  assert.match(fuente("../caja/page.tsx"), /dia\.yaCerrado \? null : enlaceCobrarUnaVenta/, "con el día cerrado no se vende");
});
