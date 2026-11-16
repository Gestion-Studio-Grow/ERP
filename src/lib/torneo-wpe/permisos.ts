// ============================================================================
// QUIÉN PUEDE QUÉ EN EL TORNEO — sin roles nuevos (no se toca el enum UserRole) y sin abrir la matriz general.
// ============================================================================
//
//   · ver        — todos los usuarios del negocio con el módulo (jugador incluido).
//   · resultados — cargar un resultado o marcar un W.O.
//   · gestionar  — además, borrar un resultado, reprogramar un partido y generar el torneo.
//
// Por rol: OWNER (el dueño) y RECEPTION (el organizador) gestionan; PROFESSIONAL (el jugador) sólo ve.
// El AGENTE es un PROFESSIONAL con UNA excepción propia del torneo, `torneo:resultados` (fila de
// `UserPermissionOverride`, que la sesión ya lee): carga resultados y W.O., pero no borra ni reprograma
// (.claude/agents/agente-wpe.md: eso lo escala al organizador). La excepción sólo SUMA `resultados`: nunca da
// `gestionar`, y una excepción con `allowed: false` no le saca nada a un organizador. No pasa por
// `CAPACIDADES_POR_USUARIO` (el candado de la matriz general): la matriz del panel no la muestra ni la graba; la
// pone el alta del ambiente de pruebas (scripts/wpe-pruebas-alta.ts).
//
// — Elaborado por GSG

import type { PermisoOverride, Role } from "@/lib/capabilities";

export type PermisoTorneo = "ver" | "resultados" | "gestionar";

/** La excepción que convierte a un PROFESSIONAL en el agente que carga resultados. */
export const EXCEPCION_RESULTADOS = "torneo:resultados";

const ORDEN: Record<PermisoTorneo, number> = { ver: 0, resultados: 1, gestionar: 2 };

/** El permiso más alto que tiene este usuario en el torneo. */
export function nivelEnElTorneo(user: { role: Role; overrides?: ReadonlyArray<PermisoOverride> }): PermisoTorneo {
  if (user.role === "OWNER" || user.role === "RECEPTION") return "gestionar";
  const agente = (user.overrides ?? []).some((o) => o.capability === EXCEPCION_RESULTADOS && o.allowed === true);
  return agente ? "resultados" : "ver";
}

export function puedeEnElTorneo(user: { role: Role; overrides?: ReadonlyArray<PermisoOverride> }, pide: PermisoTorneo): boolean {
  return ORDEN[nivelEnElTorneo(user)] >= ORDEN[pide];
}
