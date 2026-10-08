import "@fontsource-variable/hanken-grotesk/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Fondo } from "@/components/sitio/Fondo";
import { SCRIPT_TEMA } from "@/components/sitio/tema-script";

export const metadata: Metadata = {
  title: {
    default: "buscatufoto — vendé y encontrá fotos de eventos",
    template: "%s · buscatufoto",
  },
  description:
    "Fotógrafos de carreras, torneos y fiestas suben sus fotos con marca de agua y las venden. La gente se busca por número, elige y descarga.",
  generator: "Gestión Studio Grow",
  applicationName: "buscatufoto",
};

export const viewport: Viewport = {
  themeColor: "#0b0d11",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" data-tema="oscuro" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <a href="#contenido" className="saltar">
          Saltar al contenido
        </a>
        <Fondo />
        {children}
      </body>
    </html>
  );
}
