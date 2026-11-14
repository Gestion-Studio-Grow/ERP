// Etapa 2 · T5 — reglas puras del portal por cliente: la etapa como la lee el cliente, el token y el orden de la lista.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ETAPAS } from "./core";
import { CLAVES_EVENTO_DEL_CLIENTE, EN_PREPARACION, esTokenDePortal, etapaParaElCliente, separarEventos } from "./portal-cliente-core";

test("etapaParaElCliente: las etapas internas y las desconocidas dicen «En preparación»", () => {
  for (const interna of ["PEDIDO", "DISENO", "RENDER", "PRESUPUESTO"]) assert.equal(etapaParaElCliente(interna), EN_PREPARACION, interna);
  assert.equal(etapaParaElCliente("PROPUESTA"), "Propuesta enviada");
  assert.equal(etapaParaElCliente("APROBADO"), "Confirmado");
  assert.equal(etapaParaElCliente("PRODUCCION"), "En producción");
  assert.equal(etapaParaElCliente("ARMADO"), "En producción");
  assert.equal(etapaParaElCliente("DESARME"), "Evento en curso");
  assert.equal(etapaParaElCliente("CIERRE"), "Realizado");
  for (const raro of ["", "toString", "__proto__", "constructor", "perdido", null, undefined]) assert.equal(etapaParaElCliente(raro as string), EN_PREPARACION, String(raro));
});

test("etapaParaElCliente: ninguna etapa sale con su nombre interno", () => {
  for (const e of ETAPAS) assert.notEqual(etapaParaElCliente(e), e);
});

test("esTokenDePortal: base64url de 20 o más, nada más", () => {
  assert.equal(esTokenDePortal("a".repeat(43)), true);
  assert.equal(esTokenDePortal("abc-_DEF123456789012"), true);
  assert.equal(esTokenDePortal("corto"), false);
  assert.equal(esTokenDePortal("a".repeat(30) + "/.."), false);
  assert.equal(esTokenDePortal("a".repeat(30) + " "), false);
  assert.equal(esTokenDePortal("a".repeat(201)), false);
  assert.equal(esTokenDePortal(undefined), false);
});

test("CLAVES_EVENTO_DEL_CLIENTE: ni plata, ni proveedores, ni equipo, ni notas", () => {
  const prohibidas = /monto|precio|costo|cuota|pago|proveedor|equipo|nota|brief|responsable|margen|presupuesto|client|id$/i;
  for (const k of CLAVES_EVENTO_DEL_CLIENTE) assert.equal(prohibidas.test(k), false, k);
});

test("separarEventos: próximos arriba (el más cercano primero, sin fecha al final) y pasados abajo (el más reciente primero)", () => {
  const hoy = new Date(2026, 10, 9, 15, 0);
  const d = (m: number, dia: number) => new Date(2026, m, dia, 12);
  const ev = (nombre: string, fechaEvento: Date | null, fechaFin: Date | null = null) => ({ nombre, fechaEvento, fechaFin });
  const { proximos, pasados } = separarEventos(
    [ev("lejos", d(11, 20)), ev("sin fecha", null), ev("hoy", d(10, 9)), ev("pasado viejo", d(5, 1)), ev("cerca", d(10, 15)), ev("pasado reciente", d(9, 30)), ev("termina hoy", d(10, 7), d(10, 9))],
    hoy,
  );
  assert.deepEqual(proximos.map((x) => x.nombre), ["termina hoy", "hoy", "cerca", "lejos", "sin fecha"]);
  assert.deepEqual(pasados.map((x) => x.nombre), ["pasado reciente", "pasado viejo"]);
});
