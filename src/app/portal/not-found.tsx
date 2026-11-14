// «Este link ya no está disponible» (QA MIA #5 → hallazgo 4): un token del portal que no existe, que la productora
// revocó o regeneró, o un portal apagado, no deja al cliente en el 404 de Next en inglés. Cubre /portal/[token] (y lo que
// cuelgue de /portal). El texto es el mismo en todos los casos: no dice si el link existió alguna vez.
// Next no le pasa params a not-found: la marca sale del host (el negocio ya lo dice la dirección, no el token).

import type { Metadata } from "next";
import localFont from "next/font/local";
import { marcaProductora } from "@/lib/proyectos/marca";
import { getCurrentTenantSlug } from "@/lib/tenant-site";

export const metadata: Metadata = { title: "Este link ya no está disponible", robots: { index: false, follow: false } };

const letra = localFont({ src: [{ path: "../../fonts/work-sans/work-sans-latin-300-normal.woff2", weight: "300", style: "normal" }, { path: "../../fonts/work-sans/work-sans-latin-400-normal.woff2", weight: "400", style: "normal" }, { path: "../../fonts/work-sans/work-sans-latin-500-normal.woff2", weight: "500", style: "normal" }], preload: false });

export default async function LinkNoDisponible() {
  const slug = await getCurrentTenantSlug().catch(() => null);
  const marca = marcaProductora(slug);
  return (
    <div className={letra.className} style={{ minHeight: "100dvh", background: marca.papel, color: marca.tinta, display: "grid", placeItems: "center", padding: 16 }}>
      <main data-qa="link-no-disponible" style={{ maxWidth: 560, display: "grid", gap: 16, borderTop: `4px solid ${marca.acento}`, paddingTop: 24 }}>
        <h1 style={{ margin: 0, fontSize: "clamp(28px, 6vw, 40px)", lineHeight: 1.1, fontWeight: 500 }}>Este link ya no está disponible</h1>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 300 }}>Pedile uno nuevo a quien te lo mandó.</p>
      </main>
    </div>
  );
}
