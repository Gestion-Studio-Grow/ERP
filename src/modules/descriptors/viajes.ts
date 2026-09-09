// ============================================================================
// Descriptor del módulo VIAJES — armador de presupuestos de viaje (ADR-002/054/055).
// ============================================================================
//
// Capability NATIVA del Core (mecanismo B de ADR-002: "presupuesto de viaje con
// opciones congeladas" es un concepto genuinamente nuevo y reutilizable por cualquier
// agencia — no un campo de extensión ni una tabla del blueprint). Vive en
// `src/lib/viajes` (core + actions) y `src/plugins/ofertas-viaje` (conector externo
// de vuelos/hoteles, hexagonal: port + adapters Amadeus/stub).
//
// VARIANTE (ADR-055): compatible SOLO con el rubro `agencia-viajes`. Que sea compatible
// no lo activa: se ASIGNA tenant por tenant desde la consola de operador — una estética
// jamás lo ve, aunque su OWNER tenga todas las capabilities. Nunca "todos con todo".
//
// Además corre detrás del flag `VIAJES_ENABLED` (default OFF): con el flag apagado el
// módulo es invisible aunque esté asignado (rollout reversible sin tocar datos).

import type { ModuleDescriptor } from "../contract";

export const MODULO_VIAJES = "viajes";

export const viajesModule: ModuleDescriptor = {
  id: MODULO_VIAJES,
  version: "0.1.0", // esqueleto vertical (conector + snapshot + schema); UI mínima
  nombre: "Presupuestos de viaje",
  descripcion:
    "Armá presupuestos de viaje buscando vuelos y hoteles en proveedores conectados. Cada opción se guarda con su precio congelado, la base (por persona / por habitación), la fecha de captura y la vigencia.",
  kind: "capability",
  capability: "viajes:manage",
  rubros: ["agencia-viajes"],
  dependencias: [{ id: "clients", rango: "^1.0" }], // el pasajero principal es un Client del Core
  flag: "VIAJES_ENABLED",
  grupo: "ventas-mostrador",
  resumen: "Buscás vuelos y hoteles, elegís opciones y armás el presupuesto para mandarle al cliente.",
  fit: "Agencias de viaje que cotizan a mano y necesitan trazabilidad de cada precio.",
  scopeItems: [
    { label: "Buscar vuelos y hoteles en el proveedor conectado", ruta: "/admin/viajes" },
    { label: "Guardar opciones con precio congelado, base y fecha de captura" },
    { label: "Armar el presupuesto por cliente y mandarlo" },
  ],
  migraciones: [
    {
      carpeta: "prisma/migrations/20260909120000_add_viajes_presupuestos",
      descripcion:
        "Tablas PresupuestoViaje, OpcionPresupuestoViaje (snapshot), ConsumoProveedorViaje (cuota) y CacheBusquedaViaje + 3 enums.",
      aditiva: true,
    },
  ],
  configSchema: {
    AMADEUS_CLIENT_ID: { tipo: "string", descripcion: "API key de Amadeus Self-Service (la pega el dueño).", secreto: true },
    AMADEUS_CLIENT_SECRET: { tipo: "string", descripcion: "API secret de Amadeus Self-Service.", secreto: true },
    AMADEUS_ENV: { tipo: "string", descripcion: '"test" (default, gratis, orientativo) o "production" (pago por llamada).' },
    VIAJES_PROVEEDOR: { tipo: "string", descripcion: 'Proveedor activo: "stub" (default, sin red) o "amadeus".' },
    VIAJES_CUOTA_DIARIA: { tipo: "number", descripcion: "Tope diario de búsquedas reales por tenant (default 50)." },
  },
};
