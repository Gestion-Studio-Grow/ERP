// STUB 1-C: lo reemplaza 1-A/1-B — el loader real (`turnosSinCerrar`: tenantId + status IN
// (PENDING, CONFIRMED) + startsAt < ahora, sin tope de días, con cobros y veredicto) lo escribe 1-A
// en este mismo archivo, devolviendo `BandejaSinCerrar` (src/lib/turnos/cierre-lote.ts) con esta
// misma forma. Este stub sólo existe para que la rama de 1-C compile: devuelve la bandeja vacía,
// así la agenda cuenta los «sin cerrar» de hoy como siempre hasta que entre el loader real.
// 1-C sólo lee `turnos.length` y `hayMas`.

import "server-only";

/** Qué puede hacer quien mira (en 1-A vive en cierre-lote.ts, con esta forma). */
export type Permisos = {
  gestionar: boolean;
  cobrar: boolean;
  terminar: boolean;
  /** agenda:forgive — dar de baja un saldo (sólo la dueña, D5). */
  perdonar: boolean;
};

export type BandejaSinCerrar = {
  turnos: readonly { id: string }[];
  permisos: Permisos;
  hayMas: boolean;
  cajaDeHoyCerrada: boolean;
};

export async function turnosSinCerrar(): Promise<BandejaSinCerrar> {
  return {
    turnos: [],
    permisos: { gestionar: false, cobrar: false, terminar: false, perdonar: false },
    hayMas: false,
    cajaDeHoyCerrada: false,
  };
}
