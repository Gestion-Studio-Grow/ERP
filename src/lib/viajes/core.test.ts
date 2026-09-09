// Tests del CORE del snapshot de oferta (puro, sin DB). node:test + tsx.
// Foco: la INVARIANTE DURA (sin fecha de captura o sin base → no entra) y la cuenta
// de cantidadBase que evita duplicar/halvar un presupuesto.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { OfertaHotel, OfertaVuelo, PrecioOferta } from "@/plugins/ofertas-viaje/port";
import {
  avisosDeBase,
  cantidadBasePara,
  congelarOferta,
  describirHotel,
  describirVuelo,
  estadoVigencia,
  horasDesdeCaptura,
  SnapshotInvalidoError,
  totalesPorMoneda,
  validarPrecio,
} from "./core";

const AHORA = new Date("2026-09-09T12:00:00.000Z");

const precio = (over: Partial<PrecioOferta> = {}): PrecioOferta => ({
  monto: 850.5,
  moneda: "USD",
  baseOcupacion: "POR_PASAJERO",
  capturadoEn: "2026-09-09T11:30:00.000Z",
  ...over,
});

const vuelo = (over: Partial<OfertaVuelo> = {}): OfertaVuelo => ({
  referenciaProveedor: "amadeus-1",
  proveedor: "amadeus",
  tramos: [
    {
      segmentos: [
        { origen: "EZE", destino: "MAD", salida: "2026-11-10T22:00:00", llegada: "2026-11-11T14:00:00", aerolinea: "IB", numeroVuelo: "IB6842" },
      ],
    },
    {
      segmentos: [
        { origen: "MAD", destino: "GRU", salida: "2026-11-20T10:00:00", llegada: "2026-11-20T18:00:00", aerolinea: "IB", numeroVuelo: "IB6825" },
        { origen: "GRU", destino: "EZE", salida: "2026-11-20T20:00:00", llegada: "2026-11-20T23:00:00", aerolinea: "LA", numeroVuelo: "LA8010" },
      ],
    },
  ],
  precio: precio(),
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
  precio: precio({ monto: 600, baseOcupacion: "POR_HABITACION" }),
  ...over,
});

const GRUPO = { adultos: 2, ninos: 1, habitaciones: 1 };

// ── validarPrecio: la invariante ─────────────────────────────────────────────

test("validarPrecio: precio completo es válido", () => {
  assert.deepEqual(validarPrecio(precio(), AHORA), []);
});

test("INVARIANTE: sin fecha de captura NO es válido", () => {
  const m = validarPrecio({ ...precio(), capturadoEn: undefined as unknown as string }, AHORA);
  assert.ok(m.some((x) => x.includes("fecha de captura")));
});

test("INVARIANTE: sin base de ocupación NO es válido", () => {
  const m = validarPrecio({ ...precio(), baseOcupacion: undefined as unknown as PrecioOferta["baseOcupacion"] }, AHORA);
  assert.ok(m.some((x) => x.includes("base de ocupación")));
});

test("validarPrecio: base desconocida se rechaza (no se acepta cualquier string)", () => {
  const m = validarPrecio({ ...precio(), baseOcupacion: "POR_CUARTO" as PrecioOferta["baseOcupacion"] }, AHORA);
  assert.ok(m.some((x) => x.includes("base de ocupación")));
});

test("validarPrecio: captura en el futuro (más de 5 min) se rechaza", () => {
  const m = validarPrecio(precio({ capturadoEn: "2026-09-09T13:00:00.000Z" }), AHORA);
  assert.ok(m.some((x) => x.includes("futuro")));
});

test("validarPrecio: vigencia anterior a la captura se rechaza", () => {
  const m = validarPrecio(precio({ vigenteHasta: "2026-09-01T00:00:00.000Z" }), AHORA);
  assert.ok(m.some((x) => x.includes("anterior a la captura")));
});

test("validarPrecio: moneda debe ser ISO-4217 de 3 letras; monto no negativo", () => {
  assert.ok(validarPrecio(precio({ moneda: "u$s" }), AHORA).some((x) => x.includes("moneda")));
  assert.ok(validarPrecio(precio({ monto: -1 }), AHORA).some((x) => x.includes("monto")));
  assert.ok(validarPrecio(precio({ monto: Number.NaN }), AHORA).some((x) => x.includes("monto")));
});

// ── congelarOferta ────────────────────────────────────────────────────────────

test("congelarOferta: vuelo por pasajero × 3 personas", () => {
  const s = congelarOferta("VUELO", vuelo(), { grupo: GRUPO, ahora: AHORA });
  assert.equal(s.tipo, "VUELO");
  assert.equal(s.proveedor, "amadeus");
  assert.equal(s.baseOcupacion, "POR_PASAJERO");
  assert.equal(s.cantidadBase, 3);
  assert.equal(s.precio, 850.5);
  assert.equal(s.precioTotal, 2551.5);
  assert.equal(s.capturadoEn.toISOString(), "2026-09-09T11:30:00.000Z");
  assert.equal(s.vigenteHasta, null);
  assert.equal(s.descripcion, "EZE → MAD · ida y vuelta · IB/LA · sin escalas");
});

test("congelarOferta: hotel por habitación NO se multiplica por personas (el caso real)", () => {
  const s = congelarOferta("HOTEL", hotel(), { grupo: GRUPO, ahora: AHORA });
  assert.equal(s.baseOcupacion, "POR_HABITACION");
  assert.equal(s.cantidadBase, 1);
  assert.equal(s.precioTotal, 600); // NO 1800
});

test("congelarOferta: hotel por persona en doble SÍ se multiplica por personas", () => {
  const s = congelarOferta("HOTEL", hotel({ precio: precio({ monto: 300, baseOcupacion: "POR_PERSONA_EN_DOBLE" }) }), {
    grupo: { adultos: 2, ninos: 0, habitaciones: 1 },
    ahora: AHORA,
  });
  assert.equal(s.cantidadBase, 2);
  assert.equal(s.precioTotal, 600);
});

test("congelarOferta: lanza SnapshotInvalidoError sin fecha de captura", () => {
  const o = vuelo({ precio: { ...precio(), capturadoEn: "" } });
  assert.throws(() => congelarOferta("VUELO", o, { grupo: GRUPO, ahora: AHORA }), SnapshotInvalidoError);
});

test("congelarOferta: lanza sin base de ocupación", () => {
  const o = vuelo({ precio: { ...precio(), baseOcupacion: undefined as unknown as PrecioOferta["baseOcupacion"] } });
  assert.throws(() => congelarOferta("VUELO", o, { grupo: GRUPO, ahora: AHORA }), SnapshotInvalidoError);
});

test("congelarOferta: lanza sin proveedor", () => {
  const o = vuelo({ proveedor: "" });
  assert.throws(() => congelarOferta("VUELO", o, { grupo: GRUPO, ahora: AHORA }), /proveedor/);
});

test("congelarOferta: redondea a 2 decimales (ADR-057)", () => {
  const s = congelarOferta("VUELO", vuelo({ precio: precio({ monto: 100.005 }) }), { grupo: { adultos: 3, ninos: 0, habitaciones: 1 }, ahora: AHORA });
  assert.equal(s.precio, 100.01);
  assert.equal(s.precioTotal, 300.03);
});

test("congelarOferta: conserva vigenteHasta como Date", () => {
  const s = congelarOferta("VUELO", vuelo({ precio: precio({ vigenteHasta: "2026-09-12T23:59:59.000Z" }) }), { grupo: GRUPO, ahora: AHORA });
  assert.equal(s.vigenteHasta?.toISOString(), "2026-09-12T23:59:59.000Z");
});

// ── cantidadBasePara / avisos ─────────────────────────────────────────────────

test("cantidadBasePara: cada base multiplica por lo que corresponde", () => {
  const g = { adultos: 2, ninos: 2, habitaciones: 2 };
  assert.equal(cantidadBasePara("POR_PASAJERO", g), 4);
  assert.equal(cantidadBasePara("POR_PERSONA_EN_DOBLE", g), 4);
  assert.equal(cantidadBasePara("POR_PERSONA_EN_SINGLE", g), 4);
  assert.equal(cantidadBasePara("POR_PERSONA_EN_TRIPLE", g), 4);
  assert.equal(cantidadBasePara("POR_HABITACION", g), 2);
  assert.equal(cantidadBasePara("TOTAL", g), 1);
});

test("cantidadBasePara: nunca menor a 1", () => {
  assert.equal(cantidadBasePara("POR_PASAJERO", { adultos: 0, ninos: 0, habitaciones: 0 }), 1);
  assert.equal(cantidadBasePara("POR_HABITACION", { adultos: 2, ninos: 0, habitaciones: 0 }), 1);
});

test("avisosDeBase: doble con personas impares avisa; habitaciones múltiples avisa", () => {
  assert.equal(avisosDeBase("POR_PERSONA_EN_DOBLE", { adultos: 3, ninos: 0, habitaciones: 2 }).length, 1);
  assert.equal(avisosDeBase("POR_PERSONA_EN_DOBLE", { adultos: 2, ninos: 0, habitaciones: 1 }).length, 0);
  assert.equal(avisosDeBase("POR_HABITACION", { adultos: 4, ninos: 0, habitaciones: 2 }).length, 1);
  assert.equal(avisosDeBase("TOTAL", { adultos: 4, ninos: 0, habitaciones: 2 }).length, 0);
});

// ── vigencia / totales / descripciones ───────────────────────────────────────

test("estadoVigencia: vigente, vencida, sin-vigencia", () => {
  assert.equal(estadoVigencia({ vigenteHasta: new Date("2026-09-10T00:00:00Z") }, AHORA), "vigente");
  assert.equal(estadoVigencia({ vigenteHasta: new Date("2026-09-08T00:00:00Z") }, AHORA), "vencida");
  assert.equal(estadoVigencia({ vigenteHasta: null }, AHORA), "sin-vigencia");
});

test("totalesPorMoneda: nunca mezcla monedas; ordena por moneda", () => {
  const t = totalesPorMoneda([
    { moneda: "USD", precioTotal: 100.1 },
    { moneda: "ARS", precioTotal: 50000 },
    { moneda: "USD", precioTotal: 0.2 },
  ]);
  assert.deepEqual(t, [
    { moneda: "ARS", total: 50000 },
    { moneda: "USD", total: 100.3 },
  ]);
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
