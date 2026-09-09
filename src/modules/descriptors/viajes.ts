// ============================================================================
// Descriptores del módulo VIAJES — armador de presupuestos (ADR-002/054/055).
// Spec funcional: docs/producto/spec-armador-presupuestos-viaje.md (§6 catálogo).
// ============================================================================
//
// DOS módulos, como pide la spec:
//   - `presupuestos-viaje` — capability NATIVA del Core (mecanismo B de ADR-002: pedido,
//     oferta capturada como objeto maestro, presupuesto con niveles/opciones y la
//     asignación oferta→opción con ABM propio). Vive en `src/lib/viajes` + `/admin/viajes`.
//   - `buscador-ofertas-viaje` — PLUGIN opcional (integración externa: Amadeus/stub por el
//     port `src/plugins/ofertas-viaje`). Depende del anterior. Sin él, la agencia captura
//     ofertas a mano (portal del mayorista) con la misma invariante.
//
// VARIANTE (ADR-055): compatibles SOLO con el rubro `viajes`. Que sean compatibles no los
// activa: se ASIGNAN tenant por tenant desde la consola de operador — una estética jamás
// los ve, aunque su OWNER tenga todas las capabilities. Nunca "todos con todo".
//
// Ambos corren detrás del flag `VIAJES_ENABLED` (default OFF): con el flag apagado son
// invisibles aunque estén asignados (rollout reversible sin tocar datos).

import type { ModuleDescriptor } from "../contract";

export const MODULO_PRESUPUESTOS_VIAJE = "presupuestos-viaje";
export const MODULO_BUSCADOR_OFERTAS_VIAJE = "buscador-ofertas-viaje";

const MIGRACION_VIAJES = {
  carpeta: "prisma/migrations/20260909120000_add_viajes_presupuestos",
  descripcion:
    "SolicitudViaje, TramoSolicitudViaje, PresupuestoViaje, NivelPresupuestoViaje, OpcionPresupuestoViaje, OfertaCapturadaViaje (maestro), AsignacionOfertaViaje (relación), ConsumoProveedorViaje, CacheBusquedaViaje + 8 enums.",
  aditiva: true as const,
};

export const presupuestosViajeModule: ModuleDescriptor = {
  id: MODULO_PRESUPUESTOS_VIAJE,
  version: "0.1.0", // esqueleto vertical: pedido → captura → asignación → resumen por opción
  nombre: "Presupuestos de viaje",
  descripcion:
    "Armá presupuestos de viaje por niveles y opciones. Cada oferta se captura una vez con precio congelado, unidad (por persona / por habitación), base de ocupación, fecha de captura, vigencia y certeza; después se asigna a las opciones.",
  kind: "capability",
  capability: "quotes:manage",
  rubros: ["viajes"],
  dependencias: [{ id: "clients", rango: "^1.0" }], // la ficha del contacto es un Client del Core
  flag: "VIAJES_ENABLED",
  grupo: "ventas-mostrador",
  resumen: "Tomás el pedido, capturás ofertas, armás niveles y opciones y le mandás el presupuesto al cliente.",
  fit: "Agencias de viaje que cotizan a mano y necesitan trazabilidad de cada precio.",
  scopeItems: [
    { label: "Bandeja de pedidos y presupuestos", ruta: "/admin/viajes" },
    { label: "Biblioteca de ofertas capturadas (precio congelado, base y fecha)" },
    { label: "Niveles y opciones con precio por persona en doble y single" },
  ],
  migraciones: [MIGRACION_VIAJES],
};

export const buscadorOfertasViajeModule: ModuleDescriptor = {
  id: MODULO_BUSCADOR_OFERTAS_VIAJE,
  version: "0.1.0",
  nombre: "Buscador de vuelos y hoteles",
  descripcion:
    "Busca vuelos y hoteles en el proveedor conectado (Amadeus Self-Service; datos simulados sin credenciales) y captura la oferta elegida directo a la biblioteca, con caché y tope diario de búsquedas.",
  kind: "plugin",
  capability: "quotes:manage",
  rubros: ["viajes"],
  dependencias: [{ id: MODULO_PRESUPUESTOS_VIAJE, rango: "^0.1" }],
  flag: "VIAJES_ENABLED",
  grupo: "ventas-mostrador",
  resumen: "Cotizás vuelos y hoteles desde el panel en vez de abrir diez pestañas.",
  fit: "Agencias con el módulo de presupuestos que quieren precios orientativos al toque.",
  scopeItems: [
    { label: "Buscar vuelos y hoteles", ruta: "/admin/viajes" },
    { label: "Capturar la oferta elegida a la biblioteca" },
  ],
  // Superficie del plugin (ADR-002/006): no escucha el outbox; invoca el comando del Core
  // que crea el objeto maestro (la action `capturarDesdeBusquedaAction`).
  llamaComandos: ["CapturarOfertaViaje"],
  configSchema: {
    AMADEUS_CLIENT_ID: { tipo: "string", descripcion: "API key de Amadeus Self-Service (la pega el dueño).", secreto: true },
    AMADEUS_CLIENT_SECRET: { tipo: "string", descripcion: "API secret de Amadeus Self-Service.", secreto: true },
    AMADEUS_ENV: { tipo: "string", descripcion: '"test" (default, gratis, orientativo) o "production" (pago por llamada).' },
    VIAJES_PROVEEDOR: { tipo: "string", descripcion: 'Proveedor activo: "stub" (default, sin red) o "amadeus".' },
    VIAJES_CUOTA_DIARIA: { tipo: "number", descripcion: "Tope diario de búsquedas reales por tenant (default 50)." },
  },
};
