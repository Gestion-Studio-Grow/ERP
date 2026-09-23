import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { getReceivableDetail } from "@/lib/debts/receivable-repo";
import { medioDelPago } from "@/lib/cuentas/loader";
import { agingOf } from "@/lib/cuentas/aging";
import type { DebtAccountDetail } from "@/lib/cuentas/types";
import { cuentasCorrientesEnabled } from "@/lib/settlement/asiento-libro";
import { PageHeader, EmptyState } from "@/components/ui";
import { DebtDetailBody } from "@/components/cuentas/DebtDetailBody";
import { registerReceivableCollection } from "../actions";

export const dynamic = "force-dynamic";

const volver = (
  <Link href="/admin/cuentas-a-cobrar" className="inline-flex h-11 items-center text-sm font-medium text-accent hover:underline">
    ← Volver al fiado
  </Link>
);

// El detalle de un fiado: saldo, vencimiento, historial de cobros y el formulario para
// registrar lo que el cliente va pagando. La guardia es la de la app (rol, módulo y edición),
// igual que el listado; la acción de cobro pasa por la misma regla (`requireAppAccion`).
export default async function CuentaACobrarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("cuentas-a-cobrar");
  const tenantId = await getCurrentTenantId();

  const { id } = await params;
  const d = await getReceivableDetail(tenantId, id);
  if (!d) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <PageHeader title="Cuenta de cliente" description="Detalle del fiado, con el historial de cobros." />
        <EmptyState
          title="No encontramos esa cuenta"
          description="Puede que el enlace sea viejo o que la cuenta se haya anulado. Volvé al listado y elegila de nuevo."
          action={volver}
        />
      </main>
    );
  }

  const detail: DebtAccountDetail = {
    id: d.id,
    contraparte: d.clientName,
    total: d.amount,
    saldado: d.collected,
    saldo: d.balance,
    vencimiento: d.dueDate,
    referencia: d.concept,
    historial: d.collections.map((c) => ({ id: c.id, fecha: c.at, monto: c.amount, metodo: medioDelPago(c.method, c.note), nota: c.note })),
  };
  const aging = agingOf(detail.vencimiento, new Date());
  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <PageHeader
        title={detail.contraparte}
        description={detail.referencia ? `Fiado · ${detail.referencia}` : "Fiado: saldo, vencimiento e historial de cobros."}
        actions={volver}
      />
      <DebtDetailBody
        detail={detail}
        aging={aging}
        kind="cobrar"
        action={registerReceivableCollection}
        asientaEnLibro={cuentasCorrientesEnabled()}
        anulada={d.status !== "OPEN"}
      />
    </main>
  );
}
