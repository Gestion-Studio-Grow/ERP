import Link from "next/link";
import { listBlueprints } from "@/blueprints";
import { MODULES } from "@/lib/operator-config";
import { ACCENT_PRESETS } from "@/lib/branding";
import { EMPRESA_MODULE_IDS } from "@/lib/provisioning/stubs";
import { operatorPrisma } from "@/lib/operator-db";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { decidirAcceso } from "@/lib/multilocal/multilocal-core";
import { requiereOkDelDuenio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import { buildProvisionInput, type RawWizardForm } from "@/lib/provisioning/console-input";
import { AltaWizard, type WizardData } from "./WizardClient";

export const dynamic = "force-dynamic";

/**
 * ¿La fábrica de negocios da de alta SIN el catálogo de ejemplo del rubro? Un local de una red
 * tiene que nacer vacío y recibir la lista de la casa: con el catálogo de ejemplo nace con
 * productos y stock que no existen (Vacío 20 kg, Asado 30 kg…). Se le pregunta al mismo mapeo que
 * usa el alta (`buildProvisionInput`): si el pedido que arma no lleva `sinCatalogo`, la fábrica no
 * lo va a leer, y el wizard no ofrece "Local de una red". Se enciende solo el día que la fábrica
 * lo cumpla, sin tocar este archivo.
 */
function fabricaDaAltaSinCatalogo(): boolean {
  const pedido: unknown = buildProvisionInput({ slug: "sonda", sinCatalogo: true } as RawWizardForm, "dry-run");
  return (pedido as { sinCatalogo?: unknown }).sinCatalogo === true;
}

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
  // Las casas a las que se puede sumar un local (paso "¿de qué red?"): las que tienen Mis locales
  // y pueden abrirlo (no el panel del contador a la vez), y nunca un negocio que requiere el OK
  // del dueño. La regla es la misma que decide el vínculo (`decidirAcceso`, `validarVinculo`).
  // "Negocios abiertos este mes" se cuenta por mes del negocio (hora de Argentina). Son todos los
  // negocios nuevos (cada local es un negocio), no sólo los que entraron a una red.
  const inicioDelMes = businessWallTimeToUtc(`${todayInBusinessTz().slice(0, 7)}-01`, "00:00");
  const [tenantCount, conRed, delMes] = await Promise.all([
    operatorPrisma.tenant.count(),
    operatorPrisma.tenant.findMany({
      where: { modules: { has: "multilocal" } },
      select: { id: true, name: true, slug: true, modules: true, arcaCuit: true },
      orderBy: { name: "asc" },
    }),
    operatorPrisma.tenant.findMany({ where: { createdAt: { gte: inicioDelMes } }, select: { arcaPuntoVenta: true } }),
  ]);
  const casas = conRed
    .filter((c) => decidirAcceso(c.modules, "casa").ok && !requiereOkDelDuenio(c.slug))
    .map((c) => ({ id: c.id, name: c.name, cuit: c.arcaCuit }));
  const sinPuntoDeVenta = delMes.filter((t) => !t.arcaPuntoVenta).length;

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
    casas,
    altaEnRedDisponible: fabricaDaAltaSinCatalogo(),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operador" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-strong">
          ← Negocios
        </Link>
        <h1 className="text-2xl font-bold text-strong">Dar de alta un negocio</h1>
        <p className="text-muted text-sm mt-1 max-w-prose">
          Paso a paso, con la vista previa de cómo queda. Antes de crear nada se hace una prueba en
          seco; si algo falla a mitad de camino, no queda nada a medias, y repetir el alta no lo
          duplica.
          {data.altaEnRedDisponible
            ? " Si el local es de una marca con varios locales, el paso «¿De qué red?» lo deja vinculado a su casa, con su punto de venta y la lista de precios de la casa, en la misma corrida."
            : " El paso «¿De qué red?» todavía no abre locales dentro de una red: la fábrica siembra el catálogo de ejemplo del rubro."}
        </p>
        <p className="mt-3 inline-flex flex-wrap gap-x-2 rounded-md border border-line px-3 py-2 text-sm">
          <span className="text-muted">Negocios abiertos este mes:</span>
          <span className="font-semibold tabular-nums text-strong">{delMes.length}</span>
          {sinPuntoDeVenta > 0 && (
            <span className="text-warning">
              · {sinPuntoDeVenta} sin punto de venta (no pueden facturar: se carga en su ficha)
            </span>
          )}
        </p>
      </div>
      <AltaWizard data={data} />
    </div>
  );
}
