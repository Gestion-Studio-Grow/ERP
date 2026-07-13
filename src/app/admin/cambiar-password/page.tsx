import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { requireUser } from "@/lib/authz";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import { getProductoContexto } from "@/lib/producto";
import AdminThemeScript from "../AdminThemeScript";
import { ChangePasswordForm } from "./ChangePasswordForm";

// Vive FUERA de (dashboard) a propósito (como /admin/login): el proxy exige sesión válida para
// llegar, pero NO hereda el layout del dashboard → el portón de cambio forzado que redirige acá
// no entra en loop. Sin indexar; sello GSG discreto.
export const metadata: Metadata = {
  title: "Cambiá tu contraseña",
  robots: { index: false, follow: false },
  generator: "Gestión Studio Grow",
};

export default async function CambiarPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const user = await requireUser();

  const brand = await getTenantBrand();
  const { identidad } = await getProductoContexto();
  const preset = (await getTeamAccentPreset()) ?? identidad?.acento ?? brand.preset;
  const accentLight = resolveAccent(preset, "light");
  const accentDark = resolveAccent(preset, "dark");
  const marcaNombre = identidad?.nombre ?? brand.name;
  const marcaMonograma = identidad?.monograma ?? brand.monogram;

  return (
    <main
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
      className="min-h-screen flex flex-col items-center justify-center bg-surface text-body px-4 py-10 sm:px-6"
    >
      <AdminThemeScript />

      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="relative grid h-12 w-12 place-items-center">
            <span aria-hidden className="absolute inset-0 rounded-xl bg-accent opacity-20 blur-lg" />
            <span
              aria-hidden
              className="relative grid h-12 w-12 place-items-center rounded-xl bg-accent text-lg font-bold text-on-accent shadow-sm"
            >
              {marcaMonograma}
            </span>
          </span>
          <p className="mt-3 text-sm font-medium text-muted">{marcaNombre}</p>
        </div>

        <section
          aria-labelledby="cp-titulo"
          className="rounded-xl border border-line bg-surface-raised p-6 shadow-sm sm:p-8"
        >
          <h1 id="cp-titulo" className="text-xl font-semibold tracking-tight text-strong">
            Definí tu contraseña
          </h1>
          <p className="mt-1 mb-6 text-sm text-muted">
            Hola {user.name.split(/\s+/)[0]}: entraste con una contraseña temporal. Elegí una nueva
            para terminar de entrar. Va a quedar solo para vos.
          </p>

          <ChangePasswordForm status={status} />
        </section>

        <p className="mt-6 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</p>
      </div>
    </main>
  );
}
