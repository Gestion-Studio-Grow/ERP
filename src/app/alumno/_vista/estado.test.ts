// Lo puro de «Mis clases» (T3C): chip de estado, hora relativa, plazo para cancelar gratis, cuánto
// se ve una clase que ya no va, y la línea de la cuenta. «Ahora» fijo: viernes 23/10/2026 12:00 AR.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chipEstado, enCuanto, etiquetaPago, explicacionTerminal, lineaDeCuenta, plazoCancelar, reglaDeCancelacion, terminalVisible, textoAnticipacion, urlMaps, type ClaseVista } from "./estado";
import { seleccionInicial, esPdf, esIosSinInstalar, type ItemPago } from "./puro";

const AHORA = new Date("2026-10-23T15:00:00.000Z"); // 12:00 en Buenos Aires
const h = (horas: number) => new Date(AHORA.getTime() + horas * 3_600_000);
const clase = (p: Partial<ClaseVista>): ClaseVista => ({
  id: "c1",
  empiezaEn: h(6),
  terminaEn: h(7),
  estado: "CONFIRMADA",
  pagoEstado: "PENDIENTE",
  pagoMedio: null,
  precio: 25000,
  motivoCancel: null,
  ...p,
});

test("M-099: pedida y confirmada llevan ícono y texto distintos, con hora relativa", () => {
  const p = chipEstado("PEDIDA", "Matías");
  const c = chipEstado("CONFIRMADA", "Matías");
  assert.equal(p.texto, "Esperando a Matías");
  assert.equal(p.icono, "⏳");
  assert.equal(c.icono, "✓");
  assert.notEqual(p.icono, c.icono);
  assert.equal(enCuanto(h(20), AHORA), "en 20 h");
  assert.equal(enCuanto(new Date(AHORA.getTime() + 45 * 60_000), AHORA), "en 45 min");
  assert.equal(enCuanto(h(72), AHORA), "en 3 días");
  assert.equal(enCuanto(h(-1), AHORA), "ya empezó");
});

test("M-100: rechazada y vencida dicen por qué", () => {
  assert.equal(chipEstado("RECHAZADA", "Matías").texto, "Matías no puede ese horario");
  assert.equal(chipEstado("SIN_RESPUESTA", "Matías").texto, "Matías no llegó a confirmarte");
  assert.equal(chipEstado("RECHAZADA", "Matías").tono, "fin");
});

test("M-103: a 3 h con regla de 2 h, «gratis hasta las 13:00» (hoy); otro día dice el día", () => {
  const hoy = plazoCancelar(clase({ empiezaEn: h(3) }), AHORA, 120);
  assert.deepEqual(hoy, { puede: true, texto: "gratis hasta las 13:00" });
  const otro = plazoCancelar(clase({ empiezaEn: h(30) }), AHORA, 120);
  assert.equal(otro.puede, true);
  assert.match(otro.texto, /^gratis hasta el sáb 24 a las 16:00$/);
  assert.equal(plazoCancelar(clase({ empiezaEn: h(3) }), AHORA, 0).texto, "gratis hasta que empiece");
});

test("M-104/M-107: a 90 min con regla de 2 h no se cancela gratis y dice la regla", () => {
  const p = plazoCancelar(clase({ empiezaEn: new Date(AHORA.getTime() + 90 * 60_000) }), AHORA, 120);
  assert.equal(p.puede, false);
  assert.equal(p.texto, "Ya pasó el límite para cancelar o cambiar gratis (2 h antes).");
});

test("una clase dada no se cancela desde el link", () => {
  assert.equal(plazoCancelar(clase({ estado: "DADA", empiezaEn: h(10) }), AHORA, 120).puede, false);
});

test("M-027/M-100: lo que ya no va se ve 48 h desde que cambió, no más", () => {
  assert.equal(terminalVisible(clase({ estado: "RECHAZADA", rechazadaEl: h(-47), empiezaEn: h(100) }), AHORA), true);
  assert.equal(terminalVisible(clase({ estado: "RECHAZADA", rechazadaEl: h(-49), empiezaEn: h(100) }), AHORA), false);
  assert.equal(terminalVisible(clase({ estado: "SIN_RESPUESTA", empiezaEn: h(-10) }), AHORA), true);
  assert.equal(terminalVisible(clase({ estado: "SIN_RESPUESTA", empiezaEn: h(-50) }), AHORA), false);
  assert.equal(terminalVisible(clase({ estado: "CANCELADA", canceladaEl: h(-1) }), AHORA), true);
  // Viva o dada: no es «ya no va».
  assert.equal(terminalVisible(clase({ estado: "CONFIRMADA" }), AHORA), false);
  assert.equal(terminalVisible(clase({ estado: "DADA", empiezaEn: h(-2) }), AHORA), false);
});

test("M-101: cancelada pagada dice que la plata quedó a favor", () => {
  const t = explicacionTerminal(clase({ estado: "CANCELADA", pagoEstado: "ACREDITADO", motivoCancel: "Lluvia" }), "Matías");
  assert.match(t, /^Matías la canceló · Lluvia\. Lo que pagaste \(\$ 25\.000\) quedó a favor/);
  assert.equal(explicacionTerminal(clase({ estado: "CANCELADA", motivoCancel: "La canceló el alumno" }), "Matías"), "La cancelaste vos. Matías ya lo sabe.");
  assert.equal(explicacionTerminal(clase({ estado: "CANCELADA", motivoCancel: "La canceló el profe" }), "Matías"), "Matías la canceló.");
});

test("la cuenta: lo que debe manda; si no, el saldo; si no, al día", () => {
  assert.deepEqual(lineaDeCuenta({ debe: 50000, clasesQueDebe: 2, saldoAFavor: 0 }), { titulo: "Debés $ 50.000 · 2 clases", tono: "debe" });
  assert.deepEqual(lineaDeCuenta({ debe: 25000, clasesQueDebe: 1, saldoAFavor: 0 }).titulo, "Debés $ 25.000 · 1 clase");
  assert.deepEqual(lineaDeCuenta({ debe: 0, clasesQueDebe: 0, saldoAFavor: 25000 }), { titulo: "Tenés $ 25.000 a favor", tono: "favor" });
  assert.deepEqual(lineaDeCuenta({ debe: 0, clasesQueDebe: 0, saldoAFavor: 0 }), { titulo: "Estás al día ✓", tono: "al-dia" });
});

test("M-090: la regla de cancelación en criollo", () => {
  assert.equal(textoAnticipacion(120), "2 h");
  assert.equal(textoAnticipacion(90), "1 h 30 min");
  assert.equal(textoAnticipacion(1440), "1 día");
  assert.equal(textoAnticipacion(30), "30 min");
  assert.equal(reglaDeCancelacion(120), "Cancelás gratis hasta 2 h antes");
  assert.equal(reglaDeCancelacion(0), "Cancelás gratis hasta que empiece");
});

test("pago: etiqueta con el medio, Maps con la dirección", () => {
  assert.equal(etiquetaPago(clase({ pagoEstado: "PAGADO", pagoMedio: "EFECTIVO" })), "Pagada · efectivo");
  assert.equal(etiquetaPago(clase({ pagoEstado: "PENDIENTE" })), "Sin pagar");
  assert.equal(etiquetaPago(clase({ precio: 0 })), "Sin cargo");
  assert.equal(urlMaps("Club Norte, Canning"), "https://www.google.com/maps/search/?api=1&query=Club%20Norte%2C%20Canning");
  assert.equal(urlMaps("  "), null);
});

test("M-109: un comprobante arranca tildando todo lo que debe; si no debe, la próxima a adelantar", () => {
  const it = (id: string, deuda: boolean, enRevision = false): ItemPago => ({ id, cuando: id, precio: 25000, deuda, enRevision, nota: null });
  assert.deepEqual(seleccionInicial([it("a", true), it("b", true), it("c", false)]), ["a", "b"]);
  assert.deepEqual(seleccionInicial([it("c", false), it("d", false)]), ["c"]);
  assert.deepEqual(seleccionInicial([it("e", false, true)]), ["e"]);
});

test("PDF: se detecta por tipo o por nombre (se pide una captura)", () => {
  assert.equal(esPdf({ type: "application/pdf", name: "x" }), true);
  assert.equal(esPdf({ type: "", name: "Comprobante.PDF" }), true);
  assert.equal(esPdf({ type: "image/jpeg", name: "foto.jpg" }), false);
});

test("M-111: los pasos de Safari sólo en iPhone/iPad con Safari y sin instalar", () => {
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  assert.equal(esIosSinInstalar(safari, false), true);
  assert.equal(esIosSinInstalar(safari, true), false);
  assert.equal(esIosSinInstalar(safari.replace("Version/17.0", "CriOS/120.0"), false), false);
  assert.equal(esIosSinInstalar("Mozilla/5.0 (Linux; Android 14) Chrome/120", false), false);
});
