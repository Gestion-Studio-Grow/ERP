// Tests de la validación de CUIT/CUIL con motivo (R0-F4). node:test.
// Fixtures: CUITs sintéticos con verificador correcto (los mismos del laboratorio
// del contador, E1 §4.1). Ninguno es de una persona real a sabiendas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cuitValido as cuitValidoCore } from "@/lib/cuit";
import { formatearCuit, validarCuit } from "@/lib/fiscal/cuit";

const EMPRESA_RI = "30-71000111-8";
const PERSONA = "20-30405060-9";

test("CUIT válido: normaliza, formatea y dice si es persona o empresa", () => {
  const r = validarCuit(EMPRESA_RI);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.cuit, "30710001118");
  assert.equal(r.formateado, "30-71000111-8");
  assert.equal(r.persona, "juridica");

  const p = validarCuit("20 30405060 9");
  assert.equal(p.ok && p.persona, "humana");
  assert.equal(validarCuit(20304050609).ok, true, "también acepta el número");
  assert.equal(validarCuit("20.304.050.609").ok, true, "tolera puntos");
});

test("CUIT con dígito verificador inválido: se rechaza y dice que es el verificador", () => {
  for (const malo of ["30-71000111-9", "30710001110", "20-30405060-1"]) {
    const r = validarCuit(malo);
    assert.equal(r.ok, false, malo);
    if (r.ok) continue;
    assert.equal(r.error, "DIGITO_VERIFICADOR", malo);
    assert.match(r.motivo, /verificador/);
    assert.match(r.motivo, /constancia de ARCA/, "dice cómo seguir");
  }
});

test("el mensaje nunca sugiere cuál sería el dígito 'correcto'", () => {
  // 30-71000111-8 es el válido: el motivo del 9 no puede contener "8" como sugerencia.
  const r = validarCuit("30-71000111-9");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.doesNotMatch(r.motivo, /\d/, "el motivo no trae números que inviten a 'arreglarlo' a mano");
});

test("prefijo inexistente o verificador imposible (10): NO_EXISTE", () => {
  const prefijo = validarCuit("99-30405060-9");
  assert.equal(prefijo.ok === false && prefijo.error, "NO_EXISTE");
  // 20-99999999-?: el verificador daría 10; ARCA nunca asigna ese CUIT.
  for (let d = 0; d <= 9; d++) {
    const r = validarCuit(`2099999999${d}`);
    assert.equal(r.ok === false && r.error, "NO_EXISTE", `2099999999${d}`);
  }
});

test("vacío, letras y largo equivocado: cada uno con su motivo", () => {
  for (const vacio of ["", "   ", null, undefined]) {
    const r = validarCuit(vacio);
    assert.equal(r.ok === false && r.error, "VACIO");
  }
  const letra = validarCuit("20-3040506O-9"); // una O en lugar de un cero
  assert.equal(letra.ok === false && letra.error, "CARACTERES");
  const corto = validarCuit("20-3040506-9");
  assert.equal(corto.ok === false && corto.error, "LARGO");
  if (!corto.ok) assert.match(corto.motivo, /11 números y este tiene 10/);
  const largo = validarCuit("203040506090");
  assert.equal(largo.ok === false && largo.error, "LARGO");
});

test("el mensaje usa la palabra que se pidió (CUIT, CUIL o CDI)", () => {
  const r = validarCuit("", "CUIL");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.motivo, /Falta el CUIL/);
  const cdi = validarCuit("20-30405060-1", "CDI");
  assert.equal(cdi.ok === false && cdi.error, "DIGITO_VERIFICADOR");
  if (!cdi.ok) assert.match(cdi.motivo, /Ese CDI no existe/);
  assert.equal(validarCuit("20-30405060-9", "CDI").ok, true, "la CDI usa el mismo verificador");
});

test("misma respuesta que el validador único del repo en 20.000 números al azar", () => {
  // No se duplica el algoritmo: este módulo delega en @/lib/cuit. Si alguien lo
  // reimplementa acá y se separa, este test lo encuentra.
  let semilla = 20260924;
  const azar = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };
  const prefijos = ["20", "23", "24", "25", "26", "27", "30", "33", "34", "21", "99"];
  let validos = 0;
  for (let i = 0; i < 20_000; i++) {
    const cuerpo = String(Math.floor(azar() * 1e9)).padStart(9, "0");
    const n = prefijos[Math.floor(azar() * prefijos.length)] + cuerpo;
    const r = validarCuit(n);
    assert.equal(r.ok, cuitValidoCore(n), n);
    if (r.ok) validos++;
  }
  assert.ok(validos > 500, `la muestra tiene que incluir válidos (tuvo ${validos})`);
});

test("formatearCuit", () => {
  assert.equal(formatearCuit("20304050609"), "20-30405060-9");
  assert.equal(formatearCuit(PERSONA), "20-30405060-9");
  assert.equal(formatearCuit("123"), null);
  assert.equal(formatearCuit(null), null);
});
