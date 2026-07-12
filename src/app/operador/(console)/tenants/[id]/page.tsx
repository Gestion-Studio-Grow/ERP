import Link from "next/link";
import { notFound } from "next/navigation";
import { operatorPrisma } from "@/lib/operator-db";
import { getBlueprint } from "@/blueprints";
import {
  setTenantStatus,
  setTenantPlan,
  setTenantBranding,
  setTenantSubdomain,
  toggleTenantModule,
  cargarCredencialFiscal,
} from "@/lib/operator-actions";
import { MODULES, PLANS, TENANT_STATUSES, ACCENT_PRESET_IDS } from "@/lib/operator-config";
import { Card, Field, Input, Select, Textarea, Button, Badge } from "@/components/ui";

// Estado de la credencial fiscal del tenant (metadata NO sensible). Tolerante a que la
// migración `TenantFiscalCredential` no esté aplicada aún (Gate 2): si la tabla no existe,
// devuelve `null` en vez de romper la ficha.
async function credencialFiscalDe(tenantId: string): Promise<
  { certCuit: string; certNotAfter: Date | null; updatedAt: Date } | null | "pendiente"
> {
  try {
    const r = await operatorPrisma.tenantFiscalCredential.findUnique({
      where: { tenantId },
      select: { certCuit: true, certNotAfter: true, updatedAt: true },
    });
    return r ?? null;
  } catch {
    return "pendiente"; // tabla inexistente (migración sin aplicar)
  }
}

export const dynamic = "force-dynamic";

function blueprintLabel(id: string | null): string {
  if (!id) return "—";
  try { return getBlueprint(id).label; } catch { return id; }
}

// CONFIGURACIÓN POR TENANT (control-plane, ADR-021). Cross-tenant vía operatorPrisma.
export default async function TenantConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; bootstrap?: string; ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { created, bootstrap, ok, error } = await searchParams;

  const tenant = await operatorPrisma.tenant.findUnique({
    where: { id },
    select: {
      id: true, name: true, slug: true, status: true, plan: true, blueprintId: true,
      subdomain: true, modules: true, accentPreset: true, frontTheme: true, createdAt: true,
      arcaCuit: true,
      _count: { select: { users: true, services: true, products: true, appointments: true, orders: true, clients: true } },
    },
  });
  if (!tenant) notFound();

  const active = new Set(tenant!.modules);
  const credFiscal = await credencialFiscalDe(tenant!.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/operador" className="text-sm text-muted hover:text-strong">← Tenants</Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-semibold">{tenant!.name}</h1>
          <Badge tone={tenant!.status === "ACTIVE" ? "success" : tenant!.status === "SUSPENDED" ? "danger" : "info"} dot>
            {tenant!.status}
          </Badge>
        </div>
        <p className="text-muted text-sm mt-1">
          /{tenant!.slug} · {blueprintLabel(tenant!.blueprintId)} · {tenant!._count.users} usuarios ·{" "}
          {tenant!._count.clients} clientes
        </p>
      </div>

      {created && (
        <div className="rounded-md bg-success-soft text-success text-sm px-3 py-2">
          Tenant provisionado.
          {bootstrap && (
            <span className="block mt-1">
              🔑 Contraseña de bootstrap del OWNER (se muestra <b>una sola vez</b>, comunicala por canal seguro):{" "}
              <code className="font-mono">{bootstrap}</code>
            </span>
          )}
        </div>
      )}
      {ok && <div className="rounded-md bg-success-soft text-success text-sm px-3 py-2">Guardado ({ok}).</div>}
      {error && <div className="rounded-md bg-danger-soft text-danger text-sm px-3 py-2 whitespace-pre-wrap">{error}</div>}

      {/* Estado + Plan */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h2 className="font-medium">Estado</h2>
          <form action={setTenantStatus} className="flex items-end gap-2">
            <input type="hidden" name="tenantId" value={tenant!.id} />
            <Field label="Estado del tenant" className="flex-1">
              <Select name="status" defaultValue={tenant!.status}>
                {TENANT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="outline" size="sm">Guardar</Button>
          </form>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-medium">Plan</h2>
          <form action={setTenantPlan} className="flex items-end gap-2">
            <input type="hidden" name="tenantId" value={tenant!.id} />
            <Field label="Plan comercial" className="flex-1">
              <Select name="plan" defaultValue={tenant!.plan ?? ""}>
                <option value="">(sin plan)</option>
                {PLANS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="outline" size="sm">Guardar</Button>
          </form>
        </Card>
      </div>

      {/* Branding */}
      <Card className="p-5 space-y-3">
        <h2 className="font-medium">Marca / acento</h2>
        <form action={setTenantBranding} className="grid md:grid-cols-3 gap-3 items-end">
          <input type="hidden" name="tenantId" value={tenant!.id} />
          <Field label="Acento">
            <Select name="accentPreset" defaultValue={tenant!.accentPreset ?? ""}>
              <option value="">(default)</option>
              {ACCENT_PRESET_IDS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </Field>
          <Field label="Tema vidriera">
            <Select name="frontTheme" defaultValue={tenant!.frontTheme ?? ""}>
              <option value="">(default)</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </Select>
          </Field>
          <Button type="submit" variant="outline" size="sm">Guardar</Button>
        </form>
      </Card>

      {/* Subdominio / link */}
      <Card className="p-5 space-y-3">
        <h2 className="font-medium">Link / subdominio</h2>
        <p className="text-sm text-muted">La URL propia del tenant (cada tenant con su routing). Debe ser único.</p>
        <form action={setTenantSubdomain} className="flex items-end gap-2">
          <input type="hidden" name="tenantId" value={tenant!.id} />
          <Field label="Subdominio" className="flex-1">
            <Input name="subdomain" defaultValue={tenant!.subdomain ?? ""} placeholder="estetica-norte" />
          </Field>
          <Button type="submit" variant="outline" size="sm">Guardar</Button>
        </form>
      </Card>

      {/* Credencial fiscal ARCA (cifrada por tenant, ADR-066) */}
      <Card className="p-5 space-y-3">
        <h2 className="font-medium">Credencial fiscal · ARCA</h2>
        <p className="text-sm text-muted">
          Certificado del emisor <b>por tenant</b>, cifrado en reposo (ADR-066). El sistema firma con
          este cert, y solo si su CUIT coincide con el del tenant. Cargalo/rotalo pegando los PEM.
          El material nunca se muestra ni se loguea.
        </p>

        {credFiscal === "pendiente" ? (
          <div className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2">
            La tabla de credenciales fiscales todavía no está en la base (migración pendiente · Gate 2).
            Aplicá <code>TenantFiscalCredential</code> para poder cargar certificados.
          </div>
        ) : credFiscal ? (
          <div className="rounded-md border border-line px-3 py-2 text-sm">
            <Badge tone="success" dot>Cargada</Badge>{" "}
            CUIT del cert: <code>{credFiscal.certCuit}</code>
            {credFiscal.certNotAfter && (
              <> · vence {credFiscal.certNotAfter.toISOString().slice(0, 10)}</>
            )}
            <span className="block text-xs text-muted mt-1">
              Actualizada {credFiscal.updatedAt.toISOString().slice(0, 10)}.
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-line px-3 py-2 text-sm text-muted">
            <Badge tone="info" dot>Sin credencial</Badge> Este tenant todavía no puede emitir facturas reales.
          </div>
        )}

        {!tenant!.arcaCuit && (
          <div className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2" role="alert">
            El tenant no tiene <b>CUIT (arcaCuit)</b> configurado. Cargalo antes del certificado: el guard
            compara el CUIT del cert contra el del tenant.
          </div>
        )}

        <form action={cargarCredencialFiscal} className="space-y-3">
          <input type="hidden" name="tenantId" value={tenant!.id} />
          <Field label="Certificado (PEM)">
            <Textarea
              name="certPem"
              rows={4}
              required
              placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Clave privada (PEM)">
            <Textarea
              name="keyPem"
              rows={4}
              required
              placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
              className="font-mono text-xs"
            />
          </Field>
          <Button type="submit" variant="outline" size="sm">
            {credFiscal && credFiscal !== "pendiente" ? "Rotar credencial" : "Cargar credencial"}
          </Button>
        </form>
      </Card>

      {/* Módulos */}
      <Card className="p-5 space-y-3">
        <h2 className="font-medium">Módulos activos</h2>
        <p className="text-sm text-muted">Encendé/apagá cada módulo para este tenant.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {MODULES.map((m) => {
            const on = active.has(m.id);
            return (
              <form key={m.id} action={toggleTenantModule} className="flex items-center justify-between gap-2 rounded-md border border-line p-3">
                <input type="hidden" name="tenantId" value={tenant!.id} />
                <input type="hidden" name="module" value={m.id} />
                <span>
                  <span className="font-medium text-sm">{m.label}{m.plugin ? " · plugin" : ""}</span>
                  <span className="block text-xs text-muted">{m.description}</span>
                </span>
                <Button type="submit" variant={on ? "solid" : "subtle"} size="sm">
                  {on ? "Activo" : "Apagado"}
                </Button>
              </form>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
