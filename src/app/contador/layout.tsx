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
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import ThemeToggle from "../admin/(dashboard)/ThemeToggle";
import { basePrisma } from "@/lib/prisma-base";
import { getCurrentTenantId } from "@/lib/tenant";

export const metadata: Metadata = {
  title: "Panel del contador",
  robots: { index: false, follow: false },
  // Sello GSG (estándar de marca): el estudio conserva SU marca visible; GSG
  // firma como generador, discreto.
  generator: "Gestión Studio Grow",
};

export default async function ContadorLayout({ children }: { children: React.ReactNode }) {
  // Diseño nuevo del estudio (interruptor "Diseño nuevo"): se larga ya y se espera al final, en
  // paralelo con las lecturas de abajo. Nunca rechaza: si falla, el de siempre.
  const disenoP = disenoNuevo();
  const brand = await getTenantBrand();
  // Acento del producto Contador (verde) salvo que el estudio haya elegido color de equipo.
  const { identidad } = await getProductoContexto();
  const preset = (await getTeamAccentPreset()) ?? identidad?.acento ?? brand.preset;
  const accentLight = resolveAccent(preset, "light");
  const accentDark = resolveAccent(preset, "dark");
  const nuevo = await disenoP;
  // Diseño nuevo: la cabecera lleva el nombre del estudio (el de la marca puede ser el genérico
  // «Mi negocio» si nunca lo cargaron). Una lectura chica, sólo con el interruptor prendido.
  const estudio = nuevo
    ? await basePrisma.tenant.findUnique({ where: { id: await getCurrentTenantId() }, select: { name: true } })
    : null;
  const nombreEstudio = estudio?.name?.trim() || brand.name;

  return (
    <div
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
      className="min-h-screen bg-surface text-body"
    >
      {/* Corrige el data-theme ANTES del primer paint (sistema/localStorage). */}
      <AdminThemeScript nuevo={nuevo} />
      {/* Diseño nuevo: sus hojas y `useDiseno()`. Apagado devuelve lo de adentro tal cual. */}
      <ConDiseno nuevo={nuevo}>
        {nuevo ? (
          <>
            {/* La cabecera del estudio (diseño nuevo): su marca, qué es esta pantalla y el tema. El
                mismo renglón de marca que la hoja de ingreso; sin barra lateral. */}
            <header data-parte="cabecera-estudio" className="border-b border-line-strong bg-surface">
              <div className="mx-auto flex min-h-14 max-w-[87.5rem] items-center gap-3 px-4 lg:px-6">
                <span aria-hidden className="grid h-8 min-w-8 place-items-center rounded-[4px] bg-accent px-1.5 text-[14px] font-semibold text-on-accent">
                  {nombreEstudio.charAt(0).toUpperCase() || "E"}
                </span>
                <span className="min-w-0 truncate text-[15px] font-semibold text-strong">{nombreEstudio}</span>
                <span className="hidden text-[13px] text-muted sm:inline">· panel del contador</span>
                <span className="ml-auto flex items-center">
                  <ThemeToggle />
                </span>
              </div>
            </header>
            {children}
          </>
        ) : (
          children
        )}
      </ConDiseno>
    </div>
  );
}
