/** Tests del alta self-serve de Facturita: CUIT con dígito verificador, punto de venta y mensaje. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALTA_VACIA,
  altaCompleta,
  formatearCuit,
  mensajeActivacion,
  PASOS_CERTIFICADO_PROPIO,
  PERMISO_ARCA_ALTA,
  OPCIONES_NIVEL_3,
  AYUDA_NIVEL_3,
  esClaveNivel3,
  resumenMercadoPago,
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
  mercadoPago: "",
  nombre: "Ana Pérez",
  cuit: "20-11111111-2",
  condicion: "monotributo",
  puntoVenta: "2",
  sinPuntoVenta: false,
  claveNivel3: "si",
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
  // La respuesta a «¿Tu clave fiscal es nivel 3?» reemplaza al viejo «Certificado en ARCA: ya lo hice».
  assert.match(m, /Nivel 3 en ARCA: Sí/);
  assert.doesNotMatch(m, /Certificado en ARCA/);
  assert.doesNotMatch(m, /clave|contraseña/i);
  const sinPv = mensajeActivacion({ ...COMPLETO, puntoVenta: "", sinPuntoVenta: true, claveNivel3: "no" });
  assert.match(sinPv, /todavía no lo creé/);
  assert.match(sinPv, /No, ayudame a subirla/);
  assert.match(mensajeActivacion({ ...COMPLETO, claveNivel3: "nose" }), /No sé, ayudame a revisarlo/);
  assert.match(mensajeActivacion({ ...COMPLETO, claveNivel3: "" }), /Sin responder/);
});

test("permiso en ARCA en el alta: se hace después de activar, con compu y clave nivel 3; la respuesta no frena", () => {
  assert.match(PERMISO_ARCA_ALTA.cuando, /después de que te activamos/);
  assert.match(PERMISO_ARCA_ALTA.cuando, /10 minutos/);
  const necesitas = PERMISO_ARCA_ALTA.necesitas.join(" ");
  assert.match(necesitas, /nivel 3/);
  assert.match(necesitas, /computadora/);
  assert.match(necesitas, /celular/);
  assert.deepEqual(OPCIONES_NIVEL_3.map((o) => o.nombre), ["Sí", "No", "No sé"]);
  assert.match(AYUDA_NIVEL_3.comoSaberlo, /Certificados Digitales/);
  assert.match(AYUDA_NIVEL_3.comoSubirla, /Mi ARCA/);
  assert.equal(ALTA_VACIA.claveNivel3, "");
  for (const v of ["", "si", "no", "nose"] as const) assert.equal(altaCompleta({ ...COMPLETO, claveNivel3: v }), true);
  assert.equal(esClaveNivel3("si"), true);
  assert.equal(esClaveNivel3("quizas"), false);
  assert.equal(esClaveNivel3(true), false);
});

test("certificado propio: el usuario lo hace él mismo, sin delegar a GSG ni dar su clave", () => {
  const pasos = PASOS_CERTIFICADO_PROPIO.join(" ");
  assert.match(pasos, /nivel 3/);
  assert.match(pasos, /Facturación Electrónica/);
  assert.match(pasos, /\.csr/);
  assert.match(pasos, /no nos la das nunca/);
  assert.doesNotMatch(pasos, /Representante/);
  assert.doesNotMatch(pasos, /CUIT de Gestión Studio Grow/);
  assert.doesNotMatch(pasos, /\d{2}-\d{8}-\d/);
});

test("Mercado Pago (paso 1, opcional): saltarlo no bloquea el alta ni cambia el mensaje", () => {
  assert.equal(ALTA_VACIA.mercadoPago, "");
  assert.equal(altaCompleta({ ...COMPLETO, mercadoPago: "" }), true);
  assert.equal(altaCompleta({ ...COMPLETO, mercadoPago: "despues" }), true);
  assert.equal(mensajeActivacion({ ...COMPLETO, mercadoPago: "despues" }), mensajeActivacion({ ...COMPLETO, mercadoPago: "" }));
  assert.doesNotMatch(mensajeActivacion({ ...COMPLETO, mercadoPago: "" }), /Mercado Pago/);
  const quiere = mensajeActivacion({ ...COMPLETO, mercadoPago: "quiere" });
  assert.match(quiere, /Mercado Pago: quiero conectarlo/);
  assert.doesNotMatch(quiere, /clave|token/i);
  assert.match(resumenMercadoPago("quiere"), /un toque/);
  assert.match(resumenMercadoPago(""), /Más adelante/);
});
