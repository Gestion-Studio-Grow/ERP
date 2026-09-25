import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { requireUser } from "@/lib/authz";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import { getProductoContexto } from "@/lib/producto";
import AdminThemeScript from "../AdminThemeScript";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import HojaDeIngreso, { RAIZ_HOJA_DE_INGRESO } from "../login/HojaDeIngreso";
import { folioDelDia } from "../login/login-core";

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
  // Diseño nuevo del negocio: se larga ya y se espera al final (en paralelo con lo de abajo).
  // Nunca rechaza: si falla, el de siempre.
  const disenoP = disenoNuevo();
  const { status } = await searchParams;
  const user = await requireUser();

  const brand = await getTenantBrand();
  const { identidad } = await getProductoContexto();
  const preset = (await getTeamAccentPreset()) ?? identidad?.acento ?? brand.preset;
  const accentLight = resolveAccent(preset, "light");
  const accentDark = resolveAccent(preset, "dark");
  const marcaNombre = identidad?.nombre ?? brand.name;
  const marcaMonograma = identidad?.monograma ?? brand.monogram;
  const nuevo = await disenoP;

  return (
    <main
      data-skin="fable"
      // Diseño nuevo: apagado es `undefined` y la raíz queda como siempre (raices-ch.test.ts).
      data-diseno={nuevo ? PIEL_RENGLON : undefined}
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
      // Diseño nuevo: la misma hoja que el ingreso, anclada arriba. Apagado, la clase de siempre.
      className={
        nuevo
          ? RAIZ_HOJA_DE_INGRESO
          : "min-h-screen flex flex-col items-center justify-center bg-surface text-body px-4 py-10 sm:px-6"
      }
    >
      <AdminThemeScript nuevo={nuevo} />

      {/* Diseño nuevo: sus hojas y `useDiseno()`. Apagado devuelve este único hijo tal cual. */}
      <ConDiseno nuevo={nuevo}>
        {nuevo ? (
          <HojaDeIngreso
            marcaNombre={marcaNombre}
            marcaMonograma={marcaMonograma}
            hoy={folioDelDia(new Date())}
            lema={identidad?.tagline}
          >
            <section aria-labelledby="cp-titulo" className="mt-8">
              <h1 id="cp-titulo" className="text-[26px] font-semibold leading-tight text-strong">
                Definí tu contraseña
              </h1>
              <p className="mt-1 mb-6 text-sm text-muted">
                Hola {user.name.split(/\s+/)[0]}: entraste con una contraseña temporal. Elegí una nueva
                para terminar de entrar. Va a quedar solo para vos.
              </p>
              <div className="border-t border-line pt-5">
                <ChangePasswordForm status={status} />
              </div>
            </section>
          </HojaDeIngreso>
        ) : (
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
        )}
      </ConDiseno>
    </main>
  );
}
