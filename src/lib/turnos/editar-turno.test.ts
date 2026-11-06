import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  MOTIVO_CON_COBRO,
  MOTIVO_CON_DESCUENTO,
  camposCambiados,
  cambioAlgo,
  precioDeLaEdicion,
  sePuedeEditar,
  veredictoDeEdicion,
} from "./editar-turno";

const AHORA = new Date("2026-11-04T15:00:00.000Z");
const T = { estado: "CONFIRMED", inicio: "2026-11-05T13:00:00.000Z", servicioId: "s1", profesionalId: "p1" };
const base = {
  estado: "CONFIRMED",
  inicioActual: T.inicio,
  inicioNuevo: "2026-11-05T14:00:00.000Z",
  ahora: AHORA,
  tienePlata: false,
  tieneDescuento: false,
  profesionalLoHace: true,
};

describe("editar un turno: qué cambió", () => {
  test("nada / sólo la hora / servicio y profesional", () => {
    assert.deepEqual(camposCambiados(T, { servicioId: "s1", inicio: T.inicio, profesionalId: "p1" }), { servicio: false, inicio: false, profesional: false });
    assert.equal(cambioAlgo(camposCambiados(T, { servicioId: "s1", inicio: new Date(T.inicio), profesionalId: "p1" })), false, "Date o ISO, mismo instante");
    assert.deepEqual(camposCambiados(T, { servicioId: "s1", inicio: "2026-11-05T14:00:00.000Z", profesionalId: "p1" }), { servicio: false, inicio: true, profesional: false });
    assert.deepEqual(camposCambiados(T, { servicioId: "s2", inicio: T.inicio, profesionalId: "p2" }), { servicio: true, inicio: false, profesional: true });
    assert.deepEqual(camposCambiados(T, { servicioId: "", inicio: T.inicio, profesionalId: "" }), { servicio: false, inicio: false, profesional: false }, "vacío = el mismo");
  });

  test("sePuedeEditar: vivo y sin empezar", () => {
    assert.equal(sePuedeEditar(T, AHORA), true);
    assert.equal(sePuedeEditar({ ...T, estado: "PENDING" }, AHORA), true);
    assert.equal(sePuedeEditar({ ...T, estado: "COMPLETED" }, AHORA), false);
    assert.equal(sePuedeEditar({ ...T, estado: "CANCELLED" }, AHORA), false);
    assert.equal(sePuedeEditar({ ...T, inicio: "2026-11-04T14:00:00.000Z" }, AHORA), false, "ya empezó");
  });
});

describe("editar un turno: el precio", () => {
  test("mismo servicio: el congelado no se toca", () => {
    assert.deepEqual(precioDeLaEdicion({ cambiaServicio: false, precioActual: 12000, servicioNuevo: { price: 14000, residentPrice: null }, esVecina: false }), {
      precio: 12000,
      isResidentBooking: null,
      cambia: false,
    });
  });
  test("otro servicio: el vigente; vecina con precio de vecina", () => {
    assert.deepEqual(precioDeLaEdicion({ cambiaServicio: true, precioActual: 14000, servicioNuevo: { price: 9000, residentPrice: 7000 }, esVecina: false }), {
      precio: 9000,
      isResidentBooking: false,
      cambia: true,
    });
    assert.deepEqual(precioDeLaEdicion({ cambiaServicio: true, precioActual: 14000, servicioNuevo: { price: 9000, residentPrice: 7000 }, esVecina: true }), {
      precio: 7000,
      isResidentBooking: true,
      cambia: true,
    });
    assert.equal(precioDeLaEdicion({ cambiaServicio: true, precioActual: 9000, servicioNuevo: { price: 9000, residentPrice: null }, esVecina: null }).cambia, false);
  });
});

describe("editar un turno: el veredicto", () => {
  const soloHora = { servicio: false, inicio: true, profesional: false };
  const servicio = { servicio: true, inicio: false, profesional: false };
  test("se puede: hora o servicio sin plata", () => {
    assert.deepEqual(veredictoDeEdicion({ ...base, cambios: soloHora }), { ok: true });
    assert.deepEqual(veredictoDeEdicion({ ...base, cambios: servicio, inicioNuevo: T.inicio }), { ok: true });
  });
  test("cerrado, sin cambios, al pasado", () => {
    assert.equal(veredictoDeEdicion({ ...base, estado: "COMPLETED", cambios: soloHora }).ok, false);
    assert.deepEqual(veredictoDeEdicion({ ...base, cambios: { servicio: false, inicio: false, profesional: false } }), { ok: false, motivo: "No cambiaste nada." });
    assert.deepEqual(veredictoDeEdicion({ ...base, cambios: soloHora, inicioNuevo: "2026-11-04T14:00:00.000Z" }), { ok: false, motivo: "Ese horario ya pasó. Elegí uno que venga." });
  });
  test("con plata o con descuento, el servicio no cambia; la hora sí", () => {
    assert.deepEqual(veredictoDeEdicion({ ...base, cambios: servicio, tienePlata: true }), { ok: false, motivo: MOTIVO_CON_COBRO });
    assert.deepEqual(veredictoDeEdicion({ ...base, cambios: servicio, tieneDescuento: true }), { ok: false, motivo: MOTIVO_CON_DESCUENTO });
    assert.deepEqual(veredictoDeEdicion({ ...base, cambios: soloHora, tienePlata: true }), { ok: true });
  });
  test("ya empezó: no cambia de servicio; profesional que no lo hace, rechazada", () => {
    assert.equal(veredictoDeEdicion({ ...base, cambios: servicio, inicioActual: "2026-11-04T14:00:00.000Z" }).ok, false);
    assert.deepEqual(veredictoDeEdicion({ ...base, cambios: servicio, profesionalLoHace: false }), { ok: false, motivo: "Esa profesional no hace ese servicio. Elegí otra." });
  });
});
