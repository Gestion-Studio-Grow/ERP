import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Fraunces, Hanken_Grotesk } from "next/font/google";
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

const favicon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23F3EEE5'/%3E%3Ctext x='32' y='42' font-family='Georgia,serif' font-size='30' fill='%231E93A6' text-anchor='middle'%3ECH%3C/text%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: "CH Estética — La Alameda, Canning",
  description:
    "CH Estética de Carolina Haponiuk, dentro del Barrio La Alameda, Canning. Estética y spa con turnos que no se pisan y protocolos serios. Reservá online.",
  icons: { icon: favicon },
};

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
