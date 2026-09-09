// Tests del adapter Amadeus: mapeo PURO con fixtures representativos de la API
// (Flight Offers Search v2 / Hotel Search v3) + transporte falso. Sin red, sin
// credenciales. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AmadeusProveedorOfertas,
  BASE_URL,
  configAmadeusDesdeEnv,
  duracionIsoAMin,
  mapearOfertasHotel,
  mapearOfertasVuelo,
  type RawFlightOffersAmadeus,
  type RawHotelOffersAmadeus,
  type TransporteAmadeus,
} from "./adapter";

const CAPTURA = "2026-09-09T12:00:00.000Z";

// Fixture recortado de la forma real de /v2/shopping/flight-offers.
const VUELOS: RawFlightOffersAmadeus = {
  data: [
    {
      id: "1",
      lastTicketingDate: "2026-09-12",
      numberOfBookableSeats: 7,
      itineraries: [
        {
          duration: "PT13H30M",
          segments: [
            { departure: { iataCode: "EZE", at: "2026-11-10T22:15:00" }, arrival: { iataCode: "MAD", at: "2026-11-11T15:45:00" }, carrierCode: "IB", number: "6842", duration: "PT13H30M" },
          ],
        },
        {
          duration: "PT12H50M",
          segments: [
            { departure: { iataCode: "MAD", at: "2026-11-20T00:05:00" }, arrival: { iataCode: "EZE", at: "2026-11-20T08:55:00" }, carrierCode: "IB", number: "6841", duration: "PT12H50M" },
          ],
        },
      ],
      price: { currency: "USD", total: "1701.00", grandTotal: "1701.00" },
      travelerPricings: [
        { travelerType: "ADULT", price: { currency: "USD", total: "850.50" }, fareDetailsBySegment: [{ includedCheckedBags: { quantity: 1 } }] },
        { travelerType: "ADULT", price: { currency: "USD", total: "850.50" } },
      ],
    },
    // Sin precio → se descarta (nunca se inventa un precio).
    { id: "2", itineraries: [{ segments: [{ departure: { iataCode: "EZE", at: "x" }, arrival: { iataCode: "MAD", at: "y" } }] }] },
    // Sin travelerPricings: cae a grandTotal / 1.
    { id: "3", itineraries: [{ segments: [{ departure: { iataCode: "AEP", at: "2026-11-10T08:00:00" }, arrival: { iataCode: "COR", at: "2026-11-10T09:20:00" }, carrierCode: "AR", number: "1520" }] }], price: { currency: "ARS", grandTotal: "120000.50" }, travelerPricings: [{ travelerType: "ADULT" }] },
  ],
};

const HOTELES: RawHotelOffersAmadeus = {
  data: [
    {
      hotel: { hotelId: "HLMAD001", name: "Hotel Madrid Centro", cityCode: "MAD", rating: "4" },
      available: true,
      offers: [
        {
          id: "OF1",
          checkInDate: "2026-11-11",
          checkOutDate: "2026-11-16",
          boardType: "BREAKFAST",
          room: { type: "A1K", typeEstimated: { category: "STANDARD_ROOM", beds: 1, bedType: "KING" }, description: { text: "Standard King Room" } },
          guests: { adults: 2 },
          price: { currency: "EUR", total: "612.30", base: "540.00" },
          policies: { cancellations: [{ deadline: "2026-11-09T23:59:00+01:00" }] },
        },
        { id: "OF2", checkInDate: "2026-11-11", checkOutDate: "2026-11-16", boardType: "ROOM_ONLY", price: { currency: "EUR", total: "480.00" }, policies: { refundable: { cancellationRefund: "NON_REFUNDABLE" } } },
        { id: "OF3", price: { currency: "EUR" } }, // sin total → se descarta
      ],
    },
    { hotel: { hotelId: "HLMAD002", name: "Sin disponibilidad" }, available: false, offers: [{ id: "OFX", price: { currency: "EUR", total: "1" } }] },
  ],
};

test("duracionIsoAMin", () => {
  assert.equal(duracionIsoAMin("PT2H30M"), 150);
  assert.equal(duracionIsoAMin("PT45M"), 45);
  assert.equal(duracionIsoAMin("PT13H"), 780);
  assert.equal(duracionIsoAMin("P1DT2H"), 1560);
  assert.equal(duracionIsoAMin("raro"), undefined);
  assert.equal(duracionIsoAMin(undefined), undefined);
});

test("mapearOfertasVuelo: precio POR_PASAJERO del adulto, vigencia desde lastTicketingDate, descarta sin precio", () => {
  const out = mapearOfertasVuelo(VUELOS, CAPTURA);
  assert.equal(out.length, 2);
  const [a, c] = out;
  assert.equal(a.referenciaProveedor, "1");
  assert.equal(a.proveedor, "amadeus");
  assert.equal(a.precio.monto, 850.5);
  assert.equal(a.precio.moneda, "USD");
  assert.equal(a.precio.baseOcupacion, "POR_PASAJERO");
  assert.equal(a.precio.capturadoEn, CAPTURA);
  assert.equal(a.precio.vigenteHasta, "2026-09-12T23:59:59.000Z");
  assert.deepEqual(a.totalGrupo, { monto: 1701, moneda: "USD" });
  assert.equal(a.equipajeIncluido, true);
  assert.equal(a.asientosDisponibles, 7);
  assert.equal(a.tramos.length, 2);
  assert.equal(a.tramos[0].segmentos[0].numeroVuelo, "IB6842");
  assert.equal(a.tramos[0].duracionTotalMin, 810);
  // Fallback grandTotal / travelerPricings.length
  assert.equal(c.referenciaProveedor, "3");
  assert.equal(c.precio.monto, 120000.5);
  assert.equal(c.precio.moneda, "ARS");
  assert.equal(c.precio.vigenteHasta, undefined);
});

test("mapearOfertasHotel: POR_HABITACION por toda la estadía, régimen en criollo, descarta sin total y no disponibles", () => {
  const out = mapearOfertasHotel(HOTELES, CAPTURA);
  assert.equal(out.length, 2);
  const [a, b] = out;
  assert.equal(a.referenciaProveedor, "OF1");
  assert.equal(a.hotel.nombre, "Hotel Madrid Centro");
  assert.equal(a.hotel.estrellas, 4);
  assert.equal(a.hotel.ciudad, "MAD");
  assert.equal(a.habitacion.descripcion, "Standard King Room");
  assert.equal(a.habitacion.regimen, "con desayuno");
  assert.equal(a.noches, 5);
  assert.equal(a.precio.monto, 612.3);
  assert.equal(a.precio.moneda, "EUR");
  assert.equal(a.precio.baseOcupacion, "POR_HABITACION");
  assert.equal(a.precio.capturadoEn, CAPTURA);
  assert.match(a.politicaCancelacion ?? "", /Cancelación sin cargo hasta/);
  assert.equal(b.habitacion.regimen, "solo alojamiento");
  assert.equal(b.politicaCancelacion, "No reembolsable");
});

test("configAmadeusDesdeEnv: null sin credenciales; ambiente test por default", () => {
  assert.equal(configAmadeusDesdeEnv({}), null);
  assert.equal(configAmadeusDesdeEnv({ AMADEUS_CLIENT_ID: "a" }), null);
  assert.deepEqual(configAmadeusDesdeEnv({ AMADEUS_CLIENT_ID: "a", AMADEUS_CLIENT_SECRET: "b" }), { clientId: "a", clientSecret: "b", ambiente: "test" });
  assert.equal(configAmadeusDesdeEnv({ AMADEUS_CLIENT_ID: "a", AMADEUS_CLIENT_SECRET: "b", AMADEUS_ENV: "production" })?.ambiente, "production");
});

// Transporte falso: registra las llamadas y responde fixtures.
function transporteFalso() {
  const llamadas: Array<{ metodo: string; url: string; query?: Record<string, string>; bearer?: string }> = [];
  let tokens = 0;
  const t: TransporteAmadeus = {
    async postForm(url, form) {
      llamadas.push({ metodo: "POST", url, query: form });
      tokens++;
      return { access_token: `tok-${tokens}`, expires_in: 1799 };
    },
    async getJson(url, query, bearer) {
      llamadas.push({ metodo: "GET", url, query, bearer });
      if (url.endsWith("/v2/shopping/flight-offers")) return VUELOS;
      if (url.endsWith("/hotels/by-city")) return { data: [{ hotelId: "HLMAD001" }, { hotelId: "HLMAD002" }, { hotelId: "HLMAD003" }] };
      if (url.endsWith("/v3/shopping/hotel-offers")) return HOTELES;
      throw new Error(`url inesperada ${url}`);
    },
  };
  return { t, llamadas, tokens: () => tokens };
}

test("adapter vuelos: pide token una vez, arma la query correcta contra el ambiente de test y marca avisos", async () => {
  const { t, llamadas, tokens } = transporteFalso();
  let ahora = Date.parse("2026-09-09T12:00:00Z");
  const a = new AmadeusProveedorOfertas({ clientId: "id", clientSecret: "sec", ambiente: "test" }, t, () => new Date(ahora));
  const r = await a.buscarVuelos({ origen: "EZE", destino: "MAD", fechaIda: "2026-11-10", fechaVuelta: "2026-11-20", adultos: 2, ninos: 1, moneda: "USD", maxResultados: 3 });
  ahora += 60_000;
  await a.buscarVuelos({ origen: "EZE", destino: "MAD", fechaIda: "2026-11-10", adultos: 1 });
  assert.equal(tokens(), 1); // token cacheado
  const get = llamadas.find((l) => l.metodo === "GET")!;
  assert.equal(get.url, `${BASE_URL.test}/v2/shopping/flight-offers`);
  assert.equal(get.bearer, "tok-1");
  assert.deepEqual(get.query, { originLocationCode: "EZE", destinationLocationCode: "MAD", departureDate: "2026-11-10", adults: "2", max: "3", returnDate: "2026-11-20", children: "1", currencyCode: "USD" });
  assert.equal(r.proveedor, "amadeus");
  assert.equal(r.ofertas.length, 2);
  assert.ok(r.avisos.some((x) => /prueba/i.test(x)));
});

test("adapter vuelos: renueva el token cuando vence", async () => {
  const { t, tokens } = transporteFalso();
  let ahora = Date.parse("2026-09-09T12:00:00Z");
  const a = new AmadeusProveedorOfertas({ clientId: "id", clientSecret: "sec", ambiente: "production" }, t, () => new Date(ahora));
  await a.buscarVuelos({ origen: "EZE", destino: "MAD", fechaIda: "2026-11-10", adultos: 1 });
  ahora += 1800_000; // 30 min después
  const r = await a.buscarVuelos({ origen: "EZE", destino: "MAD", fechaIda: "2026-11-10", adultos: 1 });
  assert.equal(tokens(), 2);
  assert.deepEqual(r.avisos, []); // producción: sin aviso de prueba
});

test("adapter hoteles: 2 llamadas (lista por ciudad + ofertas) y el tope limita los hotelIds cotizados", async () => {
  const { t, llamadas } = transporteFalso();
  const a = new AmadeusProveedorOfertas({ clientId: "id", clientSecret: "sec", ambiente: "test" }, t);
  const r = await a.buscarHoteles({ ciudad: "MAD", checkIn: "2026-11-11", checkOut: "2026-11-16", adultos: 2, habitaciones: 1, moneda: "EUR", maxResultados: 2 });
  const gets = llamadas.filter((l) => l.metodo === "GET");
  assert.equal(gets.length, 2);
  assert.deepEqual(gets[0].query, { cityCode: "MAD" });
  assert.deepEqual(gets[1].query, { hotelIds: "HLMAD001,HLMAD002", checkInDate: "2026-11-11", checkOutDate: "2026-11-16", adults: "2", roomQuantity: "1", currency: "EUR" });
  assert.equal(r.ofertas.length, 2);
});
