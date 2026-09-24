// Quién hizo cada cosa, como lo lee el NEGOCIO en su pantalla de Auditoría. Puro (sin base ni
// React): la página resuelve los nombres de usuario y los pasa.
//
// Traduce el `actor` guardado a algo legible. Los registros nuevos guardan
// `user:<id>` (ADR-017 §2.f); los históricos previos al modelo de usuarios dicen
// "admin"; los del sitio público, `cliente:<tel>`; los de la consola de GSG, `operator:<nombre>`.
// Desde la red de locales llegan además `casa:<casaId>:user:<id>` (el catálogo que manda la
// casa) y `traslado:user:<id>` (un traslado entre locales): la persona es la del final.
export function formatActor(actor: string, userNames: Map<string, string>): string {
  // Toda acción de la consola de GSG (actor `operator:<nombre>`): el negocio ve "GSG", nunca el
  // nombre interno de un operador. Antes se veía el actor crudo ("operator:operator").
  if (actor.startsWith("operator:")) return "GSG";
  if (actor.startsWith("user:")) {
    return userNames.get(actor.slice(5)) ?? "Usuario eliminado";
  }
  // Desde la casa de la red: el usuario suele ser de la CASA (otro negocio), así que su nombre
  // no está en este negocio. Se dice de dónde vino, nunca el id crudo.
  if (actor.startsWith("casa:")) {
    const id = actor.split(":user:")[1];
    return (id && userNames.get(id)) || "La casa de la red";
  }
  if (actor.startsWith("traslado:")) {
    const id = actor.split("user:")[1];
    return (id && userNames.get(id)) || "Traslado entre locales";
  }
  // El cupón que guarda el alta del pedido (order-core.ts) lo escribe el sistema, no una persona.
  if (actor === "system") return "El sistema";
  if (actor === "admin") return "admin (histórico)";
  if (actor.startsWith("cliente:")) return `Cliente ${actor.slice(8)}`;
  if (actor === "cliente") return "Cliente";
  return actor;
}
