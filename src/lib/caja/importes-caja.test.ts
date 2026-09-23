// Los campos de PLATA de la caja se leen como se escribe acá, en el navegador y en el servidor.
//
// MEDIDO (Chromium 141, locale es-AR, teclado físico y virtual): en un `<input type="number">`
// tipear "12,5" deja `.value = "125"` —la coma se descarta al tipear— y "12.500" deja
// `"12.500"`, que `Number()` lee 12,5. O sea: el efectivo contado del cierre, el fondo de caja
// y los movimientos del libro podían entrar diez veces más grandes o mil veces más chicos.
//
// La DECISIÓN (qué número es "12.500") se prueba ejecutándola en pos-peso.test.ts. Acá sólo se
// fija que los tres formularios y sus tres acciones la usen, y no una copia suya.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Sin comentarios: los comentarios NOMBRAN el parseo viejo para explicar por qué se fue.
const leer = (p: string) =>
  readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
    .join("\n");

const FORMULARIOS = [
  "src/app/admin/(dashboard)/caja/cierre/CierreForm.tsx",
  "src/app/admin/(dashboard)/caja/CajaForms.tsx",
  "src/app/admin/(dashboard)/caja/libro/LibroForms.tsx",
];
const ACCIONES = ["src/lib/caja-actions.ts", "src/lib/libro-caja-actions.ts", "src/lib/cierre-diario-actions.ts"];

test("ningún campo de plata de la caja es type=number", () => {
  for (const f of FORMULARIOS) {
    assert.doesNotMatch(leer(f), /type="number"/, `${f} volvió a un type=number`);
  }
});

test("las acciones de caja leen la plata con leerImporte, no con Number(replace)", () => {
  for (const f of ACCIONES) {
    const src = leer(f);
    assert.match(src, /leerImporte\(/, `${f} no usa leerImporte`);
    assert.doesNotMatch(src, /Number\([^)]*replace\(",", "\."\)/, `${f} conserva el parseo viejo`);
  }
});
