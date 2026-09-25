// Tests del catálogo de errores accionables. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODIGOS_ERROR,
  ETIQUETA_ACCION,
  codigoPorEstadoHttp,
  errorAccionable,
  esCodigoError,
  type CodigoError,
} from "./errores";

const JERGA = /\b(webhook|token|api|oauth|http|https?:\/\/(?!\.)|ssrf|json|payload|outbox|endpoint|dek|kek|aad|hmac)\b/i;
const BASURA = /undefined|null|NaN|\[object|\$\{/;

const DATOS_COMPLETOS = {
  conector: "Tiendanube",
  producto: "Vela sándalo 200g",
  pedido: "1043",
  pedidas: 3,
  disponibles: 1,
  proximoIntento: "14:30",
  limite: 1000,
  fecha: "12/11",
  intentos: 8,
};

test("cada código arma frase, qué hacer y botón coherente, con y sin datos", () => {
  for (const codigo of CODIGOS_ERROR) {
    for (const datos of [{}, DATOS_COMPLETOS]) {
      const e = errorAccionable(codigo, datos);
      assert.equal(e.codigo, codigo);
      assert.ok(e.mensaje.trim().length > 0, `${codigo}: sin mensaje`);
      assert.ok(e.queHacer.trim().length > 0, `${codigo}: sin qué hacer`);
      assert.equal(e.etiquetaAccion, ETIQUETA_ACCION[e.accion]);
      assert.doesNotMatch(e.mensaje, BASURA, `${codigo}: ${e.mensaje}`);
      assert.doesNotMatch(e.queHacer, BASURA, `${codigo}: ${e.queHacer}`);
    }
  }
});

test("ningún texto para el dueño trae jerga técnica", () => {
  for (const codigo of CODIGOS_ERROR) {
    const e = errorAccionable(codigo, DATOS_COMPLETOS);
    // "https://" aparece a propósito en la ayuda de la dirección: se lo saca antes de mirar.
    const texto = `${e.mensaje} ${e.queHacer} ${e.etiquetaAccion ?? ""}`.replace("https://", "");
    assert.doesNotMatch(texto, JERGA, `${codigo}: ${texto}`);
  }
});

test("los datos de afuera salen en la frase, limpios y acotados", () => {
  assert.equal(
    errorAccionable("producto_sin_mapear", { producto: "Vela sándalo 200g" }).mensaje,
    "Llegó un pedido con «Vela sándalo 200g», que no está en tu catálogo.",
  );
  assert.equal(
    errorAccionable("stock_insuficiente", { pedido: "#1043", pedidas: 3, disponibles: 1 }).mensaje,
    "El pedido #1043 pide 3 y tenés 1.",
  );
  assert.equal(
    errorAccionable("stock_insuficiente", { pedido: "1043", pedidas: 3, disponibles: 0 }).mensaje,
    "El pedido #1043 pide 3 y tenés 0.",
  );
  assert.equal(
    errorAccionable("limite_del_plan", { limite: 1000 }).mensaje,
    "Este mes llegaste a 1.000 movimientos, el tope de tu plan.",
  );
  const sucio = errorAccionable("producto_sin_mapear", { producto: "Vela\n\u0000\tsándalo" + "x".repeat(200) });
  assert.doesNotMatch(sucio.mensaje, /[\u0000-\u001f]/);
  assert.ok(sucio.mensaje.length < 140, "el nombre largo se acorta");
  // Un dato vacío o inválido no deja un hueco: cae en la frase genérica.
  assert.equal(
    errorAccionable("stock_insuficiente", { pedido: "  ", pedidas: -1, disponibles: Number.NaN }).mensaje,
    "Llegó un pedido con más unidades de las que tenés en stock.",
  );
});

test("decisiones de cada código: reconectar, pausar y avisar a GSG", () => {
  for (const c of ["credencial_vencida", "permiso_revocado", "credencial_ilegible"] as CodigoError[]) {
    const e = errorAccionable(c);
    assert.equal(e.efectoEnConexion, "requiere_reconectar", c);
    assert.equal(e.accion, "reconectar", c);
    assert.equal(e.reintentaSolo, false, c);
  }
  const firma = errorAccionable("firma_invalida_repetida");
  assert.equal(firma.efectoEnConexion, "con_problemas");
  assert.equal(firma.avisaOperador, true);
  assert.equal(errorAccionable("credencial_ilegible").avisaOperador, true);
  assert.equal(errorAccionable("proveedor_caido").reintentaSolo, true);
  assert.equal(errorAccionable("datos_rechazados").reintentaSolo, false, "un rechazo 4xx es definitivo");
  assert.equal(errorAccionable("direccion_no_publica").mensaje, "La dirección no es pública.");
});

test("un código desconocido nunca se muestra crudo: cae en error_interno", () => {
  const e = errorAccionable("inventado" as CodigoError);
  assert.equal(e.codigo, "error_interno");
  assert.equal(esCodigoError("inventado"), false);
  assert.equal(esCodigoError("proveedor_caido"), true);
  assert.equal(esCodigoError(42), false);
});

test("clasificación de la respuesta del proveedor", () => {
  const tabla: Array<[number, CodigoError | null]> = [
    [200, null],
    [204, null],
    [301, "direccion_invalida"],
    [302, "direccion_invalida"],
    [400, "datos_rechazados"],
    [401, "credencial_vencida"],
    [403, "credencial_vencida"],
    [404, "datos_rechazados"],
    [408, "proveedor_caido"],
    [409, "datos_rechazados"],
    [422, "datos_rechazados"],
    [425, "proveedor_caido"],
    [429, "proveedor_caido"],
    [500, "proveedor_caido"],
    [503, "proveedor_caido"],
    [0, "respuesta_invalida"],
    [100, "respuesta_invalida"],
    [600, "respuesta_invalida"],
    [Number.NaN, "respuesta_invalida"],
    [200.5, "respuesta_invalida"],
  ];
  for (const [estado, esperado] of tabla) {
    assert.equal(codigoPorEstadoHttp(estado), esperado, `estado ${estado}`);
  }
});
