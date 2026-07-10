import Link from "next/link";
import type { CSSProperties } from "react";
import { getPublicBookingData, getPublicNews } from "@/lib/actions";
import { nextBusinessDays } from "@/lib/datetime";
import { getLocation } from "@/lib/settings";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { getBrandSheet, brandSheetAccent } from "@/lib/brand-sheet";
import { tenantBrandSheetEnabled } from "@/lib/identity";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { WhatsAppCtaProvider } from "@/components/whatsapp-cta";
import BookingProvider from "./_ch/BookingProvider";
import Header from "./_ch/Header";
import AnnouncementBar from "./_ch/AnnouncementBar";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [{ groups, professionals }, news, location, brand, slug] = await Promise.all([
    getPublicBookingData(),
    getPublicNews(),
    getLocation(),
    getTenantBrand(),
    getCurrentTenantSlug(),
  ]);
  // REGLA front/back: el FRONT (vidriera) usa el tema declarado del tenant; el
  // acento va afinado a ese tema (--accent + on-accent). `data-theme` deja los
  // tokens listos para cuando estas pantallas migren a la base Nocturne.
  //
  // FICHA DE MARCA (RFC-004-D, frente A), detrás de `TENANT_BRAND_SHEET_ENABLED`: con el flag
  // ON, la piel del front sale de la ficha del tenant (DB) + su theme pack (`data-brand`) → ya
  // no hereda el look de CH. Flag OFF → camino legado (byte-idéntico).
  const sheet = tenantBrandSheetEnabled() ? await getBrandSheet() : null;
  const frontTheme = sheet ? sheet.frontTheme : brand.frontTheme;
  const dataBrand = sheet ? sheet.themeId : undefined;
  const brandName = sheet ? sheet.name : brand.name;
  const { accent, onAccent } = sheet
    ? brandSheetAccent(sheet, frontTheme)
    : resolveAccent(brand.preset, brand.frontTheme);
  const days = nextBusinessDays(14);
  // WhatsApp del negocio (módulo Localización): ya viene normalizado a dígitos.
  const whatsapp = location.whatsapp;
  const latestNews = news[0] ?? null;

  return (
    <WhatsAppCtaProvider tenantKey={slug ?? "ch-default"} configuredNumber={whatsapp}>
      <BookingProvider data={{ groups, professionals, days, whatsapp }}>
      {/* Acento + tema del front por tenant, disponibles también en el sitio para
          cuando sus pantallas migren a los tokens de la base Nocturne. */}
      <div data-theme={frontTheme} data-brand={dataBrand} style={{ background: "var(--surface)", color: "var(--text-strong)", fontFamily: "var(--font-body), system-ui, sans-serif", "--accent": accent, "--text-on-accent": onAccent } as CSSProperties}>
        {/* Franja arriba de todo el sitio (no solo home): la novedad se
            "adopta" con menos fricción que esperando que el cliente llegue
            a la sección más abajo en la página. */}
        {latestNews && <AnnouncementBar id={latestNews.id} message={latestNews.message} />}
        <Header hasNews={!!latestNews} brandName={brandName} />
        <main id="top">{children}</main>

        <footer style={{ background: "var(--surface-inverted)", color: "var(--text-on-accent)" }}>
          <div style={{ maxWidth: 1152, margin: "0 auto", padding: "48px 24px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 24, fontSize: ".875rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 22, color: "var(--accent)" }}>{brandName}</span>
              </div>
              <p style={{ margin: 0 }}>{location.addressLine} · {location.city}</p>
            </div>
            <div>
              <p style={{ color: "var(--text-on-accent)", margin: "0 0 4px" }}>Horarios</p>
              <p style={{ margin: 0 }}>{location.hoursLabel}</p>
            </div>
            <div>
              <p style={{ color: "var(--text-on-accent)", margin: "0 0 4px" }}>Contacto</p>
              <p style={{ margin: 0 }}>{location.contactNote}</p>
              {location.instagramUrl && (
                <p style={{ margin: "4px 0 0" }}>
                  <a href={location.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-on-accent)", textDecoration: "underline", textUnderlineOffset: 4 }}>
                    {location.instagramLabel}
                  </a>
                </p>
              )}
              {location.email && (
                <p style={{ margin: "4px 0 0" }}>
                  <a href={`mailto:${location.email}`} style={{ color: "var(--text-on-accent)", textDecoration: "underline", textUnderlineOffset: 4 }}>
                    {location.email}
                  </a>
                </p>
              )}
              <Link href="/admin" style={{ display: "inline-block", marginTop: 8, color: "var(--text-on-accent)", opacity: 0.7, textDecoration: "underline", textUnderlineOffset: 4, fontSize: ".8125rem" }}>
                Acceso administrador
              </Link>
            </div>
          </div>
        </footer>
      </div>
      </BookingProvider>
    </WhatsAppCtaProvider>
  );
}
