/** «Datos para tus facturas» de Facturita: validación, lo que se graba y lo que falta para el PDF. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IIBB_CONVENIO,
  IIBB_EXENTO,
  faltantesEmisor,
  formDesdeGuardado,
  listaEnCriollo,
  validarDatosEmisor,
  type DatosEmisorForm,
} from "@/lib/facturita-emisor";

const OK: DatosEmisorForm = {
  razonSocial: "Ana Pérez",
  domicilio: "Mitre 100, Quilmes",
  inicioActividades: "2024-01-15",
  iibbTipo: "numero",
  iibbNumero: "901-123456-7",
};

test("graba en los campos que lee el PDF, con el inicio en AAAAMMDD", () => {
  const v = validarDatosEmisor(OK, "20261022");
  assert.ok(v.ok);
  if (v.ok) {
    assert.deepEqual(v.datos, {
      arcaRazonSocial: "Ana Pérez",
      arcaDomicilioFiscal: "Mitre 100, Quilmes",
      arcaInicioActividades: "20240115",
      arcaIibb: "901-123456-7",
    });
  }
});

test("IIBB exento o Convenio Multilateral: los textos del schema", () => {
  const ex = validarDatosEmisor({ ...OK, iibbTipo: "exento", iibbNumero: "" });
  assert.ok(ex.ok && ex.datos.arcaIibb === IIBB_EXENTO);
  const cm = validarDatosEmisor({ ...OK, iibbTipo: "cm", iibbNumero: "" });
  assert.ok(cm.ok && cm.datos.arcaIibb === IIBB_CONVENIO);
});

test("marca cada campo que falta o está mal, y no acepta un inicio futuro", () => {
  const v = validarDatosEmisor({ razonSocial: "", domicilio: "x", inicioActividades: "", iibbTipo: "numero", iibbNumero: "abc" });
  assert.equal(v.ok, false);
  if (!v.ok) assert.deepEqual(Object.keys(v.errores).sort(), ["domicilio", "iibb", "inicioActividades", "razonSocial"]);
  const futuro = validarDatosEmisor({ ...OK, inicioActividades: "2027-01-01" }, "20261022");
  assert.equal(futuro.ok, false);
});

test("faltantes para el PDF y el texto en criollo", () => {
  const nada = { arcaRazonSocial: null, arcaDomicilioFiscal: " ", arcaInicioActividades: null, arcaIibb: null };
  assert.deepEqual(faltantesEmisor(nada), ["la razón social", "el domicilio comercial", "el inicio de actividades", "Ingresos Brutos"]);
  assert.equal(listaEnCriollo(["a", "b", "c"]), "a, b y c");
  assert.equal(listaEnCriollo(["a"]), "a");
  const todo = { arcaRazonSocial: "A", arcaDomicilioFiscal: "B 1", arcaInicioActividades: "20240115", arcaIibb: IIBB_EXENTO };
  assert.deepEqual(faltantesEmisor(todo), []);
});

test("lo guardado vuelve al formulario tal cual", () => {
  const f = formDesdeGuardado({ arcaRazonSocial: "A", arcaDomicilioFiscal: "B", arcaInicioActividades: "20240115", arcaIibb: IIBB_CONVENIO });
  assert.equal(f.inicioActividades, "2024-01-15");
  assert.equal(f.iibbTipo, "cm");
  const n = formDesdeGuardado({ arcaRazonSocial: null, arcaDomicilioFiscal: null, arcaInicioActividades: null, arcaIibb: "12345" });
  assert.equal(n.iibbTipo, "numero");
  assert.equal(n.iibbNumero, "12345");
});
