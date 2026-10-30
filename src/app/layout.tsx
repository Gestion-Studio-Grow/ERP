import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Fraunces, Hanken_Grotesk, Bebas_Neue, Open_Sans, Cormorant, Kumbh_Sans } from "next/font/google";
import { getTenantBrand, resolveAccent, tenantFaviconDataUri } from "@/lib/branding";
import { gsgIdentityEnabled, identityAttr, tenantBrandSheetEnabled } from "@/lib/identity";
import { getBrandSheet } from "@/lib/brand-sheet";
import { faviconGsg, NOMBRE_GSG, pestanaDelPedido } from "@/lib/pestana";
import { canonicalDe, pedidoPublico } from "@/lib/seo/base";
import { ogDelNegocio } from "@/lib/seo/og";
import { esRutaPrivada } from "@/lib/seo/sitio";
import { resolveTenantBrandId } from "@/tenants/storefront";
import { estadoDeLaDireccion, slugResueltoDelPedido } from "@/lib/tenant";
import "./globals.css";

// RENDER DINÁMICO APP-WIDE (fix build P1001, 2026-07-10). La app es 100% multi-tenant y
// resuelve el tenant por HOST en cada request → NINGUNA ruta puede prerenderizarse en build
// de forma útil (dependería del host, que no existe en build). Forzarlo en el layout RAÍZ
// hace que `next build` NUNCA ejecute loaders ni toque la base (P1001 `Can't reach database
// server at 127.0.0.1:5432` al prerenderizar una page que consulta Prisma —
// p. ej. `serviceCategory.findMany` de la landing). El fix correcto NO es dar una DB de
// build: es que el build no dependa de la DB. Aplica a todo el árbol de rutas.
export const dynamic = "force-dynamic";

// ============================================================================
// FUENTES — una sola declaración para toda la app, PERO no todas se precargan.
// ============================================================================
//
// Acá conviven las identidades de CUATRO negocios (spa genérico, CH Estética,
// Magra, Shine Velas). Declararlas juntas está bien: `next/font` las auto-hospeda
// y evita el salto de tipografía. El problema era `preload`, que viene en true por
// defecto: Next inyectaba un <link rel="preload"> de las NUEVE familias en CADA
// pantalla, así que el backoffice de CH se bajaba también las fuentes de Magra y
// de Shine — 355 KB de tipografía por pantalla, más que todo el JavaScript.
//
// Regla que se aplica abajo: precarga SOLO Geist, la base de todas las pantallas.
// Fraunces/Hanken (la identidad de CH) también pasaron a `preload: false` (E3,
// 29/10/2026): precargadas, viajaban ~145 KB a TODAS las vidrieras — Qué Bien Olés,
// Magra, Shine, A Dos Manos, el taller — aunque usen su propia letra. Las clases de
// variable siguen en <html> a propósito: globals.css resuelve --font-display y
// --font-body en :root, así que sacarlas de acá rompe esos tokens. Sin preload, el
// navegador baja cada familia sólo cuando una pantalla la pinta. Una superficie que
// quiera precargar su letra la declara en un módulo propio (next/font precarga sólo
// en las rutas que importan ese módulo), nunca acá. Las de identidad de OTRAS
// superficies llevan `preload: false`: siguen disponibles por su variable CSS y el navegador las baja
// recién cuando una pantalla las usa. Con `display: "swap"` el texto se ve desde el
// primer frame, así que la contrapartida es un cambio de tipografía tardío en la
// vidriera de esos tenants, no una pantalla en blanco.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // Monoespaciada: la usan pantallas puntuales (códigos, importes técnicos), no el
  // grueso del panel → sin preload.
  preload: false,
});

const playfair = Playfair_Display({
  variable: "--font-spa-serif",
  subsets: ["latin"],
  preload: false, // identidad del spa genérico / vidriera, no del backoffice
});

// Identidad CH Estética (rediseño): display serif editorial + grotesque de cuerpo.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false, // identidad CH: la baja quien la pinta (E3), no todas las vidrieras
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
  preload: false, // ídem
});

// Identidad MAGRA (ADR-072 §8): Bebas Neue (display condensado, cartelería premium) +
// Open Sans (cuerpo/UI). Familias cargadas acá una sola vez; la vidriera de magra las
// consume por `--font-bebas` / `--font-open-sans`. Sin descargas por-pantalla.
const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false, // identidad MAGRA: la baja su vidriera, no el resto de los tenants
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false, // identidad MAGRA (cuerpo)
});

// Identidad SHINE (manual de marca 2026): serif display DELICADA de alto contraste
// (Cormorant — sustituto libre de "The Seasons", la primaria del manual) + Kumbh Sans
// (cuerpo, exactamente la del manual). Cargadas acá una vez; el front de shinevelas las
// consume por `--font-cormorant` / `--font-kumbh`. Sin descargas por-pantalla, cero CLS.
const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  display: "swap",
  // Identidad SHINE y la más cara de todas: 3 pesos × 2 estilos = 6 archivos. Sin
  // preload no la toca nadie salvo la vidriera de shinevelas.
  preload: false,
});

const kumbhSans = Kumbh_Sans({
  variable: "--font-kumbh",
  subsets: ["latin"],
  display: "swap",
  preload: false, // identidad SHINE (cuerpo)
});

// PESTAÑA POR NEGOCIO (E1, 29/10/2026): título e ícono salen del negocio que resuelve el host, en todas las rutas
// que no declaran los suyos (src/lib/pestana.ts). Antes el título era «Panel de gestión» para toda la app con la
// ficha de marca apagada, y una dirección sin negocio mostraba el favicon neutro con la landing de CH. Ahora:
//   · sin negocio → «Gestión Studio Grow» + ícono de GSG, sin indexar;
//   · con ficha propia (branding.ts) → su nombre y su monograma, sin consultar nada;
//   · sin ficha → el nombre de la fila Tenant (getBrandSheet, cacheada por pedido; fail-open).
// Las rutas con metadata propia (/tienda, /taller, /clases, /admin…) igual la sobreescriben.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getTenantBrand();
  const { accent } = resolveAccent(brand.preset, brand.frontTheme);
  // FICHA DE MARCA (RFC-004-D): con `TENANT_BRAND_SHEET_ENABLED` ON manda el nombre de la ficha, como siempre.
  const sheet = tenantBrandSheetEnabled() ? await getBrandSheet() : null;
  if (sheet) return { title: sheet.name, description: "Gestión del negocio y reservas online.", icons: { icon: tenantFaviconDataUri(brand.monogram, accent) } };
  // Una base caída no se disfraza de «dirección sin negocio», pero tampoco de negocio (P0 ronda 2): pestaña neutra de
  // GSG y sin indexar. El cuerpo lo resuelve el layout del sitio (redirige a /sin-servicio).
  const estado = await estadoDeLaDireccion();
  if (estado === "sin-servicio") {
    return { title: NOMBRE_GSG, icons: { icon: faviconGsg() }, robots: { index: false, follow: false } };
  }
  const sinNegocio = estado === "sin-negocio";
  const nombreDelTenant = sinNegocio || brand.propia ? null : (await getBrandSheet()).name;
  const pestana = pestanaDelPedido({ sinNegocio, brand, nombreDelTenant });
  if (pestana.tipo === "gsg") {
    return {
      title: NOMBRE_GSG,
      description: "Gestión Studio Grow: sistemas de gestión y vidrieras para negocios.",
      icons: { icon: faviconGsg() },
      robots: { index: false, follow: false },
    };
  }
  // SEO de base (ronda 2, P0): dirección pública, canonical y tarjeta para compartir de cada negocio, por host. Las
  // páginas con metadata propia pisan título y descripción; el canonical sale de la ruta real del pedido (`x-pathname`,
  // lo pone el proxy) y vale para todas. Sin query: `?p=…` y los filtros no son páginas distintas.
  const { origen, ruta } = await pedidoPublico();
  const slug = await slugResueltoDelPedido().catch(() => null);
  const og = ogDelNegocio(slug, resolveTenantBrandId(slug));
  return {
    title: pestana.titulo,
    description: "Gestión del negocio y reservas online.",
    icons: { icon: tenantFaviconDataUri(pestana.glifo, accent) },
    ...(origen
      ? {
          metadataBase: new URL(origen),
          alternates: { canonical: canonicalDe(origen, ruta) },
          openGraph: {
            type: "website",
            locale: "es_AR",
            siteName: pestana.titulo,
            url: canonicalDe(origen, ruta),
            ...(og ? { images: [{ url: og.src, width: og.width, height: og.height, alt: og.alt, type: "image/webp" }] } : {}),
          },
          twitter: { card: og ? "summary_large_image" : "summary" },
        }
      : {}),
    // Paneles, turnos y pedidos de una persona no se indexan aunque la página no lo diga (mismo listado que el robots).
    robots: esRutaPrivada(ruta) ? { index: false, follow: false } : { index: true, follow: true },
    generator: "GSG",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // IDENTIDAD DE PRODUCTO GSG (RFC-004), detrás de `GSG_IDENTITY_ENABLED` (default OFF):
  // con el flag ON, `data-identity="gsg"` activa la base neutra propia de GSG (globals.css)
  // — el color de marca sigue siendo del tenant (el acento, que inyecta cada layout). Con el
  // flag OFF → sin atributo → tokens actuales (paleta CH) intactos → byte-idéntico a hoy.
  const identity = identityAttr(gsgIdentityEnabled());

  return (
    <html
      lang="es"
      data-identity={identity}
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${fraunces.variable} ${hanken.variable} ${bebasNeue.variable} ${openSans.variable} ${cormorant.variable} ${kumbhSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
