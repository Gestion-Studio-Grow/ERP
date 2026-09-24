// EL ERROR DE UNA ACCIÓN QUE TIRA, DICHO DE FORMA QUE SE PUEDA SEGUIR.
//
// Algunas acciones de la agenda y de la lista de espera todavía TIRAN su error de dominio
// ("Ese profesional no trabaja en ese horario. Elegí otro.") en vez de devolverlo. En
// desarrollo el mensaje llega entero, pero en producción Next lo reemplaza por un texto en
// inglés ("An error occurred in the Server Components render…") y la recepción leía eso en la
// fila del turno. Mientras esas acciones no devuelvan el error, la pantalla muestra el mensaje
// real si llegó y, si no, uno propio que dice qué pudo pasar y cómo seguir.
//
// Client-safe y puro: lo usan componentes cliente.

/** El texto con que Next tapa el error de una acción de servidor en producción. */
const TAPADO_POR_NEXT = /Server Components? render|omitted in production|digest/i;

export function mensajeAccionable(err: unknown, siNoSeSabe: string): string {
  if (!(err instanceof Error)) return siNoSeSabe;
  const m = err.message.trim();
  if (!m || TAPADO_POR_NEXT.test(m)) return siNoSeSabe;
  return m;
}

/**
 * El "error" con que Next hace un redirect desde una acción (la guardia sin sesión o sin permiso).
 * No es una falla: quien lo atrapa tiene que volver a tirarlo para que la navegación siga.
 */
export function esRedireccionDeNext(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
