// ============================================================================
// Descriptor del módulo TORNEO — el torneo de pádel de un circuito, guardado en la base (GSG-PLAT-016).
// ============================================================================
//
// Es el motor del sitio de Circuito WPE (src/tenants/circuito-wpe/sitio/index.html, freeze: no se toca) corriendo
// en el SERVIDOR (src/lib/torneo-wpe/motor.server.ts): zonas, llave, resultados, W.O. y reprogramación. El estado
// se guarda como una FOTO en `AuditLog` (entidad `TorneoEstado`, src/lib/torneo-wpe/estado-repo.ts, sin migración):
// por eso `migraciones: []`.
//
// capability "agenda:read": entran todos los usuarios del negocio (el jugador, como PROFESSIONAL, también). Qué
// puede cambiar cada uno lo decide src/lib/torneo-wpe/permisos.ts en cada acción del servidor.
//
// Ningún negocio lo recibe por defecto ni por blueprint: se asigna en `Tenant.modules[]` (hoy, sólo el ambiente de
// pruebas de WPE, scripts/wpe-pruebas-alta.ts).

import type { ModuleDescriptor } from "../contract";

export const torneoModule: ModuleDescriptor = {
  id: "torneo",
  version: "0.1.0",
  nombre: "Torneo de pádel",
  descripcion: "El torneo en curso: zonas, llave, resultados, W.O. y reprogramación, compartido por el organizador y los jugadores.",
  kind: "capability",
  capability: "agenda:read",
  rubros: "todos",
  dependencias: [],
  grupo: "agenda-turnos",
  resumen: "El organizador carga resultados desde el celular y todos ven lo mismo al instante: zonas, llave y próximos partidos.",
  fit: "Circuitos y torneos de pádel amateur con varias sedes y categorías.",
  scopeItems: [
    { label: "Zonas y llave por categoría" },
    { label: "Carga de resultados y W.O." },
    { label: "Reprogramar un partido" },
    { label: "Jugadores ven el torneo sin poder cambiarlo" },
  ],
  migraciones: [],
};
