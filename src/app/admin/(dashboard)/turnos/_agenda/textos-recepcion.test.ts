// Lo que lee recepción en la agenda, dicho para quien lo lee (UAT 3 personas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENDA = "src/app/admin/(dashboard)/turnos";
const leer = (r: string) => readFileSync(join(process.cwd(), AGENDA, r), "utf8");

test("punto 13: a recepción se le dice qué hacer, no de dónde lo saca la dueña", () => {
  for (const archivo of ["AppointmentRow.tsx", "_agenda/TurnoCajon.tsx"]) {
    const texto = leer(archivo);
    assert.match(texto, /Pedile el código a la dueña\./, archivo);
    assert.doesNotMatch(texto, /La dueña lo saca/, archivo);
  }
});

test("punto 8: Confirmar, en la lista y en la ficha, ofrece el mensaje ya escrito", () => {
  assert.match(leer("_agenda/MesaDeTurnos.tsx"), /accionDeConfirmado\(t\)/);
  assert.match(leer("_agenda/TurnoCajon.tsx"), /accionDeConfirmado\(t\)/);
});
