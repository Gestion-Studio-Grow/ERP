import Link from "next/link";
import { listBlueprints } from "@/blueprints";
import { MODULES } from "@/lib/operator-config";
import { ACCENT_PRESETS } from "@/lib/branding";
import { EMPRESA_MODULE_IDS } from "@/lib/provisioning/stubs";
import { operatorPrisma } from "@/lib/operator-db";
import { AltaWizard, type WizardData } from "./WizardClient";

export const dynamic = "force-dynamic";

// ALTA DE TENANT — WIZARD con preview en vivo (RFC-003 §3.1) sobre la fábrica de tenants (ADR-074).
// Server component: computa TODO el catálogo (blueprints, módulos, acentos con color real) del lado
// servidor y lo pasa como props planos al wizard cliente. El cliente NO importa nada server-tainted
// (catálogo de módulos/plugins, branding, Prisma) — sólo tipos, UI y los Server Actions del alta.
export default async function AltaPage() {
  const blueprints = listBlueprints();

  // Agrupa por familia usando el prefijo del label ("Agenda · Estética" → "Agenda").
  const groups = new Map<string, { id: string; label: string }[]>();
  for (const b of blueprints) {
    const [maybeFamily, ...rest] = b.label.split(" · ");
    const family = rest.length > 0 ? maybeFamily : "Base / Genérico";
    const label = rest.length > 0 ? rest.join(" · ") : b.label;
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family)!.push({ id: b.id, label });
  }

  // Swatches de color REALES de cada acento (resuelve P5: elegir viendo el color, no un id crudo).
  const accents = (Object.keys(ACCENT_PRESETS) as (keyof typeof ACCENT_PRESETS)[]).map((id) => ({
    id,
    light: ACCENT_PRESETS[id].light,
    dark: ACCENT_PRESETS[id].dark,
    onLight: ACCENT_PRESETS[id].onLight,
    onDark: ACCENT_PRESETS[id].onDark,
  }));

  // ¿El próximo es el 2º tenant? El gate RLS de ADR-018 lo bloquea hasta activar RLS; lo avisamos
  // ANTES de crear (RFC-003 §3.1 paso 5), no como error post-submit.
  const tenantCount = await operatorPrisma.tenant.count();

  const data: WizardData = {
    blueprintGroups: [...groups.entries()].map(([family, items]) => ({ family, items })),
    moduleCatalog: MODULES.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      plugin: Boolean(m.plugin),
    })),
    empresaModuleIds: [...EMPRESA_MODULE_IDS],
    accents,
    isSecondTenant: tenantCount >= 1,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operador" className="text-sm text-muted hover:text-strong">← Tenants</Link>
        <h1 className="text-2xl font-semibold mt-2">Alta de tenant</h1>
        <p className="text-muted text-sm mt-1">
          Wizard con vista previa en vivo. Envuelve la fábrica de tenants (ADR-074): dry-run obligatorio →
          preview → commit del core de ADR-019 (idempotente, transaccional, gate RLS).
        </p>
      </div>
      <AltaWizard data={data} />
    </div>
  );
}
