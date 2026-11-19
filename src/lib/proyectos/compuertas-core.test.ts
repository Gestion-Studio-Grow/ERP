// MIA-50 T02 · O03: al pasar de etapa, lo que falta según la compuerta (Dis. § 2.2). Esperados escritos a mano antes del
// código: la lista exacta de lo que falta, y si frena (sólo cuando la etapa que se deja tiene la compuerta en «frena»).

import { test } from "node:test";
import assert from "node:assert/strict";
import { defDe, type EtapaParam } from "./parametros/catalogo";
import { evaluarPase, type HechosDelPase } from "./compuertas-core";

const lista = defDe("etapas.lista").rubro;
const AHORA = new Date("2026-11-18T15:00:00-03:00");
const vacio: HechosDelPase = { brief: "", responsable: null, aprobada: false, finEvento: null, rendicionesPendientes: 0 };
const completo: HechosDelPase = { brief: "Stand de 6 × 3", responsable: "Ana", aprobada: true, finEvento: new Date("2026-11-10T23:00:00-03:00"), rendicionesPendientes: 0 };
const ids = (origen: string, destino: string, h: HechosDelPase, l: EtapaParam[] = lista) => evaluarPase(l, origen, destino, h, AHORA).faltan.map((f) => f.id);
const conFrena = (id: string): EtapaParam[] => lista.map((e) => (e.id === id ? { ...e, compuerta: "FRENA" } : e));

test("O03 · Brief → Comercial: brief cargado y responsable asignado", () => {
  assert.deepEqual(ids("PEDIDO", "DISENO", vacio), ["brief", "responsable"]);
  assert.deepEqual(ids("PEDIDO", "DISENO", { ...vacio, brief: "   " }), ["brief", "responsable"], "un brief de espacios no cuenta");
  assert.deepEqual(ids("PEDIDO", "DISENO", completo), []);
});

test("O03 · Comercial → Producción: el cliente aprobó una versión", () => {
  assert.deepEqual(ids("PROPUESTA", "APROBADO", { ...completo, aprobada: false }), ["aprobacion"]);
  assert.deepEqual(ids("PROPUESTA", "APROBADO", completo), []);
});

test("O03 · Producción → Cierre: evento terminado y gastos de campo rendidos; la lista dice cuántos", () => {
  const p = evaluarPase(lista, "DESARME", "CIERRE", { ...completo, finEvento: new Date("2026-11-20T23:00:00-03:00"), rendicionesPendientes: 2 }, AHORA);
  assert.deepEqual(p.faltan.map((f) => f.id), ["evento", "rendiciones"]);
  assert.match(p.faltan[1].texto, /2 /);
  assert.deepEqual(ids("DESARME", "CIERRE", { ...completo, finEvento: null }), ["evento"], "sin fecha, el evento no consta como terminado");
  assert.deepEqual(ids("DESARME", "CIERRE", completo), []);
});

test("O03 · saltear etapas suma las compuertas que cruza; dentro de una etapa, hacia atrás o a la misma, no hay compuerta", () => {
  assert.deepEqual(ids("PEDIDO", "APROBADO", vacio), ["brief", "responsable", "aprobacion"]);
  assert.deepEqual(ids("PEDIDO", "CIERRE", vacio), ["brief", "responsable", "aprobacion", "evento"]);
  assert.deepEqual(ids("RENDER", "PRESUPUESTO", vacio), [], "dentro de Comercial");
  assert.deepEqual(ids("CIERRE", "PRODUCCION", vacio), [], "hacia atrás");
  assert.deepEqual(ids("ARMADO", "ARMADO", vacio), []);
});

test("O03 · avisa y no frena con el valor del rubro; frena sólo la etapa que se deja con «frena»", () => {
  assert.equal(evaluarPase(lista, "PROPUESTA", "APROBADO", vacio, AHORA).frena, false);
  const l = conFrena("COMERCIAL");
  assert.equal(evaluarPase(l, "PROPUESTA", "APROBADO", vacio, AHORA).frena, true);
  assert.equal(evaluarPase(l, "PEDIDO", "DISENO", vacio, AHORA).frena, false, "Brief sigue avisando");
  assert.equal(evaluarPase(l, "PROPUESTA", "APROBADO", completo, AHORA).frena, false, "sin faltantes no frena");
  const salto = evaluarPase(l, "PEDIDO", "APROBADO", { ...completo, aprobada: false }, AHORA);
  assert.deepEqual(salto.faltan.map((f) => [f.id, f.etapa]), [["aprobacion", "COMERCIAL"]]);
  assert.equal(salto.frena, true);
});

test("O03 · con otra agrupación, la compuerta se mide al cruzar de etapa y la pone la etapa que se deja", () => {
  const otra: EtapaParam[] = [
    { id: "A", nombre: "Venta", estados: ["PEDIDO", "DISENO", "RENDER", "PRESUPUESTO"], compuerta: "AVISA" },
    { id: "B", nombre: "Obra", estados: ["PROPUESTA", "APROBADO", "PRODUCCION", "ARMADO"], compuerta: "FRENA" },
    { id: "C", nombre: "Fin", estados: ["DESARME", "CIERRE"], compuerta: "AVISA" },
  ];
  assert.deepEqual(ids("PEDIDO", "DISENO", vacio, otra), [], "Pedido → Desglose queda dentro de A");
  assert.deepEqual(ids("PROPUESTA", "APROBADO", vacio, otra), [], "dentro de B");
  const p = evaluarPase(otra, "ARMADO", "CIERRE", { ...completo, rendicionesPendientes: 1 }, AHORA);
  assert.deepEqual(p.faltan.map((f) => [f.id, f.etapa]), [["rendiciones", "B"]]);
  assert.equal(p.frena, true, "B frena");
});
