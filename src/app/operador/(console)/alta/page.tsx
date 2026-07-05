import Link from "next/link";
import { provisionFromConsole } from "@/lib/operator-actions";
import { listBlueprints } from "@/blueprints";
import { MODULES, PLANS, TENANT_STATUSES, ACCENT_PRESET_IDS } from "@/lib/operator-config";
import { Card, Field, Input, Select, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

// ALTA DE TENANT desde la consola — envuelve provisionTenant (ADR-019). Materializa
// el descubrimiento pre-alta (ONBOARDING §3.2): rubro→blueprint (o comodín), branding,
// módulos y plan, todo en un formulario que arma un tenant pre-configurado.
export default async function AltaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const blueprints = listBlueprints();

  // Agrupa por familia usando el prefijo del label ("Agenda · Estética" → "Agenda").
  // Los blueprints base (servicios/carniceria/generico) no tienen prefijo → "Base".
  const groups = new Map<string, { id: string; label: string }[]>();
  for (const b of blueprints) {
    const [maybeFamily, ...rest] = b.label.split(" · ");
    const family = rest.length > 0 ? maybeFamily : "Base / Genérico";
    const label = rest.length > 0 ? rest.join(" · ") : b.label;
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family)!.push({ id: b.id, label });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/operador" className="text-sm text-muted hover:text-strong">← Tenants</Link>
        <h1 className="text-2xl font-semibold mt-2">Alta de tenant</h1>
        <p className="text-muted text-sm mt-1">
          Envuelve el provisioning (ADR-019): crea tenant + dueño + branding + catálogo del rubro.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft text-danger text-sm px-3 py-2 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <form action={provisionFromConsole} className="space-y-6">
        <Card className="p-5 space-y-4">
          <h2 className="font-medium">Negocio</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nombre del negocio" required>
              <Input name="name" required placeholder="Estética Norte" />
            </Field>
            <Field label="Slug (identificador único, URL-safe)" required hint="minúsculas, números y guiones">
              <Input name="slug" required placeholder="estetica-norte" />
            </Field>
            <Field label="Nombre del dueño (OWNER)">
              <Input name="ownerName" placeholder="Ana Ruiz" />
            </Field>
            <Field label="Email del dueño (login)" required>
              <Input type="email" name="ownerEmail" required placeholder="ana@estetica-norte.com" />
            </Field>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-medium">Rubro y vertical</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Rubro (texto libre)" hint="Se resuelve al blueprint del rubro, o al comodín genérico si no matchea.">
              <Input name="rubro" placeholder="p. ej. ferretería, spa, carnicería…" />
            </Field>
            <Field label="…o blueprint explícito" hint="Si lo elegís, tiene prioridad sobre el rubro.">
              <Select name="blueprint" defaultValue="">
                <option value="">(según rubro / default)</option>
                {[...groups.entries()].map(([family, items]) => (
                  <optgroup key={family} label={family}>
                    {items.map((b) => (
                      <option key={b.id} value={b.id}>{b.label}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-medium">Plan, estado y marca</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Plan">
              <Select name="plan" defaultValue="trial">
                {PLANS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Estado inicial">
              <Select name="status" defaultValue="TRIAL">
                {TENANT_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Acento de marca">
              <Select name="accentPreset" defaultValue="">
                <option value="">(default del rubro)</option>
                {ACCENT_PRESET_IDS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tema de la vidriera">
              <Select name="frontTheme" defaultValue="">
                <option value="">(default)</option>
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </Select>
            </Field>
            <Field label="Subdominio / link del tenant" hint="Su URL propia. Único. Opcional." className="md:col-span-2">
              <Input name="subdomain" placeholder="estetica-norte" />
            </Field>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-medium">Módulos activos</h2>
          <p className="text-sm text-muted">Si no marcás ninguno, se usan los del blueprint por defecto.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {MODULES.map((m) => (
              <label key={m.id} className="flex items-start gap-2 rounded-md border border-line p-3 cursor-pointer hover:bg-elevated">
                <input type="checkbox" name="modules" value={m.id} className="mt-1" />
                <span>
                  <span className="font-medium text-sm">{m.label}{m.plugin ? " · plugin" : ""}</span>
                  <span className="block text-xs text-muted">{m.description}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit">Provisionar tenant</Button>
          <Link href="/operador" className="text-sm text-muted hover:text-strong">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
