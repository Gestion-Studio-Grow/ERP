import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Fraunces, Hanken_Grotesk, Bebas_Neue, Open_Sans } from "next/font/google";
import { getTenantBrand, resolveAccent, tenantFaviconDataUri } from "@/lib/branding";
import { gsgIdentityEnabled, identityAttr, tenantBrandSheetEnabled } from "@/lib/identity";
import { getBrandSheet } from "@/lib/brand-sheet";
import "./globals.css";

// RENDER DINÁMICO APP-WIDE (fix build P1001, 2026-07-10). La app es 100% multi-tenant y
// resuelve el tenant por HOST en cada request → NINGUNA ruta puede prerenderizarse en build
// de forma útil (dependería del host, que no existe en build). Forzarlo en el layout RAÍZ
// hace que `next build` NUNCA ejecute loaders ni toque la base (P1001 `Can't reach database
// server at 127.0.0.1:5432` al prerenderizar una page que consulta Prisma —
// p. ej. `serviceCategory.findMany` de la landing). El fix correcto NO es dar una DB de
// build: es que el build no dependa de la DB. Aplica a todo el árbol de rutas.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-spa-serif",
  subsets: ["latin"],
});

// Identidad CH Estética (rediseño): display serif editorial + grotesque de cuerpo.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});

// Identidad MAGRA (ADR-072 §8): Bebas Neue (display condensado, cartelería premium) +
// Open Sans (cuerpo/UI). Familias cargadas acá una sola vez; la vidriera de magra las
// consume por `--font-bebas` / `--font-open-sans`. Sin descargas por-pantalla.
const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  display: "swap",
});

// Favicon POR TENANT (no más "CH" hardcodeado para toda la app): el ícono de la
// pestaña sale del monograma + acento del tenant activo, resuelto en cada request
// (getTenantBrand cachea por request; fail-open al brand por defecto sin DB). Las
// rutas que definen su propia metadata (p. ej. /tienda) igual la sobreescriben.
// El title/description siguen siendo el default del spa (la landing (site) los
// hereda de acá); su versión por-tenant es un follow-up junto con el SEO por ruta.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getTenantBrand();
  const { accent } = resolveAccent(brand.preset, brand.frontTheme);
  // FICHA DE MARCA (RFC-004-D): con `TENANT_BRAND_SHEET_ENABLED` ON, el título sale del nombre
  // del tenant (DB) — antes estaba HARDCODEADO "CH Estética" para toda la app, así que la
  // pestaña de cualquier tenant decía CH. Flag OFF → default neutro (ya no CH). Las rutas con
  // metadata propia (p. ej. /tienda) igual la sobreescriben por tenant.
  const sheet = tenantBrandSheetEnabled() ? await getBrandSheet() : null;
  const title = sheet ? sheet.name : "Panel de gestión";
  return {
    title,
    description: "Gestión del negocio y reservas online.",
    icons: { icon: tenantFaviconDataUri(brand.monogram, accent) },
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
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${fraunces.variable} ${hanken.variable} ${bebasNeue.variable} ${openSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
