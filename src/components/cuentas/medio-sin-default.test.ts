// El formulario de cobro/pago de cuenta corriente NO supone un medio: hay que elegirlo. Con
// "Efectivo" preseleccionado, una transferencia dejada como venía se asentaba como efectivo
// (con CUENTAS_CORRIENTES_ENABLED, en el libro de caja) y descuadraba el cajón. Se verifica la
// forma del componente (sin DOM en estos tests) y que sus medios sean los que acepta el
// servidor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MEDIOS_CUENTA_CORRIENTE, leerMedio } from "@/lib/settlement/asiento-libro";

const FUENTE = readFileSync(join(process.cwd(), "src/components/cuentas/RegisterCollectionForm.tsx"), "utf8");

test("el medio arranca vacío, es obligatorio y el botón no se habilita sin elegirlo", () => {
  assert.ok(!/defaultValue="EFECTIVO"/.test(FUENTE), "no hay medio por defecto");
  assert.match(FUENTE, /<Select name="metodo" value=\{metodo\} .* required>/);
  assert.match(FUENTE, /const \[metodo, setMetodo\] = useState\(""\);/);
  assert.match(FUENTE, /<option value="" disabled>\s*Elegí el medio/);
  assert.match(FUENTE, /disabled=\{!validation\.ok \|\| !medioElegido\}/);
});

test("los medios del formulario son exactamente los que acepta el servidor, y vacío se rechaza", () => {
  const bloque = /const MEDIOS_DEL_FORMULARIO = \[([\s\S]*?)\] as const;/.exec(FUENTE)?.[1] ?? "";
  const valores = [...bloque.matchAll(/value: "([A-Z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(valores, [...MEDIOS_CUENTA_CORRIENTE]);
  for (const v of valores) assert.equal(leerMedio(v), v);
  // Lo que manda el formulario si nadie eligió (el placeholder): el servidor no cobra.
  assert.equal(leerMedio(""), null);
});
