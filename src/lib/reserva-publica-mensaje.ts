// Qué ve la CLIENTA cuando una acción de la web de turnos no pudo (reservar, reprogramar,
// cancelar, dejar una reseña). PURO salvo el log.
//
// Una Server Action que TIRA llega a la pantalla, en producción, como un texto genérico en
// inglés: Next reemplaza el mensaje por un digest. Por eso las acciones públicas DEVUELVEN
// `{ ok: false, error }` y el texto sale de acá:
//   - un `RechazoDeDominio` (horario ocupado, profesional que no hace ese servicio, turno que
//     ya pasó) se muestra tal cual: lo escribimos a propósito para quien está reservando;
//   - una carrera perdida (dos reservas del mismo horario a la vez: la base aborta una por
//     conflicto de escritura, y los reintentos se agotaron) es la otra cara de "ese horario
//     se ocupó": se dice así, con qué hacer;
//   - cualquier otra cosa (la base caída, un bug) no se muestra cruda: el genérico de cada
//     acción, en castellano y con qué hacer, y el detalle al log del servidor.

import { esConflictoDeEscritura } from "@/lib/conflicto-de-escritura";
import { rechazoDeDominio } from "@/lib/rechazo-de-dominio";

export const HORARIO_TOMADO_EN_CARRERA =
  "Ese horario ya no está disponible: alguien lo reservó recién. Elegí otro horario.";

export function mensajeParaLaClienta(e: unknown, generico: string, scope: string): string {
  if (esConflictoDeEscritura(e)) return HORARIO_TOMADO_EN_CARRERA;
  return rechazoDeDominio(e, generico, scope);
}
