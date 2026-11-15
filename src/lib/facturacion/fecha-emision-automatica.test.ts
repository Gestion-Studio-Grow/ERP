// GSG-FACT-011 · H4 + H5 · la fecha, la ventana de ARCA y el concepto de la emisión AUTOMÁTICA (puro).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conceptoDeLaEmision,
  fechaDelComprobante,
  fechasDeServicio,
  motivoFueraDeVentanaArca,
  tipoFacturaAConsumidorFinal,
} from "@/lib/facturacion/fecha-emision-automatica";

test("H5 · concepto: el del movimiento; si no, el del negocio; si no, productos (1)", () => {
  assert.equal(conceptoDeLaEmision(2, 3), 2);
  assert.equal(conceptoDeLaEmision(null, 3), 3);
  assert.equal(conceptoDeLaEmision(undefined, null), 1);
  // Un valor que no es de ARCA no se usa: se sigue con el próximo.
  assert.equal(conceptoDeLaEmision(7, 2), 2);
  assert.equal(conceptoDeLaEmision(0, 9), 1);
});

test("H5 · con servicios: período = mes del cobro y vencimiento = el mayor entre cobro y factura", () => {
  assert.deepEqual(fechasDeServicio(2, "20261103", "20261110"), {
    servicioDesde: "20261101",
    servicioHasta: "20261130",
    vencimientoPago: "20261110",
  });
  // Cobro de fin de febrero (bisiesto) facturado en marzo: el período es febrero entero.
  assert.deepEqual(fechasDeServicio(3, "20280228", "20280302"), {
    servicioDesde: "20280201",
    servicioHasta: "20280229",
    vencimientoPago: "20280302",
  });
  // La factura no puede quedar antes del cobro, pero si llegara así, el vencimiento es el cobro.
  assert.equal(fechasDeServicio(2, "20261115", "20261110").vencimientoPago, "20261115");
  // Productos: sin fechas de servicio.
  assert.deepEqual(fechasDeServicio(1, "20261103", "20261110"), {});
});

test("H4 · la fecha nunca queda antes de la última factura del punto de venta", () => {
  assert.equal(fechaDelComprobante("20261110", "20261113"), "20261113");
  assert.equal(fechaDelComprobante("20261114", "20261113"), "20261114");
  assert.equal(fechaDelComprobante("20261110", null), "20261110");
});

test("H4 · ventana de ARCA: 5 días con productos, 10 con servicios (contados desde hoy)", () => {
  const hoy = "20261115";
  assert.equal(motivoFueraDeVentanaArca("20261110", hoy, 1), null); // justo 5 días
  assert.match(motivoFueraDeVentanaArca("20261109", hoy, 1) ?? "", /ARCA.*5 días/);
  assert.equal(motivoFueraDeVentanaArca("20261108", hoy, 2), null);
  assert.equal(motivoFueraDeVentanaArca("20261105", hoy, 3), null); // justo 10 días
  assert.match(motivoFueraDeVentanaArca("20261104", hoy, 2) ?? "", /ARCA.*10 días/);
  assert.equal(motivoFueraDeVentanaArca(hoy, hoy, 1), null);
});

test("H4 · el tipo de factura a consumidor final, por la condición del emisor", () => {
  assert.equal(tipoFacturaAConsumidorFinal("MONOTRIBUTO"), 11);
  assert.equal(tipoFacturaAConsumidorFinal("EXENTO"), 11);
  assert.equal(tipoFacturaAConsumidorFinal("RESPONSABLE_INSCRIPTO"), 6);
  assert.equal(tipoFacturaAConsumidorFinal("RARO"), null);
});
