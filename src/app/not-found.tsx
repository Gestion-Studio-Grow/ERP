// «No encontramos esta página» (404) de toda la app. Qué se muestra lo decide noEncontradaPara
// (no-encontrada-core.ts): en la consola del operador y en el panel de un negocio con el «Diseño
// nuevo» prendido, una hoja en castellano con el camino de vuelta. En la vidriera, CH con su «Diseño
// nuevo» prendido ve el suyo adentro del sitio, y apagado la hoja en castellano con su nombre: el layout del
// sitio se dibuja sólo para CH. El `import()` no lo separa del compilado: el HTML del 404 de otro negocio igual
// pide el JS de CH y el CSS de sus fuentes (medido el 31/10 sobre f29231fd). En el resto (otras vidrieras, y el
// panel con el interruptor apagado) el 404 de Next de siempre, el mismo módulo que Next usa cuando no hay not-found.tsx.

import type { CSSProperties } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import NotFoundDeNext from "next/dist/client/components/builtin/not-found";
import { getTenantBrand, resolveAccent } from "@/lib/branding";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { PIEL_RENGLON } from "@/lib/diseno/diseno";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import AdminThemeScript from "./admin/AdminThemeScript";
import HojaDeIngreso, { RAIZ_HOJA_DE_INGRESO } from "./admin/login/HojaDeIngreso";
import { folioDelDia } from "./admin/login/login-core";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { noEncontradaDeLaVidriera, noEncontradaPara } from "./no-encontrada-core";
import { chConDisenoNuevo } from "./(site)/_ch/diseno-ch.server";

export default async function NoEncontrada() {
  const ruta = (await headers()).get("x-pathname");
  // En la consola no se lee el interruptor (no hay negocio).
  const siPrendido = noEncontradaPara(ruta, true);
  if (!siPrendido) {
    // Vidriera: una dirección que no existe no pasa por el layout del sitio. CH la ve con su encabezado, su pie y el camino de
    // vuelta (P0-3), con el diseño nuevo o con el de siempre. El resto, el de siempre. Los `notFound()` de las páginas del
    // sitio no llegan acá: los atiende (site)/not-found.tsx, ya adentro del layout.
    const vidriera = noEncontradaDeLaVidriera(await getCurrentTenantSlug().catch(() => null), await chConDisenoNuevo());
    if (vidriera === "de-next") return <NotFoundDeNext />;
    const { default: SiteLayout } = await import("./(site)/layout");
    if (vidriera === "ch-de-siempre") {
      const { default: NoEncontradaDelNegocio } = await import("./(site)/NoEncontradaDelNegocio");
      return (
        <SiteLayout>
          <NoEncontradaDelNegocio />
        </SiteLayout>
      );
    }
    const { default: NoEncontradaCH } = await import("./(site)/_ch/NoEncontradaCH");
    return (
      <SiteLayout>
        <NoEncontradaCH />
      </SiteLayout>
    );
  }
  const nuevo = siPrendido.superficie === "operador" ? true : await disenoNuevo();
  const decision = noEncontradaPara(ruta, nuevo);
  if (!decision) return <NotFoundDeNext />;

  const brand = decision.superficie === "negocio" ? await getTenantBrand() : null;
  const claro = brand ? resolveAccent(brand.preset, "light") : null;
  const oscuro = brand ? resolveAccent(brand.preset, "dark") : null;

  return (
    <main
      data-skin="fable"
      data-diseno={PIEL_RENGLON}
      data-theme="light"
      suppressHydrationWarning
      style={
        claro && oscuro
          ? ({
              "--tenant-accent-light": claro.accent,
              "--tenant-on-accent-light": claro.onAccent,
              "--tenant-accent-dark": oscuro.accent,
              "--tenant-on-accent-dark": oscuro.onAccent,
            } as CSSProperties)
          : undefined
      }
      className={RAIZ_HOJA_DE_INGRESO}
    >
      <AdminThemeScript nuevo />
      <ConDiseno nuevo>
        <HojaDeIngreso
          marcaNombre={brand ? brand.name : "Consola GSG"}
          marcaMonograma={brand ? brand.monogram : "G"}
          hoy={folioDelDia(new Date())}
          lema={brand ? undefined : "Gestión Studio Grow"}
        >
          <title>No encontramos esta página</title>
          <section aria-labelledby="ne-titulo" className="mt-8">
            <h1 id="ne-titulo" className="text-[26px] font-semibold leading-tight text-strong">
              No encontramos esta página
            </h1>
            <p className="mt-2 text-[15px] text-body">
              La dirección no existe, se escribió mal o ya no está disponible.
            </p>
            {ruta && <p className="mt-1 break-all text-sm text-muted">{ruta}</p>}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {decision.enlaces.map((e, i) => (
                <Link
                  key={e.href}
                  href={e.href}
                  className={cn(buttonClasses(i === 0 ? "solid" : "outline", "lg", "w-full sm:w-auto"), "min-h-11")}
                >
                  {e.etiqueta}
                </Link>
              ))}
            </div>
          </section>
        </HojaDeIngreso>
      </ConDiseno>
    </main>
  );
}
