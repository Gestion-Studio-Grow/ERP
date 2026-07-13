import { test } from "node:test";
import assert from "node:assert/strict";
import { traducirErrorArca, extraerCodigos } from "./arca-errores";

test("extraerCodigos: saca los códigos de un 'codigo: mensaje; codigo: mensaje'", () => {
  assert.deepEqual(extraerCodigos("10018: Punto de venta; 600: Token"), [10018, 600]);
});

test("extraerCodigos: ignora tramos sin código numérico al frente", () => {
  assert.deepEqual(extraerCodigos("campo: mensaje; fecha: formato"), []);
});

test("extraerCodigos: no confunde números en medio del texto con códigos", () => {
  assert.deepEqual(extraerCodigos("La factura 12345 falló"), []);
});

test("traducirErrorArca: devuelve null para vacío/nulo", () => {
  assert.equal(traducirErrorArca(null), null);
  assert.equal(traducirErrorArca(""), null);
  assert.equal(traducirErrorArca("   "), null);
});

test("traducirErrorArca: código 10018 (punto de venta no habilitado) → roja", () => {
  const d = traducirErrorArca("10018: El punto de venta no se encuentra habilitado")!;
  assert.equal(d.categoria, "punto_venta");
  assert.equal(d.severidad, "roja");
  assert.match(d.titulo, /punto de venta/i);
  assert.ok(d.accion);
  assert.match(d.crudo, /10018/);
});

test("traducirErrorArca: token WSAA vencido (código 600) → auth_wsaa roja", () => {
  const d = traducirErrorArca("600: El Token no es valido o no existe")!;
  assert.equal(d.categoria, "auth_wsaa");
  assert.equal(d.severidad, "roja");
});

test("traducirErrorArca: numeración fuera de secuencia (10048) → amarilla", () => {
  const d = traducirErrorArca("10048: Cbte Nro no se corresponde con el proximo a autorizar")!;
  assert.equal(d.categoria, "numeracion");
  assert.equal(d.severidad, "amarilla");
});

test("traducirErrorArca: credencial fiscal ausente (fail-closed) → credencial roja", () => {
  const d = traducirErrorArca(
    "El tenant abc no tiene credencial fiscal (certificado ARCA) cargada. Cargala desde el plano de operador...",
  )!;
  assert.equal(d.categoria, "credencial");
  assert.equal(d.severidad, "roja");
  assert.match(d.accion, /consola|certificad/i);
});

test("traducirErrorArca: CUIT que no coincide con el certificado → credencial roja", () => {
  const d = traducirErrorArca("El CUIT del tenant no coincide con el del certificado cargado")!;
  assert.equal(d.categoria, "credencial");
  assert.equal(d.severidad, "roja");
});

test("traducirErrorArca: 'Computador no autorizado' (cert no habilitado wsfe) → auth_wsaa roja", () => {
  const d = traducirErrorArca("Computador no autorizado a acceder al servicio wsfe")!;
  assert.equal(d.categoria, "auth_wsaa");
  assert.equal(d.severidad, "roja");
  assert.match(d.accion, /ARCA/);
});

test("traducirErrorArca: error de transporte SOAP (HTTP) → red amarilla (transitorio)", () => {
  const d = traducirErrorArca("ARCA: transporte SOAP falló (HTTP 503). Cuerpo: ...")!;
  assert.equal(d.categoria, "red");
  assert.equal(d.severidad, "amarilla");
  assert.match(d.accion, /reintent/i);
});

test("traducirErrorArca: validación de comprobante (campo rechazado) → comprobante amarilla", () => {
  const d = traducirErrorArca("docTipo: Comprobante A exige receptor identificado con CUIT.")!;
  assert.equal(d.categoria, "comprobante");
  assert.equal(d.severidad, "amarilla");
});

test("traducirErrorArca: condición de IVA del receptor → comprobante", () => {
  const d = traducirErrorArca("La condicion de IVA del receptor es incompatible")!;
  assert.equal(d.categoria, "comprobante");
});

test("traducirErrorArca: con varios errores gana el más severo (roja tapa amarilla)", () => {
  const d = traducirErrorArca("10048: fuera de secuencia; 10018: punto de venta no habilitado")!;
  assert.equal(d.severidad, "roja");
  assert.equal(d.categoria, "punto_venta");
});

test("traducirErrorArca: un error no catalogado cae a 'desconocido' pero conserva el crudo", () => {
  const crudo = "Algo raro que nunca vimos: 0xDEADBEEF";
  const d = traducirErrorArca(crudo)!;
  assert.equal(d.categoria, "desconocido");
  assert.equal(d.crudo, crudo);
  assert.ok(d.queePaso);
  assert.ok(d.accion);
});

test("traducirErrorArca: nunca devuelve un diagnóstico sin acción (todo error es accionable)", () => {
  for (const crudo of [
    "600: token",
    "10018: pdv",
    "transporte SOAP falló (HTTP 500)",
    "no tiene credencial fiscal cargada",
    "basura no catalogada",
  ]) {
    const d = traducirErrorArca(crudo)!;
    assert.ok(d.accion.length > 0);
    assert.ok(d.titulo.length > 0);
  }
});
