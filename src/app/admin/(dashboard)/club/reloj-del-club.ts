// ============================================================================
// EL RELOJ REAL DEL CLUB — qué día y qué hora es para la agenda (portado del club vanilla).
// ============================================================================
//
// La regla es la de `relojReal` en public/previews/breakpoint/club/app.mjs (verificada línea por línea):
//   · de madrugada, ANTES del cierre del día anterior (su horario, `horarioDe(ayer).cierra`, que puede pasar de 1440:
//     el club que cierra a la 01:00 tiene `cierra = 1500`), sigue siendo el día que abrió: las 00:30 son
//     `{ fecha: ayer, min: 1470 }`, como el motor guarda esos turnos;
//   · en el minuto exacto del cierre (y después) ya es el día del calendario.
// Ojo: NO depende de la caja. La caja corre de 12 a 12 (`diaDeCaja`) y, si ya se cerró, lo cobrado entra en la
// siguiente (`cajaAbierta`): eso lo resuelve el motor a partir de este `Ahora`, no el reloj.
//
// Pura: la hora se inyecta (los tests y el latido del almacén le pasan su propio reloj).

import { horarioDe, sumarDias } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Fecha } from "@/lib/club/motor.mjs";

const dos = (n: number) => String(n).padStart(2, "0");

/** La fecha civil de este equipo para ese instante, "AAAA-MM-DD" (hora local, no UTC). */
export function fechaLocal(cuando: Date): Fecha {
  return `${cuando.getFullYear()}-${dos(cuando.getMonth() + 1)}-${dos(cuando.getDate())}`;
}

/**
 * El `Ahora` del club para ese instante. Sin estado (todavía no se cargó la jornada) no hay horario: da el día del
 * calendario, como el vanilla antes de tener `E`.
 */
export function relojReal(estado: EstadoClub | null, cuando: Date): Ahora {
  const fecha = fechaLocal(cuando);
  const min = cuando.getHours() * 60 + cuando.getMinutes();
  if (estado) {
    const ayer = sumarDias(fecha, -1);
    if (min + 1440 < horarioDe(estado, ayer).cierra) return { fecha: ayer, min: min + 1440 };
  }
  return { fecha, min };
}

/** ¿Es el mismo momento para la agenda? (el latido no avisa si no cambió). */
export const mismoAhora = (a: Ahora, b: Ahora) => a.fecha === b.fecha && a.min === b.min;
