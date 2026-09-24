// Quién hizo cada cosa, como lo lee el NEGOCIO en su pantalla de Auditoría. Puro (sin base ni
// React): la página resuelve los nombres de usuario y los pasa.
//
// Traduce el `actor` guardado a algo legible. Los registros nuevos guardan
// `user:<id>` (ADR-017 §2.f); los históricos previos al modelo de usuarios dicen
// "admin"; los del sitio público, `cliente:<tel>`; los de la consola de GSG, `operator:<nombre>`.
export function formatActor(actor: string, userNames: Map<string, string>): string {
  // Toda acción de la consola de GSG (actor `operator:<nombre>`): el negocio ve "GSG", nunca el
  // nombre interno de un operador. Antes se veía el actor crudo ("operator:operator").
  if (actor.startsWith("operator:")) return "GSG";
  if (actor.startsWith("user:")) {
    return userNames.get(actor.slice(5)) ?? "Usuario eliminado";
  }
  if (actor === "admin") return "admin (histórico)";
  if (actor.startsWith("cliente:")) return `Cliente ${actor.slice(8)}`;
  if (actor === "cliente") return "Cliente";
  return actor;
}
