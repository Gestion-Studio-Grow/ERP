import { test } from "node:test";
import assert from "node:assert/strict";
import { alElegirServicio, montoComoTexto, pideIdentificarAlComprador, previaEnUnaLinea } from "./facturador-una-pantalla";
import { CONSUMIDOR_FINAL, borradorVacio, previa, totalDelTexto } from "./facturador-core";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

test("montoComoTexto vuelve a leerse igual con totalDelTexto", () => {
  for (const n of [12100, 1500.5, 999, 1234567.89]) assert.equal(totalDelTexto(montoComoTexto(n)), n);
  assert.equal(montoComoTexto(12100), "12.100");
});

test("chip de servicio: detalle, servicios y el precio sólo si el monto está vacío", () => {
  assert.deepEqual(alElegirServicio({ total: "" }, { nombre: "Limpieza facial", precio: 18000 }), {
    descripcion: "Limpieza facial",
    concepto: "servicios",
    total: "18.000",
  });
  assert.deepEqual(alElegirServicio({ total: "5000" }, { nombre: "Masaje", precio: 20000 }), { descripcion: "Masaje", concepto: "servicios" });
  assert.equal(alElegirServicio({ total: "" }, { nombre: "Consulta", precio: null }).total, undefined);
});

test("el umbral de identificación despliega el comprador", () => {
  assert.equal(pideIdentificarAlComprador("Desde $10.000.000 ARCA exige identificar al comprador (RG 5700): cargá su DNI, CUIL o CUIT."), true);
  assert.equal(pideIdentificarAlComprador("Contá qué vendiste: la descripción va en la factura."), false);
  assert.equal(pideIdentificarAlComprador(null), false);
});

test("previa en una línea con la letra del sistema", () => {
  const b = { ...borradorVacio(), descripcion: "Torta", total: "12.100" };
  assert.equal(
    previaEnUnaLinea(previa(b, "RESPONSABLE_INSCRIPTO"), CONSUMIDOR_FINAL, pesos),
    "Factura B a Consumidor final · $12.100 (IVA $2.100 incluido)",
  );
  assert.equal(previaEnUnaLinea(previa(b, "MONOTRIBUTO"), CONSUMIDOR_FINAL, pesos), "Factura C a Consumidor final · $12.100");
  assert.equal(previaEnUnaLinea(null, CONSUMIDOR_FINAL, pesos), null);
});
