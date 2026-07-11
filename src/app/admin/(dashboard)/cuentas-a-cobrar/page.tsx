import { requireCapability } from "@/lib/authz";
import { getReceivables } from "@/lib/cuentas/loader";
import { agingOf, summarizeAging } from "@/lib/cuentas/aging";
import { PageHeader, EmptyState } from "@/components/ui";
import { DebtListTable } from "@/components/cuentas/DebtListTable";
import { DebtSummaryCards } from "@/components/cuentas/DebtSummaryCards";

export const dynamic = "force-dynamic";

// Cuentas a cobrar (fiado, ADR-060 D3). Es `lite` + RUBRO (fiado = comercio de barrio):
// NO enterprise-only — un Comercio de rubro fiado lo usa. El rubro-gating (qué tenants lo
// ven) vive en la nav (perfilMin=lite + módulo por rubro, default-OFF). El plus de Empresa
// es ADITIVO (vencimiento/recordatorio, J60) sobre la misma pantalla — data-driven (el
// Comercio hace fiado light sin vencimiento → la columna "Vence" queda "—", aging neutral),
// no un gate. La `capability` (billing:manage) es la barrera de rol.
export default async function CuentasACobrarPage() {
  await requireCapability("billing:manage");

  const rows = await getReceivables();
  const now = new Date();
  const vms = rows.map((r) => ({ ...r, aging: agingOf(r.vencimiento, now) }));
  const resumen = summarizeAging(rows, now);

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Cuentas a cobrar"
        description="Fiado y saldos de clientes: quién te debe, cuánto y desde cuándo. Con vencimiento y aviso automático en la edición Empresa."
      />
      <DebtSummaryCards resumen={resumen} totalLabel="Adeudado por clientes" />
      {rows.length === 0 ? (
        <EmptyState
          title="Sin cuentas a cobrar"
          description="Cuando anotes un fiado a un cliente va a aparecer acá con su saldo, su vencimiento y el historial de cobros."
        />
      ) : (
        <DebtListTable rows={vms} contraparteLabel="Cliente" detailBase="/admin/cuentas-a-cobrar" caption="Cuentas a cobrar" />
      )}
    </main>
  );
}
