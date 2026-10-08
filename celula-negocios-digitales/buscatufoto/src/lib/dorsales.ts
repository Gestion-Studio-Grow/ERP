/**
 * Dorsales (números de corredor) desde el nombre del archivo.
 *
 * Reglas, en orden:
 *  1. Números precedidos por "dorsal", "d", "n", "nro" o "#":  BTF_1201_d73-d4471.jpg → 73, 4471
 *  2. Si el nombre (sin extensión) son sólo números separados por - _ , o espacio:  "1043-318.jpg" → 1043, 318
 * Lo demás (IMG_4021, DSC_0001) NO se toma: es la numeración de la cámara, no un dorsal.
 */
export function dorsalesDesdeNombre(nombreArchivo: string): string[] {
  const base = nombreArchivo.replace(/\.[a-z0-9]{2,5}$/i, "");
  const hallados = new Set<string>();

  const marcado = /(?:^|[^a-z])(?:dorsal|nro|d|n|#)[-_ .]?(\d{1,5})(?!\d)/gi;
  for (const m of base.matchAll(marcado)) hallados.add(normalizarDorsal(m[1]));

  if (hallados.size === 0 && /^[\d\s,_-]+$/.test(base)) {
    for (const t of base.split(/[\s,_-]+/)) if (/^\d{1,5}$/.test(t)) hallados.add(normalizarDorsal(t));
  }
  return [...hallados].filter(Boolean);
}

/** "0073" → "73". Vacío si no es un número válido. */
export function normalizarDorsal(v: string): string {
  const s = v.trim().replace(/^#/, "");
  if (!/^\d{1,5}$/.test(s)) return "";
  return String(Number(s));
}

/** "73, 4471 1043" → ["73","4471","1043"] */
export function parsearListaDorsales(texto: string): string[] {
  const out = new Set<string>();
  for (const t of texto.split(/[\s,;]+/)) {
    const n = normalizarDorsal(t);
    if (n) out.add(n);
  }
  return [...out];
}
