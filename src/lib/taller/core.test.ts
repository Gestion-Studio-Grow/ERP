import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarMensaje,
  avisosDeVehiculo,
  conRecargo,
  formatoPatente,
  mostrarPatente,
  normalizarPatente,
  pesos,
  precioConMargen,
  recargoPct,
  RECARGOS_DEFAULT,
  siguienteEstado,
  totales,
  waLink,
} from "./core";

test("patente: acepta vieja y Mercosur, autos y motos; rechaza lo demás", () => {
  assert.equal(formatoPatente("abc 123"), "vieja");
  assert.equal(formatoPatente("AB-123-CD"), "mercosur");
  assert.equal(formatoPatente("123ABC"), "moto-vieja");
  assert.equal(formatoPatente("A123BCD"), "moto-mercosur");
  assert.equal(formatoPatente("ABCD123"), null);
  assert.equal(formatoPatente("AB12CD"), null);
  assert.equal(formatoPatente(""), null);
  assert.equal(normalizarPatente(" ab 123 cd "), "AB123CD");
  assert.equal(mostrarPatente("ab123cd"), "AB 123 CD");
  assert.equal(mostrarPatente("abc123"), "ABC 123");
});

test("plata: formato argentino y margen", () => {
  assert.equal(pesos(1234567.89).replace(/ /g, " "), "$ 1.234.567,89");
  assert.equal(pesos(0).replace(/ /g, " "), "$ 0,00");
  assert.equal(precioConMargen(10000, 35), 13500);
});

test("totales: lo rechazado no suma, lo traído por el cliente vale cero, se cobra sólo lo aprobado", () => {
  const t = totales([
    { tipo: "MANO_OBRA", cantidad: 2, precio: 15000, decision: "APROBADO" },
    { tipo: "REPUESTO", cantidad: 1, precio: 40000, decision: "PENDIENTE" },
    { tipo: "REPUESTO", cantidad: 1, precio: 9000, decision: "RECHAZADO" },
    { tipo: "REPUESTO", cantidad: 4, precio: 5000, decision: "APROBADO", traidoPorCliente: true },
  ]);
  assert.equal(t.manoDeObra, 30000);
  assert.equal(t.repuestos, 40000);
  assert.equal(t.presupuestado, 70000);
  assert.equal(t.aprobado, 30000);
  assert.equal(t.pendientes, 1);
  assert.equal(t.rechazados, 1);
});

test("recargo: sólo tarjeta, por tramo de cuotas", () => {
  assert.equal(recargoPct("EFECTIVO", 1, RECARGOS_DEFAULT), 0);
  assert.equal(recargoPct("CREDITO", 1, RECARGOS_DEFAULT), 8);
  assert.equal(recargoPct("CREDITO", 3, RECARGOS_DEFAULT), 15);
  assert.equal(recargoPct("CREDITO", 6, RECARGOS_DEFAULT), 30);
  assert.equal(recargoPct("CREDITO", 12, RECARGOS_DEFAULT), 60);
  assert.deepEqual(conRecargo(100000, 15), { recargo: 15000, total: 115000 });
});

test("mensaje: reemplaza variables y no deja llaves a la vista", () => {
  assert.equal(armarMensaje("Hola {nombre}, tu {vehiculo} {falta} está.", { nombre: "Juan", vehiculo: "Gol" }), "Hola Juan, tu Gol está.");
});

test("wa.me: arma el número de celular argentino", () => {
  assert.equal(waLink("011 15-5183-9732", "hola")?.startsWith("https://wa.me/549111551839732"), true);
  assert.equal(waLink("+54 9 11 5183-9732", "hola")?.startsWith("https://wa.me/5491151839732?text=hola"), true);
  assert.equal(waLink("11 5183-9732", "a b")?.endsWith("?text=a%20b"), true);
  assert.equal(waLink("", "hola"), null);
});

test("estados: avanza hasta Entregado y ahí se queda", () => {
  assert.equal(siguienteEstado("RECIBIDO"), "DIAGNOSTICO");
  assert.equal(siguienteEstado("LISTO"), "ENTREGADO");
  assert.equal(siguienteEstado("ENTREGADO"), null);
});

test("avisos: VTV cerca, service por km o fecha, e inactivo a los 6 meses", () => {
  const hoy = new Date("2026-10-08T12:00:00Z");
  const base = { id: "v", km: null, vtvVence: null, proximoServiceFecha: null, proximoServiceKm: null, ultimaVisita: null };
  assert.deepEqual(avisosDeVehiculo({ ...base, vtvVence: new Date("2026-10-25") }, hoy), ["vtv"]);
  assert.deepEqual(avisosDeVehiculo({ ...base, vtvVence: new Date("2027-03-01") }, hoy), []);
  assert.deepEqual(avisosDeVehiculo({ ...base, km: 49800, proximoServiceKm: 50000 }, hoy), ["service"]);
  assert.deepEqual(avisosDeVehiculo({ ...base, proximoServiceFecha: new Date("2026-10-15") }, hoy), ["service"]);
  assert.deepEqual(avisosDeVehiculo({ ...base, ultimaVisita: new Date("2026-03-01") }, hoy), ["inactivo"]);
  assert.deepEqual(avisosDeVehiculo({ ...base, ultimaVisita: new Date("2026-08-01") }, hoy), []);
});
