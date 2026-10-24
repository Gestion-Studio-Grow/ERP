// ============================================================================
// LA TARJETA VIEJA DEL TURNO (AppointmentRow) Y SU LEYENDA — las reglas, PURAS.
// ============================================================================
//
// Lo que decide la tarjeta de la agenda de siempre (CH con el interruptor apagado) sin tocar la
// base ni el render. Lo prueba fila-core.test.ts. Reingeniería CH, Tanda 1, agente 1-D (B4, B7,
// «Dar de baja» sólo con `agenda:forgive`).

import { ROLE_CAPABILITIES, type Capability } from "@/lib/capabilities";
import { esMetodoDePago } from "@/lib/turnos/cobros";
import type { TipoMarca } from "@/components/ui";

/**
 * ¿El rol tiene esta capacidad? Acepta el rol como texto (el `viewer` que cruza el borde RSC):
 * un rol desconocido o vacío no tiene ninguna. El servidor sigue siendo la autoridad: esto es
 * sólo para no ofrecer lo que va a rechazar.
 */
export function rolTieneCapacidad(rol: string | null | undefined, capacidad: Capability): boolean {
  if (!rol || !Object.prototype.hasOwnProperty.call(ROLE_CAPABILITIES, rol)) return false;
  return ROLE_CAPABILITIES[rol as keyof typeof ROLE_CAPABILITIES].includes(capacidad);
}

/** Dar de baja un saldo es perdonar plata: lo decide la dueña (`agenda:forgive`), no el mostrador. */
export function puedeDarDeBajaSaldo(viewer: { role: string } | null | undefined): boolean {
  return rolTieneCapacidad(viewer?.role, "agenda:forgive");
}

/**
 * B7 — «Marcar como completado» con saldo: hasta que no se elige el medio, no se completa.
 * Antes el medio venía en Efectivo y un toque sin mirar asentaba la venta en el cajón equivocado.
 * Sin saldo, o si se deja el saldo a cobrar, no hace falta medio.
 */
export function puedeCompletarConMedio(i: { saldo: number; dejarSaldo: boolean; medio: string }): boolean {
  if (i.saldo <= 0 || i.dejarSaldo) return true;
  return esMetodoDePago(i.medio);
}

/** B4 — La leyenda de la grilla: los 5 estados con forma + palabra (nunca el color solo). */
export const LEYENDA_DE_ESTADOS: readonly { status: string; tipo: TipoMarca; palabra: string }[] = [
  { status: "PENDING", tipo: "pendiente", palabra: "Reservado" },
  { status: "CONFIRMED", tipo: "medias", palabra: "Confirmado" },
  { status: "COMPLETED", tipo: "hecho", palabra: "Completado" },
  { status: "NO_SHOW", tipo: "atencion", palabra: "No se presentó" },
  { status: "CANCELLED", tipo: "anulado", palabra: "Cancelado" },
];
