// Apariencia del backoffice (/admin/apariencia) — skin Fable (mockups del dueño).
//
// Dos decisiones, dos alcances distintos (a propósito y explicado en pantalla):
//   - TEMA claro/oscuro → preferencia de CADA persona en CADA dispositivo
//     (localStorage; también está en la topbar). No es dato del negocio.
//   - COLOR DEL EQUIPO → dato del NEGOCIO (Tenant.accentPreset, server action
//     gated `appearance:manage`): lo ven todos los usuarios del panel.
//
// La vidriera pública del tenant NO se toca desde acá: su marca es otra capa
// (theme packs / paleta por tenant). Esto es solo la piel del panel interno.

import { requireApp } from "@/lib/require-app";
import { getTenantBrand, ACCENT_PRESETS, ACCENT_PRESET_LABELS, type AccentPreset } from "@/lib/branding";
import { getTeamAccentPreset } from "@/lib/team-accent";
import { Bloque, PageContainer, PageHeader, SectionGroup } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { AccentSelector, ThemeSelector, type Swatch } from "./AparienciaControls";

export const dynamic = "force-dynamic";

export default async function AparienciaPage() {
  // La guardia de la app (rol, desde el registro): quien no puede ve "App no disponible".
  await requireApp("apariencia");

  const [persistido, brand] = await Promise.all([getTeamAccentPreset(), getTenantBrand()]);
  const actual: AccentPreset = persistido ?? brand.preset;

  const swatches: Swatch[] = (Object.keys(ACCENT_PRESETS) as AccentPreset[]).map((id) => ({
    id,
    label: ACCENT_PRESET_LABELS[id],
    ...ACCENT_PRESETS[id],
  }));

  // DISEÑO NUEVO («Renglón»): dos bloques de renglones que se tocan enteros. La diferencia de alcance
  // (el tema es tuyo, el color es de todos) va en la nota de cada bloque, no en un párrafo.
  if (await disenoNuevo()) {
    const enUso = swatches.find((s) => s.id === actual)?.label;
    return (
      <PageContainer width="narrow">
        <PageHeader title="Apariencia" estado={["Sólo el panel: tu página pública no cambia", enUso ? `color ${enUso.toLowerCase()}` : null]} />
        <div className="space-y-8">
          <Bloque id="tema" titulo="Tema" nota="sólo en este dispositivo">
            <ThemeSelector renglon />
          </Bloque>
          <Bloque id="color" titulo="Color del equipo" nota="lo ven todos">
            <AccentSelector swatches={swatches} actual={actual} renglon />
          </Bloque>
        </div>
      </PageContainer>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Apariencia"
        description="Cómo se ve el panel para vos y para tu equipo. La página pública de tu negocio no cambia: esto es solo puertas adentro."
      />

      <SectionGroup
        title="Tema del panel"
        description="Claro u oscuro, como te resulte más cómodo. Es una elección personal: cada persona del equipo elige el suyo en su dispositivo (también desde el botón de la barra superior)."
      >
        <ThemeSelector />
      </SectionGroup>

      <SectionGroup
        title="Color del equipo"
        description="El color de los botones, enlaces y resaltados del panel. Este sí es del negocio: lo ven todos los usuarios. Cada color trae su tono para tema claro y para tema oscuro."
      >
        <AccentSelector swatches={swatches} actual={actual} />
      </SectionGroup>
    </main>
  );
}
