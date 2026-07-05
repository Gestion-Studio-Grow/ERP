import type { Metadata } from "next";
import PremiumLanding from "@/components/premium/PremiumLanding";
import { MAGRA_PREMIUM } from "@/lib/premium-brand";

// TIER "Front Premium Animado" — ruta de demostración del template.
// Aislada del core (no importa DB/RLS): se puede renderizar y buildear sola.
// Un tenant premium activa su front pasando su propia PremiumConfig (ver
// src/lib/premium-brand.ts → PREMIUM_TENANTS). Acá mostramos Magra de ejemplo.
//
// SSR completo (contenido en el HTML para SEO); la animación es una isla cliente.
export const dynamic = "force-static";

const brand = MAGRA_PREMIUM;

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.sub,
};

export default function PremiumPage() {
  return <PremiumLanding config={brand} />;
}
