// Fábrica de tenants — MÁQUINA DE ESTADOS de la saga (ADR-061).
//
//   PENDING ─commit(tx ADR-019)→ DB_COMMITTED ─bindHost→ HOST_BOUND ─invite→ INVITED ─activate→ ACTIVE
//                                     │              │            │
//                                     └──── fallo en un paso externo ────┐
//                                                                        ▼
//                                                              FAILED_COMPENSATED
//
// PENDING→DB_COMMITTED es el ÚNICO paso transaccional (todo-o-nada, ADR-019): si falla no hay
// nada que compensar. Los pasos externos (host/DNS, invitación, activación) son compensables:
// ante un fallo posterior se deshacen en orden inverso y el estado terminal es
// FAILED_COMPENSATED. El commit de DB NO se borra (aditivo/idempotente): un reintento con la
// misma idempotencyKey retoma desde DB_COMMITTED sin duplicar.
//
// En esta iteración es un TIPO + reducer puro (no una tabla). Persistir la saga como
// `ProvisioningRun` para reanudar entre procesos es la próxima iteración (Gate 2).

export const PROVISION_STATES = [
  "PENDING",
  "DB_COMMITTED",
  "HOST_BOUND",
  "INVITED",
  "ACTIVE",
  "FAILED_COMPENSATED",
] as const;

export type ProvisionState = (typeof PROVISION_STATES)[number];

/** El camino feliz, en orden. `FAILED_COMPENSATED` queda fuera (es la rama de fallo). */
export const HAPPY_PATH: ProvisionState[] = [
  "PENDING",
  "DB_COMMITTED",
  "HOST_BOUND",
  "INVITED",
  "ACTIVE",
];

/** Estados terminales (no admiten transición de avance). */
export const TERMINAL_STATES: ProvisionState[] = ["ACTIVE", "FAILED_COMPENSATED"];

export function isTerminal(state: ProvisionState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** El siguiente estado del camino feliz, o null si `state` ya es terminal/desconocido. */
export function nextOnSuccess(state: ProvisionState): ProvisionState | null {
  const i = HAPPY_PATH.indexOf(state);
  if (i === -1 || i === HAPPY_PATH.length - 1) return null;
  return HAPPY_PATH[i + 1];
}

/**
 * ¿La transición `from → to` es válida? Válidas: avanzar un paso del camino feliz, o caer a
 * FAILED_COMPENSATED desde cualquier estado externo ya alcanzado (DB_COMMITTED/HOST_BOUND/INVITED).
 * PENDING no cae a FAILED_COMPENSATED: si el commit falla, no hubo saga (nada que compensar).
 */
export function canTransition(from: ProvisionState, to: ProvisionState): boolean {
  if (to === "FAILED_COMPENSATED") {
    return from === "DB_COMMITTED" || from === "HOST_BOUND" || from === "INVITED";
  }
  return nextOnSuccess(from) === to;
}

/**
 * Pasos externos (compensables) que se completaron al llegar a `state`, en el ORDEN en que
 * se aplicaron. Sirve para compensar en orden INVERSO ante un fallo. El commit de DB NO está
 * acá: es aditivo/idempotente, no se compensa (no se borra el tenant).
 */
export function externalStepsCompletedAt(state: ProvisionState): Array<"host" | "invite"> {
  switch (state) {
    case "HOST_BOUND":
      return ["host"];
    case "INVITED":
    case "ACTIVE":
      return ["host", "invite"];
    default:
      return [];
  }
}
