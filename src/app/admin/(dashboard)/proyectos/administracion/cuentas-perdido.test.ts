// ADV-7 (MIA-107): la lista de Administración usa la misma regla que la ficha (V2) y el servidor para un perdido:
// `perdidoAdmite` (ficha-core.ts), que falla cerrada. Un cobro de un perdido no lleva «Cobrado» ni se pinta vencido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = (archivo: string) => readFileSync(new URL(archivo, import.meta.url), "utf8");

test("ADV-7 (MIA-107) · Cuentas a cobrar: un cobro de un perdido no ofrece «Cobrado», no se pinta vencido y dice por qué", () => {
  const s = leer("./_cuentas.tsx");
  const marcar = s.split("\n").find((l) => l.includes("<MarcarCuota "));
  assert.ok(marcar, "el renglón tiene el botón de marcar");
  assert.match(marcar, /!c\.noSeCobra/, "«Cobrado» sólo si la regla del perdido lo admite");
  assert.match(s, /const vencida = [^;\n]*!c\.noSeCobra/, "un cobro que no se cobra no se pinta vencido");
  assert.match(s, /c\.noSeCobra && [^\n]*Proyecto perdido: no se cobra/, "dice lo mismo que la ficha (V2)");
});

test("ADV-7 (MIA-107) · la marca sale de la regla compartida, en el servidor que arma la lista", () => {
  const s = leer("../../../../../lib/proyectos/empresa.server.ts");
  assert.match(s, /noSeCobra: cobroFrenadoPorPerdido\(c\)/, "Administración marca la cuota con la regla de ficha-core");
  const core = leer("../../../../../lib/proyectos/ficha-core.ts");
  assert.match(core, /export const cobroFrenadoPorPerdido = [^\n]*!perdidoAdmite\(c\.tipo\)/, "la regla nueva es `perdidoAdmite`, sin otra");
});
