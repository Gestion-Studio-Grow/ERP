// BUSCATUFOTO — producto de GSG (fotos de eventos) servido por este mismo despliegue en su propio host.
//
// Es una app sin servidor: los datos viven en el navegador del usuario (IndexedDB). Se compila como
// exportación estática de Next (fuente en celula-negocios-digitales/buscatufoto/, `BTF_EXPORT=1 next build`)
// y el resultado vive en `src/tenants/buscatufoto/sitio/`. Mismo patrón que Circuito WPE
// (src/lib/sitio-estatico.ts), con dos diferencias:
//   1. No hay negocio en la base: decide SÓLO el host (`buscatufoto.<dominio>` o `buscatufoto-erp.vercel.app`).
//      No toca Neon, ni tenant, ni sesión. En cualquier otro host el manejador responde 404.
//   2. Es una app con rutas dinámicas (/a/<álbum>, /f/<usuario>…): cada una se exportó una sola vez con el
//      comodín "_" y el cliente lee el valor real de la URL. El resolvedor de abajo traduce la ruta pedida al
//      archivo exportado. El nombre del archivo nunca sale tal cual de la URL: se valida cada segmento y se
//      resuelve dentro de la carpeta del sitio.
//
// Este módulo no importa nada a propósito: lo lee `next.config.ts` al compilar.

export const PREFIJO_BUSCATUFOTO = "/sitio-buscatufoto";
export const CARPETA_BUSCATUFOTO = "src/tenants/buscatufoto/sitio";
/** Prefijo de los recursos de Next de buscatufoto (su `assetPrefix`), para no chocar con los del ERP. */
const PREFIJO_RECURSOS = "btf";

/** Host de buscatufoto, como lo aplica Next en `has` (`^<valor>$` contra el hostname sin puerto). */
export const PATRON_HOST_BUSCATUFOTO = "buscatufoto(?:\\..+|-erp\\.vercel\\.app)";

export function esHostDeBuscatufoto(host: string | null | undefined): boolean {
  const h = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  return new RegExp(`^${PATRON_HOST_BUSCATUFOTO}$`).test(h);
}

/** Regla de `rewrites().beforeFiles`: en el host de buscatufoto, TODO va al manejador. PURA. */
export function reescrituraDeBuscatufoto() {
  return {
    source: "/:ruta*",
    destination: `${PREFIJO_BUSCATUFOTO}/:ruta*`,
    has: [{ type: "host" as const, value: PATRON_HOST_BUSCATUFOTO }],
  };
}

/** Rutas dinámicas exportadas con comodín "_". "*" = segmento variable. */
const PLANTILLAS: readonly (readonly string[])[] = [
  ["a", "*", "pedido", "*"],
  ["a", "*"],
  ["f", "*"],
  ["panel", "albumes", "*"],
];

const SEGMENTO_VALIDO = /^[A-Za-z0-9_.!$()\-]+$/;

/**
 * Archivos candidatos (relativos a la carpeta del sitio) para la ruta pedida, en orden de preferencia.
 * `null` si la ruta es inválida (segmentos vacíos, `..`, caracteres raros). PURA.
 */
export function candidatosDeRuta(segmentos: readonly string[] | undefined): string[] | null {
  let seg = [...(segmentos ?? [])];
  for (const s of seg) {
    if (!s || s === "." || s === ".." || !SEGMENTO_VALIDO.test(s)) return null;
  }
  // Recursos de Next bajo /btf/_next/… → _next/… de la exportación.
  if (seg[0] === PREFIJO_RECURSOS && seg[1] === "_next") seg = seg.slice(1);
  if (seg.length === 0) return ["index.html"];

  const directos = (s: string[]) => {
    const r = s.join("/");
    return [r, `${r}.html`, `${r}/index.html`];
  };
  const out = directos(seg);

  for (const plantilla of PLANTILLAS) {
    if (seg.length < plantilla.length) continue;
    let coincide = true;
    const sustituido = [...seg];
    plantilla.forEach((p, i) => {
      if (!coincide) return;
      const s = seg[i];
      if (p === "*") {
        // El último segmento puede traer extensión (pedido RSC: "<slug>.txt").
        const ext = i === seg.length - 1 ? /\.(txt|html)$/.exec(s)?.[0] ?? "" : "";
        sustituido[i] = `_${ext}`;
      } else if (p !== s) {
        coincide = false;
      }
    });
    if (coincide) out.push(...directos(sustituido));
  }
  return [...new Set(out)];
}

const TIPOS: Readonly<Record<string, string>> = {
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
};

export function tipoDeArchivo(ruta: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(ruta)?.[1]?.toLowerCase() ?? "";
  return TIPOS[ext] ?? "application/octet-stream";
}

function cacheDe(ruta: string): string {
  if (ruta.startsWith("_next/static/")) return "public, max-age=31536000, immutable";
  if (/\.(jpg|jpeg|png|webp|svg|ico|woff2?)$/i.test(ruta)) return "public, max-age=86400";
  return "public, max-age=0, must-revalidate";
}

/**
 * Respuesta del manejador. `host` es el del pedido; `existe`/`leer` reciben rutas relativas a la raíz del
 * repo (inyectadas para testear sin disco). Fuera del host de buscatufoto: 404 vacío.
 */
export async function responderBuscatufoto(
  host: string | null,
  segmentos: readonly string[] | undefined,
  existe: (rutaRelativa: string) => Promise<boolean>,
  leer: (rutaRelativa: string) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<Response> {
  const vacio = () =>
    new Response("No encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  if (!esHostDeBuscatufoto(host)) return vacio();

  const candidatos = candidatosDeRuta(segmentos);
  let elegido: string | null = null;
  for (const c of candidatos ?? []) {
    if (await existe(`${CARPETA_BUSCATUFOTO}/${c}`)) {
      elegido = c;
      break;
    }
  }
  const status = elegido ? 200 : 404;
  if (!elegido) {
    if (!(await existe(`${CARPETA_BUSCATUFOTO}/404.html`))) return vacio();
    elegido = "404.html";
  }
  const cuerpo = await leer(`${CARPETA_BUSCATUFOTO}/${elegido}`);
  return new Response(cuerpo, {
    status,
    headers: {
      "content-type": tipoDeArchivo(elegido),
      "cache-control": status === 404 ? "no-store" : cacheDe(elegido),
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}
