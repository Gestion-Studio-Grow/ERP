// E4 (clubes) + E8 (clase fija semanal): las reglas puras de core.ts y config-campos.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caeEnBloqueo,
  clasesQueFaltan,
  clubDeHora,
  corteDeSerie,
  fechasDeSerie,
  franjasLibres,
  linkDeMapsValido,
  nombreDeClub,
  pagoAlCancelar,
  plantillaConClub,
  armarMensaje,
  PLANTILLAS_DEFAULT,
  semanasDeSerie,
  textoSerie,
  type Franja,
} from "./core";
import { validarTramos } from "./config-campos";
import { aTramos, cambiarClub, iguales, semanaDesde } from "@/app/admin/(dashboard)/clases/config/horarios/grilla";

const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);
// 2026-11-10 es martes.
const MARTES = "2026-11-10";

test("semanasDeSerie: lo que muestra el turnero redondeado para arriba, mínimo 4", () => {
  assert.equal(semanasDeSerie(14), 4);
  assert.equal(semanasDeSerie(0), 4);
  assert.equal(semanasDeSerie(30), 5);
  assert.equal(semanasDeSerie(42), 6);
  assert.equal(semanasDeSerie(43), 7);
});

test("fechasDeSerie: cada 7 días desde `desde`, sin pasar el horizonte ni el corte, y no antes del piso", () => {
  assert.deepEqual(fechasDeSerie({ desde: MARTES, horizonte: "2026-12-07" }), ["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"]);
  // Horizonte inclusive.
  assert.deepEqual(fechasDeSerie({ desde: MARTES, horizonte: "2026-11-24" }), ["2026-11-10", "2026-11-17", "2026-11-24"]);
  // Corte de la serie (hasta, inclusive) antes del horizonte.
  assert.deepEqual(fechasDeSerie({ desde: MARTES, horizonte: "2026-12-31", hasta: "2026-11-23" }), ["2026-11-10", "2026-11-17"]);
  // Piso: las que ya pasaron no.
  assert.deepEqual(fechasDeSerie({ desde: MARTES, horizonte: "2026-12-01", piso: "2026-11-18" }), ["2026-11-24", "2026-12-01"]);
  // Cruza fin de año y de mes sin correrse de día.
  assert.deepEqual(fechasDeSerie({ desde: "2026-12-22", horizonte: "2027-01-12" }), ["2026-12-22", "2026-12-29", "2027-01-05", "2027-01-12"]);
  assert.deepEqual(fechasDeSerie({ desde: "basura", horizonte: "2027-01-12" }), []);
});

test("clasesQueFaltan: hora de Argentina, idempotente y nunca re-crea una que ya existió (aunque esté cancelada)", () => {
  const serie = { desde: MARTES, hora: "18:00", hasta: null };
  const todas = clasesQueFaltan({ serie, existentes: [], horizonte: "2026-12-07", piso: MARTES });
  assert.deepEqual(todas.map((d) => d.toISOString()), ["2026-11-10T21:00:00.000Z", "2026-11-17T21:00:00.000Z", "2026-11-24T21:00:00.000Z", "2026-12-01T21:00:00.000Z"]);
  // Segunda pasada con las creadas: nada.
  assert.deepEqual(clasesQueFaltan({ serie, existentes: todas, horizonte: "2026-12-07", piso: MARTES }), []);
  // El horizonte avanzó una semana: sólo la nueva.
  assert.deepEqual(clasesQueFaltan({ serie, existentes: todas, horizonte: "2026-12-14", piso: MARTES }).map((d) => d.toISOString()), ["2026-12-08T21:00:00.000Z"]);
  // La del 24 se canceló (sigue existiendo con su serieId): no vuelve a nacer.
  const conCancelada = [todas[0], todas[1], todas[2]];
  assert.deepEqual(clasesQueFaltan({ serie, existentes: conCancelada, horizonte: "2026-11-24", piso: MARTES }), []);
  // Sólo después de la última existente: una salteada del medio (choque) no se reintenta.
  assert.deepEqual(clasesQueFaltan({ serie, existentes: [todas[0], todas[2]], horizonte: "2026-11-24", piso: MARTES }), []);
  // Serie cortada: nada después del corte.
  assert.deepEqual(clasesQueFaltan({ serie: { ...serie, hasta: "2026-11-16" }, existentes: [todas[0]], horizonte: "2026-12-31", piso: MARTES }), []);
  assert.deepEqual(clasesQueFaltan({ serie: { ...serie, hora: "25:00" }, existentes: [], horizonte: "2026-12-31", piso: MARTES }), []);
});

test("corteDeSerie y textoSerie", () => {
  assert.equal(corteDeSerie("2026-11-24"), "2026-11-23");
  assert.equal(corteDeSerie("2027-01-01"), "2026-12-31");
  assert.equal(textoSerie({ diaSemana: 2, hora: "18:00" }), "Todos los martes a las 18:00");
  assert.equal(textoSerie({ diaSemana: 6, hora: "09:30" }), "Todos los sábados a las 09:30");
});

test("cancelar la serie: lo pagado queda a favor, lo no pagado no se toca, lo pagado con saldo vuelve al saldo", () => {
  assert.deepEqual(pagoAlCancelar({ pagoEstado: "PAGADO", pagoMedio: "EFECTIVO" }), { pagoEstado: "ACREDITADO" });
  assert.deepEqual(pagoAlCancelar({ pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR" }), { pagoEstado: "PENDIENTE", pagoMedio: null });
  assert.equal(pagoAlCancelar({ pagoEstado: "PENDIENTE" }), null);
});

// ── Clubes en franjas y bloqueos ─────────────────────────────────────────────

const franjas: Franja[] = [
  { diaSemana: 2, fecha: null, desde: "08:00", hasta: "10:00", tipo: "DA", clubId: "norte" },
  { diaSemana: 2, fecha: null, desde: "18:00", hasta: "20:00", tipo: "DA", clubId: "sur" },
  { diaSemana: 2, fecha: null, desde: "20:00", hasta: "21:00", tipo: "DA" },
];
const base = { fecha: MARTES, ocupadas: [], duracionMin: 60, anticipacionMin: 0, ahora: new Date("2026-11-01T00:00:00Z") };

test("clubDeHora: la hora hereda el club de su franja; sin club o fuera de grilla, null", () => {
  assert.equal(clubDeHora(MARTES, franjas, aLas(MARTES, "08:00")), "norte");
  assert.equal(clubDeHora(MARTES, franjas, aLas(MARTES, "09:00")), "norte");
  assert.equal(clubDeHora(MARTES, franjas, aLas(MARTES, "19:00")), "sur");
  assert.equal(clubDeHora(MARTES, franjas, aLas(MARTES, "20:00")), null);
  assert.equal(clubDeHora(MARTES, franjas, aLas(MARTES, "12:00")), null);
  assert.equal(clubDeHora("2026-11-11", franjas, aLas("2026-11-11", "08:00")), null);
});

test("un bloqueo de un club frena sólo ese club; uno sin club frena todo (como antes)", () => {
  const todas = franjasLibres({ ...base, franjas });
  assert.equal(todas.length, 5);
  const soloNorte = franjasLibres({ ...base, franjas: [...franjas, { diaSemana: null, fecha: MARTES, desde: "00:00", hasta: "23:59", tipo: "NO", clubId: "norte" }] });
  assert.deepEqual(soloNorte, todas.filter((iso) => clubDeHora(MARTES, franjas, new Date(iso)) !== "norte"));
  const todoElDia = franjasLibres({ ...base, franjas: [...franjas, { diaSemana: null, fecha: MARTES, desde: "00:00", hasta: "23:59", tipo: "NO" }] });
  assert.deepEqual(todoElDia, []);
  // Sin clubes en ningún lado: exactamente lo de antes.
  const sinClub = franjas.map((f) => ({ ...f, clubId: null }));
  assert.deepEqual(franjasLibres({ ...base, franjas: sinClub }), todas);
});

test("caeEnBloqueo: el del mismo club y el general cuentan; el de otro club no", () => {
  const conBloqueo = (clubId?: string): Franja[] => [...franjas, { diaSemana: null, fecha: MARTES, desde: "17:00", hasta: "22:00", tipo: "NO", clubId: clubId ?? null }];
  const e = aLas(MARTES, "18:00");
  const t = aLas(MARTES, "19:00");
  assert.equal(caeEnBloqueo(MARTES, conBloqueo(), e, t, "sur"), true);
  assert.equal(caeEnBloqueo(MARTES, conBloqueo("sur"), e, t, "sur"), true);
  assert.equal(caeEnBloqueo(MARTES, conBloqueo("norte"), e, t, "sur"), false);
  assert.equal(caeEnBloqueo(MARTES, conBloqueo("norte"), e, t, null), false);
  assert.equal(caeEnBloqueo(MARTES, franjas, e, t, "sur"), false);
  assert.equal(caeEnBloqueo("2026-11-17", conBloqueo(), aLas("2026-11-17", "18:00"), aLas("2026-11-17", "19:00")), false);
});

// ── WhatsApp con {club} ──────────────────────────────────────────────────────

test("plantillaConClub: sin club no cambia nada; con club va después de la hora o donde el profe puso {club}", () => {
  for (const t of Object.values(PLANTILLAS_DEFAULT)) assert.equal(plantillaConClub(t, false), t);
  const p = plantillaConClub(PLANTILLAS_DEFAULT.proxima, true);
  assert.equal(
    armarMensaje(p, { nombre: "Juan", dia: "martes 10/11", hora: "18:00", club: "Club Norte", link: "L" }),
    "Hola Juan! Te agendé la próxima clase: martes 10/11 a las 18:00 en Club Norte. Si no podés, cancelala desde tu link: L",
  );
  // Editada por el profe con {club}: va donde la puso, una sola vez.
  const editada = "Nos vemos en {club} el {dia} {hora}";
  assert.equal(plantillaConClub(editada, true), editada);
  // Editada vieja sin {hora}: no se inventa nada.
  assert.equal(plantillaConClub("Gracias {nombre}!", true), "Gracias {nombre}!");
});

test("nombreDeClub y linkDeMapsValido", () => {
  assert.equal(nombreDeClub("  Club   Norte "), "Club Norte");
  assert.equal(nombreDeClub("x"), null);
  assert.equal(nombreDeClub("a".repeat(61)), null);
  assert.deepEqual(linkDeMapsValido(""), { ok: true, url: null });
  assert.deepEqual(linkDeMapsValido("https://maps.app.goo.gl/abc"), { ok: true, url: "https://maps.app.goo.gl/abc" });
  assert.deepEqual(linkDeMapsValido("javascript:alert(1)"), { ok: false });
  assert.deepEqual(linkDeMapsValido("http://maps.google.com"), { ok: false });
  assert.deepEqual(linkDeMapsValido("no es un link"), { ok: false });
});

// ── Horarios con club ────────────────────────────────────────────────────────

test("horarios: el club de cada tramo viaja de la grilla a la validación y vuelve", () => {
  const s = semanaDesde([
    { diaSemana: 2, desde: "08:00", hasta: "12:00", fecha: null, tipo: "DA", clubId: "norte" },
    { diaSemana: 2, desde: "16:00", hasta: "21:00", fecha: null, tipo: "DA" },
  ]);
  assert.deepEqual(aTramos(s), [
    { diaSemana: 2, desde: "08:00", hasta: "12:00", clubId: "norte" },
    { diaSemana: 2, desde: "16:00", hasta: "21:00" },
  ]);
  const cambiada = cambiarClub(s, 2, 1, "sur");
  assert.equal(iguales(s, cambiada), false);
  assert.equal(iguales(cambiarClub(cambiada, 2, 1, null), s), true);
  const v = validarTramos(aTramos(cambiada));
  assert.ok(v.ok);
  assert.deepEqual(v.ok && v.tramos.map((t) => t.clubId ?? null), ["norte", "sur"]);
  // Un id con forma rara no pasa (la pertenencia al negocio la mira la acción).
  assert.equal(validarTramos([{ diaSemana: 1, desde: "08:00", hasta: "09:00", clubId: "'; drop" }]).ok, false);
  assert.equal(validarTramos([{ diaSemana: 1, desde: "08:00", hasta: "09:00", clubId: "" }]).ok, true);
});
