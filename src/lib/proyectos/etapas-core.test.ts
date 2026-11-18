// MIA-50 T02 · O01: las etapas del tablero agrupan los 10 estados. Esperados escritos a mano antes del código.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ETAPAS } from "./core";
import { defDe } from "./parametros/catalogo";
import { agruparPorEtapa, destinoAlSoltar, etapaDelEstado } from "./etapas-core";

const lista = defDe("etapas.lista").rubro;

test("O01 · las 4 etapas del rubro agrupan los 10 estados, cada uno en una sola", () => {
  assert.deepEqual(lista.map((e) => e.nombre), ["Brief o idea", "Comercial", "Producción", "Cierre y postventa"]);
  assert.equal(lista.flatMap((e) => e.estados).join(), ETAPAS.join());
  assert.equal(etapaDelEstado(lista, "PEDIDO")?.id, "BRIEF");
  assert.equal(etapaDelEstado(lista, "PROPUESTA")?.id, "COMERCIAL");
  assert.equal(etapaDelEstado(lista, "APROBADO")?.id, "PRODUCCION");
  assert.equal(etapaDelEstado(lista, "DESARME")?.id, "PRODUCCION");
  assert.equal(etapaDelEstado(lista, "CIERRE")?.id, "CIERRE");
  assert.equal(etapaDelEstado(lista, "INVENTADO"), null);
});

test("O01 · proyectos por columna = conteo a mano; los perdidos van aparte y no cambia ningún estado", () => {
  const items = [
    { id: "1", etapa: "PEDIDO", perdido: false },
    { id: "2", etapa: "DISENO", perdido: false },
    { id: "3", etapa: "PROPUESTA", perdido: false },
    { id: "4", etapa: "PRESUPUESTO", perdido: true },
    { id: "5", etapa: "APROBADO", perdido: false },
    { id: "6", etapa: "ARMADO", perdido: false },
    { id: "7", etapa: "DESARME", perdido: false },
    { id: "8", etapa: "CIERRE", perdido: false },
  ];
  const antes = JSON.stringify(items);
  const { columnas, perdidos } = agruparPorEtapa(lista, items);
  // A mano: Brief {1} · Comercial {2, 3} · Producción {5, 6, 7} · Cierre {8} · perdidos {4}.
  assert.deepEqual(columnas.map((c) => c.items.map((i) => i.id)), [["1"], ["2", "3"], ["5", "6", "7"], ["8"]]);
  assert.deepEqual(perdidos.map((i) => i.id), ["4"]);
  assert.equal(JSON.stringify(items), antes, "agrupar no toca los estados");
});

test("O01 · con otra agrupación (5 etapas de otro negocio) las columnas siguen al parámetro", () => {
  const otra = [
    { id: "A", nombre: "Pedido", estados: ["PEDIDO"], compuerta: "AVISA" },
    { id: "B", nombre: "Diseño", estados: ["DISENO", "RENDER"], compuerta: "AVISA" },
    { id: "C", nombre: "Venta", estados: ["PRESUPUESTO", "PROPUESTA"], compuerta: "AVISA" },
    { id: "D", nombre: "Obra", estados: ["APROBADO", "PRODUCCION", "ARMADO", "DESARME"], compuerta: "AVISA" },
    { id: "E", nombre: "Fin", estados: ["CIERRE"], compuerta: "AVISA" },
  ] as typeof lista;
  const { columnas } = agruparPorEtapa(otra, [{ etapa: "RENDER", perdido: false }, { etapa: "PRESUPUESTO", perdido: false }]);
  assert.deepEqual(columnas.map((c) => c.items.length), [0, 1, 1, 0, 0]);
});

test("O01 · soltar una tarjeta en una columna la lleva al primer estado de esa etapa; en la suya, no se mueve", () => {
  assert.equal(destinoAlSoltar(lista, "COMERCIAL", "PEDIDO"), "DISENO");
  assert.equal(destinoAlSoltar(lista, "PRODUCCION", "PROPUESTA"), "APROBADO");
  assert.equal(destinoAlSoltar(lista, "BRIEF", "ARMADO"), "PEDIDO");
  assert.equal(destinoAlSoltar(lista, "COMERCIAL", "RENDER"), null, "ya está en Comercial");
  assert.equal(destinoAlSoltar(lista, "NO_EXISTE", "PEDIDO"), null);
});
