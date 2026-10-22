// EL CAMPO ÚNICO — la ráfaga del lector sin foco: el lector de fábrica (sin prefijo, con Enter),
// el criterio de qué teclas se miran (el de VenderForm) y la lectura de punta a punta:
// teclas → detectorDeRafaga → decidirLectura.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEtiquetaDeBalanza, FORMATO_BALANZA_POR_DEFECTO } from "@/lib/supermercado/balanza";
import { detectorDeRafaga, UMBRAL_RAFAGA_MS } from "@/lib/terminal/lector-core";
import { decidirLectura, indiceDelCampo } from "./decidir-lectura";
import { LECTOR_DE_FABRICA, rafagaPrendida, teclaParaLaRafaga } from "./rafaga";

const PESO = FORMATO_BALANZA_POR_DEFECTO;
const indice = indiceDelCampo([
  { id: "p-vacio", name: "Vacío", codigo: "00201", saleUnit: "WEIGHT", pricePerKg: 28600 },
  { id: "p-chori", name: "Chorizo", codigo: "7790000000017", saleUnit: "UNIT", pricePerKg: null },
]);

/** Manda `texto` + Enter al detector, una tecla cada `cadaMs`, desde `t0`. Devuelve lo leído. */
function teclear(det: ReturnType<typeof detectorDeRafaga>, texto: string, cadaMs: number, t0 = 1000) {
  let t = t0;
  for (const c of texto) {
    assert.equal(det.tecla(c, t), null);
    t += cadaMs;
  }
  return det.tecla("Enter", t);
}

test("ráfaga de la balanza sin foco: la etiqueta entra como etiqueta (MG-020)", () => {
  const det = detectorDeRafaga({ lector: LECTOR_DE_FABRICA });
  const etiqueta = armarEtiquetaDeBalanza(PESO, "00201", 1.24);
  const r = teclear(det, etiqueta, 8);
  assert.equal(r?.valor, etiqueta);
  const l = decidirLectura(r?.valor, indice, PESO);
  assert.equal(l.tipo === "etiqueta" && l.kg, 1.24);
});

test("tres etiquetas seguidas: tres lecturas, una por etiqueta (MG-021)", () => {
  const det = detectorDeRafaga({ lector: LECTOR_DE_FABRICA });
  const pesos = [1.24, 0.98, 1.5];
  const kilos = pesos.map((kg, i) => {
    const r = teclear(det, armarEtiquetaDeBalanza(PESO, "00201", kg), 8, 1000 + i * 2000);
    const l = decidirLectura(r?.valor, indice, PESO);
    return l.tipo === "etiqueta" ? l.kg : null;
  });
  assert.deepEqual(kilos, pesos);
});

test("una persona que tipea no es ráfaga: el Enter no se intercepta", () => {
  const det = detectorDeRafaga({ lector: LECTOR_DE_FABRICA });
  assert.equal(teclear(det, "7790000000017", UMBRAL_RAFAGA_MS + 60), null);
});

test("el código de barras en ráfaga entra como código", () => {
  const det = detectorDeRafaga({ lector: LECTOR_DE_FABRICA });
  const r = teclear(det, "7790000000017", 10);
  assert.deepEqual(decidirLectura(r?.valor, indice, PESO), { tipo: "codigo", productId: "p-chori", cantidad: 1 });
});

test("qué teclas mira la ráfaga: el mismo criterio que Vender (VenderForm.tsx:626-635)", () => {
  // En la página, un botón o un medio de pago tocado: sí.
  assert.equal(teclaParaLaRafaga({ tagName: "BODY" }, false), true);
  assert.equal(teclaParaLaRafaga({ tagName: "BUTTON" }, false), true);
  assert.equal(teclaParaLaRafaga({ tagName: "INPUT", type: "radio" }, false), true);
  // En el peso o la cantidad de un renglón: sí (y el campo vuelve a su valor).
  assert.equal(teclaParaLaRafaga({ tagName: "INPUT", type: "text", dataset: { tipo: "peso" } }, false), true);
  assert.equal(teclaParaLaRafaga({ tagName: "INPUT", type: "text", dataset: { tipo: "cantidad" } }, false), true);
  // Donde la persona escribe (incluido el propio campo único, que lee con su Enter): no.
  assert.equal(teclaParaLaRafaga({ tagName: "INPUT", type: "text" }, false), false);
  assert.equal(teclaParaLaRafaga({ tagName: "TEXTAREA" }, false), false);
  // Con un diálogo abierto: no.
  assert.equal(teclaParaLaRafaga({ tagName: "BODY" }, true), false);
});

test("la ráfaga se prende sola con balanza, sin exigir el módulo terminal; quien integra manda", () => {
  assert.equal(rafagaPrendida(undefined, true), true);
  assert.equal(rafagaPrendida(undefined, false), false);
  assert.equal(rafagaPrendida(false, true), false);
  assert.equal(rafagaPrendida(true, false), true);
  assert.deepEqual(LECTOR_DE_FABRICA, { prefijo: "", sufijo: "enter" });
});
