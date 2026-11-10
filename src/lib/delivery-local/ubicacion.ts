// ============================================================================
// DELIVERY LOCAL · LA UBICACIÓN DEL CLIENTE — leer, validar y llevarla al repartidor. LÓGICA PURA.
// ============================================================================
//
// El cliente toca «Usar mi ubicación» y el navegador da latitud, longitud y precisión (metros). Acá
// se decide si eso sirve: números de verdad, dentro de la Argentina continental y con una precisión
// que permita encontrar la puerta. La dirección escrita SIEMPRE manda (la ubicación es una ayuda
// para el repartidor, no un reemplazo): si el GPS dice otra cosa, se avisa, no se rechaza.
//
// Sin Prisma, sin red, sin DOM: lo usan el navegador, el servidor y los tests.

export type Ubicacion = { lat: number; lng: number; precisionM: number | null };

export type LecturaUbicacion =
  | { estado: "vacia" }
  | { estado: "ok"; ubicacion: Ubicacion }
  | { estado: "invalida"; motivo: string };

/** Caja que contiene la Argentina continental (con margen). Afuera, el dato vino mal. */
const ARGENTINA = { latMin: -55.2, latMax: -21.7, lngMin: -73.7, lngMax: -53.5 };

/** Más de esto, la ubicación no ayuda a encontrar la puerta: se avisa, pero igual se guarda. */
export const PRECISION_UTIL_M = 150;

function numero(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Lee lo que mandó el formulario (`ubicacionLat`, `ubicacionLng`, `ubicacionPrecision`). */
export function leerUbicacion(lat: unknown, lng: unknown, precision?: unknown): LecturaUbicacion {
  const la = numero(lat);
  const lo = numero(lng);
  if (la === null && lo === null) return { estado: "vacia" };
  if (la === null || lo === null || Number.isNaN(la) || Number.isNaN(lo)) {
    return { estado: "invalida", motivo: "La ubicación llegó incompleta. Escribí bien la dirección y seguimos igual." };
  }
  if (la < ARGENTINA.latMin || la > ARGENTINA.latMax || lo < ARGENTINA.lngMin || lo > ARGENTINA.lngMax) {
    return { estado: "invalida", motivo: "La ubicación no parece de la Argentina. Revisá la dirección escrita." };
  }
  const p = numero(precision);
  const precisionM = p === null || Number.isNaN(p) || p < 0 ? null : Math.round(Math.min(p, 100_000));
  // 5 decimales ≈ 1 metro: alcanza para la puerta y no guarda más de lo necesario (Ley 25.326).
  return { estado: "ok", ubicacion: { lat: redondear5(la), lng: redondear5(lo), precisionM } };
}

function redondear5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/** Distancia en km entre dos puntos (haversine). */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Link que abre el mapa en cualquier teléfono (Google Maps universal; no pide cuenta). */
export function linkDeMapa(u: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${u.lat},${u.lng}`;
}

/** Link para ir directo con el navegador del teléfono (Waze lo abre si está instalado). */
export function linkDeWaze(u: { lat: number; lng: number }): string {
  return `https://waze.com/ul?ll=${u.lat},${u.lng}&navigate=yes`;
}

export type ChequeoDeDistancia =
  | { estado: "sin-dato" }
  | { estado: "dentro"; km: number }
  | { estado: "fuera"; km: number; radioKm: number };

/** ¿Está dentro del radio de reparto del local? Sin ubicación del local o del cliente, no se sabe. */
export function chequearRadio(
  local: { lat: number; lng: number } | null,
  cliente: Ubicacion | null,
  radioKm: number | null,
): ChequeoDeDistancia {
  if (!local || !cliente || radioKm === null) return { estado: "sin-dato" };
  const km = Math.round(distanciaKm(local, cliente) * 10) / 10;
  return km <= radioKm ? { estado: "dentro", km } : { estado: "fuera", km, radioKm };
}

/** El renglón que viaja en la nota del pedido (lo ven el local y el repartidor). */
export function renglonDeUbicacion(u: Ubicacion, distancia: ChequeoDeDistancia): string {
  const precision = u.precisionM !== null && u.precisionM > PRECISION_UTIL_M ? ` (aprox. ${u.precisionM} m, confirmar)` : "";
  const km = distancia.estado === "dentro" || distancia.estado === "fuera" ? ` · ${String(distancia.km).replace(".", ",")} km` : "";
  const aviso = distancia.estado === "fuera" ? " · FUERA DEL RADIO" : "";
  return `Ubicación: ${linkDeMapa(u)}${precision}${km}${aviso}`;
}
