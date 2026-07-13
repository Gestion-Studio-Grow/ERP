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
  setTenantArcaCuit,
  cargarCredencialFiscal,
} from "@/lib/operator-actions";
import { MODULES, PLANS, TENANT_STATUSES, ACCENT_PRESET_IDS } from "@/lib/operator-config";
import { Card, Field, Input, Select, Textarea, Button, Badge, fmtCuit } from "@/components/ui";
import { modoDesdeEnv } from "@/plugins/arca";
import { operatorReadMustChange } from "@/lib/must-change-password";
import { ResetOwnerPasswordCard } from "./ResetOwnerPasswordCard";

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

const MODO_ARCA_LABEL: Record<string, string> = {
  stub: "Stub (apagado)",
  homologacion: "Homologación (test)",
  real: "Real (producción)",
};

// Fila del "estado fiscal de un vistazo". El ✓/✗ va acompañado de texto (no solo
// color) para accesibilidad. `ok === null` = dato neutro (sin aplicar / no aplica).
function EstadoFiscalRow({ label, ok, valor }: { label: string; ok: boolean | null; valor: string }) {
  const tone = ok === null ? "neutral" : ok ? "success" : "warning";
  const estado = ok === null ? "sin dato" : ok ? "listo" : "falta";
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-2 font-medium text-strong">
        <span>{valor}</span>
        <Badge tone={tone} dot>
          <span className="sr-only">{estado}: </span>
          {ok === null ? "—" : ok ? "✓" : "✗"}
        </Badge>
      </dd>
    </div>
  );
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

  // OWNER del tenant + estado de su contraseña temporal (para la tarjeta de reset). Cross-tenant
  // vía operatorPrisma; el estado del flag tolera que la migración Gate 2 no esté aplicada.
  const owner = await operatorPrisma.user.findFirst({
    where: { tenantId: tenant!.id, role: "OWNER", active: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  const ownerTempPending = owner
    ? await operatorReadMustChange(operatorPrisma, owner.id)
    : (false as const);

  // Estado fiscal derivado (para el resumen "de un vistazo" y el semáforo).
  const modoArca = modoDesdeEnv();
  const credLoaded = credFiscal && credFiscal !== "pendiente" ? credFiscal : null;
  const cuitOk = !!tenant!.arcaCuit;
  const certOk = !!credLoaded;
  const certVence = credLoaded?.certNotAfter ? credLoaded.certNotAfter.toISOString().slice(0, 10) : null;
  const cuitCertMismatch = !!(credLoaded && cuitOk && credLoaded.certCuit !== tenant!.arcaCuit);
  const listoParaFacturar = cuitOk && certOk && !cuitCertMismatch && modoArca !== "stub";

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

      {/* Facturación electrónica · ARCA (CUIT + credencial por tenant, ADR-066) */}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-medium">Facturación electrónica · ARCA</h2>
          <p className="text-sm text-muted">
            Para emitir hacen falta dos cosas, <b>en este orden</b>: <b>1)</b> el CUIT del emisor y{" "}
            <b>2)</b> su certificado ARCA. El sistema firma <b>solo</b> si el CUIT del certificado coincide
            con el del tenant (guard fail-closed, ADR-066). El material nunca se muestra ni se loguea.
          </p>
        </div>

        {/* Estado fiscal de un vistazo */}
        <dl className="grid sm:grid-cols-2 gap-2 text-sm">
          <EstadoFiscalRow
            label="CUIT del emisor"
            ok={cuitOk}
            valor={cuitOk ? fmtCuit(tenant!.arcaCuit) : "sin cargar"}
          />
          <EstadoFiscalRow
            label="Certificado"
            ok={credFiscal === "pendiente" ? null : certOk}
            valor={credFiscal === "pendiente" ? "tabla pendiente" : certOk ? "cargado" : "sin cargar"}
          />
          <EstadoFiscalRow
            label="Vence el certificado"
            ok={certVence ? true : null}
            valor={certVence ?? "—"}
          />
          <EstadoFiscalRow
            label="Modo ARCA (plataforma)"
            ok={modoArca !== "stub"}
            valor={MODO_ARCA_LABEL[modoArca]}
          />
        </dl>

        {/* Semáforo: ¿listo para facturar? */}
        {listoParaFacturar ? (
          <div role="status" className="rounded-md bg-success-soft text-success text-sm px-3 py-2">
            ✓ Listo para facturar en modo <b>{MODO_ARCA_LABEL[modoArca]}</b>.
          </div>
        ) : (
          <div role="status" className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2">
            Todavía no está listo para facturar
            {!cuitOk && " — falta el CUIT del emisor"}
            {cuitOk && !certOk && " — falta el certificado"}
            {cuitOk && certOk && cuitCertMismatch && " — el CUIT no coincide con el del certificado"}
            {cuitOk && certOk && !cuitCertMismatch && modoArca === "stub" && " — ARCA está en modo stub (apagado)"}
            .
          </div>
        )}

        {cuitCertMismatch && (
          <div role="alert" className="rounded-md bg-danger-soft text-danger text-sm px-3 py-2">
            El CUIT del tenant (<code>{fmtCuit(tenant!.arcaCuit)}</code>) no coincide con el del certificado
            cargado (<code>{fmtCuit(credLoaded!.certCuit)}</code>). La firma lo va a rechazar: corregí el CUIT
            o volvé a cargar el certificado del CUIT correcto.
          </div>
        )}

        {/* Paso 1 — CUIT del emisor */}
        <form action={setTenantArcaCuit} className="space-y-2 border-t border-line pt-4">
          <input type="hidden" name="tenantId" value={tenant!.id} />
          <Field label="Paso 1 · CUIT del emisor">
            <div className="flex items-end gap-2">
              <Input
                name="arcaCuit"
                defaultValue={tenant!.arcaCuit ?? ""}
                placeholder="20-30405060-7"
                inputMode="numeric"
                autoComplete="off"
                className="flex-1 font-mono"
                aria-describedby="cuit-hint"
              />
              <Button type="submit" variant="outline" size="sm">Guardar CUIT</Button>
            </div>
          </Field>
          <p id="cuit-hint" className="text-xs text-muted">
            11 números (con o sin guiones/puntos). Se valida el dígito verificador. Dejalo vacío para borrarlo.
          </p>
        </form>

        {/* Paso 2 — Certificado ARCA */}
        <div className="space-y-3 border-t border-line pt-4">
          <h3 className="text-sm font-medium">Paso 2 · Certificado ARCA</h3>

          {credFiscal === "pendiente" ? (
            <div role="alert" className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2">
              La tabla de credenciales fiscales todavía no está en la base (migración pendiente · Gate 2).
              Aplicá <code>TenantFiscalCredential</code> para poder cargar certificados.
            </div>
          ) : credLoaded ? (
            <div className="rounded-md border border-line px-3 py-2 text-sm">
              <Badge tone="success" dot>Cargada</Badge>{" "}
              CUIT del cert: <code>{fmtCuit(credLoaded.certCuit)}</code>
              {certVence && <> · vence {certVence}</>}
              <span className="block text-xs text-muted mt-1">
                Actualizada {credLoaded.updatedAt.toISOString().slice(0, 10)}.
              </span>
            </div>
          ) : (
            <div className="rounded-md border border-line px-3 py-2 text-sm text-muted">
              <Badge tone="info" dot>Sin credencial</Badge> Cargá primero el CUIT (Paso 1), después el certificado.
            </div>
          )}

          {!cuitOk && credFiscal !== "pendiente" && (
            <div role="alert" className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2">
              Cargá el <b>CUIT (Paso 1)</b> antes del certificado: el guard compara el CUIT del cert contra el del tenant.
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
              {credLoaded ? "Rotar credencial" : "Cargar credencial"}
            </Button>
          </form>
        </div>
      </Card>

      {/* Contraseña del OWNER — reset con revelado único */}
      <ResetOwnerPasswordCard
        tenantId={tenant!.id}
        ownerEmail={owner?.email ?? null}
        tempPending={ownerTempPending}
      />

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
