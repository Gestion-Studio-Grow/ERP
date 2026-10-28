// FACTURITA · Layout de producto — envuelve TODO /facturita (vidriera, alta, planes y la app).
//
// Sólo hace lo que es común a todo el producto y no depende del negocio: el manifiesto de la app
// instalable, los íconos, el color de la barra del sistema y el registro del service worker
// mínimo. No lee base ni sesión (la vidriera es `force-static`, PD-1); lo del negocio lo sigue
// resolviendo el layout de /facturita/app.

import type { Metadata, Viewport } from "next";
import {
  APPLE_TOUCH_ICON_FACTURITA,
  MANIFEST_FACTURITA_URL,
  THEME_COLOR_FACTURITA,
  THEME_COLOR_FACTURITA_OSCURO,
} from "@/lib/facturita-pwa";
import RegistrarServiceWorker from "./RegistrarServiceWorker";

export const metadata: Metadata = {
  applicationName: "Facturita",
  manifest: MANIFEST_FACTURITA_URL,
  // Sello GSG (bloque 2 del Gate): firma como generador, discreto; la marca visible es Facturita.
  generator: "Gestión Studio Grow",
  icons: {
    icon: [
      { url: "/facturita/icon.svg", type: "image/svg+xml" },
      { url: "/facturita/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: APPLE_TOUCH_ICON_FACTURITA, sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Facturita", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR_FACTURITA },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR_FACTURITA_OSCURO },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function FacturitaProductoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <RegistrarServiceWorker />
    </>
  );
}
