import { requireCapability } from "@/lib/authz";
import { getActiveProfile } from "@/lib/profile-gating";
import { getReceivables } from "@/lib/cuentas/loader";
import { agingOf, summarizeAging } from "@/lib/cuentas/aging";
import { PageHeader, EmptyState } from "@/components/ui";
import { DebtListTable } from "@/components/cuentas/DebtListTable";
import { DebtSummaryCards } from "@/components/cuentas/DebtSummaryCards";

export const dynamic = "force-dynamic";

// Cuentas a cobrar (fiado, ADR-060 D3). perfilMin=enterprise (gate acá) + rubro-gated en
// la nav (fiado = comercio de barrio; el módulo/rubro decide la VISIBILIDAD del ítem).
// Datos vía loader (hoy stub de S1) — la pantalla se recorre detrás de flags sin dead-end.
export default async function CuentasACobrarPage() {
  await requireCapability("billing:manage");
  const profile = await getActiveProfile();
  if (profile !== "enterprise") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Cuentas a cobrar" description="Fiado y saldos de clientes." />
        <EmptyState title="Disponible en la edición Empresa" description="Las cuentas a cobrar (fiado) son parte de la edición Empresa." />
      </main>
    );
  }

  const rows = await getReceivables();
  const now = new Date();
  const vms = rows.map((r) => ({ ...r, aging: agingOf(r.vencimiento, now) }));
  const resumen = summarizeAging(rows, now);

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Cuentas a cobrar"
        description="Fiado y saldos de clientes: quién te debe, cuánto y desde cuándo. Con vencimiento y aviso de vencimiento en la edición Empresa."
      />
      <DebtSummaryCards resumen={resumen} totalLabel="Adeudado por clientes" />
      {rows.length === 0 ? (
        <EmptyState
          title="Sin cuentas por cobrar"
          description="Cuando anotes un fiado a un cliente va a aparecer acá con su saldo, su vencimiento y el historial de cobros."
        />
      ) : (
        <DebtListTable rows={vms} contraparteLabel="Cliente" detailBase="/admin/cuentas-a-cobrar" caption="Cuentas a cobrar" />
      )}
    </main>
  );
}
