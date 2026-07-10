import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Fraunces, Hanken_Grotesk } from "next/font/google";
import { getTenantBrand, resolveAccent, tenantFaviconDataUri } from "@/lib/branding";
import { gsgIdentityEnabled, identityAttr, tenantBrandSheetEnabled } from "@/lib/identity";
import { getBrandSheet } from "@/lib/brand-sheet";
import "./globals.css";

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
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${fraunces.variable} ${hanken.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
