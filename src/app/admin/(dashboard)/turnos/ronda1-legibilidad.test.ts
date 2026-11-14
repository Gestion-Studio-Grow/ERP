// Ronda 1 del vertical estética (docs/sprints/ESTETICA-5-RONDAS-RELEVO.md): legibilidad y toque en el
// celular de lo que leen la clienta (reserva) y la recepción (agenda). Mira el código fuente, sin navegador:
// el recorrido clic por clic a 390 px es el que midió los defectos; esto evita que vuelvan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../../../../..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

test("la reserva pública no escribe «Requiere seña» en letra menor a 12 px", () => {
  const modal = leer("src/app/(site)/_ch/BookingModal.tsx");
  const linea = modal.split("\n").find((l) => l.includes("Requiere seña"));
  assert.ok(linea, "el aviso de seña sigue en el paso 1 de la reserva");
  const px = Number(/fontSize:\s*(\d+)/.exec(linea)?.[1]);
  assert.ok(px >= 12, `«Requiere seña» va a ${px} px: el piso es 12`);
});

test("la planilla de la agenda no usa letra menor a 12 px", () => {
  const planilla = leer("src/app/admin/(dashboard)/turnos/_agenda/PorProfesional.tsx");
  assert.doesNotMatch(planilla, /text-\[(9|10|11)px\]/);
});

test("los atajos de teclado de la planilla no se muestran en el celular", () => {
  const planilla = leer("src/app/admin/(dashboard)/turnos/_agenda/PorProfesional.tsx");
  assert.match(planilla, /<span className="max-sm:hidden"> Con el teclado:/);
});

test("las pestañas Calendario/Lista llevan 44 px de ancho y de alto en el celular", () => {
  for (const rel of ["src/app/admin/(dashboard)/turnos/page.tsx", "src/app/admin/(dashboard)/turnos/lista/page.tsx"]) {
    const pestañas = leer(rel).split("\n").filter((l) => l.includes("<Link href=\"/admin/turnos") && l.includes("max-sm:min-h-11"));
    assert.equal(pestañas.length, 2, `${rel}: dos pestañas`);
    for (const l of pestañas) assert.match(l, /max-sm:min-w-11/, `${rel}: falta el ancho táctil`);
  }
});
