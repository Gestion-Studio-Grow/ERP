/** @type {import('next').NextConfig} */
// Sitio 100% estático (SSG). Se exporta a /out y se sube a cualquier hosting de estáticos.
// NOTA: leé la guía de tu versión de Next en node_modules/next/dist/docs/ antes de tocar esto;
// las opciones de 'output: export' cambiaron entre versiones.
const nextConfig = {
  output: "export",
  images: { unoptimized: true }, // requerido para export estático sin servidor de imágenes
  trailingSlash: true,           // rutas amigables para hosting de estáticos
};

module.exports = nextConfig;
