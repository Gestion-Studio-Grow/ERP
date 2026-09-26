import { test } from "node:test";
import assert from "node:assert/strict";
import { getRetailRubro } from "@/blueprints/retail/rubros";
import { defaultModulesForBlueprint } from "@/blueprints/presets-meta";
import { vocabularioDelNegocio, tituloDeEntrega, VOCABULARIO_POR_DEFECTO } from "./vocabulario-negocio";
import { etiquetaDeHorario, avisoPedidoListo } from "./order-anulacion";

test("sin rubro (una estética) y en los rubros de siempre, el retiro se sigue llamando como hoy", () => {
  assert.equal(VOCABULARIO_POR_DEFECTO.opcion, "Retira en el local");
  assert.equal(VOCABULARIO_POR_DEFECTO.corto, "Retira");
  assert.equal(tituloDeEntrega(VOCABULARIO_POR_DEFECTO), "Retiro / envío");
  for (const id of ["carniceria", "velas", "padel", "verduleria"]) {
    const v = vocabularioDelNegocio(getRetailRubro(id));
    assert.equal(v.opcion, "Retira en el local", id);
    assert.equal(v.corto, "Retira", id);
    assert.equal(v.listoPara, "listo para retirar", id);
  }
});

test("la perfumería entrega en un punto de encuentro, y el panel lo dice así", () => {
  const v = vocabularioDelNegocio(getRetailRubro("perfumeria"));
  assert.equal(v.opcion, "Punto de encuentro");
  assert.equal(v.corto, "Encuentro");
  assert.equal(tituloDeEntrega(v), "Punto de encuentro / envío");
});

test("el ejemplo de la nota sale del rubro, no de la carnicería para todos", () => {
  assert.match(vocabularioDelNegocio(getRetailRubro("perfumeria")).notasEjemplo, /^Ej: es para regalo/);
  assert.match(vocabularioDelNegocio(getRetailRubro("padel")).notasEjemplo, /^Ej: talle/);
  assert.equal(vocabularioDelNegocio(null).notasEjemplo, "Ej: aclaraciones del pedido");
  for (const id of ["perfumeria", "velas", "padel"]) {
    assert.doesNotMatch(vocabularioDelNegocio(getRetailRubro(id)).notasEjemplo, /milanesa/i, id);
  }
});

test("el horario del tablero usa la palabra del rubro; sin ella, la de siempre", () => {
  const hoy = "2026-09-23";
  const d = new Date("2026-09-23T21:30:00.000Z"); // 18:30 en Buenos Aires
  assert.equal(etiquetaDeHorario(d, "PICKUP", hoy).texto, "Retira hoy 18:30");
  assert.equal(etiquetaDeHorario(d, "PICKUP", hoy, "Encuentro").texto, "Encuentro hoy 18:30");
  assert.equal(etiquetaDeHorario(d, "DELIVERY", hoy, "Encuentro").texto, "Envío hoy 18:30");
});

test("el aviso de 'pedido listo' no le dice 'para retirar' a quien no tiene local", () => {
  const base = {
    cliente: "Sofía",
    code: 12,
    total: 45000,
    pagado: false,
    fulfillment: "PICKUP",
    direccionEnvio: null,
    negocio: "Qué Bien Olés",
    direccionLocal: null,
    horarioLocal: null,
  };
  assert.match(avisoPedidoListo(base), /ya está listo para retirar\./);
  const v = vocabularioDelNegocio(getRetailRubro("perfumeria"));
  const texto = avisoPedidoListo({ ...base, listoPara: v.listoPara });
  assert.match(texto, /ya está listo; coordinamos el punto de encuentro\./);
  assert.doesNotMatch(texto, /retirar/);
});

test("sólo se habla de peso donde se vende por kilo", () => {
  assert.equal(vocabularioDelNegocio(getRetailRubro("carniceria")).porPeso, true);
  assert.equal(vocabularioDelNegocio(getRetailRubro("perfumeria")).porPeso, false);
  assert.equal(vocabularioDelNegocio(getRetailRubro("velas")).porPeso, false);
  assert.equal(vocabularioDelNegocio(null).porPeso, true, "sin rubro, como siempre");
});

test("la perfumería arranca con inventario (compras y stock) además del mostrador", () => {
  const m = defaultModulesForBlueprint("perfumeria");
  for (const id of ["pos", "catalog", "clients", "reports", "inventario"]) assert.ok(m.includes(id), id);
  assert.ok(!defaultModulesForBlueprint("velas").includes("inventario"), "los demás rubros no cambian");
});
