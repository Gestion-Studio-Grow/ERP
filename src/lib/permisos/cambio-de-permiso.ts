// Regla pura de `setUserPermission` (PLAN permisos §8, riesgos 1, 5 y 7). Sin Prisma ni sesión:
// decide si el cambio de una casilla se acepta y qué filas de `UserPermissionOverride` quedan.
//
// - Nadie se cambia a sí mismo; nadie edita a otro OWNER (los socios se arreglan por rol).
// - Sólo capabilities de `CAPACIDADES_POR_USUARIO` (el candado de `permisoEfectivo`).
// - La casilla 6 (stock) graba sus tres capabilities juntas.
// - Una profesional sin ficha vinculada no puede tener prendido agendar/editar turnos: no tendría
//   agenda propia que operar (§5).
// - Igual al rol → se BORRA la fila; distinto → se graba la excepción.

import {
  esCapacidadPorUsuario,
  permisoEfectivo,
  roleHasCapability,
  type Capability,
  type PermisoOverride,
  type Role,
} from "@/lib/capabilities";

const CASILLA_STOCK: readonly Capability[] = ["stock:receive", "stock:count", "stock:adjust"];

export type ObjetivoDelCambio = {
  id: string;
  role: Role;
  professionalId: string | null;
  overrides: ReadonlyArray<PermisoOverride>;
};

export type PlanDelCambio = {
  /** Capabilities que toca (3 para la casilla de stock, 1 para las demás). */
  caps: Capability[];
  /** Valor efectivo pedido. */
  allowed: boolean;
  /** Capabilities cuyo pedido coincide con el rol: se BORRA la fila (sin excepción). */
  borrar: Capability[];
  /** Capabilities cuyo pedido difiere del rol: se graba la excepción (upsert). */
  grabar: Capability[];
  /** Valor efectivo antes del cambio, por capability (para la auditoría). */
  antes: Record<string, boolean>;
};

export type DecisionDelCambio = { ok: true; plan: PlanDelCambio } | { ok: false; error: string };

/** Lee el valor de la casilla del FormData: sólo `"true"`/`"false"`; cualquier otra cosa, `null`. */
export function leerAllowed(v: unknown): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export function decidirCambioDePermiso(p: {
  actorId: string;
  objetivo: ObjetivoDelCambio | null;
  capability: string;
  allowed: boolean | null;
}): DecisionDelCambio {
  const { objetivo } = p;
  if (!objetivo) return { ok: false, error: "Esa persona no existe en este negocio." };
  if (objetivo.id === p.actorId) return { ok: false, error: "Nadie se cambia sus propios permisos." };
  if (objetivo.role === "OWNER") {
    return { ok: false, error: "A un socio no se le cambian casillas: tiene todo por su rol." };
  }
  if (!esCapacidadPorUsuario(p.capability)) {
    return { ok: false, error: "Ese permiso no se puede cambiar por persona." };
  }
  if (p.allowed === null) return { ok: false, error: "Falta decir si se prende o se apaga." };
  const cap = p.capability;
  const allowed = p.allowed;

  if (
    allowed &&
    objetivo.role === "PROFESSIONAL" &&
    !objetivo.professionalId &&
    (cap === "agenda:create" || cap === "agenda:manage")
  ) {
    return {
      ok: false,
      error: "Primero vinculá a esta persona con su ficha de profesional: sin agenda propia no puede agendar ni editar turnos.",
    };
  }

  const caps = CASILLA_STOCK.includes(cap) ? [...CASILLA_STOCK] : [cap];
  const antes: Record<string, boolean> = {};
  for (const c of caps) antes[c] = permisoEfectivo(objetivo, c);
  const borrar = caps.filter((c) => roleHasCapability(objetivo.role, c) === allowed);
  const grabar = caps.filter((c) => roleHasCapability(objetivo.role, c) !== allowed);
  return { ok: true, plan: { caps, allowed, borrar, grabar, antes } };
}
