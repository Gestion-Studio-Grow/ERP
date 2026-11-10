// EL CLUB CRUDO DE BREAK POINT (public/previews/breakpoint/club): la app del club de antes del ERP, los mismos
// archivos fuente que empaqueta /club. Seguridad (GSG-SEG-002, 08/11/2026): el proxy ya no deja servir el archivo
// público directo; con una sesión vigente reescribe a `/club-crudo/<archivo>` y este manejador lo sirve sólo a un
// usuario activo DEL NEGOCIO breakpoint con el permiso del club (`agenda:manage`), el mismo criterio que /club en
// src/lib/sitio-estatico.ts. Un token válido de otro negocio: 404.
//
// Este módulo no importa nada a propósito: lo lee el proxy. La consulta a la base vive en club-crudo.server.ts.
// El archivo sale de este registro, nunca de la URL: no hay forma de pedir otra ruta del disco.

export const PREFIJO_CLUB_CRUDO = "/club-crudo";
/** `Tenant.slug` del único negocio cuyo panel abre el club crudo. */
export const SLUG_DEL_CLUB_CRUDO = "breakpoint";
/** Carpeta de los archivos, relativa a la raíz del repo (la traza `outputFileTracingIncludes`). */
export const CARPETA_CLUB_CRUDO = "public/previews/breakpoint/club";

const HTML = "text/html; charset=utf-8";
const JS = "text/javascript; charset=utf-8";
/** Lo que se sirve. `motor.mjs` no está: es público y no pasa por acá (ver `rutaDelClubCrudo` en src/proxy.ts). */
export const ARCHIVOS_DEL_CLUB_CRUDO: Readonly<Record<string, string>> = {
  "index.html": HTML,
  "app.mjs": JS,
  "conectado.mjs": JS,
  "morph.mjs": JS,
  "studio.mjs": JS,
};

const NO_ENCONTRADO = () =>
  new Response("No encontrado", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * Respuesta del manejador. `esDelClub`: ¿quien pide es un usuario activo de breakpoint con permiso? (falla
 * cerrado). `leer` recibe la ruta relativa a la raíz del repo (inyectada para testear sin disco).
 */
export async function responderClubCrudo(
  segmentos: readonly string[] | undefined,
  leer: (rutaRelativa: string) => Promise<Uint8Array<ArrayBuffer>>,
  esDelClub: () => Promise<boolean>,
): Promise<Response> {
  const nombre = (segmentos ?? []).join("/");
  if (!Object.hasOwn(ARCHIVOS_DEL_CLUB_CRUDO, nombre)) return NO_ENCONTRADO();
  if (!(await esDelClub().catch(() => false))) return NO_ENCONTRADO();
  return new Response(await leer(`${CARPETA_CLUB_CRUDO}/${nombre}`), {
    status: 200,
    headers: {
      "content-type": ARCHIVOS_DEL_CLUB_CRUDO[nombre],
      // Depende de la sesión: ninguna caché compartida lo guarda.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-frame-options": "SAMEORIGIN",
      "content-security-policy": "frame-ancestors 'self'",
      "x-robots-tag": "noindex",
    },
  });
}
