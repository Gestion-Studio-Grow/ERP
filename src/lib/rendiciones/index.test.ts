// La superficie pública expone todas las funciones del contrato (las pantallas importan sólo de
// acá). node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as rendi from "./index";

test("el índice exporta las funciones de CONTRATO.md", () => {
  for (const nombre of [
    "pesos",
    "formatearPesos",
    "ivaDeLinea",
    "sumar",
    "leerQrArca",
    "claseDesdeTipoArca",
    "tipoArcaDesdeClase",
    "urlQrArca",
    "evaluarComprobante",
    "calcularCuadratura",
    "aplicarAccion",
    "totalRendicion",
    "nivelesDeAprobacion",
    "puedeAprobar",
    "armarLoteContable",
    "conciliarConPrecarga",
    "resumenParaHaberes",
  ]) {
    assert.equal(typeof (rendi as Record<string, unknown>)[nombre], "function", nombre);
  }
});
