/** Identificadores y claves. crypto.getRandomValues está en todos los navegadores soportados. */
export function nuevoId(prefijo = ""): string {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return prefijo + Array.from(b, (x) => (x % 36).toString(36)).join("");
}

export function nuevaClave(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** "10K de la Costanera 2026" → "10k-de-la-costanera-2026" */
export function aSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
