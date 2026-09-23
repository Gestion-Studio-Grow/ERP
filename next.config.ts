import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lo fija scripts/vercel-build.mjs en un preview que apunta a la base de producción: se inlinea
  // en el build y el proxy responde 503 a todo (ver src/proxy.ts). Vacío en cualquier otro caso.
  env: { GSG_PREVIEW_BLOQUEADO: process.env.GSG_PREVIEW_BLOQUEADO ?? "" },
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
