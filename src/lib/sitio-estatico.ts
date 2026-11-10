// SITIOS ESTÁTICOS POR NEGOCIO — el ERP sirve, en el subdominio de un negocio, un sitio ya hecho (un
// HTML de un solo archivo y sus adjuntos) en lugar de la vidriera de React. Hoy: Circuito WPE, cuya demo
// aprobada es un HTML con el motor de torneo adentro (docs/tenants/circuito-wpe/README.md), y Break Point,
// el turnero y la gestión del club de pádel (docs/tenants/breakpoint/README.md).
//
// Dos llaves, las dos por configuración (ninguna es un `if (tenant === X)` en una pantalla):
//   1. `next.config.ts` reescribe `/`, `/manual.pdf`… hacia `/sitio-estatico/…` sólo cuando el host
//      empieza con el subdominio registrado (`wpe.`). Es una regla declarativa: no pasa por el proxy
//      (que no carga Prisma y así sigue) ni toca la página `/` de los demás negocios.
//   2. El manejador (`src/app/sitio-estatico/[[...archivo]]/route.ts`) resuelve el negocio del host por
//      la vía de siempre (`getCurrentTenantSlug` → `tenant.ts`) y sólo sirve si ESE negocio tiene un
//      sitio acá. Sin negocio para el host → 404 sin contenido (falla cerrado, ADR-015). Otro negocio
//      que pida `/sitio-estatico` → 404: decide el host, no la URL.
//
// El nombre del archivo sale de este registro, nunca de la URL: no hay forma de pedir otra ruta del disco.
// Este módulo no importa nada a propósito: lo lee `next.config.ts` al compilar.

export const PREFIJO_SITIO_ESTATICO = "/sitio-estatico";

export type ArchivoDelSitio = {
  /** Nombre del archivo dentro de la carpeta del sitio. */
  archivo: string;
  /** `content-type` con el que se sirve. */
  tipo: string;
  /** `cache-control`: privado (sólo el navegador), así ninguna caché compartida mezcla hosts. */
  cache: string;
  /** `false`: una pantalla de gestión (la del club), no una página para buscadores: fuera del sitemap (SEO ronda 2). */
  indexable?: boolean;
  /**
   * `true`: sólo con una sesión del panel de ESTE negocio con permiso para el club (lo decide el manejador, que
   * pasa `conSesion`). Sin ella, una puerta sin la app. Es para las pantallas de gestión: el club de Break Point
   * (seguridad, 08/11/2026: se servía a cualquiera).
   */
  soloConSesion?: boolean;
};

export type SitioEstatico = {
  /** `Tenant.slug` del negocio dueño del sitio. */
  slug: string;
  /** `Tenant.subdomain`: el host `<subdominio>.<dominio>` es el que se reescribe. */
  subdominio: string;
  /** Carpeta con los archivos, relativa a la raíz del repo (así la encuentra el trazado de Vercel). */
  carpeta: string;
  /** Ruta pública sin la barra inicial (`""` es la raíz) → archivo. */
  archivos: Readonly<Record<string, ArchivoDelSitio>>;
  /**
   * `true`: sólo se puede mostrar en un iframe del mismo sitio (X-Frame-Options + frame-ancestors), contra el
   * clickjacking de pantallas con botones (turnero, gestión del club). Opcional para no cambiar los sitios que ya
   * están publicados.
   */
  sinEmbeberAfuera?: boolean;
  /**
   * Pantallas de otros rubros que en este host llevan a la portada, además de tienda y reserva (con todo lo que
   * cuelgue de ellas). Opcional para no cambiar los sitios que ya están publicados.
   */
  rutasDeOtrosRubros?: readonly string[];
};

const PAGINA: Omit<ArchivoDelSitio, "archivo"> = { tipo: "text/html; charset=utf-8", cache: "private, max-age=300" };
const ADJUNTO_PDF: Omit<ArchivoDelSitio, "archivo"> = { tipo: "application/pdf", cache: "private, max-age=86400" };
const IMAGEN_PNG: Omit<ArchivoDelSitio, "archivo"> = { tipo: "image/png", cache: "private, max-age=86400" };

export const SITIOS_ESTATICOS: readonly SitioEstatico[] = [
  {
    slug: "circuito-wpe",
    subdominio: "wpe",
    carpeta: "src/tenants/circuito-wpe/sitio",
    archivos: {
      "": { archivo: "index.html", ...PAGINA },
      "manual.pdf": { archivo: "manual.pdf", ...ADJUNTO_PDF },
      "og.png": { archivo: "og.png", ...IMAGEN_PNG },
      "apple-touch-icon.png": { archivo: "apple-touch-icon.png", ...IMAGEN_PNG },
    },
  },
  {
    // Break Point Pádel (prospecto, demo a costo cero), en breakpointpadel.gsgapp.com.ar: portada, turnero web y
    // gestión del club, cada una en un solo archivo, sin datos reales ni persistencia. Con /turnero y /club en
    // pestañas del mismo navegador se sincronizan en vivo, sin servidor. Se genera con
    // src/tenants/breakpoint/empaquetar.mjs (docs/tenants/breakpoint/README.md).
    slug: "breakpoint",
    subdominio: "breakpointpadel",
    carpeta: "src/tenants/breakpoint/sitio",
    sinEmbeberAfuera: true, // D38 del UAT: el turnero y el club tienen botones que no se pueden dejar embeber
    archivos: {
      "": { archivo: "index.html", ...PAGINA },
      turnero: { archivo: "turnero.html", ...PAGINA },
      // Gestión del club: sólo con sesión del ERP de Break Point (dueño o recepción). Sin caché: al salir del panel
      // la copia del navegador no la vuelve a mostrar.
      club: { archivo: "club.html", ...PAGINA, cache: "private, no-store", indexable: false, soloConSesion: true },
    },
  },
  {
    // MIA Producciones: copia de su sitio público (la portada y sus 12 proyectos), en mia-producciones.gsgapp.com.ar
    // hasta que el dueño decida qué pasa con su dominio. Las imágenes, estilos y scripts están en
    // public/tenants/mia-producciones/sitio. Se genera con scripts/proyectos/copiar-sitio-mia.mjs
    // (docs/tenants/mia-producciones/README.md).
    slug: "mia-producciones",
    subdominio: "mia-producciones",
    carpeta: "src/tenants/mia-producciones/sitio",
    sinEmbeberAfuera: true,
    rutasDeOtrosRubros: [
      "/servicios", "/clases", "/mis-clases", "/alumno", "/alquiler", "/demo", "/facturita", "/contador",
      "/inmobiliaria", "/propiedades", "/premium", "/probar", "/seguimiento", "/taller", "/obsequio",
    ],
    archivos: {
      "": { archivo: "index.html", ...PAGINA },
      ...Object.fromEntries(
        [
          "nucleoelectrica-en-tecnopolis", "sediana", "activacion-flow", "telecom-summit", "mangapalloza",
          "nissan-expo-ganadera", "personal-fest", "andes-origen", "laboratorios-raffo", "nissan-casa-foa",
          "nissan-carilo", "biogenesis-bago-expo-ganadera",
        ].map((ruta) => [ruta, { archivo: `${ruta}.html`, ...PAGINA }]),
      ),
    },
  },
];

/** Regla de reescritura en el formato de `rewrites().beforeFiles` de Next. */
export type ReglaDeReescritura = {
  source: string;
  destination: string;
  has: { type: "host"; value: string }[];
};

/**
 * Patrón de host de un subdominio, como lo aplica Next (`^<valor>$` contra el hostname sin puerto):
 * `wpe.gsgapp.com.ar` y `wpe.localhost` sí; `wpex.…`, `xwpe.…` y el `wpe` pelado, no.
 */
export function patronDeHost(subdominio: string): string {
  return `${subdominio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\..+`;
}

/** Las reglas que van en `next.config.ts`: una por archivo de cada sitio. PURA. */
export function reescriturasDeSitiosEstaticos(
  sitios: readonly SitioEstatico[] = SITIOS_ESTATICOS,
): ReglaDeReescritura[] {
  return sitios.flatMap((sitio) =>
    Object.keys(sitio.archivos).map((ruta) => ({
      source: `/${ruta}`,
      destination: ruta ? `${PREFIJO_SITIO_ESTATICO}/${ruta}` : PREFIJO_SITIO_ESTATICO,
      has: [{ type: "host" as const, value: patronDeHost(sitio.subdominio) }],
    })),
  );
}

/** Regla de redirección en el formato de `redirects()` de Next. */
export type ReglaDeRedireccion = ReglaDeReescritura & { permanent: false };

// Lo que el sitio propio reemplaza de la app pública: en su host, la tienda y la reserva genéricas
// (que mostrarían el catálogo de ejemplo del alta) llevan a la portada del sitio. El panel (/admin)
// no se toca. Temporal (307): si el negocio suma tienda, se borra la regla y listo.
const RUTAS_REEMPLAZADAS = ["/tienda", "/tienda/:resto*", "/reserva", "/reserva/:resto*"] as const;

/** Las redirecciones que van en `next.config.ts`: tienda y reserva → portada, sólo en el host del sitio. PURA. */
export function redireccionesDeSitiosEstaticos(
  sitios: readonly SitioEstatico[] = SITIOS_ESTATICOS,
): ReglaDeRedireccion[] {
  return sitios.flatMap((sitio) =>
    [...RUTAS_REEMPLAZADAS, ...(sitio.rutasDeOtrosRubros ?? []).flatMap((ruta) => [ruta, `${ruta}/:resto*`])].map((source) => ({
      source,
      destination: "/",
      permanent: false as const,
      has: [{ type: "host" as const, value: patronDeHost(sitio.subdominio) }],
    })),
  );
}

/** Globs de las carpetas a incluir en la función del manejador (`outputFileTracingIncludes`). PURA. */
export function carpetasParaTrazar(sitios: readonly SitioEstatico[] = SITIOS_ESTATICOS): string[] {
  return sitios.map((sitio) => `./${sitio.carpeta}/**/*`);
}

/** El sitio registrado para un negocio, o `null`. PURA. */
export function sitioDelNegocio(
  slug: string | null | undefined,
  sitios: readonly SitioEstatico[] = SITIOS_ESTATICOS,
): SitioEstatico | null {
  if (!slug) return null;
  return sitios.find((sitio) => sitio.slug === slug) ?? null;
}

/** El archivo que corresponde a los segmentos pedidos, sólo si está registrado tal cual. PURA. */
export function archivoPedido(
  sitio: SitioEstatico,
  segmentos: readonly string[] | undefined,
): ArchivoDelSitio | null {
  const ruta = (segmentos ?? []).join("/");
  return Object.hasOwn(sitio.archivos, ruta) ? sitio.archivos[ruta] : null;
}

const NO_ENCONTRADO = () =>
  new Response("No encontrado", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * Lo que ve quien abre una pantalla de gestión sin sesión: dónde entrar, sin la app. Si llegó con el link de una
 * aprobación (`#aprobar&…`, sólo lo ve el navegador), le dice cómo aprobarlo. 401, sin caché, sin embeber.
 */
export const PUERTA_DEL_CLUB = () =>
  new Response(
    `<!doctype html><html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex"><title>Entrar al club</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 16px;line-height:1.5;color:#111;background:#fff">` +
      `<h1 style="font-size:1.4rem">La gestión del club se usa desde el sistema</h1>` +
      `<p id="general">Entrá con tu usuario y tu contraseña: el club abre ahí, con la jornada guardada.</p>` +
      `<p id="aprobar" hidden>Para aprobar este pedido, entrá con tu usuario de dueño y después volvé a tocar el link del WhatsApp.</p>` +
      `<p><a href="/admin/login?next=%2Fadmin%2Fclub" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Entrar al club</a></p>` +
      `<script>if(location.hash.indexOf("#aprobar&")===0){document.getElementById("aprobar").hidden=false;document.getElementById("general").hidden=true}</script>` +
      `</body></html>`,
    {
      status: 401,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "content-security-policy": "frame-ancestors 'none'",
        "x-robots-tag": "noindex",
      },
    },
  );

/**
 * Respuesta del manejador: el archivo del sitio del negocio del host, o 404 sin contenido.
 * `slug` es el negocio que resolvió el host (`null` si no hay ninguno); `leer` recibe la ruta relativa
 * a la raíz del repo (inyectada para testear sin disco).
 */
export async function responderSitioEstatico(
  slug: string | null,
  segmentos: readonly string[] | undefined,
  leer: (rutaRelativa: string) => Promise<Uint8Array<ArrayBuffer>>,
  /** `conSesion`: ¿quien pide tiene sesión del panel de este negocio con permiso? Sin él, los `soloConSesion` no se sirven. */
  opciones: { conSesion?: () => Promise<boolean> } = {},
): Promise<Response> {
  const sitio = sitioDelNegocio(slug);
  const archivo = sitio ? archivoPedido(sitio, segmentos) : null;
  if (!sitio || !archivo) return NO_ENCONTRADO();
  if (archivo.soloConSesion && !(await (opciones.conSesion?.() ?? Promise.resolve(false)))) return PUERTA_DEL_CLUB();
  const cuerpo = await leer(`${sitio.carpeta}/${archivo.archivo}`);
  return new Response(cuerpo, {
    status: 200,
    headers: {
      "content-type": archivo.tipo,
      "cache-control": archivo.cache,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      ...(sitio.sinEmbeberAfuera && { "x-frame-options": "SAMEORIGIN", "content-security-policy": "frame-ancestors 'self'" }),
    },
  });
}
