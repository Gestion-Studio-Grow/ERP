// El cartel de góndola del supermercado: precio, precio por litro o kilo, código y promo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlDeEtiquetas, lineaPorUnidadDeMedida } from "@/lib/catalogo/etiquetas-core";
import { rotulosDePromoPorProducto, type Promocion } from "./promociones";

test("el cartel de un envase lleva el precio por litro o por kilo; lo pesado no lo repite", () => {
  assert.equal(lineaPorUnidadDeMedida({ saleUnit: "UNIT", precio: 1299, unidad: "900 ml" }), "$1.443,33 el litro");
  assert.equal(lineaPorUnidadDeMedida({ saleUnit: "UNIT", precio: 1850, unidad: "500 g" }), "$3.700 el kg");
  assert.equal(lineaPorUnidadDeMedida({ saleUnit: "UNIT", precio: 4200, unidad: "x 12 u" }), "$350 la unidad");
  assert.equal(lineaPorUnidadDeMedida({ saleUnit: "WEIGHT", precio: 12990, unidad: "kg" }), null);
  assert.equal(lineaPorUnidadDeMedida({ saleUnit: "UNIT", precio: 900, unidad: "unidades" }), null);
});

test("el HTML del cartel trae precio, precio por litro, código y promo, todo escapado", () => {
  const html = htmlDeEtiquetas(
    [{ id: "a", nombre: "Aceite <Natura> 900 ml", saleUnit: "UNIT", precio: 2790, unidad: "900 ml", codigo: "7791100000130", promo: "2×1" }],
    "a4",
    "Súper · precio al 27/09/2026",
  );
  assert.match(html, /\$2\.790/);
  assert.match(html, /x 900 ml/);
  assert.match(html, /\$3\.100 el litro/);
  assert.match(html, /7791100000130 · Súper/);
  assert.match(html, /<i class="o">2×1<\/i>/);
  assert.match(html, /Aceite &lt;Natura&gt;/);
  assert.doesNotMatch(html, /<script/);
});

test("el rótulo de promo del cartel sale de las promos que nombran al producto y valen en la semana", () => {
  const base = { secciones: [] as string[], dias: [] as number[], prioridad: 20, acumulable: false, activa: true };
  const promos: Promocion[] = [
    { ...base, id: "p1", nombre: "2×1", tipo: "nxm", lleva: 2, paga: 1, productos: ["coca"] },
    { ...base, id: "p2", nombre: "Martes", tipo: "porcentaje", porcentaje: 20, productos: ["papa"], dias: [2] },
    { ...base, id: "p3", nombre: "Pausada", tipo: "porcentaje", porcentaje: 20, productos: ["yerba"], activa: false },
    { ...base, id: "p4", nombre: "Vencida", tipo: "porcentaje", porcentaje: 20, productos: ["agua"], hasta: "2026-09-01" },
  ];
  const m = rotulosDePromoPorProducto(promos, "2026-09-27", 0);
  assert.deepEqual([...m], [["coca", "2×1"]]);
});
