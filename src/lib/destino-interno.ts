// Sólo se acepta una ruta interna como destino de un `next`: con http(s), `//` o `/\\` (que el navegador lee
// como `//`) esta pantalla sería un trampolín para mandar gente a otro sitio (certificación GSG-SEG-002, cert 3).
const BASE = "http://destino.invalid";

/** `crudo` si es una ruta interna segura; si no, `"/"`. Devuelve ruta + query + hash resueltos. PURA. */
export function destinoInterno(crudo: string): string {
  if (!crudo.startsWith("/") || crudo.startsWith("//")) return "/";
  if (crudo.includes("\\")) return "/";
  // Caracteres de control (tab, salto de línea, NUL, DEL…): el parser de URL los saca y `/\t/evil.com` queda en `//`.
  if (/[\u0000-\u001f\u007f]/.test(crudo)) return "/";
  let url: URL;
  try {
    url = new URL(crudo, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  const destino = url.pathname + url.search + url.hash;
  return destino.startsWith("/") && !destino.startsWith("//") ? destino : "/";
}
