// Layout del panel del contador (/contador) — superficie propia del ESTUDIO
// contable (módulo CARTERA), fuera del AdminShell del tenant: el contador opera
// su cartera, no el backoffice de un negocio. Misma piel que el resto del back:
// SKIN FABLE (mockups aprobados por el dueño) — el tema lo decide el usuario
// (prefers-color-scheme + toggle persistente, anti-flash con AdminThemeScript),
// y el acento es el del tenant estudio (color del equipo si lo eligió), con sus
// DOS tonos inyectados para que el toggle flipe también el acento.

import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import { getProductoContexto } from "@/lib/producto";
import AdminThemeScript from "../admin/AdminThemeScript";

export const metadata: Metadata = {
  title: "Panel del contador",
  robots: { index: false, follow: false },
  // Sello GSG (estándar de marca): el estudio conserva SU marca visible; GSG
  // firma como generador, discreto.
  generator: "Gestión Studio Grow",
};

export default async function ContadorLayout({ children }: { children: React.ReactNode }) {
  const brand = await getTenantBrand();
  // Acento del producto Contador (verde) salvo que el estudio haya elegido color de equipo.
  const { identidad } = await getProductoContexto();
  const preset = (await getTeamAccentPreset()) ?? identidad?.acento ?? brand.preset;
  const accentLight = resolveAccent(preset, "light");
  const accentDark = resolveAccent(preset, "dark");

  return (
    <div
      data-skin="fable"
      data-theme="light"
      suppressHydrationWarning
      style={
        {
          "--tenant-accent-light": accentLight.accent,
          "--tenant-on-accent-light": accentLight.onAccent,
          "--tenant-accent-dark": accentDark.accent,
          "--tenant-on-accent-dark": accentDark.onAccent,
        } as CSSProperties
      }
      className="min-h-screen bg-surface text-body"
    >
      {/* Corrige el data-theme ANTES del primer paint (sistema/localStorage). */}
      <AdminThemeScript />
      {children}
    </div>
  );
}
