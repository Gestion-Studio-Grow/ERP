/**
 * OFERTAS DE VIAJE — contrato provider-agnóstico del buscador de vuelos y hoteles.
 *
 * Es el PORT sobre el que habla el módulo "Presupuestos de viaje" (`src/lib/viajes`):
 * NUNCA contra un proveedor concreto. Cada proveedor (Amadeus Self-Service primero;
 * mañana Duffel / un bedbank / carga manual) aporta un ADAPTER que implementa
 * `ProveedorOfertas` y normaliza su payload a `OfertaVuelo` / `OfertaHotel`. Mismo
 * patrón hexagonal que `src/plugins/pagos` (port + registry + adapters real/stub).
 *
 * Regla de dependencias: este módulo NO importa ningún proveedor. Los proveedores
 * importan de acá, no al revés. Dato PURO: sin Prisma, sin red, sin React.
 *
 * INVARIANTE DURA (caso real que originó el módulo, spec §3.3): todo precio que sale
 * de un adapter trae `capturadoEn` y `unidad` OBLIGATORIOS, y `baseOcupacion` si es
 * alojamiento. Confundir "por habitación" con "por persona" duplica un presupuesto; un
 * precio sin fecha de captura no se puede defender ante el cliente. El tipo no admite
 * omitirlos; el core (`src/lib/viajes/core.ts`) lo re-valida en runtime al capturar.
 */

/** Código IATA de aeropuerto o ciudad (3 letras mayúsculas, p.ej. "AEP", "MAD"). */
export type CodigoIata = string;

/** Fecha calendario `AAAA-MM-DD` (sin hora, sin zona: es la fecha local del viaje). */
export type FechaISO = string;

/** Instante ISO-8601 completo con zona (p.ej. "2026-09-09T15:04:05.000Z"). */
export type InstanteISO = string;

/** Moneda ISO-4217 (3 letras mayúsculas): "ARS", "USD", "EUR". */
export type Moneda = string;

/**
 * UNIDAD DE PRECIO — QUÉ cubre el importe (spec §3.3 `unidadDePrecio`).
 *  - POR_PERSONA           : por pasajero/persona (vuelos, seguros, excursiones).
 *  - POR_HABITACION_NOCHE  : la habitación completa, por noche (hace falta `noches`).
 *  - POR_HABITACION_TOTAL  : la habitación completa por toda la estadía.
 *  - POR_TRAMO             : el ítem entero para el grupo (traslado, paquete, tramo).
 * Espeja el enum `UnidadPrecioViaje` del schema Prisma (mismos literales).
 */
export type UnidadPrecio = "POR_PERSONA" | "POR_HABITACION_NOCHE" | "POR_HABITACION_TOTAL" | "POR_TRAMO";

export const UNIDADES_PRECIO: readonly UnidadPrecio[] = [
  "POR_PERSONA",
  "POR_HABITACION_NOCHE",
  "POR_HABITACION_TOTAL",
  "POR_TRAMO",
];

/**
 * BASE DE OCUPACIÓN — con cuántas personas se comparte la habitación (spec §3.3
 * `baseDeOcupacion`). Obligatoria en alojamiento; sin default silencioso. `OTRA`
 * exige `ocupacion` (el número). Espeja `BaseOcupacionViaje` del schema.
 */
export type BaseOcupacion = "SINGLE" | "DOBLE" | "TRIPLE" | "OTRA";

export const BASES_OCUPACION: readonly BaseOcupacion[] = ["SINGLE", "DOBLE", "TRIPLE", "OTRA"];

/** Personas que cubre una base (OTRA → `ocupacion`). */
export function personasPorBase(base: BaseOcupacion, ocupacion?: number | null): number {
  switch (base) {
    case "SINGLE":
      return 1;
    case "DOBLE":
      return 2;
    case "TRIPLE":
      return 3;
    case "OTRA":
      return ocupacion && ocupacion >= 1 ? Math.floor(ocupacion) : 0;
  }
}

/** Base que corresponde a `n` adultos por habitación (para normalizar lo que dice el proveedor). */
export function baseParaPersonas(n: number): { base: BaseOcupacion; ocupacion?: number } {
  if (n <= 1) return { base: "SINGLE" };
  if (n === 2) return { base: "DOBLE" };
  if (n === 3) return { base: "TRIPLE" };
  return { base: "OTRA", ocupacion: Math.floor(n) };
}

/** Etiquetas en criollo para la UI (ADR-080: cero jerga en pantalla). */
export const UNIDAD_PRECIO_LABEL: Record<UnidadPrecio, string> = {
  POR_PERSONA: "por persona",
  POR_HABITACION_NOCHE: "por habitación y noche",
  POR_HABITACION_TOTAL: "por habitación (toda la estadía)",
  POR_TRAMO: "por tramo / ítem completo",
};

export const BASE_OCUPACION_LABEL: Record<BaseOcupacion, string> = {
  SINGLE: "single",
  DOBLE: "doble",
  TRIPLE: "triple",
  OTRA: "otra",
};

/**
 * Un precio normalizado. `monto`, `moneda`, `unidad` y `capturadoEn` son OBLIGATORIOS a
 * propósito; `baseOcupacion` lo es cuando el ítem es alojamiento (lo valida el core).
 */
export interface PrecioOferta {
  /** Importe con 2 decimales (number en memoria, ADR-057). */
  monto: number;
  moneda: Moneda;
  unidad: UnidadPrecio;
  /** Obligatoria en alojamiento. */
  baseOcupacion?: BaseOcupacion;
  /** Solo con `baseOcupacion: "OTRA"`: cuántas personas. */
  ocupacion?: number;
  /** Solo con `POR_HABITACION_NOCHE`: cantidad de noches para totalizar. */
  noches?: number;
  /** Cuándo se obtuvo el precio del proveedor (instante de la respuesta). */
  capturadoEn: InstanteISO;
  /** Hasta cuándo el proveedor lo garantiza (p.ej. lastTicketingDate). Ausente = no informa. */
  vigenteHasta?: InstanteISO;
  /** Si el precio incluye impuestos/tasas según el proveedor. Ausente = no informa. */
  incluyeImpuestos?: "SI" | "NO" | "PARCIAL";
}

// ── Vuelos ────────────────────────────────────────────────────────────────────

export interface BusquedaVuelos {
  origen: CodigoIata;
  destino: CodigoIata;
  fechaIda: FechaISO;
  /** Ausente = solo ida. */
  fechaVuelta?: FechaISO;
  adultos: number;
  ninos?: number;
  /** Moneda en la que se pide cotizar (el proveedor puede ignorarla; el precio dice la suya). */
  moneda?: Moneda;
  /** Tope de resultados a pedir al proveedor (control de gasto: menos = más barato). */
  maxResultados?: number;
}

export interface SegmentoVuelo {
  origen: CodigoIata;
  destino: CodigoIata;
  salida: InstanteISO;
  llegada: InstanteISO;
  /** Código IATA de la aerolínea (2 letras, p.ej. "AR", "IB"). */
  aerolinea: string;
  numeroVuelo: string;
  duracionMin?: number;
}

/** Un tramo (ida o vuelta) = uno o más segmentos encadenados. */
export interface TramoVuelo {
  segmentos: SegmentoVuelo[];
  duracionTotalMin?: number;
}

export interface OfertaVuelo {
  /** Id de la oferta en el proveedor (para re-cotizar o reservar después). */
  referenciaProveedor: string;
  proveedor: string;
  tramos: TramoVuelo[];
  /** Precio por pasajero adulto (unidad POR_PERSONA). */
  precio: PrecioOferta;
  /** Precio total del grupo tal como lo informa el proveedor (si lo informa). */
  totalGrupo?: { monto: number; moneda: Moneda };
  equipajeIncluido?: boolean;
  asientosDisponibles?: number;
}

// ── Hoteles ───────────────────────────────────────────────────────────────────

export interface BusquedaHoteles {
  /** Código IATA de ciudad (p.ej. "BUE", "MAD"). */
  ciudad: CodigoIata;
  checkIn: FechaISO;
  checkOut: FechaISO;
  adultos: number;
  habitaciones?: number;
  moneda?: Moneda;
  /** Tope de hoteles a cotizar (control de gasto). */
  maxResultados?: number;
}

export interface OfertaHotel {
  referenciaProveedor: string;
  proveedor: string;
  hotel: {
    nombre: string;
    codigo?: string;
    ciudad?: CodigoIata;
    estrellas?: number;
  };
  habitacion: {
    descripcion: string;
    tipo?: string;
    /** Régimen de comidas en criollo: "solo alojamiento", "con desayuno", "media pensión", "todo incluido". */
    regimen?: string;
  };
  checkIn: FechaISO;
  checkOut: FechaISO;
  noches: number;
  /** Precio de la habitación por toda la estadía (POR_HABITACION_TOTAL) con su base de ocupación. */
  precio: PrecioOferta;
  politicaCancelacion?: string;
}

// ── Resultado y contrato ───────────────────────────────────────────────────────

export interface ResultadoBusqueda<T> {
  ofertas: T[];
  proveedor: string;
  /** Instante en que el proveedor respondió: es el `capturadoEn` de todas las ofertas. */
  capturadoEn: InstanteISO;
  /** true si vino del caché (no consumió cuota del proveedor). */
  desdeCache: boolean;
  /** Avisos no bloqueantes para mostrar al operador (p.ej. "ambiente de prueba: precios orientativos"). */
  avisos: string[];
}

/**
 * Proveedor de ofertas. Un adapter lo implementa contra la API real (Amadeus,
 * Duffel…); el stub lo implementa en memoria (dev/test/demo). El resto del ERP
 * NUNCA sabe de qué proveedor vino el dato: solo ve este contrato.
 */
export interface ProveedorOfertas {
  /** Clave estable del proveedor (p.ej. "amadeus", "stub"). Se persiste en la oferta capturada. */
  readonly clave: string;
  buscarVuelos(busqueda: BusquedaVuelos): Promise<ResultadoBusqueda<OfertaVuelo>>;
  buscarHoteles(busqueda: BusquedaHoteles): Promise<ResultadoBusqueda<OfertaHotel>>;
}

/** Error de proveedor (red, credenciales, cuota del lado del proveedor). */
export class ProveedorOfertasError extends Error {
  constructor(
    readonly proveedor: string,
    message: string,
    readonly causa?: unknown,
  ) {
    super(`[${proveedor}] ${message}`);
    this.name = "ProveedorOfertasError";
  }
}
