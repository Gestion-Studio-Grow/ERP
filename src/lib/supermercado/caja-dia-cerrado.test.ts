// La caja con lector después del cierre del día: no cobra, y el mensaje dice cómo seguir con lo
// que ESA pantalla tiene (no hay «Cobrado» para destildar: se manda a Vender).

import { test } from "node:test";
import assert from "node:assert/strict";
import { fronteraDeVenta } from "@/lib/order-anulacion";

const cerrado = (dia: string, hasta: string) => dia <= hasta;

test("con el día cerrado, la caja con lector no cobra y manda a Vender sin cobrar, con la fecha en que vuelve a abrir", () => {
  const f = fronteraDeVenta({ paid: true, paymentMethod: "EFECTIVO", hoy: "2026-09-27", cerradoHasta: "2026-09-27", esDiaCerrado: cerrado, contexto: "caja-con-lector" });
  assert.equal(f.bloquea, true);
  assert.ok(f.bloquea);
  assert.match(f.error, /Esta caja vuelve a cobrar el 28\/09\/2026/);
  assert.match(f.error, /Vender sin tildar «Cobrado»/);
  assert.doesNotMatch(f.error, /Destildá/);
});

test("con el día abierto, la caja con lector cobra", () => {
  const f = fronteraDeVenta({ paid: true, paymentMethod: "EFECTIVO", hoy: "2026-09-28", cerradoHasta: "2026-09-27", esDiaCerrado: cerrado, contexto: "caja-con-lector" });
  assert.equal(f.bloquea, false);
});
