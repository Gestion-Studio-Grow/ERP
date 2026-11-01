import type { Metadata } from "next";
import { headers } from "next/headers";
import { CLASES_FUENTES } from "./fuentes";
import { CSS_TALLER } from "./estilos";

// Piel común de /taller y /taller/turno: la letra del taller (sólo en estas rutas) y su CSS, renderizado acá, en el
// servidor. La barra y el pie los pone cada página (marco.tsx) para que error.tsx los pueda reemplazar si la base cae.

// URLs absolutas de la metadata (og:image) con el host del request, no con el .vercel.app del proyecto.
async function baseDelRequest(): Promise<URL | null> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return null;
  const local = /(^|\.)localhost(:|$)|^127\.0\.0\.1(:|$)/.test(host);
  return new URL(`${local ? "http" : "https"}://${host}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const base = await baseDelRequest();
  // Firma de GSG sólo en metadata (ADR-043): en la vidriera no se ve.
  return { generator: "Gestión Studio Grow", ...(base ? { metadataBase: base } : {}) };
}

export default function TallerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`agr ${CLASES_FUENTES}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS_TALLER }} />
      {children}
    </div>
  );
}
