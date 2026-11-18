// ============================================================================
// PROYECTOS · la clave de UN envío de un formulario (del lado del navegador). La misma hasta que el servidor contesta: un
// doble clic o un reintento de la red mandan la misma, y el servidor graba una sola fila (`claveDeEnvio`, pago-columnas.ts).
// PURA: la usan los formularios de la ficha y de Administración.
// ============================================================================

/** Clave aleatoria URL-safe (32 caracteres) para un envío. */
export function nuevaClave(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
