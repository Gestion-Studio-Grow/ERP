// El motivo de un rechazo de dominio, listo para mostrar; o uno propio si no se puede mostrar.
//
// Las acciones de la agenda y de la lista de espera rechazan con `throw new RechazoDeDominio("Ese
// profesional no trabaja en ese horario…")`. Si ese error se escapa de la action, en producción
// Next lo reemplaza por un texto en inglés. Las actions que DEVUELVEN el rechazo
// ({ ok: false, error }) lo atrapan y lo pasan por `rechazoDeDominio`.
//
// Qué se muestra tal cual: SÓLO un `RechazoDeDominio`, o sea, un motivo que el código escribió a
// propósito para la persona que está en el mostrador. Todo lo demás es infraestructura o
// programación y NUNCA llega crudo a la pantalla, traiga `code` o no:
//   - PrismaClientInitializationError ("Can't reach database server at …"),
//   - PrismaClientValidationError (el volcado de la consulta mal armada),
//   - PrismaClientUnknownRequestError, PrismaClientKnownRequestError (P2025…),
//   - RangeError ("Invalid time value" de una fecha mal armada), TypeError,
//   - un `new Error(...)` suelto del tenant, de RLS o de una librería.
// Para esos se muestra `generico` (qué hacer y a quién avisar) y el detalle va al log del
// servidor con `logger.error`, que es donde GSG lo puede leer.
//
// Lo prueba rechazo-de-dominio.test.ts (un caso por tipo de error).

import { logger } from "@/lib/logger";

/** Un rechazo escrito para la persona que usa la pantalla: su mensaje se muestra tal cual. */
export class RechazoDeDominio extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "RechazoDeDominio";
  }
}

/** El texto del rechazo si se puede mostrar; `null` si no es un rechazo de dominio mostrable. */
export function motivoMostrable(e: unknown): string | null {
  if (!(e instanceof RechazoDeDominio)) return null;
  const mensaje = e.message.trim();
  return mensaje && mensaje.length <= 300 ? mensaje : null;
}

/**
 * Lo que ve la persona cuando la action no pudo: el motivo del rechazo de dominio, o `generico`.
 * Si es `generico`, el error real queda en el log bajo `scope`: nunca se pierde en silencio.
 */
export function rechazoDeDominio(e: unknown, generico: string, scope: string): string {
  const motivo = motivoMostrable(e);
  if (motivo !== null) return motivo;
  logger.error(scope, "falló por algo que no es un rechazo de dominio: se mostró el mensaje genérico", e);
  return generico;
}
