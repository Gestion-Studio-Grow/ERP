// Tests de la copy rubro-aware del flujo de reserva de agenda. Config pura, patrón
// node:test. Blindan que la copy caiga al wording histórico para los rubros que NO
// definen voz propia (los tenants de turnos existentes no cambian ni una palabra en
// /reserva), y que el resolver por slug sea seguro sin mapeos.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAgendaRubroIdBySlug,
  agendaBookingCopyFor,
  agendaBookingCopyForSlug,
} from "./rubros";

test("resolveAgendaRubroIdBySlug: slug sin mapeo → null (seguro)", () => {
  assert.equal(resolveAgendaRubroIdBySlug("cualquier-tenant"), null);
  assert.equal(resolveAgendaRubroIdBySlug(null), null);
  assert.equal(resolveAgendaRubroIdBySlug(undefined), null);
});

test("copy fallback (rubro sin voz propia): wording histórico intacto", () => {
  // Un tenant sin rubro, o con un rubro que no define bookingTitle/serviceNoun, debe
  // ver EXACTAMENTE la copy vieja de /reserva (backward-compat CH Estética).
  for (const copy of [
    agendaBookingCopyFor(null),
    agendaBookingCopyFor("estetica"),
    agendaBookingCopyForSlug("cualquier-tenant"),
  ]) {
    assert.equal(copy.title, "Reservá tu turno");
    assert.equal(copy.providerLabel, "Profesional");
    assert.equal(copy.providerPlaceholder, "Seleccioná un profesional");
    assert.equal(copy.serviceLabel, "Servicio");
    assert.equal(copy.servicePlaceholder, "Seleccioná un servicio");
    assert.equal(copy.confirmCta, "Confirmar turno");
  }
});

test("taller (AGR): el turno habla de mecánico y trabajo, no de profesional", () => {
  assert.equal(resolveAgendaRubroIdBySlug("agr"), "taller");
  assert.equal(resolveAgendaRubroIdBySlug("taller-agr"), "taller");
  for (const copy of [agendaBookingCopyForSlug("agr"), agendaBookingCopyForSlug("taller-agr")]) {
    assert.equal(copy.title, "Sacá turno");
    assert.equal(copy.providerLabel, "Mecánico");
    assert.equal(copy.providerPlaceholder, "Seleccioná un mecánico");
    assert.equal(copy.serviceLabel, "Trabajo");
    assert.equal(copy.servicePlaceholder, "Seleccioná un trabajo");
    assert.equal(copy.summaryProviderLabel, "Mecánico");
    assert.equal(copy.confirmCta, "Confirmar turno");
  }
  // Los demás negocios no cambian.
  assert.equal(agendaBookingCopyForSlug("beauty-spa").providerLabel, "Profesional");
  assert.equal(agendaBookingCopyForSlug("chestetica").providerLabel, "Profesional");
});
