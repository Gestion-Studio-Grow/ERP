// La hoja chica de las pantallas del ingreso que no son el login (desbloquear con PIN, definir el PIN): la marca del
// negocio arriba, una tarjeta y el sello GSG abajo. Server component; misma piel que /admin/login/pin.

import type { CSSProperties, ReactNode } from "react";
import LogoDelNegocio from "@/components/marca/LogoDelNegocio";
import { FUENTES_PANEL } from "@/design/fuentes-panel";
import { getTenantBrand, marcaDelNegocio, resolveAccent } from "@/lib/branding";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { claseDeFuentes } from "@/lib/estetica-backoffice-fuentes";
import { getCurrentTenantSlug } from "@/lib/tenant-site";

export default async function HojaSimple({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [brand, slug] = await Promise.all([getTenantBrand(), getCurrentTenantSlug()]);
  const { nombre } = marcaDelNegocio(brand, null);
  const estetica = esteticaBackoffice(slug) ?? undefined;
  const claro = resolveAccent(brand.preset, "light");
  const oscuro = resolveAccent(brand.preset, "dark");

  return (
    <main
      data-skin="fable"
      data-escala="nivel-5"
      data-theme="light"
      data-estetica={estetica}
      suppressHydrationWarning
      style={{ "--tenant-accent-light": claro.accent, "--tenant-on-accent-light": claro.onAccent, "--tenant-accent-dark": oscuro.accent, "--tenant-on-accent-dark": oscuro.onAccent } as CSSProperties}
      className={`min-h-screen flex flex-col items-center justify-center bg-surface text-body px-4 py-10 sm:px-6 ${FUENTES_PANEL}${estetica ? ` ${claseDeFuentes(estetica)}` : ""}`}
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {estetica && <LogoDelNegocio estetica={estetica} nombre={nombre} />}
          <p className="mt-3 text-sm font-medium text-muted">{nombre}</p>
        </div>
        <section aria-labelledby="hoja-titulo" className="grid gap-4 rounded-xl border border-line bg-surface-raised p-6 shadow-sm sm:p-8">
          <h1 id="hoja-titulo" className="text-xl font-semibold tracking-tight text-strong">{titulo}</h1>
          {children}
        </section>
        <p className="mt-6 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</p>
      </div>
    </main>
  );
}
