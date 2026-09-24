// «Confirmar», «Preparar», «Marcar listo»: qué se le dice a quien toca el botón cuando el paso
// no salió. DATO PURO (sin React ni servidor): lo usa AvanzarPedidoForm y lo prueba
// avanzar-pedido.test.ts.
//
// Antes el botón era un `<form action={advanceOrderStatus}>` pelado en la página: si la acción
// tiraba (se cortó la señal, el servidor falló) la bandeja entera se iba a la pantalla genérica
// de error; y si volvía con un rechazo, nadie lo mostraba. El QA de la ola 3 lo dejó anotado
// sobre la bandeja: "la pantalla no puede mostrarlo".
//
// La sesión vencida o sin permiso NO pasa por acá: `requireCapability` redirige (NEXT_REDIRECT) y
// AvanzarPedidoForm deja pasar esa excepción para que Next haga el redirect.
//
// `advanceOrderStatus` devuelve { ok: true } o el rechazo ({ ok: false, error }), como las demás
// acciones de la bandeja: cuando otra pestaña ya movió el pedido, revalida y dice que la bandeja
// se actualizó. Este lector también tolera `void` (por si vuelve una acción vieja).

/** El texto del rechazo que devolvió la acción, o null si no hubo rechazo (incluye `void`). */
export function rechazoDeAccion(r: unknown): string | null {
  if (!r || typeof r !== "object" || !("ok" in r)) return null;
  const o = r as { ok: unknown; error?: unknown };
  if (o.ok !== false) return null;
  return typeof o.error === "string" && o.error.trim() ? o.error : "No se pudo hacer ese paso. Recargá la bandeja y volvé a intentar.";
}

/**
 * Lo que se dice cuando el paso no volvió. Avanzar un estado no mueve plata ni stock y la acción
 * sólo escribe si el pedido sigue en el estado de antes, así que reintentar es seguro: a lo sumo
 * ya estaba hecho. `enLinea` es `navigator.onLine` al fallar: sólo con el navegador desconectado
 * se culpa a la conexión; con señal, falló el servidor y no se manda a revisar el wifi.
 */
export function sinRespuestaAlAvanzar(verbo: string, code: number, enLinea = false): string {
  const que = enLinea ? "Recargá la bandeja y volvé a tocarlo en un rato" : "Revisá la conexión y volvé a tocarlo";
  return `No se pudo «${verbo}» el pedido #${code}. ${que}: si ya se había hecho, no pasa nada.`;
}
