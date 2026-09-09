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
 * INVARIANTE DURA (caso real que originó el módulo): todo precio que sale de un
 * adapter trae `capturadoEn` y `baseOcupacion` OBLIGATORIOS. Confundir "precio por
 * habitación" con "precio por persona" duplica un presupuesto; un precio sin fecha de
 * captura no se puede defender ante el cliente. El tipo no admite omitirlos; el core
 * (`src/lib/viajes/core.ts`) lo re-valida en runtime antes de congelar.
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
 * BASE DE OCUPACIÓN de un precio — QUÉ unidad cubre el importe. Es la pieza que evita
 * el error de duplicar/halvar un presupuesto. Vocabulario del rubro (agencias):
 *  - POR_PERSONA_EN_DOBLE : hotel, precio por persona compartiendo habitación doble.
 *  - POR_PERSONA_EN_SINGLE: hotel, precio por persona en habitación single.
 *  - POR_PERSONA_EN_TRIPLE: hotel, precio por persona en habitación triple.
 *  - POR_HABITACION       : hotel, precio de la habitación completa por toda la estadía.
 *  - POR_PASAJERO         : vuelo, precio por pasajero (tarifa + tasas).
 *  - TOTAL                : importe total del ítem para todo el grupo/estadía.
 * Espeja el enum `BaseOcupacionViaje` del schema Prisma (mismos literales).
 */
export type BaseOcupacion =
  | "POR_PERSONA_EN_DOBLE"
  | "POR_PERSONA_EN_SINGLE"
  | "POR_PERSONA_EN_TRIPLE"
  | "POR_HABITACION"
  | "POR_PASAJERO"
  | "TOTAL";

export const BASES_OCUPACION: readonly BaseOcupacion[] = [
  "POR_PERSONA_EN_DOBLE",
  "POR_PERSONA_EN_SINGLE",
  "POR_PERSONA_EN_TRIPLE",
  "POR_HABITACION",
  "POR_PASAJERO",
  "TOTAL",
];

/** Etiquetas en criollo para la UI (ADR-080: cero jerga en pantalla). */
export const BASE_OCUPACION_LABEL: Record<BaseOcupacion, string> = {
  POR_PERSONA_EN_DOBLE: "por persona en doble",
  POR_PERSONA_EN_SINGLE: "por persona en single",
  POR_PERSONA_EN_TRIPLE: "por persona en triple",
  POR_HABITACION: "por habitación (toda la estadía)",
  POR_PASAJERO: "por pasajero",
  TOTAL: "total del ítem",
};

/**
 * Un precio normalizado. Los cuatro campos son OBLIGATORIOS a propósito: sin
 * `capturadoEn` y `baseOcupacion` un precio no existe en este sistema.
 */
export interface PrecioOferta {
  /** Importe en pesos/dólares con 2 decimales (number en memoria, ADR-057). */
  monto: number;
  moneda: Moneda;
  baseOcupacion: BaseOcupacion;
  /** Cuándo se obtuvo el precio del proveedor (instante de la respuesta). */
  capturadoEn: InstanteISO;
  /** Hasta cuándo el proveedor lo garantiza (p.ej. lastTicketingDate). Ausente = no informa. */
  vigenteHasta?: InstanteISO;
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
  /** Precio por pasajero adulto (baseOcupacion POR_PASAJERO) salvo que el adapter indique otra base. */
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
  /** Precio de la habitación por toda la estadía (POR_HABITACION) salvo indicación del adapter. */
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
  /** Clave estable del proveedor (p.ej. "amadeus", "stub", "manual"). Se persiste en el snapshot. */
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
