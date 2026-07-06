import { test } from "node:test";
import assert from "node:assert/strict";

import { parseWaMessage, normalizeWa, type WaServiceRef } from "./wa-intent";

// "ahora" fijo para todas las pruebas de fecha: jueves 2026-07-02, 10:00 local.
// (getDay(): dom=0..sab=6 → 2026-07-02 es jueves = 4).
const NOW = new Date(2026, 6, 2, 10, 0, 0);

const SERVICES: WaServiceRef[] = [
  { name: "Corte", aliases: ["cortar", "corte de pelo"] },
  { name: "Color", aliases: ["coloracion", "tintura"] },
  { name: "Manicura", aliases: ["manos", "uñas"] },
];

function parse(text: string) {
  return parseWaMessage(text, { now: NOW, services: SERVICES });
}

// --- Normalización ------------------------------------------------------------

test("normalizeWa saca acentos, ñ y puntuación pero conserva : y /", () => {
  assert.equal(normalizeWa("¡Hola! ¿Mañana a las 15:30?"), "hola manana a las 15:30");
  assert.equal(normalizeWa("El 03/08 está bien"), "el 03/08 esta bien");
  assert.equal(normalizeWa("  MÚLTIPLES   espacios  "), "multiples espacios");
});

// --- Intenciones núcleo -------------------------------------------------------

test("BOOK: pedir un turno", () => {
  const r = parse("hola, quiero sacar un turno");
  assert.equal(r.kind, "BOOK");
  assert.equal(r.suggestedAction, "getAvailableSlots+createAppointment");
  assert.ok(r.confidence > 0.5);
});

test("BOOK gana al saludo cuando coexisten", () => {
  const r = parse("buenas! necesito un turno para corte");
  assert.equal(r.kind, "BOOK");
  assert.equal(r.entities.service?.name, "Corte");
});

test("RESCHEDULE: reprogramar tiene prioridad sobre BOOK", () => {
  const r = parse("necesito reprogramar mi turno para otro dia");
  assert.equal(r.kind, "RESCHEDULE");
  assert.equal(r.suggestedAction, "rescheduleAppointment");
});

test("CANCEL: cancelar", () => {
  const r = parse("quiero cancelar el turno de mañana");
  assert.equal(r.kind, "CANCEL");
  assert.equal(r.suggestedAction, "cancelAppointment");
});

test("CANCEL: 'no voy a poder ir' no se confunde con DENY", () => {
  const r = parse("hola no voy a poder ir mañana");
  assert.equal(r.kind, "CANCEL");
});

test("PRICE: cuánto sale", () => {
  const r = parse("cuanto sale el color?");
  assert.equal(r.kind, "PRICE");
  assert.equal(r.entities.service?.name, "Color");
  assert.equal(r.suggestedAction, "listServices");
});

test("PAY: link de pago", () => {
  const r = parse("me pasas el link de pago asi abono la seña?");
  assert.equal(r.kind, "PAY");
  assert.equal(r.suggestedAction, "mercadopago:createPreference");
});

test("INVOICE: pide factura", () => {
  const r = parse("necesito factura a nombre de mi empresa");
  assert.equal(r.kind, "INVOICE");
  assert.equal(r.suggestedAction, "arca:emitInvoice");
});

test("HOURS: horarios / ubicación", () => {
  assert.equal(parse("a que hora abren?").kind, "HOURS");
  assert.equal(parse("donde estan ubicados?").kind, "HOURS");
});

test("HUMAN: pedir una persona → handoff", () => {
  const r = parse("no me sirve el bot, quiero hablar con una persona");
  assert.equal(r.kind, "HUMAN");
  assert.equal(r.suggestedAction, "handoff");
});

test("GREETING solo cuando no hay contenido", () => {
  const r = parse("holaa buenas tardes");
  assert.equal(r.kind, "GREETING");
  assert.equal(r.suggestedAction, "menu");
});

// --- Confirmación / negación cortas -------------------------------------------

test("AFFIRM: confirmación breve", () => {
  assert.equal(parse("dale").kind, "AFFIRM");
  assert.equal(parse("si perfecto").kind, "AFFIRM");
  assert.equal(parse("dale").suggestedAction, null);
});

test("DENY: negación breve", () => {
  assert.equal(parse("no").kind, "DENY");
  assert.equal(parse("no gracias").kind, "DENY");
});

test("mensaje largo con 'si' NO es AFFIRM", () => {
  const r = parse("si tienen lugar el lunes saco turno");
  assert.equal(r.kind, "BOOK");
});

test("UNKNOWN cae a handoff con confianza 0", () => {
  const r = parse("asdkjfh qwerty");
  assert.equal(r.kind, "UNKNOWN");
  assert.equal(r.confidence, 0);
  assert.equal(r.suggestedAction, "handoff");
});

// --- Entidades: fecha ---------------------------------------------------------

test("fecha: hoy / mañana / pasado mañana", () => {
  assert.equal(parse("turno para hoy").entities.date, "2026-07-02");
  assert.equal(parse("turno para mañana").entities.date, "2026-07-03");
  assert.equal(parse("turno pasado mañana").entities.date, "2026-07-04");
});

test("fecha: día de la semana → próxima ocurrencia", () => {
  // NOW es jueves 2026-07-02. "viernes" → 2026-07-03.
  assert.equal(parse("turno el viernes").entities.date, "2026-07-03");
  // "lunes" → 2026-07-06.
  assert.equal(parse("turno el lunes").entities.date, "2026-07-06");
});

test("fecha: mismo día de la semana empuja a la semana siguiente", () => {
  // NOW es jueves; "jueves" → el próximo jueves, no hoy (para hoy se dice 'hoy').
  assert.equal(parse("turno el jueves").entities.date, "2026-07-09");
});

test("fecha: numérica dd/mm a futuro", () => {
  assert.equal(parse("turno el 15/08").entities.date, "2026-08-15");
  // fecha ya pasada este año → salta al año siguiente.
  assert.equal(parse("turno el 15/01").entities.date, "2027-01-15");
});

test("fecha: dd/mm inválida se ignora", () => {
  assert.equal(parse("turno el 31/02").entities.date, null);
});

// --- Entidades: hora ----------------------------------------------------------

test("hora: HH:MM explícita", () => {
  assert.equal(parse("mañana a las 15:30").entities.time, "15:30");
});

test("hora: 'a las 3 de la tarde' → 15:00", () => {
  assert.equal(parse("turno a las 3 de la tarde").entities.time, "15:00");
});

test("hora: '9 de la mañana' → 09:00", () => {
  assert.equal(parse("turno a las 9 de la mañana").entities.time, "09:00");
});

test("hora: '15 hs' → 15:00", () => {
  assert.equal(parse("mañana 15 hs").entities.time, "15:00");
});

test("hora: 'a las 3 y media' → 15:30 (heurística de hora comercial, default ON)", () => {
  // En contexto de reserva, "a las 3 y media" es la tarde, no la madrugada.
  assert.equal(parse("a las 3 y media").entities.time, "15:30");
});

test("hora: heurística de hora comercial empuja 1–8 a la tarde", () => {
  assert.equal(parse("turno a las 4").entities.time, "16:00");
  assert.equal(parse("dale a las 6").entities.time, "18:00");
  assert.equal(parse("a las 8 hs").entities.time, "20:00");
  // 9–12 se quedan como AM (no se tocan).
  assert.equal(parse("a las 10").entities.time, "10:00");
});

test("hora: assumeBusinessHours=false hace parseo literal", () => {
  const r = parseWaMessage("a las 3 y media", { now: NOW, services: SERVICES, assumeBusinessHours: false });
  assert.equal(r.entities.time, "03:30");
});

test("hora: mediodía y medianoche", () => {
  assert.equal(parse("turno al mediodia").entities.time, "12:00");
  assert.equal(parse("turno a la medianoche").entities.time, "00:00");
  // "12 de la noche" es medianoche; "12 de la mañana" también → 00:00.
  assert.equal(parse("a las 12 de la noche").entities.time, "00:00");
  assert.equal(parse("a las 12 de la manana").entities.time, "00:00");
});

test("hora: franja explícita gana a la heurística", () => {
  // Con "de la mañana" no se empuja a la tarde aunque sea 1–8.
  assert.equal(parse("a las 8 de la manana").entities.time, "08:00");
});

test("hora: sin mención horaria → null", () => {
  assert.equal(parse("quiero un turno para corte").entities.time, null);
});

// --- Entidades: servicio ------------------------------------------------------

test("servicio: match por alias, la mención más larga gana", () => {
  assert.equal(parse("quiero un corte de pelo").entities.service?.name, "Corte");
  assert.equal(parse("turno de tintura").entities.service?.name, "Color");
});

test("servicio: sin catálogo no rompe", () => {
  const r = parseWaMessage("quiero un turno para corte", { now: NOW });
  assert.equal(r.kind, "BOOK");
  assert.equal(r.entities.service, null);
});

test("servicio: límite de palabra evita falsos positivos", () => {
  // "manos" (alias de Manicura) no debe matchear dentro de "manoseo".
  assert.equal(parse("consulta sobre manoseo de datos").entities.service, null);
});

// --- Confianza ----------------------------------------------------------------

test("confianza: BOOK con fecha+hora+servicio es alta", () => {
  const r = parse("quiero sacar un turno para corte el viernes a las 15:30");
  assert.equal(r.kind, "BOOK");
  assert.equal(r.entities.service?.name, "Corte");
  assert.equal(r.entities.date, "2026-07-03");
  assert.equal(r.entities.time, "15:30");
  assert.ok(r.confidence >= 0.8, `esperaba confianza alta, fue ${r.confidence}`);
});

test("mensaje vacío → UNKNOWN", () => {
  assert.equal(parse("").kind, "UNKNOWN");
  assert.equal(parse("   ").kind, "UNKNOWN");
});
