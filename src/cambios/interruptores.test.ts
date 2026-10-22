// ============================================================================
// INTERRUPTOR «mostrador-boutique» — el catálogo y la lectura, EJECUTADOS.
// ============================================================================
//
// Reingeniería de Magra, Tanda 1 · agente 1G. Todo lo nuevo del mostrador (pie de cobro, campo
// único, cliente con CUIT, envío con costo, Armar) se prende con este interruptor, por negocio.
// Lo que se cuida acá: que exista en el catálogo con su texto para la consola y la Auditoría, que
// arranque APAGADO en todo negocio (CH incluido), que sólo una fila de la consola lo prenda (una
// fila forjada desde la app de un negocio no) y que la última fila válida mande.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCION_APAGAR,
  ACCION_ENCENDER,
  CANAL_INTERRUPTOR,
  ENTIDAD_INTERRUPTOR,
  INTERRUPTORES,
  MOSTRADOR_BOUTIQUE,
  esInterruptorId,
  interruptorPorId,
  mostradorBoutiquePrendido,
  textoDeInterruptorEnAuditoria,
} from "./interruptores";
import { estadoDesdeFilas, filtroDeFilasValidas, todosApagados, type FilaLeida } from "./interruptores-core";

let n = 0;
function fila(p: Partial<FilaLeida> & { action: string; createdAt: Date }): FilaLeida {
  n += 1;
  return {
    id: `f${String(n).padStart(3, "0")}`,
    entity: ENTIDAD_INTERRUPTOR,
    entityId: MOSTRADOR_BOUTIQUE,
    actor: "operator:facu",
    channel: CANAL_INTERRUPTOR,
    ...p,
  };
}

test("«mostrador-boutique» está en el catálogo, con su texto para la consola y la Auditoría", () => {
  assert.equal(MOSTRADOR_BOUTIQUE, "mostrador-boutique");
  assert.ok(esInterruptorId("mostrador-boutique"));
  assert.equal(INTERRUPTORES.filter((i) => i.id === MOSTRADOR_BOUTIQUE).length, 1, "un solo renglón con ese id");
  const i = interruptorPorId(MOSTRADOR_BOUTIQUE);
  assert.equal(i.nombre, "Mostrador boutique");
  assert.match(i.queCambia, /Apagado, el mostrador de siempre\./, "la ficha dice qué pasa apagado");
  // Cambia cómo se vende, no qué apps ve cada persona: no exige la vista previa de apps.
  assert.equal(i.cambiaLasApps, false);
});

test("los ids del catálogo no se repiten (el nuevo no pisa a ninguno)", () => {
  const ids = INTERRUPTORES.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("arranca apagado en todo negocio: sin filas, CH y Magra ven el mostrador de siempre", () => {
  assert.equal(mostradorBoutiquePrendido(todosApagados()), false);
  assert.equal(mostradorBoutiquePrendido(estadoDesdeFilas([])), false);
});

test("un estado sin la entrada cuenta como apagado: lo nuevo nunca se prende por un hueco", () => {
  assert.equal(mostradorBoutiquePrendido({}), false);
  assert.equal(mostradorBoutiquePrendido({ "diseno-nuevo": { encendido: true } }), false);
});

test("la consola lo prende y lo apaga: manda la última fila válida", () => {
  const prendido = estadoDesdeFilas([fila({ action: ACCION_ENCENDER, createdAt: new Date("2026-10-22T10:00:00Z") })]);
  assert.equal(mostradorBoutiquePrendido(prendido), true);
  assert.equal(prendido[MOSTRADOR_BOUTIQUE].quien, "facu");

  const apagadoDespues = estadoDesdeFilas([
    fila({ action: ACCION_ENCENDER, createdAt: new Date("2026-10-22T10:00:00Z") }),
    fila({ action: ACCION_APAGAR, createdAt: new Date("2026-10-22T11:00:00Z") }),
  ]);
  assert.equal(mostradorBoutiquePrendido(apagadoDespues), false);
});

test("prenderlo no prende ningún otro interruptor", () => {
  const e = estadoDesdeFilas([fila({ action: ACCION_ENCENDER, createdAt: new Date("2026-10-22T10:00:00Z") })]);
  for (const i of INTERRUPTORES) if (i.id !== MOSTRADOR_BOUTIQUE) assert.equal(e[i.id].encendido, false, i.id);
});

test("una fila forjada desde la app del negocio (canal admin, actor sin operador) no lo prende", () => {
  const forjadas = [
    fila({ action: ACCION_ENCENDER, channel: "admin", createdAt: new Date("2026-10-22T12:00:00Z") }),
    fila({ action: ACCION_ENCENDER, actor: "user:dueno@magra", createdAt: new Date("2026-10-22T12:00:00Z") }),
    fila({ action: ACCION_ENCENDER, actor: "operator:", createdAt: new Date("2026-10-22T12:00:00Z") }),
  ];
  assert.equal(mostradorBoutiquePrendido(estadoDesdeFilas(forjadas)), false);
});

test("la consulta de la consola y del panel lo trae (está en el filtro de filas válidas)", () => {
  const f = filtroDeFilasValidas("t-magra");
  assert.ok(f.entityId.in.includes(MOSTRADOR_BOUTIQUE));
  assert.equal(f.tenantId, "t-magra");
});

test("la Auditoría del negocio lo nombra sin el operador: «GSG activó el mostrador boutique»", () => {
  const base = { entity: ENTIDAD_INTERRUPTOR, entityId: MOSTRADOR_BOUTIQUE, actor: "operator:facu", channel: CANAL_INTERRUPTOR };
  assert.equal(textoDeInterruptorEnAuditoria({ ...base, action: ACCION_ENCENDER }), "GSG activó el mostrador boutique");
  assert.equal(textoDeInterruptorEnAuditoria({ ...base, action: ACCION_APAGAR }), "GSG apagó el mostrador boutique");
});
