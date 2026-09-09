/**
 * ADAPTER real: implementa `ProveedorOfertas` contra Amadeus Self-Service APIs.
 *
 * Endpoints que usa (REST, JSON):
 *  - POST /v1/security/oauth2/token          (client_credentials → access token, ~30 min)
 *  - GET  /v2/shopping/flight-offers         (Flight Offers Search)
 *  - GET  /v1/reference-data/locations/hotels/by-city   (hoteles de una ciudad → ids)
 *  - GET  /v3/shopping/hotel-offers          (Hotel Search: ofertas por hotelIds)
 *
 * Dos ambientes: `test` (https://test.api.amadeus.com — gratis, datos parciales y
 * cacheados: PRECIOS ORIENTATIVOS) y `production` (https://api.amadeus.com — pago por
 * llamada más allá de la cuota gratis). El ambiente sale de config, default `test`.
 *
 * Misma disciplina que `src/plugins/mercadopago/http.ts`:
 *  - El MAPEO (payload crudo → modelo normalizado) es PURO y exportado: se testea con
 *    fixtures representativos, sin red ni credenciales.
 *  - El transporte vive detrás de `TransporteAmadeus` (inyectable): en producción
 *    hace `fetch`; en tests se mockea.
 *  - Credenciales por env (`AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET`): las pega
 *    el dueño (FASE 2), jamás al repo. Sin credenciales la fábrica devuelve `null`.
 *
 * Búsqueda de hoteles = 2 llamadas (lista por ciudad + ofertas). El tope
 * `maxResultados` limita cuántos hotelIds se cotizan: es la palanca de gasto.
 */

import {
  ProveedorOfertasError,
  type BusquedaHoteles,
  type BusquedaVuelos,
  type InstanteISO,
  type OfertaHotel,
  type OfertaVuelo,
  type ProveedorOfertas,
  type ResultadoBusqueda,
  type SegmentoVuelo,
  type TramoVuelo,
} from "../port";
import { round2 } from "@/lib/round";

export const CLAVE_AMADEUS = "amadeus";

export type AmbienteAmadeus = "test" | "production";

export const BASE_URL: Record<AmbienteAmadeus, string> = {
  test: "https://test.api.amadeus.com",
  production: "https://api.amadeus.com",
};

export interface ConfigAmadeus {
  clientId: string;
  clientSecret: string;
  ambiente: AmbienteAmadeus;
}

/** Lee la config desde env. `null` si faltan credenciales (proveedor no operable). */
export function configAmadeusDesdeEnv(
  env: Record<string, string | undefined> = process.env,
): ConfigAmadeus | null {
  const clientId = env.AMADEUS_CLIENT_ID?.trim();
  const clientSecret = env.AMADEUS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const ambiente: AmbienteAmadeus = env.AMADEUS_ENV?.trim().toLowerCase() === "production" ? "production" : "test";
  return { clientId, clientSecret, ambiente };
}

// ── Transporte (inyectable) ───────────────────────────────────────────────────

export interface TransporteAmadeus {
  /** POST form-urlencoded (token). */
  postForm(url: string, form: Record<string, string>): Promise<unknown>;
  /** GET JSON con bearer. */
  getJson(url: string, query: Record<string, string>, bearer: string): Promise<unknown>;
}

export class TransporteFetch implements TransporteAmadeus {
  async postForm(url: string, form: Record<string, string>): Promise<unknown> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
    if (!res.ok) throw new ProveedorOfertasError(CLAVE_AMADEUS, `token HTTP ${res.status}`);
    return res.json();
  }

  async getJson(url: string, query: Record<string, string>, bearer: string): Promise<unknown> {
    const u = new URL(url);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    const res = await fetch(u, { headers: { authorization: `Bearer ${bearer}` } });
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => "");
      throw new ProveedorOfertasError(CLAVE_AMADEUS, `HTTP ${res.status} en ${u.pathname}: ${cuerpo.slice(0, 300)}`);
    }
    return res.json();
  }
}

// ── Forma cruda (solo lo que usamos) ──────────────────────────────────────────

export interface RawTokenAmadeus {
  access_token?: string;
  expires_in?: number;
}

export interface RawSegmentoAmadeus {
  departure?: { iataCode?: string; at?: string };
  arrival?: { iataCode?: string; at?: string };
  carrierCode?: string;
  number?: string;
  duration?: string; // ISO-8601 "PT2H30M"
}

export interface RawFlightOfferAmadeus {
  id?: string;
  lastTicketingDate?: string; // "AAAA-MM-DD"
  numberOfBookableSeats?: number;
  itineraries?: Array<{ duration?: string; segments?: RawSegmentoAmadeus[] }>;
  price?: { currency?: string; total?: string; grandTotal?: string };
  travelerPricings?: Array<{
    travelerType?: string;
    price?: { currency?: string; total?: string };
    fareDetailsBySegment?: Array<{ includedCheckedBags?: { quantity?: number } }>;
  }>;
}

export interface RawFlightOffersAmadeus {
  data?: RawFlightOfferAmadeus[];
}

export interface RawHotelListAmadeus {
  data?: Array<{ hotelId?: string; name?: string }>;
}

export interface RawHotelOfferAmadeus {
  id?: string;
  checkInDate?: string;
  checkOutDate?: string;
  boardType?: string; // ROOM_ONLY | BREAKFAST | HALF_BOARD | FULL_BOARD | ALL_INCLUSIVE
  room?: { type?: string; typeEstimated?: { category?: string; beds?: number; bedType?: string }; description?: { text?: string } };
  guests?: { adults?: number };
  price?: { currency?: string; total?: string; base?: string };
  policies?: { cancellations?: Array<{ deadline?: string; amount?: string }>; refundable?: { cancellationRefund?: string } };
}

export interface RawHotelOffersAmadeus {
  data?: Array<{
    hotel?: { hotelId?: string; name?: string; cityCode?: string; rating?: string };
    available?: boolean;
    offers?: RawHotelOfferAmadeus[];
  }>;
}

// ── Mapeo PURO ────────────────────────────────────────────────────────────────

/** "PT2H30M" → 150. `undefined` si no parsea. */
export function duracionIsoAMin(d?: string): number | undefined {
  if (!d) return undefined;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/.exec(d);
  if (!m) return undefined;
  const dias = Number(m[1] ?? 0);
  const h = Number(m[2] ?? 0);
  const min = Number(m[3] ?? 0);
  return dias * 1440 + h * 60 + min;
}

function num(s?: string): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const REGIMEN: Record<string, string> = {
  ROOM_ONLY: "solo alojamiento",
  BREAKFAST: "con desayuno",
  HALF_BOARD: "media pensión",
  FULL_BOARD: "pensión completa",
  ALL_INCLUSIVE: "todo incluido",
};

function nochesEntre(checkIn?: string, checkOut?: string): number {
  if (!checkIn || !checkOut) return 1;
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

/**
 * Flight Offers Search → `OfertaVuelo[]`. El precio normalizado es POR PASAJERO
 * (adulto): `travelerPricings[ADULT].price.total`. Si no viene, cae a
 * `price.grandTotal / cantidad de travelerPricings`. `lastTicketingDate` se convierte
 * en `vigenteHasta` (fin de ese día, UTC). Ofertas sin precio se descartan (nunca se
 * inventa un precio).
 */
export function mapearOfertasVuelo(raw: RawFlightOffersAmadeus, capturadoEn: InstanteISO): OfertaVuelo[] {
  const out: OfertaVuelo[] = [];
  for (const o of raw.data ?? []) {
    const moneda = o.price?.currency ?? o.travelerPricings?.[0]?.price?.currency;
    const adulto = o.travelerPricings?.find((t) => t.travelerType === "ADULT") ?? o.travelerPricings?.[0];
    const porPax = num(adulto?.price?.total);
    const total = num(o.price?.grandTotal ?? o.price?.total);
    const cantPax = o.travelerPricings?.length ?? 0;
    const monto = porPax ?? (total != null && cantPax > 0 ? total / cantPax : null);
    if (!o.id || !moneda || monto == null) continue;

    const tramos: TramoVuelo[] = (o.itineraries ?? []).map((it) => ({
      segmentos: (it.segments ?? []).flatMap((s): SegmentoVuelo[] => {
        if (!s.departure?.iataCode || !s.arrival?.iataCode || !s.departure.at || !s.arrival.at) return [];
        return [
          {
            origen: s.departure.iataCode,
            destino: s.arrival.iataCode,
            salida: s.departure.at,
            llegada: s.arrival.at,
            aerolinea: s.carrierCode ?? "",
            numeroVuelo: `${s.carrierCode ?? ""}${s.number ?? ""}`,
            duracionMin: duracionIsoAMin(s.duration),
          },
        ];
      }),
      duracionTotalMin: duracionIsoAMin(it.duration),
    }));
    if (tramos.length === 0 || tramos.some((t) => t.segmentos.length === 0)) continue;

    const bags = adulto?.fareDetailsBySegment?.[0]?.includedCheckedBags?.quantity;
    out.push({
      referenciaProveedor: o.id,
      proveedor: CLAVE_AMADEUS,
      tramos,
      precio: {
        monto: round2(monto),
        moneda,
        baseOcupacion: "POR_PASAJERO",
        capturadoEn,
        ...(o.lastTicketingDate ? { vigenteHasta: `${o.lastTicketingDate}T23:59:59.000Z` } : {}),
      },
      ...(total != null ? { totalGrupo: { monto: round2(total), moneda } } : {}),
      ...(bags != null ? { equipajeIncluido: bags > 0 } : {}),
      ...(o.numberOfBookableSeats != null ? { asientosDisponibles: o.numberOfBookableSeats } : {}),
    });
  }
  return out;
}

/**
 * Hotel Search v3 → `OfertaHotel[]`. En v3 cada `offer` es UNA habitación por toda la
 * estadía: `price.total` → POR_HABITACION. Sin precio o sin id, se descarta.
 */
export function mapearOfertasHotel(raw: RawHotelOffersAmadeus, capturadoEn: InstanteISO): OfertaHotel[] {
  const out: OfertaHotel[] = [];
  for (const h of raw.data ?? []) {
    if (h.available === false) continue;
    const nombre = h.hotel?.name;
    if (!nombre) continue;
    const estrellas = h.hotel?.rating ? Number(h.hotel.rating) : undefined;
    for (const of of h.offers ?? []) {
      const monto = num(of.price?.total);
      const moneda = of.price?.currency;
      if (!of.id || monto == null || !moneda) continue;
      const deadline = of.policies?.cancellations?.[0]?.deadline;
      const reembolsable = of.policies?.refundable?.cancellationRefund;
      const politica =
        reembolsable === "NON_REFUNDABLE"
          ? "No reembolsable"
          : deadline
            ? `Cancelación sin cargo hasta ${deadline}`
            : undefined;
      out.push({
        referenciaProveedor: of.id,
        proveedor: CLAVE_AMADEUS,
        hotel: {
          nombre,
          ...(h.hotel?.hotelId ? { codigo: h.hotel.hotelId } : {}),
          ...(h.hotel?.cityCode ? { ciudad: h.hotel.cityCode } : {}),
          ...(estrellas != null && Number.isFinite(estrellas) ? { estrellas } : {}),
        },
        habitacion: {
          descripcion: of.room?.description?.text?.trim() || of.room?.typeEstimated?.category || of.room?.type || "Habitación",
          ...(of.room?.typeEstimated?.category ? { tipo: of.room.typeEstimated.category } : {}),
          ...(of.boardType ? { regimen: REGIMEN[of.boardType] ?? of.boardType.toLowerCase() } : {}),
        },
        checkIn: of.checkInDate ?? "",
        checkOut: of.checkOutDate ?? "",
        noches: nochesEntre(of.checkInDate, of.checkOutDate),
        precio: { monto: round2(monto), moneda, baseOcupacion: "POR_HABITACION", capturadoEn },
        ...(politica ? { politicaCancelacion: politica } : {}),
      });
    }
  }
  return out;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class AmadeusProveedorOfertas implements ProveedorOfertas {
  readonly clave = CLAVE_AMADEUS;
  private token: { valor: string; expiraMs: number } | null = null;

  constructor(
    private readonly config: ConfigAmadeus,
    private readonly transporte: TransporteAmadeus = new TransporteFetch(),
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  private get base(): string {
    return BASE_URL[this.config.ambiente];
  }

  private avisos(): string[] {
    return this.config.ambiente === "test"
      ? ["Ambiente de prueba de Amadeus: precios orientativos, no confirmables."]
      : [];
  }

  /** Token cacheado en memoria; se renueva 60 s antes de vencer. */
  private async bearer(): Promise<string> {
    const ahoraMs = this.ahora().getTime();
    if (this.token && this.token.expiraMs - 60_000 > ahoraMs) return this.token.valor;
    const raw = (await this.transporte.postForm(`${this.base}/v1/security/oauth2/token`, {
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    })) as RawTokenAmadeus;
    if (!raw?.access_token) throw new ProveedorOfertasError(CLAVE_AMADEUS, "token vacío");
    this.token = { valor: raw.access_token, expiraMs: ahoraMs + (raw.expires_in ?? 1799) * 1000 };
    return this.token.valor;
  }

  async buscarVuelos(b: BusquedaVuelos): Promise<ResultadoBusqueda<OfertaVuelo>> {
    const bearer = await this.bearer();
    const query: Record<string, string> = {
      originLocationCode: b.origen,
      destinationLocationCode: b.destino,
      departureDate: b.fechaIda,
      adults: String(b.adultos),
      max: String(Math.min(Math.max(b.maxResultados ?? 5, 1), 20)),
    };
    if (b.fechaVuelta) query.returnDate = b.fechaVuelta;
    if (b.ninos) query.children = String(b.ninos);
    if (b.moneda) query.currencyCode = b.moneda;
    const capturadoEn = this.ahora().toISOString();
    const raw = (await this.transporte.getJson(`${this.base}/v2/shopping/flight-offers`, query, bearer)) as RawFlightOffersAmadeus;
    return { ofertas: mapearOfertasVuelo(raw, capturadoEn), proveedor: CLAVE_AMADEUS, capturadoEn, desdeCache: false, avisos: this.avisos() };
  }

  async buscarHoteles(b: BusquedaHoteles): Promise<ResultadoBusqueda<OfertaHotel>> {
    const bearer = await this.bearer();
    // 1) hoteles de la ciudad → ids (tope = palanca de gasto: cada id cotizado cuesta).
    const lista = (await this.transporte.getJson(
      `${this.base}/v1/reference-data/locations/hotels/by-city`,
      { cityCode: b.ciudad },
      bearer,
    )) as RawHotelListAmadeus;
    const tope = Math.min(Math.max(b.maxResultados ?? 5, 1), 20);
    const ids = (lista.data ?? []).map((h) => h.hotelId).filter((x): x is string => !!x).slice(0, tope);
    const capturadoEn = this.ahora().toISOString();
    if (ids.length === 0) {
      return { ofertas: [], proveedor: CLAVE_AMADEUS, capturadoEn, desdeCache: false, avisos: [...this.avisos(), "Sin hoteles para esa ciudad en el proveedor."] };
    }
    // 2) ofertas de esos hoteles.
    const query: Record<string, string> = {
      hotelIds: ids.join(","),
      checkInDate: b.checkIn,
      checkOutDate: b.checkOut,
      adults: String(b.adultos),
      roomQuantity: String(b.habitaciones ?? 1),
    };
    if (b.moneda) query.currency = b.moneda;
    const raw = (await this.transporte.getJson(`${this.base}/v3/shopping/hotel-offers`, query, bearer)) as RawHotelOffersAmadeus;
    return { ofertas: mapearOfertasHotel(raw, capturadoEn), proveedor: CLAVE_AMADEUS, capturadoEn, desdeCache: false, avisos: this.avisos() };
  }
}
