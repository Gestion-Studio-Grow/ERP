import { test } from "node:test";
import assert from "node:assert/strict";
import { serieDeNumeracion, type DatosDeSerie } from "./serie-numeracion";

const base: DatosDeSerie = {
  concepto: 1,
  fecha: "20261106",
  emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 3 },
  receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
  total: 1210,
};

test("serie · inscripto a consumidor final: PV 3, Factura B (6)", () => {
  assert.equal(serieDeNumeracion(base), "3:6");
});

test("serie · monotributista: Factura C (11), sea quien sea el receptor", () => {
  assert.equal(serieDeNumeracion({ ...base, emisor: { ...base.emisor, condicionIva: "MONOTRIBUTO" } }), "3:11");
});

test("serie · nota de crédito de una Factura B: Nota de crédito B (8), otra serie que la factura", () => {
  const nota = serieDeNumeracion({
    ...base,
    clase: "nota_credito",
    asociado: { cbteTipo: 6, puntoVenta: 3, numero: 10, fecha: "20261105" },
  });
  assert.equal(nota, "3:8");
});

test("serie · sin condición del emisor no se decide: sin serie (comodín)", () => {
  assert.equal(serieDeNumeracion({ ...base, emisor: { ...base.emisor, condicionIva: "" } }), null);
});
