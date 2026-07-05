import Link from "next/link";
import type { CSSProperties } from "react";
import { getPublicBookingData, getPublicNews } from "@/lib/actions";
import { nextBusinessDays } from "@/lib/datetime";
import { getLocation } from "@/lib/settings";
import { getTenantAccent } from "@/lib/branding";
import BookingProvider from "./_ch/BookingProvider";
import Header from "./_ch/Header";
import AnnouncementBar from "./_ch/AnnouncementBar";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [{ groups, professionals }, news, location, accent] = await Promise.all([
    getPublicBookingData(),
    getPublicNews(),
    getLocation(),
    getTenantAccent(),
  ]);
  const days = nextBusinessDays(14);
  // WhatsApp del negocio (módulo Localización): ya viene normalizado a dígitos.
  const whatsapp = location.whatsapp;
  const latestNews = news[0] ?? null;

  return (
    <BookingProvider data={{ groups, professionals, days, whatsapp }}>
      {/* Acento de marca por tenant (`--accent`) disponible también en el sitio,
          para cuando sus pantallas migren a los tokens de la base B. */}
      <div style={{ background: "var(--ch-ivory)", color: "var(--ch-ink)", fontFamily: "var(--font-body), system-ui, sans-serif", "--accent": accent } as CSSProperties}>
        {/* Franja arriba de todo el sitio (no solo home): la novedad se
            "adopta" con menos fricción que esperando que el cliente llegue
            a la sección más abajo en la página. */}
        {latestNews && <AnnouncementBar id={latestNews.id} message={latestNews.message} />}
        <Header hasNews={!!latestNews} />
        <main id="top">{children}</main>

        <footer style={{ background: "var(--ch-sage-deep)", color: "rgba(243,238,229,.8)" }}>
          <div style={{ maxWidth: 1152, margin: "0 auto", padding: "48px 24px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 24, fontSize: ".875rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, color: "var(--ch-teal-logo)" }}>CH</span>
                <span style={{ textTransform: "uppercase", letterSpacing: ".22em", fontWeight: 600, fontSize: ".75rem", color: "var(--ch-clay)" }}>Estética</span>
              </div>
              <p style={{ margin: 0 }}>{location.addressLine} · {location.city}</p>
            </div>
            <div>
              <p style={{ color: "var(--ch-ivory)", margin: "0 0 4px" }}>Horarios</p>
              <p style={{ margin: 0 }}>{location.hoursLabel}</p>
            </div>
            <div>
              <p style={{ color: "var(--ch-ivory)", margin: "0 0 4px" }}>Contacto</p>
              <p style={{ margin: 0 }}>{location.contactNote}</p>
              {location.instagramUrl && (
                <p style={{ margin: "4px 0 0" }}>
                  <a href={location.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(243,238,229,.8)", textDecoration: "underline", textUnderlineOffset: 4 }}>
                    {location.instagramLabel}
                  </a>
                </p>
              )}
              {location.email && (
                <p style={{ margin: "4px 0 0" }}>
                  <a href={`mailto:${location.email}`} style={{ color: "rgba(243,238,229,.8)", textDecoration: "underline", textUnderlineOffset: 4 }}>
                    {location.email}
                  </a>
                </p>
              )}
              <Link href="/admin" style={{ display: "inline-block", marginTop: 8, color: "rgba(243,238,229,.55)", textDecoration: "underline", textUnderlineOffset: 4, fontSize: ".8125rem" }}>
                Acceso administrador
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </BookingProvider>
  );
}
