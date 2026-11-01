// «Continuar» dice qué falta en todos los pasos, sólo después de intentar (tercera vuelta de T1).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { faltaParaSeguir, type EstadoDeLaReserva } from "./_ch/reserva-falta";

const vacio: EstadoDeLaReserva = {
  servicio: false,
  profesional: false,
  hayProfesionales: true,
  dia: false,
  diaSinHorarios: false,
  hora: false,
  nombre: false,
  telefono: "vacio",
  emailValido: true,
};

test("cada paso dice qué falta", () => {
  assert.equal(faltaParaSeguir(1, vacio), "Falta elegir el servicio.");
  assert.equal(faltaParaSeguir(2, vacio), "Falta elegir la profesional.");
  assert.match(faltaParaSeguir(2, { ...vacio, hayProfesionales: false }) ?? "", /volvé y elegí otro/);
  assert.equal(faltaParaSeguir(3, vacio), "Falta elegir el día y el horario.");
  assert.equal(faltaParaSeguir(3, { ...vacio, dia: true }), "Falta elegir el horario.");
  assert.equal(faltaParaSeguir(3, { ...vacio, dia: true, diaSinHorarios: true }), "Ese día no tiene horarios: elegí otro.");
  assert.equal(faltaParaSeguir(4, vacio), "Falta tu nombre y tu teléfono.");
  assert.equal(faltaParaSeguir(4, { ...vacio, nombre: true }), "Falta tu teléfono.");
  assert.equal(faltaParaSeguir(4, { ...vacio, nombre: true, telefono: "invalido" }), "Revisá el teléfono.");
  assert.equal(faltaParaSeguir(4, { ...vacio, telefono: "invalido" }), "Falta tu nombre. Revisá el teléfono.");
});

test("el email es opcional: nunca «falta», se corrige o se borra", () => {
  const texto = faltaParaSeguir(4, { ...vacio, nombre: true, telefono: "valido", emailValido: false }) ?? "";
  assert.doesNotMatch(texto, /Falta/);
  assert.match(texto, /corregilo o borralo, es opcional/);
});

test("con el paso completo no falta nada, y en la confirmación tampoco", () => {
  assert.equal(faltaParaSeguir(1, { ...vacio, servicio: true }), null);
  assert.equal(faltaParaSeguir(2, { ...vacio, profesional: true }), null);
  assert.equal(faltaParaSeguir(3, { ...vacio, dia: true, hora: true }), null);
  assert.equal(faltaParaSeguir(4, { ...vacio, nombre: true, telefono: "valido" }), null);
  assert.equal(faltaParaSeguir(5, vacio), null);
});

test("el aviso nace de un intento en ESE paso: elegir y avanzar no lo arrastra", () => {
  const fuente = readFileSync(join(process.cwd(), "src/app/(site)/_ch/BookingModal.tsx"), "utf8");
  assert.match(fuente, /const intento = intentoEn === step;/);
  assert.match(fuente, /function elegirYSeguir\(fn: \(\) => void\) \{\s+setIntentoEn\(0\);/);
  assert.equal((fuente.match(/role="alert"[^>]*>\s*\{?avisoPie\}?/g) ?? []).length, 1, "un solo aviso, en el pie que queda a la vista");
});

test("el error de /reserva también vuelve a pedir la página al servidor", () => {
  const fuente = readFileSync(join(process.cwd(), "src/app/(site)/reserva/error.tsx"), "utf8");
  assert.match(fuente, /\(retry \?\? reset\)\(\)/);
});
