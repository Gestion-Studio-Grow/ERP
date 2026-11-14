import type { Metadata } from "next";
import localFont from "next/font/local";
import { FUENTES_CH } from "@/design/fuentes-ch";
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
// FUENTES POR SUPERFICIE (ronda 2, P0, 30/10/2026)
// ============================================================================
//
// La raíz declara SÓLO Geist (la base de todas las pantallas; precargada sólo en el panel) y Geist Mono (sin precarga). Antes declaraba
// nueve familias: cada vidriera cargaba los `@font-face` de CH, Magra y Shine, y `--font-body` era Hanken en todo
// `body`. Ahora cada superficie declara su letra en su propio módulo (next/font la precarga sólo en las rutas que
// importan ese módulo): CH en src/app/(site)/fuentes.ts, el panel en src/design/fuentes-panel.ts, cada tienda en
// src/app/tienda/<marca>/fuentes.ts, taller y clases en el suyo.
//
// Excepción temporal: Fraunces + Hanken (src/design/fuentes-ch.ts, SIN precarga) siguen colgadas de <html> por
// Facturita, que las toma de la raíz (src/app/facturita/piel.ts) y está en otra rama. Sin precarga no bajan nada en
// las vidrieras que no las pintan. Se van de acá cuando facturin ponga `FUENTES_CH` en su layout.
const geistSans = localFont({
  src: [
    { path: "../fonts/geist/geist-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist-sans",
  // Sin precarga en la raíz: las vidrieras pintan su propia letra y no la necesitan. El panel la precarga con su
  // propia declaración (src/design/fuentes-panel.ts, mismo archivo).
  preload: false,
});

const geistMono = localFont({
  src: [
    { path: "../fonts/geist-mono/geist-mono-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist-mono",
  // Monoespaciada: la usan pantallas puntuales (códigos, importes técnicos), no el
  // grueso del panel → sin preload.
  preload: false,
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
      className={`${geistSans.variable} ${geistMono.variable} ${FUENTES_CH} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
