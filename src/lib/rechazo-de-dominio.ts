// El motivo de un rechazo de dominio, listo para mostrar; o uno propio si no se puede mostrar.
//
// Las acciones de la agenda y de la lista de espera rechazan con `throw new Error("Ese
// profesional no trabaja en ese horario…")`. Si ese error se escapa de la action, en producción
// Next lo reemplaza por un texto en inglés. Las actions que DEVUELVEN el rechazo
// ({ ok: false, error }) lo atrapan y lo pasan por acá: un `Error` de dominio (sin `code`, corto)
// se muestra tal cual; uno de Prisma (trae `code` y un volcado técnico) o cualquier otra cosa,
// no: se dice `generico`, que explica qué pudo pasar y cómo seguir.
//
// Puro y sin servidor: lo prueba rechazo-de-dominio.test.ts.

export function rechazoDeDominio(e: unknown, generico: string): string {
  const sinCodigo = typeof e === "object" && e !== null && !("code" in e);
  const mensaje = e instanceof Error ? e.message.trim() : "";
  return sinCodigo && mensaje && mensaje.length <= 300 ? mensaje : generico;
}
