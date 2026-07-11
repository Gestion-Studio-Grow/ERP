// Layout del producto FACTURITA (/facturita/app) — la experiencia colapsada del
// tenant liviano (ADR-076): Emitir / Mis facturas / Mi cuenta y nada más. Fuera
// del AdminShell a propósito: el usuario de Facturita no ve un ERP, ve un
// emisor de facturas. Misma piel Fable (claro/oscuro + acento del tenant).

import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import AdminThemeScript from "../../admin/AdminThemeScript";
import ThemeToggle from "../../admin/(dashboard)/ThemeToggle";

export const metadata: Metadata = {
  title: "Facturita",
  robots: { index: false, follow: false },
  // Sello GSG: el negocio conserva su marca; GSG firma como generador, discreto.
  generator: "Gestión Studio Grow",
};

const TABS = [
  { href: "/facturita/app", label: "Emitir" },
  { href: "/facturita/app/facturas", label: "Mis facturas" },
  { href: "/facturita/app/cuenta", label: "Mi cuenta" },
];

export default async function FacturitaLayout({ children }: { children: React.ReactNode }) {
  const brand = await getTenantBrand();
  const preset = (await getTeamAccentPreset()) ?? brand.preset;
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
      <AdminThemeScript />
      <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <span className="text-sm font-semibold tracking-tight text-strong">
            {brand.name || "Facturita"}
          </span>
          <nav aria-label="Secciones" className="flex gap-1">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-strong"
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="mx-auto max-w-3xl border-t border-line px-4 pb-6 pt-4 text-center text-xs text-faint">
        Con tecnología de Gestión Studio Grow
      </footer>
    </div>
  );
}
