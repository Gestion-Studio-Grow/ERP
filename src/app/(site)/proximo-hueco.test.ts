// La agenda viva de CH no ofrece una hora ya tomada (QA 29/10, paso 18).
//   node --import tsx --test "src/app/(site)/proximo-hueco.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { primerHueco, sigueLibre } from "./_ch/huecos";
import { reservaDesdeTexto } from "./_ch/reserva-guardada";

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

test("la agenda viva relee al reservar, al cerrar el modal y cada 90 s; volver a la pestaña no relee (P0-2)", () => {
  const fuente = readFileSync(join(process.cwd(), "src/app/(site)/_ch/ProximoHueco.tsx"), "utf8");
  assert.match(fuente, /estabaAbierto\.current && !abierto/, "al cerrar el modal");
  assert.match(fuente, /reservasVistas\.current === reservas/, "al confirmar un turno");
  assert.match(fuente, /REFRESCO_MS = 90_000/, "cada 90 s");
  assert.match(fuente, /document\.visibilityState === "visible"\) setVuelta/, "sólo con la pestaña a la vista");
  assert.doesNotMatch(fuente, /addEventListener\("(focus|visibilitychange)"/, "volver a la pestaña no dispara lecturas");
  assert.match(fuente, /\}, \[clave, vuelta\]\);/);
  assert.match(fuente, /onClick=\{\(\) => void tocarHora\(f, e\.day, e\.slot\)\}/, "tocar una hora la verifica antes de abrir");
  // Sólo lecturas: el motor de reservas no se toca desde la agenda viva.
  assert.doesNotMatch(fuente, /createAppointment|crearTurno|reservar\(/);
});

test("el modal avisa cuando se reservó, con el UID del turno y sin guardar datos de la persona", () => {
  const modal = readFileSync(join(process.cwd(), "src/app/(site)/_ch/BookingModal.tsx"), "utf8");
  assert.match(modal, /setStep\(5\);\s+onReservado\?\.\(\);/);
  assert.match(modal, /`UID:\$\{reservaId \?\? confirmedStartsAt\}@/, "dos turnos a la misma hora no chocan en el calendario");
  const guardado = modal.slice(modal.indexOf("guardarReserva({"), modal.indexOf("guardarReserva({") + 200);
  assert.doesNotMatch(guardado, /name|tel|mail|coupon/i);
});

test("lo guardado se lee con desconfianza: cualquier otra forma es «nada»", () => {
  assert.deepEqual(reservaDesdeTexto(JSON.stringify({ paso: 4, serviceId: "s1", professionalId: "p1", day: MANANA, slot: "12:00Z", vecina: true, nombre: "x" })), {
    paso: 4,
    serviceId: "s1",
    professionalId: "p1",
    day: MANANA,
    slot: "12:00Z",
    vecina: true,
  });
  for (const malo of [null, "", "no-json", "[]", "{}", JSON.stringify({ paso: 5, serviceId: "s1" }), JSON.stringify({ paso: 1 }), JSON.stringify({ paso: "2", serviceId: "s1" })]) {
    assert.equal(reservaDesdeTexto(malo), null, String(malo));
  }
});
