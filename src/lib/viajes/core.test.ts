// Tests del CORE del módulo VIAJES (puro, sin DB). node:test + tsx.
// Foco: la INVARIANTE DURA (sin fecha de captura, sin unidad o —en alojamiento— sin base →
// no entra), la cuenta por asignación que evita duplicar/halvar un presupuesto, y el
// "No cotizado" cuando el single no se puede calcular sin inferir (spec §3.6/§3.7/§4).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { OfertaHotel, OfertaVuelo, PrecioOferta } from "@/plugins/ofertas-viaje/port";
import {
  asignacionDefault,
  capturarOferta,
  capturarOfertaManual,
  costoTotalAsignacion,
  describirHotel,
  describirVuelo,
  estadoVigencia,
  horasDesdeCaptura,
  OfertaInvalidaError,
  precioPorPersona,
  resumirOpcion,
  validarPrecio,
  vigenciaPresupuesto,
  type AsignacionNueva,
  type OfertaParaCalculo,
} from "./core";

const AHORA = new Date("2026-09-09T12:00:00.000Z");
const CTX = { ahora: AHORA, certeza: "VERIFICADA" as const, fuente: "Buscador Amadeus (test)" };

const precioVuelo = (over: Partial<PrecioOferta> = {}): PrecioOferta => ({
  monto: 850.5,
  moneda: "USD",
  unidad: "POR_PERSONA",
  capturadoEn: "2026-09-09T11:30:00.000Z",
  ...over,
});

const precioHotel = (over: Partial<PrecioOferta> = {}): PrecioOferta => ({
  monto: 600,
  moneda: "USD",
  unidad: "POR_HABITACION_TOTAL",
  baseOcupacion: "DOBLE",
  noches: 5,
  capturadoEn: "2026-09-09T11:30:00.000Z",
  ...over,
});

const vuelo = (over: Partial<OfertaVuelo> = {}): OfertaVuelo => ({
  referenciaProveedor: "amadeus-1",
  proveedor: "amadeus",
  tramos: [
    { segmentos: [{ origen: "EZE", destino: "MAD", salida: "2026-11-10T22:00:00", llegada: "2026-11-11T14:00:00", aerolinea: "IB", numeroVuelo: "IB6842" }] },
    {
      segmentos: [
        { origen: "MAD", destino: "GRU", salida: "2026-11-20T10:00:00", llegada: "2026-11-20T18:00:00", aerolinea: "IB", numeroVuelo: "IB6825" },
        { origen: "GRU", destino: "EZE", salida: "2026-11-20T20:00:00", llegada: "2026-11-20T23:00:00", aerolinea: "LA", numeroVuelo: "LA8010" },
      ],
    },
  ],
  precio: precioVuelo(),
  equipajeIncluido: true,
  ...over,
});

const hotel = (over: Partial<OfertaHotel> = {}): OfertaHotel => ({
  referenciaProveedor: "amadeus-h1",
  proveedor: "amadeus",
  hotel: { nombre: "Hotel Prueba", estrellas: 4 },
  habitacion: { descripcion: "Doble estándar", tipo: "doble", regimen: "con desayuno" },
  checkIn: "2026-11-11",
  checkOut: "2026-11-16",
  noches: 5,
  precio: precioHotel(),
  politicaCancelacion: "Cancelación gratis hasta 48 h antes",
  ...over,
});

// ── validarPrecio: la invariante ─────────────────────────────────────────────

test("validarPrecio: vuelo y hotel completos son válidos", () => {
  assert.deepEqual(validarPrecio("VUELO", precioVuelo(), AHORA), []);
  assert.deepEqual(validarPrecio("ALOJAMIENTO", precioHotel(), AHORA), []);
});

test("INVARIANTE: sin fecha de captura NO es válido", () => {
  const m = validarPrecio("VUELO", { ...precioVuelo(), capturadoEn: undefined as unknown as string }, AHORA);
  assert.ok(m.some((x) => x.includes("fecha de captura")));
});

test("INVARIANTE: sin unidad de precio NO es válido", () => {
  const m = validarPrecio("VUELO", { ...precioVuelo(), unidad: undefined as unknown as PrecioOferta["unidad"] }, AHORA);
  assert.ok(m.some((x) => x.includes("unidad")));
});

test("INVARIANTE: alojamiento sin base de ocupación NO es válido; vuelo sin base SÍ", () => {
  const m = validarPrecio("ALOJAMIENTO", { ...precioHotel(), baseOcupacion: undefined }, AHORA);
  assert.ok(m.some((x) => x.includes("base de ocupación")));
  assert.deepEqual(validarPrecio("VUELO", precioVuelo(), AHORA), []);
});

test("validarPrecio: base OTRA exige cantidad; por noche exige noches; base desconocida se rechaza", () => {
  assert.ok(validarPrecio("ALOJAMIENTO", precioHotel({ baseOcupacion: "OTRA" }), AHORA).some((x) => x.includes('"otra"')));
  assert.deepEqual(validarPrecio("ALOJAMIENTO", precioHotel({ baseOcupacion: "OTRA", ocupacion: 4 }), AHORA), []);
  assert.ok(validarPrecio("ALOJAMIENTO", precioHotel({ unidad: "POR_HABITACION_NOCHE", noches: undefined }), AHORA).some((x) => x.includes("noches")));
  assert.ok(validarPrecio("ALOJAMIENTO", precioHotel({ baseOcupacion: "CUADRUPLE" as PrecioOferta["baseOcupacion"] }), AHORA).some((x) => x.includes("base")));
});

test("validarPrecio: captura en el futuro, vigencia anterior, moneda y monto inválidos", () => {
  assert.ok(validarPrecio("VUELO", precioVuelo({ capturadoEn: "2026-09-09T13:00:00.000Z" }), AHORA).some((x) => x.includes("futuro")));
  assert.ok(validarPrecio("VUELO", precioVuelo({ vigenteHasta: "2026-09-01T00:00:00.000Z" }), AHORA).some((x) => x.includes("anterior a la captura")));
  assert.ok(validarPrecio("VUELO", precioVuelo({ moneda: "u$s" }), AHORA).some((x) => x.includes("moneda")));
  assert.ok(validarPrecio("VUELO", precioVuelo({ monto: -1 }), AHORA).some((x) => x.includes("monto")));
});

// ── capturarOferta ────────────────────────────────────────────────────────────

test("capturarOferta: vuelo → objeto maestro completo, vigencia ASUMIDA si el proveedor no la dio", () => {
  const c = capturarOferta("VUELO", vuelo(), CTX);
  assert.equal(c.tipo, "VUELO");
  assert.equal(c.titulo, "EZE → MAD · ida y vuelta · IB/LA · sin escalas");
  assert.equal(c.proveedor, "amadeus");
  assert.equal(c.precio, 850.5);
  assert.equal(c.unidad, "POR_PERSONA");
  assert.equal(c.baseOcupacion, null);
  assert.equal(c.capturadoEn.toISOString(), "2026-09-09T11:30:00.000Z");
  assert.equal(c.vigenciaAsumida, true);
  assert.equal(c.vigenteHasta.toISOString(), "2026-09-11T11:30:00.000Z"); // +2 días default
  assert.equal(c.certeza, "VERIFICADA");
  assert.equal(c.fuente, "Buscador Amadeus (test)");
  assert.match(c.condiciones ?? "", /Equipaje despachado incluido/);
});

test("capturarOferta: hotel → base doble, noches y vigencia del proveedor (no asumida)", () => {
  const c = capturarOferta("ALOJAMIENTO", hotel({ precio: precioHotel({ vigenteHasta: "2026-09-12T23:59:59.000Z" }) }), CTX);
  assert.equal(c.tipo, "ALOJAMIENTO");
  assert.equal(c.baseOcupacion, "DOBLE");
  assert.equal(c.noches, 5);
  assert.equal(c.vigenciaAsumida, false);
  assert.equal(c.vigenteHasta.toISOString(), "2026-09-12T23:59:59.000Z");
  assert.equal(c.titulo, "Hotel Prueba ★4 · doble · con desayuno · 5 noches");
});

test("capturarOferta: lanza OfertaInvalidaError sin fecha de captura / sin base / sin certeza / sin fuente", () => {
  assert.throws(() => capturarOferta("VUELO", vuelo({ precio: { ...precioVuelo(), capturadoEn: "" } }), CTX), OfertaInvalidaError);
  assert.throws(() => capturarOferta("ALOJAMIENTO", hotel({ precio: precioHotel({ baseOcupacion: undefined }) }), CTX), OfertaInvalidaError);
  assert.throws(() => capturarOferta("VUELO", vuelo(), { ...CTX, certeza: "" as "VERIFICADA" }), /certeza/);
  assert.throws(() => capturarOferta("VUELO", vuelo(), { ...CTX, fuente: "  " }), /fuente/);
});

test("capturarOferta: redondea a 2 decimales (ADR-057) y respeta vigenciaDefaultDias del tenant", () => {
  const c = capturarOferta("VUELO", vuelo({ precio: precioVuelo({ monto: 100.005 }) }), { ...CTX, vigenciaDefaultDias: 5 });
  assert.equal(c.precio, 100.01);
  assert.equal(c.vigenteHasta.toISOString(), "2026-09-14T11:30:00.000Z");
});

test("capturarOfertaManual: misma invariante — sin base en alojamiento no entra; con todo, entra", () => {
  const base = { tipo: "ALOJAMIENTO" as const, titulo: "Hotel Canton Fair", proveedor: "Mayorista X", precio: precioHotel({ baseOcupacion: undefined }) };
  assert.throws(() => capturarOfertaManual(base, { ...CTX, fuente: "mail del mayorista" }), OfertaInvalidaError);
  const ok = capturarOfertaManual({ ...base, precio: precioHotel(), condiciones: " Desayuno incluido " }, { ...CTX, certeza: "ESTIMADA", fuente: "mail del mayorista" });
  assert.equal(ok.certeza, "ESTIMADA");
  assert.equal(ok.condiciones, "Desayuno incluido");
  assert.equal(ok.referenciaProveedor, null);
  assert.deepEqual(ok.detalle, { manual: true });
});

// ── asignación y cuentas ──────────────────────────────────────────────────────

const ofHotel = (over: Partial<OfertaParaCalculo> = {}): OfertaParaCalculo => ({
  tipo: "ALOJAMIENTO",
  precio: 600,
  moneda: "USD",
  unidad: "POR_HABITACION_TOTAL",
  baseOcupacion: "DOBLE",
  ocupacion: null,
  noches: 5,
  vigenteHasta: new Date("2026-09-20T00:00:00Z"),
  certeza: "VERIFICADA",
  ...over,
});

const ofVuelo = (over: Partial<OfertaParaCalculo> = {}): OfertaParaCalculo => ({
  tipo: "VUELO",
  precio: 850,
  moneda: "USD",
  unidad: "POR_PERSONA",
  baseOcupacion: null,
  ocupacion: null,
  noches: null,
  vigenteHasta: new Date("2026-09-20T00:00:00Z"),
  certeza: "VERIFICADA",
  ...over,
});

const asig = (over: Partial<AsignacionNueva> = {}): AsignacionNueva => ({
  pasajerosCubiertos: 2,
  baseAplicada: "DOBLE",
  ocupacionAplicada: null,
  suplementoSingle: null,
  cantidad: 1,
  ...over,
});

test("asignacionDefault: pasajeros del pedido, base = la capturada, cantidad = noches solo si es por noche", () => {
  assert.deepEqual(asignacionDefault(ofHotel(), 2), { pasajerosCubiertos: 2, baseAplicada: "DOBLE", ocupacionAplicada: null, suplementoSingle: null, cantidad: 1 });
  assert.equal(asignacionDefault(ofHotel({ unidad: "POR_HABITACION_NOCHE", noches: 5 }), 2).cantidad, 5);
  assert.equal(asignacionDefault(ofVuelo(), 3).baseAplicada, null);
});

test("EL CASO REAL: hotel por habitación (doble) para 2 → 600, NO 1200", () => {
  assert.equal(costoTotalAsignacion(asig(), ofHotel()), 600);
  assert.equal(precioPorPersona(asig(), ofHotel(), "DOBLE"), 300);
});

test("costoTotalAsignacion: cada unidad multiplica por lo que corresponde", () => {
  assert.equal(costoTotalAsignacion(asig({ pasajerosCubiertos: 3 }), ofVuelo()), 2550); // por persona × 3
  assert.equal(costoTotalAsignacion(asig({ pasajerosCubiertos: 3 }), ofHotel()), 1200); // 2 habitaciones dobles (ceil 3/2)
  assert.equal(costoTotalAsignacion(asig({ pasajerosCubiertos: 2, cantidad: 5 }), ofHotel({ unidad: "POR_HABITACION_NOCHE", precio: 120 })), 600); // 120 × 1 hab × 5 noches
  assert.equal(costoTotalAsignacion(asig({ pasajerosCubiertos: 4 }), ofVuelo({ unidad: "POR_TRAMO", precio: 200 })), 200); // el ítem ya es del grupo
  assert.equal(costoTotalAsignacion(asig({ baseAplicada: "OTRA", ocupacionAplicada: 4, pasajerosCubiertos: 4 }), ofHotel({ baseOcupacion: "OTRA", ocupacion: 4 })), 600);
});

test("precioPorPersona: por persona y por tramo no dependen de la base", () => {
  assert.equal(precioPorPersona(asig(), ofVuelo(), "DOBLE"), 850);
  assert.equal(precioPorPersona(asig(), ofVuelo(), "SINGLE"), 850);
  assert.equal(precioPorPersona(asig({ pasajerosCubiertos: 4 }), ofVuelo({ unidad: "POR_TRAMO", precio: 200 }), "SINGLE"), 50);
});

test("precioPorPersona: single desde tarifa doble = No cotizado (null) salvo suplemento EXPLÍCITO", () => {
  assert.equal(precioPorPersona(asig(), ofHotel(), "SINGLE"), null);
  assert.equal(precioPorPersona(asig({ suplementoSingle: 150 }), ofHotel(), "SINGLE"), 450);
  // Y al revés (single capturada, se pide doble): no se infiere.
  assert.equal(precioPorPersona(asig({ baseAplicada: "SINGLE" }), ofHotel({ baseOcupacion: "SINGLE" }), "DOBLE"), null);
  assert.equal(precioPorPersona(asig({ baseAplicada: "SINGLE" }), ofHotel({ baseOcupacion: "SINGLE" }), "SINGLE"), 600);
});

test("precioPorPersona: por noche multiplica por la cantidad (noches) antes de prorratear", () => {
  assert.equal(precioPorPersona(asig({ cantidad: 5 }), ofHotel({ unidad: "POR_HABITACION_NOCHE", precio: 120 }), "DOBLE"), 300);
});

test("resumirOpcion: suma por persona en doble; single No cotizado; confianza verde", () => {
  const r = resumirOpcion([{ asignacion: asig(), oferta: ofVuelo() }, { asignacion: asig(), oferta: ofHotel() }], AHORA);
  assert.equal(r.moneda, "USD");
  assert.equal(r.porPersonaDoble, 1150);
  assert.equal(r.porPersonaSingle, null);
  assert.equal(r.costoTotal, 2300);
  assert.equal(r.vigenteHasta?.toISOString(), "2026-09-20T00:00:00.000Z");
  assert.equal(r.confianza, "verde");
  assert.ok(r.avisos.some((a) => /No cotizado/.test(a)));
});

test("resumirOpcion: estimada → ámbar; vencida → rojo; monedas mezcladas → rojo sin sumar", () => {
  assert.equal(resumirOpcion([{ asignacion: asig(), oferta: ofVuelo({ certeza: "ESTIMADA" }) }], AHORA).confianza, "ambar");
  assert.equal(resumirOpcion([{ asignacion: asig(), oferta: ofVuelo({ vigenteHasta: new Date("2026-09-08T00:00:00Z") }) }], AHORA).confianza, "rojo");
  const mix = resumirOpcion([{ asignacion: asig(), oferta: ofVuelo() }, { asignacion: asig(), oferta: ofHotel({ moneda: "EUR" }) }], AHORA);
  assert.equal(mix.confianza, "rojo");
  assert.equal(mix.moneda, null);
  assert.equal(mix.porPersonaDoble, null);
});

test("resumirOpcion: por vencer (< 48 h) → ámbar; sin asignaciones → rojo", () => {
  assert.equal(resumirOpcion([{ asignacion: asig(), oferta: ofVuelo({ vigenteHasta: new Date("2026-09-10T00:00:00Z") }) }], AHORA).confianza, "ambar");
  assert.equal(resumirOpcion([], AHORA).confianza, "rojo");
});

// ── vigencia / descripciones ──────────────────────────────────────────────────

test("estadoVigencia y vigenciaPresupuesto (mínimo)", () => {
  assert.equal(estadoVigencia(new Date("2026-09-20T00:00:00Z"), AHORA), "vigente");
  assert.equal(estadoVigencia(new Date("2026-09-10T00:00:00Z"), AHORA), "por_vencer");
  assert.equal(estadoVigencia(new Date("2026-09-08T00:00:00Z"), AHORA), "vencida");
  assert.equal(vigenciaPresupuesto([new Date("2026-09-20T00:00:00Z"), new Date("2026-09-12T00:00:00Z")])?.toISOString(), "2026-09-12T00:00:00.000Z");
  assert.equal(vigenciaPresupuesto([]), null);
});

test("describirVuelo: solo ida con escala", () => {
  const o = vuelo({
    tramos: [
      {
        segmentos: [
          { origen: "AEP", destino: "COR", salida: "", llegada: "", aerolinea: "AR", numeroVuelo: "AR1" },
          { origen: "COR", destino: "MDZ", salida: "", llegada: "", aerolinea: "AR", numeroVuelo: "AR2" },
        ],
      },
    ],
  });
  assert.equal(describirVuelo(o), "AEP → MDZ · solo ida · AR · 1 escala");
});

test("describirHotel: nombre + estrellas + tipo + régimen + noches", () => {
  assert.equal(describirHotel(hotel()), "Hotel Prueba ★4 · doble · con desayuno · 5 noches");
  assert.equal(describirHotel(hotel({ hotel: { nombre: "Posada" }, habitacion: { descripcion: "Single" }, noches: 1 })), "Posada · Single · 1 noche");
});

test("horasDesdeCaptura", () => {
  assert.equal(horasDesdeCaptura("2026-09-09T09:10:00.000Z", AHORA), 2);
  assert.equal(horasDesdeCaptura(new Date("2026-09-09T12:30:00.000Z"), AHORA), 0);
});
