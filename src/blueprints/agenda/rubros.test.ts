// Tests del rubro `padel` (A Dos Manos Pádel) y de la copy rubro-aware del flujo de
// reserva. Config pura — patrón node:test. Blindan dos cosas: (1) que pádel nazca
// usable como club de varias canchas 7 días; (2) que la copy caiga al wording
// histórico para los rubros que NO definen voz propia (los tenants existentes no
// cambian ni una palabra en /reserva).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAgendaRubro,
  resolveAgendaRubroIdBySlug,
  agendaBookingCopyFor,
  agendaBookingCopyForSlug,
} from "./rubros";

test("rubro padel: existe y habla de canchas, no de profesionales", () => {
  const padel = getAgendaRubro("padel");
  assert.ok(padel, "el rubro padel debería existir");
  assert.equal(padel!.wording.providerNoun, "cancha");
  assert.equal(padel!.wording.serviceNoun, "turno");
});

test("rubro padel: siembra varias canchas en paralelo (club real)", () => {
  const padel = getAgendaRubro("padel")!;
  assert.ok(padel.resources && padel.resources.length >= 2, "debería tener varias canchas");
  assert.ok(padel.services.length >= 1, "debería tener turnos en el catálogo");
});

test("rubro padel: horario de club — 7 días", () => {
  const padel = getAgendaRubro("padel")!;
  assert.ok(padel.weeklyHours, "debería definir horario semanal propio");
  assert.equal(padel.weeklyHours!.days.length, 7);
});

test("resolveAgendaRubroIdBySlug: adosmanos → padel, resto → null", () => {
  assert.equal(resolveAgendaRubroIdBySlug("adosmanos"), "padel");
  assert.equal(resolveAgendaRubroIdBySlug("otro-tenant"), null);
  assert.equal(resolveAgendaRubroIdBySlug(null), null);
  assert.equal(resolveAgendaRubroIdBySlug(undefined), null);
});

test("copy de padel (por slug): dice cancha y reserva", () => {
  const c = agendaBookingCopyForSlug("adosmanos");
  assert.equal(c.title, "Reservá tu cancha");
  assert.equal(c.providerLabel, "Cancha");
  assert.equal(c.providerPlaceholder, "Seleccioná una cancha");
  assert.equal(c.serviceLabel, "Turno");
  assert.equal(c.confirmCta, "Confirmar reserva");
});

test("copy fallback (rubro sin voz propia): wording histórico intacto", () => {
  // Un tenant sin rubro o con un rubro que no define bookingTitle/serviceNoun
  // debe ver EXACTAMENTE la copy vieja de /reserva (backward-compat CH Estética).
  for (const copy of [agendaBookingCopyFor(null), agendaBookingCopyFor("estetica")]) {
    assert.equal(copy.title, "Reservá tu turno");
    assert.equal(copy.providerLabel, "Profesional");
    assert.equal(copy.providerPlaceholder, "Seleccioná un profesional");
    assert.equal(copy.serviceLabel, "Servicio");
    assert.equal(copy.servicePlaceholder, "Seleccioná un servicio");
    assert.equal(copy.confirmCta, "Confirmar turno");
  }
});
