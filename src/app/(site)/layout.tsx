import Link from "next/link";
import { getPublicBookingData } from "@/lib/actions";
import { nextBusinessDays } from "@/lib/datetime";
import { BUSINESS_WHATSAPP } from "@/lib/business-config";
import BookingProvider from "./_ch/BookingProvider";
import Header from "./_ch/Header";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { groups, professionals } = await getPublicBookingData();
  const days = nextBusinessDays(14);
  const whatsapp = BUSINESS_WHATSAPP.replace(/\D/g, "");

  return (
    <BookingProvider data={{ groups, professionals, days, whatsapp }}>
      <div style={{ background: "var(--ch-ivory)", color: "var(--ch-ink)", fontFamily: "var(--font-body), system-ui, sans-serif" }}>
        <Header />
        <main id="top">{children}</main>

        <footer style={{ background: "var(--ch-sage-deep)", color: "rgba(243,238,229,.8)" }}>
          <div style={{ maxWidth: 1152, margin: "0 auto", padding: "48px 24px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 24, fontSize: ".875rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, color: "var(--ch-teal-logo)" }}>CH</span>
                <span style={{ textTransform: "uppercase", letterSpacing: ".22em", fontWeight: 600, fontSize: ".75rem", color: "var(--ch-clay)" }}>Estética</span>
              </div>
              <p style={{ margin: 0 }}>Barrio La Alameda, Canning · Buenos Aires</p>
            </div>
            <div>
              <p style={{ color: "var(--ch-ivory)", margin: "0 0 4px" }}>Horarios</p>
              <p style={{ margin: 0 }}>Lun a sáb · 9 a 19 h</p>
            </div>
            <div>
              <p style={{ color: "var(--ch-ivory)", margin: "0 0 4px" }}>Contacto</p>
              <p style={{ margin: 0 }}>Reservas por la web · WhatsApp con turno confirmado</p>
              <Link href="/admin" style={{ color: "rgba(243,238,229,.55)", textDecoration: "underline", textUnderlineOffset: 4, fontSize: ".8125rem" }}>
                Acceso administrador
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </BookingProvider>
  );
}
