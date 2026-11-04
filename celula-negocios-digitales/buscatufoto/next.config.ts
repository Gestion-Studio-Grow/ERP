import type { NextConfig } from "next";

/**
 * buscatufoto se publica como EXPORTACIÓN ESTÁTICA (no tiene servidor: los datos viven en el navegador).
 * La sirve el ERP de GSG en su propio host (src/lib/sitio-buscatufoto.ts del ERP). Los recursos de Next
 * van bajo /btf para no chocar con los del ERP en el mismo despliegue.
 */
const exportar = process.env.BTF_EXPORT === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Raíz explícita: sin esto Turbopack sube hasta el package-lock del ERP y toma su `src/proxy.ts`
  // (módulos `@/lib/...` que no existen acá).
  turbopack: { root: import.meta.dirname },
  ...(exportar ? { output: "export" as const, assetPrefix: "/btf", images: { unoptimized: true } } : {}),
};

export default nextConfig;
