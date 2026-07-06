import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Fraunces, Hanken_Grotesk } from "next/font/google";
import { getTenantBrand, resolveAccent, tenantFaviconDataUri } from "@/lib/branding";
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
  return {
    title: "CH Estética — La Alameda, Canning",
    description:
      "CH Estética de Carolina Haponiuk, dentro del Barrio La Alameda, Canning. Estética y spa con turnos que no se pisan y protocolos serios. Reservá online.",
    icons: { icon: tenantFaviconDataUri(brand.monogram, accent) },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${fraunces.variable} ${hanken.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
