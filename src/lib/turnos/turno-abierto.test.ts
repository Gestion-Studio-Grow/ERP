// Tests de las reglas de turno abierto, con RELOJ FIJO y horas de Buenos Aires (UTC−3).
// Ejecutan la decisión con datos: qué turno aparece como "sin cerrar", en qué sección de la
// lista cae, qué turnos avisa el cierre de un día, cuándo el recordatorio cuenta como enviado
// y qué link de WhatsApp se arma.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  turnoAbiertoConHoraPasada,
  turnosSinCerrarDelDia,
  seccionDeLista,
  diaSiguiente,
  rangoDelDia,
  debeEstamparRecordatorio,
  motivoSinEnvio,
  textoRecordatorio,
} from "./turno-abierto";
import { waLinkClienta } from "@/lib/whatsapp-cta";

// Hora de pared de Buenos Aires → instante. Argentina no tiene horario de verano: UTC−3 fijo.
const ba = (dia: string, hora: string) => new Date(`${dia}T${hora}:00.000-03:00`);

const HOY = "2026-09-23";
const AHORA = ba(HOY, "12:00");

test("CONFIRMED de las 10, con el reloj a las 12: está abierto con la hora pasada", () => {
  assert.equal(turnoAbiertoConHoraPasada({ status: "CONFIRMED", startsAt: ba(HOY, "10:00") }, AHORA), true);
});

test("Reservado (PENDING) de las 10 sin cerrar a las 12: también cuenta", () => {
  assert.equal(turnoAbiertoConHoraPasada({ status: "PENDING", startsAt: ba(HOY, "10:00") }, AHORA), true);
});

test("COMPLETED, NO_SHOW y CANCELLED ya están cerrados aunque la hora haya pasado", () => {
  for (const status of ["COMPLETED", "NO_SHOW", "CANCELLED"]) {
    assert.equal(turnoAbiertoConHoraPasada({ status, startsAt: ba(HOY, "10:00") }, AHORA), false, status);
  }
});

test("un turno que todavía no empezó no está sin cerrar", () => {
  assert.equal(turnoAbiertoConHoraPasada({ status: "PENDING", startsAt: ba(HOY, "16:00") }, AHORA), false);
  assert.equal(turnoAbiertoConHoraPasada({ status: "CONFIRMED", startsAt: ba(HOY, "12:00") }, AHORA), false);
});

test("acepta la fecha serializada (string ISO), como llega a un componente cliente", () => {
  assert.equal(turnoAbiertoConHoraPasada({ status: "CONFIRMED", startsAt: ba(HOY, "10:00").toISOString() }, AHORA), true);
});

const AGENDA = [
  { id: "ayer-conf", status: "CONFIRMED", startsAt: ba("2026-09-22", "18:00") },
  { id: "ayer-hecho", status: "COMPLETED", startsAt: ba("2026-09-22", "11:00") },
  { id: "hoy-10", status: "CONFIRMED", startsAt: ba(HOY, "10:00") },
  { id: "hoy-09", status: "PENDING", startsAt: ba(HOY, "09:00") },
  { id: "hoy-16", status: "PENDING", startsAt: ba(HOY, "16:00") },
  { id: "hoy-hecho", status: "COMPLETED", startsAt: ba(HOY, "08:00") },
  // 22:30 de acá son las 01:30 UTC del día siguiente: tiene que contar como del 22.
  { id: "ayer-noche", status: "PENDING", startsAt: ba("2026-09-22", "22:30") },
];

test("el cierre de hoy avisa sólo los abiertos de hoy con la hora pasada, en orden de hora", () => {
  assert.deepEqual(turnosSinCerrarDelDia(AGENDA, HOY, AHORA).map((t) => t.id), ["hoy-09", "hoy-10"]);
});

test("el cierre de un día ANTERIOR avisa los de ese día, no los de hoy", () => {
  // Se cierra el 22 el día 23: el bloque es del día que se cierra.
  assert.deepEqual(turnosSinCerrarDelDia(AGENDA, "2026-09-22", AHORA).map((t) => t.id), ["ayer-conf", "ayer-noche"]);
});

test("el cierre de un día futuro no avisa nada", () => {
  const manana = [{ id: "m", status: "CONFIRMED", startsAt: ba("2026-09-24", "10:00") }];
  assert.deepEqual(turnosSinCerrarDelDia(manana, "2026-09-24", AHORA), []);
});

test("la lista se parte en 'sin cerrar' y 'a confirmar' sin repetir turnos", () => {
  const futuroConfirmado = { status: "CONFIRMED", startsAt: ba("2026-09-25", "10:00") };
  assert.equal(seccionDeLista({ status: "CONFIRMED", startsAt: ba(HOY, "10:00") }, AHORA), "sin-cerrar");
  assert.equal(seccionDeLista({ status: "PENDING", startsAt: ba(HOY, "09:00") }, AHORA), "sin-cerrar");
  assert.equal(seccionDeLista({ status: "PENDING", startsAt: ba(HOY, "16:00") }, AHORA), "a-confirmar");
  assert.equal(seccionDeLista(futuroConfirmado, AHORA), "historial");
  assert.equal(seccionDeLista({ status: "COMPLETED", startsAt: ba(HOY, "08:00") }, AHORA), "historial");
});

test("mañana es mañana en Buenos Aires: el rango arranca a las 00:00 de acá (03:00 UTC)", () => {
  assert.equal(diaSiguiente("2026-09-30"), "2026-10-01");
  assert.equal(diaSiguiente("2026-12-31"), "2027-01-01");
  const { desde, hasta } = rangoDelDia("2026-09-24");
  assert.equal(desde.toISOString(), "2026-09-24T03:00:00.000Z");
  assert.equal(hasta.toISOString(), "2026-09-25T03:00:00.000Z");
});

// ── Recordatorio ──────────────────────────────────────────────────────────────

test("el recordatorio se estampa si ALGÚN canal mandó", () => {
  assert.equal(debeEstamparRecordatorio({ email: { sent: true }, whatsapp: { sent: false } }), true);
  assert.equal(debeEstamparRecordatorio({ email: { sent: false }, whatsapp: { sent: true } }), true);
});

test("sin RESEND y con WhatsApp simulado NO se estampa: la clienta no recibió nada", () => {
  const r = {
    email: { sent: false, channel: "email", reason: "RESEND_API_KEY no configurada (modo simulado)" },
    whatsapp: { sent: false, channel: "whatsapp", reason: "proveedor de WhatsApp no conectado (modo simulado)" },
  };
  assert.equal(debeEstamparRecordatorio(r), false);
  assert.match(motivoSinEnvio(r), /email: RESEND_API_KEY no configurada.*whatsapp: proveedor/);
});

test("el texto del recordatorio lleva la hora de Buenos Aires aunque el servidor esté en UTC", () => {
  const texto = textoRecordatorio(null, {
    clientName: "Ana",
    serviceName: "Limpieza facial",
    professionalName: "Vero",
    startsAt: ba("2026-09-24", "16:00"),
  });
  assert.equal(texto, "Hola Ana, te esperamos jueves, 24 de septiembre de 2026, 16:00 para Limpieza facial con Vero.");
});

test("con plantilla del panel se usa la plantilla; una clave desconocida queda vacía", () => {
  const texto = textoRecordatorio("{{clientName}}: mañana {{startsAt}}.{{otra}}", {
    clientName: "Ana",
    serviceName: "x",
    professionalName: "y",
    startsAt: ba("2026-09-24", "09:30"),
  });
  assert.equal(texto, "Ana: mañana jueves, 24 de septiembre de 2026, 09:30.");
});

// ── WhatsApp a la clienta ─────────────────────────────────────────────────────

test("waLinkClienta arma 549 + la clave, sin espacios, escriba como se escriba el teléfono", () => {
  for (const tel of ["11 4000-7919", "1140007919", "+54 9 11 4000-7919", "011 15-4000-7919"]) {
    assert.equal(waLinkClienta(tel), "https://wa.me/5491140007919", tel);
  }
  const conTexto = waLinkClienta("11 4000-7919", "Hola Ana, ¿confirmás?");
  assert.equal(conTexto, "https://wa.me/5491140007919?text=Hola%20Ana%2C%20%C2%BFconfirm%C3%A1s%3F");
  assert.doesNotMatch(conTexto!, /\s/);
});

test("waLinkClienta no inventa un número: sin 10 dígitos devuelve null", () => {
  assert.equal(waLinkClienta(""), null);
  assert.equal(waLinkClienta(null), null);
  assert.equal(waLinkClienta("4000-7919"), null);
});

// ── Chequeo de FORMA: que los llamadores usen lo de arriba ────────────────────
// Lo de arriba ejecuta las reglas. Esto sólo verifica cableado que no se puede correr sin base.

test("reprogramar desde la agenda borra el 'avisada': el aviso era para la fecha vieja", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../actions.ts", import.meta.url), "utf8");
  const i = src.indexOf("export async function rescheduleAppointment(");
  assert.ok(i !== -1, "no encontré rescheduleAppointment");
  const cuerpo = src.slice(i, src.indexOf("\nexport ", i + 10));
  assert.match(cuerpo, /tx\.appointment\.update\(\{[\s\S]*?data:\s*\{[^}]*reminderSentAt:\s*null/);
});
