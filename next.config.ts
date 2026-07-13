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
  // Cabeceras de seguridad. Baseline en todo el sitio (nosniff, referrer, HSTS —
  // inofensivas para las vidrieras públicas). El anti-iframe (X-Frame-Options +
  // frame-ancestors) se scopea al backoffice y al control-plane para cerrar el
  // clickjacking sobre /admin/login y /operador/login SIN romper un eventual embed
  // de la vidriera pública/demo. Un CSP completo (script-src con nonces) queda como
  // deuda anotada (requiere pruebas de no romper Next/inline).
  async headers() {
    const baseline = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ];
    const noFrame = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ];
    return [
      { source: "/:path*", headers: baseline },
      { source: "/admin/:path*", headers: noFrame },
      { source: "/operador/:path*", headers: noFrame },
    ];
  },
};

export default nextConfig;
