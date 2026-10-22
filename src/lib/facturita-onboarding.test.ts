/** Tests del alta self-serve de Facturita: CUIT con dígito verificador, punto de venta y mensaje. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALTA_VACIA,
  altaCompleta,
  formatearCuit,
  mensajeActivacion,
  pasosDelegacion,
  validarAlta,
  validarCuitEmisor,
  validarPuntoVenta,
  type DatosAlta,
} from "@/lib/facturita-onboarding";

const CUIT_OK = "20111111112";

test("CUIT: válido con o sin guiones, y se devuelve formateado", () => {
  for (const crudo of [CUIT_OK, "20-11111111-2", " 20 11111111 2 "]) {
    const r = validarCuitEmisor(crudo);
    assert.equal(r.ok, true, crudo);
    if (r.ok) {
      assert.equal(r.cuit, CUIT_OK);
      assert.equal(r.formateado, "20-11111111-2");
    }
  }
});

test("CUIT: el dígito verificador mal se rechaza con un mensaje que dice qué revisar", () => {
  const r = validarCuitEmisor("20111111113");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /último/);
});

test("CUIT: faltan o sobran números, y prefijo que no es de CUIT", () => {
  const corto = validarCuitEmisor("2011111");
  assert.equal(corto.ok, false);
  if (!corto.ok) assert.match(corto.error, /Faltan números/);
  const largo = validarCuitEmisor("201111111123");
  assert.equal(largo.ok, false);
  if (!largo.ok) assert.match(largo.error, /Sobran números/);
  const prefijo = validarCuitEmisor("99111111112");
  assert.equal(prefijo.ok, false);
  if (!prefijo.ok) assert.match(prefijo.error, /dos primeros/);
  assert.equal(validarCuitEmisor("").ok, false);
});

test("formatearCuit deja tal cual lo que no tiene 11 dígitos", () => {
  assert.equal(formatearCuit("123"), "123");
});

test("punto de venta: 1 a 99998, acepta ceros adelante", () => {
  const r = validarPuntoVenta("0003");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.numero, 3);
    assert.equal(r.formateado, "00003");
  }
  assert.equal(validarPuntoVenta("0").ok, false);
  assert.equal(validarPuntoVenta("99999").ok, false);
  assert.equal(validarPuntoVenta("2a").ok, false);
  assert.equal(validarPuntoVenta("").ok, false);
});

const COMPLETO: DatosAlta = {
  nombre: "Ana Pérez",
  cuit: "20-11111111-2",
  condicion: "monotributo",
  puntoVenta: "2",
  sinPuntoVenta: false,
  delegacionHecha: true,
};

test("alta vacía: marca todos los campos obligatorios", () => {
  const e = validarAlta(ALTA_VACIA);
  assert.deepEqual(Object.keys(e).sort(), ["condicion", "cuit", "nombre", "puntoVenta"]);
  assert.equal(altaCompleta(ALTA_VACIA), false);
});

test("alta completa; «todavía no lo creé» libera el punto de venta", () => {
  assert.equal(altaCompleta(COMPLETO), true);
  assert.equal(altaCompleta({ ...COMPLETO, puntoVenta: "", sinPuntoVenta: true }), true);
  assert.equal(altaCompleta({ ...COMPLETO, puntoVenta: "" }), false);
});

test("mensaje de activación: lleva los datos y NUNCA pide clave fiscal", () => {
  const m = mensajeActivacion(COMPLETO);
  assert.match(m, /CUIT: 20-11111111-2/);
  assert.match(m, /Monotributo/);
  assert.match(m, /Punto de venta: 2/);
  assert.match(m, /ya la hice/);
  assert.doesNotMatch(m, /clave/i);
  const sinPv = mensajeActivacion({ ...COMPLETO, puntoVenta: "", sinPuntoVenta: true, delegacionHecha: false });
  assert.match(sinPv, /todavía no lo creé/);
  assert.match(sinPv, /ayudame/);
});

test("delegación: sin CUIT de GSG confirmado no se inventa ninguno", () => {
  const pasos = pasosDelegacion(null).join(" ");
  assert.match(pasos, /te lo pasamos por WhatsApp/);
  assert.doesNotMatch(pasos, /\d{2}-\d{8}-\d/);
  assert.match(pasosDelegacion(CUIT_OK).join(" "), /20-11111111-2/);
});
