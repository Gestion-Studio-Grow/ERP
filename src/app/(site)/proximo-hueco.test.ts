// La agenda viva de CH no ofrece una hora ya tomada (QA 29/10, paso 18).
//   node --import tsx --test "src/app/(site)/proximo-hueco.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { primerHueco, sigueLibre } from "./_ch/huecos";

const HOY = "2026-10-29";
const MANANA = "2026-10-30";

test("el próximo hueco es el primero libre, hoy antes que mañana", () => {
  assert.deepEqual(primerHueco({ [HOY]: [], [MANANA]: ["12:00Z", "13:30Z"] }, [HOY, MANANA]), { day: MANANA, slot: "12:00Z" });
  assert.deepEqual(primerHueco({ [HOY]: ["18:00Z"], [MANANA]: ["12:00Z"] }, [HOY, MANANA]), { day: HOY, slot: "18:00Z" });
  assert.equal(primerHueco({}, [HOY, MANANA]), null);
});

test("si la hora tocada ya se tomó, no sigue libre y la ficha pasa a la siguiente", () => {
  const antes = { [MANANA]: ["12:00Z", "13:30Z"] };
  const despues = { [MANANA]: ["13:30Z"] }; // alguien reservó las 12:00
  assert.equal(sigueLibre(antes, MANANA, "12:00Z"), true);
  assert.equal(sigueLibre(despues, MANANA, "12:00Z"), false);
  assert.deepEqual(primerHueco(despues, [HOY, MANANA]), { day: MANANA, slot: "13:30Z" });
});

test("la agenda viva se vuelve a pedir al cerrar el modal y al volver a la pestaña, y verifica antes de abrir", () => {
  const fuente = readFileSync(join(process.cwd(), "src/app/(site)/_ch/ProximoHueco.tsx"), "utf8");
  assert.match(fuente, /estabaAbierto\.current && !abierto/, "al cerrar el modal");
  assert.match(fuente, /addEventListener\("visibilitychange"/, "al volver a la pestaña");
  assert.match(fuente, /\}, \[clave, vuelta\]\);/);
  assert.match(fuente, /onClick=\{\(\) => void tocarHora\(f, e\.day, e\.slot\)\}/, "tocar una hora la verifica antes de abrir");
  // Sólo lecturas: el motor de reservas no se toca desde la agenda viva.
  assert.doesNotMatch(fuente, /createAppointment|crearTurno|reservar\(/);
});
