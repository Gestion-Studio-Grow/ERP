import type { NextConfig } from "next";
import { carpetasParaTrazar, redireccionesDeSitiosEstaticos, reescriturasDeSitiosEstaticos } from "./src/lib/sitio-estatico";
import { CARPETA_BUSCATUFOTO, reescrituraDeBuscatufoto } from "./src/lib/sitio-buscatufoto";

const nextConfig: NextConfig = {
  // Lo fija scripts/vercel-build.mjs en un preview que apunta a la base de producción: se inlinea
  // en el build y el proxy responde 503 a todo (ver src/proxy.ts). Vacío en cualquier otro caso.
  env: { GSG_PREVIEW_BLOQUEADO: process.env.GSG_PREVIEW_BLOQUEADO ?? "" },
  // Sitios estáticos por negocio (hoy Circuito WPE en wpe.*): `/` y sus adjuntos van al manejador
  // que resuelve el negocio del host y falla cerrado. Reglas y porqué: src/lib/sitio-estatico.ts.
  // buscatufoto (producto de GSG, app sin servidor) en su host propio: TODO va a su manejador, que sólo
  // atiende ese host. Reglas y porqué: src/lib/sitio-buscatufoto.ts.
  async rewrites() {
    return { beforeFiles: [reescrituraDeBuscatufoto(), ...reescriturasDeSitiosEstaticos()], afterFiles: [], fallback: [] };
  },
  async redirects() {
    return redireccionesDeSitiosEstaticos();
  },
  outputFileTracingIncludes: {
    "/sitio-estatico/**": carpetasParaTrazar(),
    "/sitio-buscatufoto/**": [`./${CARPETA_BUSCATUFOTO}/**/*`],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        // Avatares ilustrados del equipo (placeholder hasta tener fotos reales).
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
  },
};

export default nextConfig;
