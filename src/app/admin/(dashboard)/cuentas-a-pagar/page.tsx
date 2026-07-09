import { requireCapability } from "@/lib/authz";
import { getActiveProfile } from "@/lib/profile-gating";
import { getPayables } from "@/lib/cuentas/loader";
import { agingOf, summarizeAging } from "@/lib/cuentas/aging";
import { PageHeader, EmptyState } from "@/components/ui";
import { DebtListTable } from "@/components/cuentas/DebtListTable";
import { DebtSummaryCards } from "@/components/cuentas/DebtSummaryCards";

export const dynamic = "force-dynamic";

// Cuentas a pagar a proveedores + cheque diferido (ADR-060 D2, J59). perfilMin=enterprise
// (gate acá). Datos vía loader (hoy stub de S1) — se recorre detrás de flags sin dead-end.
export default async function CuentasAPagarPage() {
  await requireCapability("billing:manage");
  const profile = await getActiveProfile();
  if (profile !== "enterprise") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Cuentas a pagar" description="Saldos con proveedores." />
        <EmptyState title="Disponible en la edición Empresa" description="Las cuentas a pagar son parte de la edición Empresa." />
      </main>
    );
  }

  const rows = await getPayables();
  const now = new Date();
  const vms = rows.map((r) => ({ ...r, aging: agingOf(r.vencimiento, now) }));
  const resumen = summarizeAging(rows, now);

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Cuentas a pagar"
        description="Saldos con proveedores, con cheque diferido: qué debés, a quién y cuándo vence (o cuándo se deposita el cheque)."
      />
      <DebtSummaryCards resumen={resumen} totalLabel="A pagar a proveedores" />
      {rows.length === 0 ? (
        <EmptyState
          title="Sin cuentas por pagar"
          description="Cuando registres una deuda con un proveedor va a aparecer acá con su saldo, su vencimiento y el cheque diferido."
        />
      ) : (
        <DebtListTable rows={vms} contraparteLabel="Proveedor" detailBase="/admin/cuentas-a-pagar" caption="Cuentas a pagar" />
      )}
    </main>
  );
}
