// La nota de la reserva pública (QA AGR 29/10, ALTA-1): la patente y el modelo que manda el taller
// llegan al turno; sin nota (CH), el turno queda como siempre.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LARGO_MAXIMO_NOTA_PUBLICA, notaDeReservaPublica } from "./reserva-publica-notas";

test("la nota del taller llega tal cual, sin espacios de más", () => {
  assert.equal(notaDeReservaPublica("  Patente: AB 123 CD · Auto: VW Gol Trend  "), "Patente: AB 123 CD · Auto: VW Gol Trend");
});

test("sin nota, vacía o sólo espacios: null (el turno de CH no cambia)", () => {
  assert.equal(notaDeReservaPublica(null), null);
  assert.equal(notaDeReservaPublica(undefined), null);
  assert.equal(notaDeReservaPublica(""), null);
  assert.equal(notaDeReservaPublica("   \n "), null);
});

test("un archivo en vez de texto no es una nota", () => {
  assert.equal(notaDeReservaPublica(new File(["x"], "x.txt")), null);
});

test("se recorta a 500 caracteres", () => {
  const larga = "x".repeat(LARGO_MAXIMO_NOTA_PUBLICA + 200);
  assert.equal(LARGO_MAXIMO_NOTA_PUBLICA, 500);
  assert.equal(notaDeReservaPublica(larga)?.length, 500);
  // El recorte no deja un espacio colgando al final.
  assert.equal(notaDeReservaPublica(`${"y".repeat(499)} zzz`), "y".repeat(499));
});

test("createAppointment pasa la nota recortada a bookAppointment (lectura del código)", () => {
  // Lo EJECUTA contra Postgres reserva-publica-postgres.test.ts («la nota de la reserva…»); acá se mira
  // que la reserva pública use este recorte y no otro, y que la nota viaje a la reserva.
  const fuente = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const inicio = fuente.search(/export async function createAppointment\(/);
  assert.ok(inicio >= 0);
  const cuerpo = fuente.slice(inicio, fuente.indexOf("\n}\n", inicio));
  assert.match(cuerpo, /const notes = notaDeReservaPublica\(formData\.get\("notes"\)\) \?\? undefined;/);
  assert.match(cuerpo, /bookAppointment\(\{[^}]*\bnotes,[^}]*\}\)/);
});
