// Une clases condicionales sin dependencias externas (no hay clsx/cva en el
// proyecto). Filtra falsy y colapsa espacios. Suficiente para las primitivas.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
