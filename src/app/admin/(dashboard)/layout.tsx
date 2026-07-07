import type { Metadata } from "next";
import AdminShell from "./AdminShell";
import ToastProvider from "./ToastProvider";
import GlobalLoadingProvider from "./GlobalLoadingProvider";
import DemoBanner from "./DemoBanner";
import { requireUser } from "@/lib/authz";
import { getTenantBrand, resolveAccent, invertTheme } from "@/lib/branding";
import { isDemoSandbox } from "@/lib/demo-flag";
import { activeDemoRecommendation, demoNavHrefs } from "@/lib/demo-consultor";
import type { CSSProperties } from "react";

// Título neutro (antes heredaba "CH Estética…" del layout raíz → se filtraba la
// marca de CH a la pestaña del panel de CUALQUIER tenant, p. ej. Magra). Y el
// backoffice no debe indexarse.
export const metadata: Metadata = {
  title: "Panel de gestión",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // El portón grueso (¿hay sesión?) lo hace `proxy.ts`; acá resolvemos el
  // usuario para adaptar la navegación a su rol (ADR-017 §2.e — ocultar lo que
  // no puede es UX; la seguridad real son los guardas server-side por acción).
  const [user, brand] = await Promise.all([requireUser(), getTenantBrand()]);

  // REGLA front/back: el BACK (admin) va en el tema OPUESTO al front del tenant.
  // Seteamos `data-theme` (los tokens semánticos de globals.css flipan solos, y
  // como el admin ya es token-driven, todo el panel cambia de luminosidad) e
  // inyectamos el acento del tenant AFINADO a ese tema (--accent + on-accent con
  // contraste AA). hover/soft se derivan en globals.css.
  const backTheme = invertTheme(brand.frontTheme);
  const { accent, onAccent } = resolveAccent(brand.preset, backTheme);

  // En el deploy de demo, el nav se acota a los módulos con fixture (sin
  // callejones sin salida) y coherentes con lo que recomendó el consultor. En un
  // deploy real es `null` → el nav se filtra solo por rol, como siempre.
  const demoNav = isDemoSandbox() ? demoNavHrefs(activeDemoRecommendation()) : null;

  return (
    <div
      data-theme={backTheme}
      style={{ "--accent": accent, "--text-on-accent": onAccent } as CSSProperties}
      className="min-h-screen bg-surface text-body"
    >
      {/* Banda de "modo demo" — solo aparece en el deploy de demo; null en real. */}
      <DemoBanner />
      <GlobalLoadingProvider>
        <ToastProvider>
          <AdminShell role={user.role} userName={user.name} brandName={brand.name} monogram={brand.monogram} demoNavHrefs={demoNav}>
            {children}
          </AdminShell>
        </ToastProvider>
      </GlobalLoadingProvider>
    </div>
  );
}
