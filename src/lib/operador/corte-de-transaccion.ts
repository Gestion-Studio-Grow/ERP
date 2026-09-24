// ============================================================================
// ¿POR QUÉ SE CORTÓ UNA TRANSACCIÓN DE LA CONSOLA? — el mensaje para el operador, puro.
// ============================================================================
//
// Las escrituras que toman el candado de las apps de un negocio (módulos e interruptor) pueden
// cortarse por dos motivos distintos, y el operador tiene que hacer cosas distintas:
//   · el CANDADO: otro operador está cambiando ese negocio (Postgres, lock_timeout, SQLSTATE 55P03).
//     Esperar unos segundos y reintentar.
//   · la BASE: la transacción no pudo arrancar o no terminó a tiempo (Prisma P2028: pool lleno, base
//     lenta o caída). No tiene que ver con otro operador.
// Cualquier otro error no se traduce: sigue su curso.

export const CANDADO_OCUPADO =
  "Otro operador está cambiando las apps de este negocio en este momento y no terminó a tiempo. " +
  "No se guardó nada: esperá unos segundos, recargá la ficha y probá de nuevo.";

export const BASE_NO_RESPONDIO =
  "La base no respondió a tiempo (no pudo arrancar o terminar la operación). No se guardó nada: " +
  "probá de nuevo en un rato; si sigue, revisá el estado de la base en Neon.";

/** El mensaje para el operador si la transacción se cortó por el candado o por la base; si no, null. */
export function motivoDeCorte(e: unknown): string | null {
  const code = (e as { code?: string } | null)?.code;
  const texto = e instanceof Error ? e.message : String(e);
  // El candado primero: Prisma envuelve el 55P03 de Postgres en un error de consulta cruda.
  if (/\b55P03\b|lock_not_available|canceling statement due to lock timeout/i.test(texto)) return CANDADO_OCUPADO;
  if (code === "P2028") return BASE_NO_RESPONDIO;
  return null;
}
