import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // GSG Lab — demos de producto montados como assets estáticos bajo public/ (reversible).
  // URLs limpias → el index.html real de cada demo. Corre en `afterFiles`: NO pisa rutas de
  // la app; solo actúa cuando no hay página ni archivo estático que matchee el path exacto.
  // Los assets con extensión (globals.css, app.js, imágenes) se sirven directo desde public/.
  // Mover un demo a su URL propia por hostname (ADR-029) es opción post-venta: se quita su bloque.
  async rewrites() {
    return [
      // Hub del laboratorio
      { source: "/lab", destination: "/lab/index.html" },
      // Demo: Plantillería AR (tienda estática multipágina)
      { source: "/plantilleria", destination: "/plantilleria/index.html" },
      { source: "/plantilleria/carrito", destination: "/plantilleria/carrito/index.html" },
      { source: "/plantilleria/checkout", destination: "/plantilleria/checkout/index.html" },
      { source: "/plantilleria/gracias", destination: "/plantilleria/gracias/index.html" },
      { source: "/plantilleria/producto/:slug", destination: "/plantilleria/producto/:slug/index.html" },
      // Demo: Postora (HTML autocontenido)
      { source: "/postora", destination: "/postora/index.html" },
    ];
  },
};

export default nextConfig;
