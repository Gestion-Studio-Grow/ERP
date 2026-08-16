import type { Metadata } from "next";
import Link from "next/link";
import { getPublicBookingData } from "@/lib/actions";
import { getBrandSheet } from "@/lib/brand-sheet";
import { tenantBrandSheetEnabled } from "@/lib/identity";
import ReserveButton from "../_ch/ReserveButton";
import ServicesAccordion from "../_ch/ServicesAccordion";

// ============================================================================
// LA CARTA COMPLETA — todos los tratamientos con su precio, en su propia página.
// ============================================================================
//
// Vivía dentro de la home, en un acordeón al medio del scroll. Dos problemas:
// la home tenía que ser a la vez folleto y lista de precios, y quien venía sólo
// a chequear un precio tenía que recorrer la página entera para llegar.
//
// Ahora son dos piezas con un trabajo cada una: la home muestra pocos
// tratamientos con su precio exacto (FeaturedTreatments) y esta página es la
// carta, sin adornos, enlazable y compartible por WhatsApp — que es como
// realmente circula una lista de precios en un negocio de barrio.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const sheet = tenantBrandSheetEnabled() ? await getBrandSheet() : null;
  const nombre = sheet?.name ?? "CH Estética";
  return {
    title: `Servicios y precios — ${nombre}`,
    description: "Todos los tratamientos con su duración y su precio exacto. Reservás online en un minuto.",
  };
}

const versalitas: React.CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
  textTransform: "uppercase",
  letterSpacing: ".2em",
  fontWeight: 600,
  fontSize: ".6875rem",
  color: "var(--text-muted)",
};

export default async function ServiciosPage() {
  const [{ groups }, sheet] = await Promise.all([
    getPublicBookingData(),
    tenantBrandSheetEnabled() ? getBrandSheet() : Promise.resolve(null),
  ]);

  return (
    <main style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(32px,6vw,64px) 24px clamp(56px,8vw,96px)" }}>
      <p style={{ ...versalitas, margin: "0 0 14px" }}>La carta</p>
      <h1
        style={{
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize: "clamp(2rem,4.5vw,3.2rem)",
          fontWeight: 480,
          lineHeight: 1.08,
          letterSpacing: "-.01em",
          margin: "0 0 18px",
          color: "var(--text-strong)",
        }}
      >
        Servicios <em style={{ fontStyle: "italic", fontWeight: 340 }}>&amp;</em> precios
      </h1>
      <p style={{ margin: "0 0 40px", fontSize: "1.0625rem", color: "var(--text-muted)", maxWidth: "34rem", lineHeight: 1.72 }}>
        {sheet
          ? "Cada tratamiento con su duración y su precio. Sin “desde”: lo que ves es lo que sale."
          : "Cada tratamiento con su duración y su precio. Sin “desde”: lo que ves es lo que sale. El precio de vecino/a se aplica solo, no hay que pedirlo."}
      </p>

      {groups.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Próximamente publicamos el menú de servicios.</p>
      ) : (
        <ServicesAccordion groups={groups} />
      )}

      <div
        style={{
          marginTop: "clamp(40px,6vw,64px)",
          paddingTop: 32,
          borderTop: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <ReserveButton>Reservar turno</ReserveButton>
        <Link
          href="/"
          style={{
            ...versalitas,
            color: "color-mix(in srgb, var(--accent) 78%, #000)",
            textDecoration: "underline",
            textUnderlineOffset: 5,
          }}
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
