import Link from "next/link";
import { operatorPrisma } from "@/lib/operator-db";
import { getBlueprint } from "@/blueprints";
import { Badge, Card, ButtonLink } from "@/components/ui";
import type { BadgeProps } from "@/components/ui";

export const dynamic = "force-dynamic";

// Tono del badge según el estado del tenant.
function statusTone(status: string): BadgeProps["tone"] {
  return status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "danger" : "info";
}
function statusLabel(status: string): string {
  return status === "ACTIVE" ? "Activo" : status === "SUSPENDED" ? "Suspendido" : "En pruebas";
}
function blueprintLabel(id: string | null): string {
  if (!id) return "—";
  try {
    return getBlueprint(id).label;
  } catch {
    return id;
  }
}

// LISTADO + MONITOREO de tenants (control-plane, ADR-021). Lee CROSS-TENANT por la
// conexión de operador (operatorPrisma), nunca por getCurrentTenantId (fail-closed).
export default async function OperatorHome() {
  const tenants = await operatorPrisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      blueprintId: true,
      subdomain: true,
      modules: true,
      createdAt: true,
      _count: { select: { users: true, services: true, products: true, appointments: true, orders: true } },
    },
  });

  const total = tenants.length;
  const active = tenants.filter((t) => t.status === "ACTIVE").length;
  const trial = tenants.filter((t) => t.status === "TRIAL").length;

  // Estado del gate del 2º tenant (ADR-015/018): con >1 tenant, la app del tenant
  // exige RLS activo. Es una señal de plataforma clave, no de un negocio puntual.
  const gateArmado = total > 1;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tenants</h1>
          <p className="text-muted text-sm mt-1">Todos los negocios de la plataforma.</p>
        </div>
        <ButtonLink href="/operador/alta">+ Alta de tenant</ButtonLink>
      </div>

      {/* Monitoreo básico de plataforma */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Tenants" value={String(total)} />
        <Stat label="Activos" value={String(active)} />
        <Stat label="En pruebas" value={String(trial)} />
        <Stat
          label="Gate 2º tenant (RLS)"
          value={gateArmado ? "ARMADO" : "libre"}
          hint={gateArmado ? "Requiere RLS activo (ADR-018)" : "1 tenant — sin gate aún"}
        />
      </div>

      {tenants.length === 0 ? (
        <Card className="p-8 text-center text-muted">
          Todavía no hay tenants. <Link href="/operador/alta" className="text-accent underline">Dar de alta el primero</Link>.
        </Card>
      ) : (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="px-4 py-3 font-medium">Negocio</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Rubro</th>
                  <th className="px-4 py-3 font-medium">Link</th>
                  <th className="px-4 py-3 font-medium">Módulos</th>
                  <th className="px-4 py-3 font-medium">Actividad</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b border-line/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-strong">{t.name}</div>
                      <div className="text-faint text-xs">/{t.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(t.status)} dot>{statusLabel(t.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{t.plan ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{blueprintLabel(t.blueprintId)}</td>
                    <td className="px-4 py-3 text-muted">
                      {t.subdomain ? <code className="text-xs">{t.subdomain}</code> : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{t.modules.length}</td>
                    <td className="px-4 py-3 text-faint text-xs">
                      {t._count.users}u · {t._count.services + t._count.products}cat · {t._count.appointments + t._count.orders}op
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/operador/tenants/${t.id}`} className="text-accent hover:underline">Configurar →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-xs text-faint mt-1">{hint}</div>}
    </Card>
  );
}
