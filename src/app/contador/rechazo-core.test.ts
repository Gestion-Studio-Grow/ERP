// Rechazos en criollo (rechazo-core.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { explicarRechazo } from "./rechazo-core";

test("explicarRechazo: cada familia de motivo de ARCA cae en su explicación y su responsable", () => {
  const casos: [string, string, boolean][] = [
    ["502: Error interno de aplicación", "arca", true],
    ["ARCA no respondió a tiempo (ETIMEDOUT)", "arca", true],
    ["600: ValidacionDeToken: No validaron las firmas digitales", "gsg", false],
    ["10004: El punto de venta no se encuentra habilitado", "estudio", false],
    ["10016: El campo CbteFch no se encuentra en el rango permitido", "estudio", true],
    ["10015: El campo DocNro es inválido", "estudio", false],
    ["10242: El campo CondicionIVAReceptorId no es válido para la clase de comprobante", "estudio", false],
    ["Perfil fiscal incompleto del tenant x (arcaPuntoVenta): falta", "gsg", false],
    ["10048: El campo ImpTotal no coincide", "estudio", false],
  ];
  for (const [motivo, quien, reintentar] of casos) {
    const e = explicarRechazo(motivo);
    assert.equal(e.quien, quien, motivo);
    assert.equal(e.sirveReintentar, reintentar, motivo);
    assert.ok(e.queQuiereDecir.length > 10 && e.queHacer.length > 10, motivo);
  }
});

test("explicarRechazo: un importe con 600 adentro no se confunde con un error de autorización", () => {
  assert.equal(explicarRechazo("10048: ImpTotal 1.600,00 no coincide").quien, "estudio");
});

test("explicarRechazo: lo desconocido no inventa causa; sin motivo, lo dice", () => {
  const e = explicarRechazo("99999: algo raro");
  assert.match(e.queQuiereDecir, /motivo de abajo/);
  assert.equal(e.sirveReintentar, false);
  assert.match(explicarRechazo(null).queQuiereDecir, /sin mandar el motivo/);
  assert.match(explicarRechazo("   ").queQuiereDecir, /sin mandar el motivo/);
});
