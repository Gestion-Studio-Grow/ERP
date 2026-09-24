// El nombre de un archivo que se baja del panel. PURO.
//
// Los exportes se llamaban "reporte-2026-09-24-90d.csv" o "libro-iva-2026-08.csv": en la
// carpeta de Descargas de la contadora, con los archivos de varios clientes juntos, no se sabía
// de qué negocio era cada uno ni qué período cubría. Ahora dicen qué es, de quién y de cuándo:
// "reportes-ch-estetica-2026-06-27-al-2026-09-24.csv".
//
// Sólo letras sin tilde, números y guiones: el nombre viaja en una cabecera HTTP y pasa por
// Windows, WhatsApp y el mail sin que nadie lo tenga que renombrar.

/** "CH Estética" → "ch-estetica". Vacío si no queda nada legible. */
export function paraNombreDeArchivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Une las partes que tengan algo ("qué", "de quién", "desde", "al", "hasta"…) en un nombre
 * de archivo. Una parte vacía (un negocio sin nombre) se saltea, no deja "--".
 */
export function nombreDeArchivo(partes: readonly (string | null | undefined)[], extension = "csv"): string {
  const cuerpo = partes
    .map((p) => paraNombreDeArchivo(p ?? ""))
    .filter(Boolean)
    .join("-")
    .slice(0, 120)
    .replace(/-+$/, "");
  return `${cuerpo || "archivo"}.${extension}`;
}

/** "del 2026-09-01 al 2026-09-24", o un solo día si desde y hasta coinciden. */
export function periodoParaArchivo(desde: string, hasta: string): string[] {
  return desde === hasta ? [desde] : [desde, "al", hasta];
}
