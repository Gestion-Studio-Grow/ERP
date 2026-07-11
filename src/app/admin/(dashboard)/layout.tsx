import type { Metadata } from "next";
import AdminShell from "./AdminShell";
import ToastProvider from "./ToastProvider";
import GlobalLoadingProvider from "./GlobalLoadingProvider";
import DemoBanner from "./DemoBanner";
import { requireUser } from "@/lib/authz";
import { getActiveModuleIds } from "@/lib/module-gating";
import { getActiveProfile } from "@/lib/profile-gating";
import { densityForProfile } from "@/lib/profile-density";
import { navGroupingEnabled } from "@/modules";
import { getTenantBrand, resolveAccent, invertTheme } from "@/lib/branding";
import { getBrandSheet, brandSheetAccent } from "@/lib/brand-sheet";
import { tenantBrandSheetEnabled } from "@/lib/identity";
import type { CSSProperties } from "react";

// Monograma de respaldo a partir del nombre ("Velas DEMO" → "VD", "Magra" → "M").
function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "•";
  if (w.length === 1) return w[0].slice(0, 1).toUpperCase();
  return w.map((x) => x[0]).join("").slice(0, 2).toUpperCase();
}

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
  const [user, brand, activeModuleIds, activeProfile] = await Promise.all([
    requireUser(),
    getTenantBrand(),
    // Gating por módulo (ADR-054/055): set activo del tenant, o null si el flag está
    // apagado → AdminShell no gatea por módulo (solo por rol). Reversible.
    getActiveModuleIds(),
    // Perfil activo (ADR-058/059): "lite"/"enterprise" o null si `PROFILES_ENABLED`
    // está OFF (default) → AdminShell no gatea por perfil ni suma ítems Empresa. Reversible.
    getActiveProfile(),
  ]);

  // REGLA front/back: el BACK (admin) va en el tema OPUESTO al front del tenant.
  // Seteamos `data-theme` (los tokens semánticos de globals.css flipan solos, y
  // como el admin ya es token-driven, todo el panel cambia de luminosidad) e
  // inyectamos el acento del tenant AFINADO a ese tema (--accent + on-accent con
  // contraste AA). hover/soft se derivan en globals.css.
  //
  // FICHA DE MARCA (RFC-004-D, frente B), detrás de `TENANT_BRAND_SHEET_ENABLED`: cuando está
  // ON, la PIEL sale de la ficha del tenant leída de la DB (getBrandSheet: name/accentPreset/
  // frontTheme/blueprintId → theme pack) y `data-brand` inyecta neutros+tipografía+densidad
  // propios (globals.css). Con el flag OFF → camino legado (mapa por slug) → byte-idéntico.
  const useSheet = tenantBrandSheetEnabled();
  const sheet = useSheet ? await getBrandSheet() : null;

  const backTheme = sheet ? sheet.backTheme : invertTheme(brand.frontTheme);
  const { accent, onAccent } = sheet
    ? brandSheetAccent(sheet, backTheme)
    : resolveAccent(brand.preset, backTheme);
  const dataBrand = sheet ? sheet.themeId : undefined;
  const brandName = sheet ? sheet.name : brand.name;
  const monogram = sheet ? initialsOf(sheet.name) : brand.monogram;

  // DENSIDAD por perfil (ADR-059 D4): el MISMO design system en dos densidades. Comercio
  // (lite) → `data-density="lite"` (espacioso, --density 1.32); Empresa (enterprise) y motor
  // OFF → sin atributo (denso, :root --density 1 = hoy). Es el diferenciador visual que el
  // Challenger marcó invisible (data-theme se seteaba, data-density nunca). Reversible: con
  // `PROFILES_ENABLED` OFF, `activeProfile` es null → sin atributo → byte-idéntico.
  const density = densityForProfile(activeProfile);

  return (
    <div
      data-theme={backTheme}
      data-density={density}
      data-brand={dataBrand}
      style={{ "--accent": accent, "--text-on-accent": onAccent } as CSSProperties}
      className="min-h-screen bg-surface text-body"
    >
      {/* Banda de "modo demo" — solo aparece en el deploy de demo; null en real. */}
      <DemoBanner />
      <GlobalLoadingProvider>
        <ToastProvider>
          <AdminShell role={user.role} userName={user.name} brandName={brandName} monogram={monogram} activeModules={activeModuleIds ? [...activeModuleIds] : null} navGrouping={navGroupingEnabled()} activeProfile={activeProfile}>
            {children}
          </AdminShell>
        </ToastProvider>
      </GlobalLoadingProvider>
    </div>
  );
}
