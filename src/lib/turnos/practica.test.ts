// Agenda práctica (interruptor «agenda-practica»): las reglas puras, con reloj fijo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisoDeEspera,
  fechaDelProximo,
  fechaPropuestaDelAlta,
  hrefDelProximo,
  motivoDeDevolucion,
  planSeniaAlCerrar,
  politicaDelNegocio,
  POLITICA_POR_DEFECTO,
  preguntaDeCierre,
  profesionalPropuesta,
  puedeCambiarOnline,
  reglaDeCancelacion,
} from "./practica";

test("E2 · la regla de CH es de 24 h y está marcada provisional a confirmar por el dueño", () => {
  assert.deepEqual(politicaDelNegocio("beauty-spa"), { horasMinimas: 24, provisional: true });
  assert.equal(politicaDelNegocio("otro").provisional, true);
  assert.equal(politicaDelNegocio(null), POLITICA_POR_DEFECTO);
  assert.equal(reglaDeCancelacion(politicaDelNegocio("beauty-spa")), "Podés cancelar o reprogramar online hasta 24 h antes del turno. Después, escribinos por WhatsApp.");
});

test("E2 · con 25 h de anticipación la clienta cancela sola; con 23 h, se le pide WhatsApp", () => {
  const ahora = new Date("2026-10-18T12:00:00Z");
  const politica = politicaDelNegocio("beauty-spa");
  assert.deepEqual(puedeCambiarOnline({ startsAt: new Date("2026-10-19T13:00:00Z"), ahora, politica }), { ok: true });
  assert.deepEqual(puedeCambiarOnline({ startsAt: new Date("2026-10-19T12:00:00Z"), ahora, politica }), { ok: true }, "justo 24 h: entra");
  const tarde = puedeCambiarOnline({ startsAt: new Date("2026-10-19T11:00:00Z"), ahora, politica });
  assert.equal(tarde.ok, false);
  assert.match(tarde.ok ? "" : tarde.error, /menos de 24 h.*WhatsApp/);
});

test("T4 · el alta propone mañana y, con una sola profesional, la deja elegida", () => {
  assert.equal(fechaPropuestaDelAlta("2026-10-31"), "2026-11-01");
  assert.equal(profesionalPropuesta([{ id: "laura" }]), "laura");
  assert.equal(profesionalPropuesta([{ id: "laura" }, { id: "carla" }]), "");
  assert.equal(profesionalPropuesta([]), "");
});

test("E3 · sin plata cobrada no se pregunta por la seña; con plata, hay que elegir", () => {
  assert.deepEqual(planSeniaAlCerrar({ cobrado: 0, destino: null }), { ok: true, destino: null });
  assert.deepEqual(planSeniaAlCerrar({ cobrado: 5000, destino: "retener" }), { ok: true, destino: "retener" });
  assert.deepEqual(planSeniaAlCerrar({ cobrado: 5000, destino: "devolver" }), { ok: true, destino: "devolver" });
  const sinElegir = planSeniaAlCerrar({ cobrado: 5000, destino: "" });
  assert.equal(sinElegir.ok, false);
  assert.match(sinElegir.ok ? "" : sinElegir.error, /qué pasa con la seña/);
});

test("T10 · la pregunta dice la consecuencia y el motivo de la devolución queda escrito", () => {
  assert.match(preguntaDeCierre({ accion: "cancelar", clienta: "Ana", hora: "15:00" }), /^¿Cancelar el turno de Ana de las 15:00\? El horario queda libre/);
  assert.match(preguntaDeCierre({ accion: "no-vino", clienta: "Ana", hora: "15:00" }), /faltazo/);
  assert.equal(motivoDeDevolucion("cancelar"), "Devolución de la seña: turno cancelado");
  assert.equal(motivoDeDevolucion("no-vino").length >= 4, true, "pasa el mínimo de validarMotivo");
});

test("E5 · el próximo va a un ciclo del turno de hoy, nunca antes de mañana", () => {
  assert.equal(fechaDelProximo({ dia: "2026-10-18", cicloDias: 28, hoy: "2026-10-18" }), "2026-11-15");
  assert.equal(fechaDelProximo({ dia: "2026-09-01", cicloDias: 7, hoy: "2026-10-18" }), "2026-10-19");
  assert.equal(
    hrefDelProximo({ clienteId: "cli_1", fecha: "2026-11-15" }),
    "/admin/turnos/lista?nuevo=1&fecha=2026-11-15&cliente=cli_1",
  );
});

test("E6 · el aviso de la lista de espera sólo aparece si alguien sirve", () => {
  assert.equal(avisoDeEspera({ anotadas: 0, servicio: "Masaje" }), null);
  assert.match(avisoDeEspera({ anotadas: 1, servicio: "Masaje" }) ?? "", /^Hay 1 clienta anotada en la lista de espera para Masaje/);
  assert.match(avisoDeEspera({ anotadas: 3, servicio: "Masaje" }) ?? "", /^Hay 3 clientas anotadas/);
});
