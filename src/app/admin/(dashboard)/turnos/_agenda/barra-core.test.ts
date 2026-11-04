import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Permisos, TurnoDelDia } from "../agenda-core";
import { hayBarra, modoNoVino, muestraTeclaDelPaso, teclasDeLaBarra } from "./barra-core";
import { pasoDelTurno } from "../agenda-core";

const AHORA = new Date("2026-11-04T15:00:00.000Z");
const PASADO = "2026-11-04T14:00:00.000Z";
const FUTURO = "2026-11-04T18:00:00.000Z";

const turno = (o: Partial<TurnoDelDia> = {}): TurnoDelDia => ({
  id: "t1",
  clienteId: "c1",
  inicio: PASADO,
  fin: "2026-11-04T14:45:00.000Z",
  estado: "CONFIRMED",
  clienta: "Laura Gómez",
  telefono: "11 4000 7919",
  servicio: "Peeling",
  profesional: "Ana",
  profesionalId: "p1",
  servicioId: "s1",
  box: "",
  notas: null,
  precio: 20000,
  cobrado: 0,
  condonado: 0,
  saldo: 20000,
  senia: 0,
  sugerido: { tipo: "saldo", monto: 20000 },
  cuentaACobrar: false,
  cobros: [],
  avisadaEl: null,
  veredicto: { ok: true },
  ...o,
});

const TODO: Permisos = { interaccion: true, gestionar: true, cobrar: true, terminar: true, perdonar: true, anular: "directa" };

describe("barra de un toque", () => {
  test("apagado: no hay barra", () => {
    assert.equal(teclasDeLaBarra(turno(), { ...TODO, interaccion: false }, AHORA), null);
    assert.equal(teclasDeLaBarra(turno(), { ...TODO, interaccion: undefined }, AHORA), null);
    assert.equal(hayBarra(null), false);
  });

  test("prendido, ya empezó, sin seña: No vino directo, Cobrar a «terminar», WhatsApp con saludo", () => {
    const b = teclasDeLaBarra(turno(), TODO, AHORA);
    assert.ok(b);
    assert.equal(b.noVino, "directo");
    assert.deepEqual(b.cobrar, { que: "terminar", monto: 20000 });
    assert.match(b.whatsapp ?? "", /^https:\/\/wa\.me\/549/);
    assert.match(decodeURIComponent(b.whatsapp ?? ""), /Hola Laura/);
  });

  test("con seña cobrada: No vino abre la hoja (hay que decidir la plata)", () => {
    const b = teclasDeLaBarra(turno({ cobrado: 5000, saldo: 15000 }), TODO, AHORA);
    assert.equal(b?.noVino, "hoja");
    assert.equal(modoNoVino({ cobrado: 0 }), "directo");
  });

  test("Reservado pasado: Cobrar abre «terminar» (vino y cobra en una)", () => {
    const b = teclasDeLaBarra(turno({ estado: "PENDING" }), TODO, AHORA);
    assert.deepEqual(b?.cobrar, { que: "terminar", monto: 20000 });
    assert.equal(b?.noVino, "directo");
  });

  test("terminado debiendo: Cobrar abre «cobrar»; sin No vino", () => {
    const b = teclasDeLaBarra(turno({ estado: "COMPLETED", cuentaACobrar: true }), TODO, AHORA);
    assert.deepEqual(b?.cobrar, { que: "cobrar", monto: 20000 });
    assert.equal(b?.noVino, null);
  });

  test("turno futuro: ni No vino ni Cobrar; WhatsApp sí", () => {
    const b = teclasDeLaBarra(turno({ inicio: FUTURO, fin: "2026-11-04T19:00:00.000Z" }), TODO, AHORA);
    assert.equal(b?.noVino, null);
    assert.equal(b?.cobrar, null);
    assert.ok(b?.whatsapp);
    assert.equal(hayBarra(b), true);
  });

  test("rol sin capability: sin agenda:complete no hay No vino; sin agenda:collect no hay Cobrar", () => {
    const sinTerminar = teclasDeLaBarra(turno(), { ...TODO, terminar: false }, AHORA);
    assert.equal(sinTerminar?.noVino, null);
    assert.equal(sinTerminar?.cobrar, null);
    const sinCobrar = teclasDeLaBarra(turno(), { ...TODO, cobrar: false }, AHORA);
    assert.equal(sinCobrar?.noVino, "directo");
    assert.equal(sinCobrar?.cobrar, null);
    const vetado = teclasDeLaBarra(turno({ veredicto: { ok: false, motivo: "lo cobra la profesional" } }), TODO, AHORA);
    assert.equal(vetado?.cobrar, null);
  });

  test("sin teléfono válido: no hay WhatsApp; sin nada, no hay barra", () => {
    const b = teclasDeLaBarra(turno({ telefono: "", inicio: FUTURO }), TODO, AHORA);
    assert.equal(b?.whatsapp, null);
    assert.equal(hayBarra(b), false);
  });

  test("con la barra, la tecla de siempre no repite Cobrar; Terminar sin cobro queda", () => {
    const t = turno();
    const b = teclasDeLaBarra(t, TODO, AHORA);
    assert.equal(muestraTeclaDelPaso(pasoDelTurno(t, TODO, AHORA), b), false);
    const saldado = turno({ saldo: 0, cobrado: 20000 });
    assert.equal(muestraTeclaDelPaso(pasoDelTurno(saldado, TODO, AHORA), teclasDeLaBarra(saldado, TODO, AHORA)), true);
    assert.equal(muestraTeclaDelPaso(pasoDelTurno(t, TODO, AHORA), null), true);
  });
});
