import Link from "next/link";
import { requireCapability } from "@/lib/authz";
import { getActiveProfile } from "@/lib/profile-gating";
import { getReceivable } from "@/lib/cuentas/loader";
import { agingOf } from "@/lib/cuentas/aging";
import { PageHeader, EmptyState } from "@/components/ui";
import { DebtDetailBody } from "@/components/cuentas/DebtDetailBody";
import { registerReceivableCollection } from "../actions";

export const dynamic = "force-dynamic";

const volver = (
  <Link href="/admin/cuentas-a-cobrar" className="text-sm font-medium text-accent hover:underline">
    ← Volver a cuentas a cobrar
  </Link>
);

export default async function CuentaACobrarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("billing:manage");
  const profile = await getActiveProfile();
  if (profile !== "enterprise") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Cuenta a cobrar" description="Fiado de un cliente." />
        <EmptyState title="Disponible en la edición Empresa" description="Las cuentas a cobrar son parte de la edición Empresa." />
      </main>
    );
  }

  const { id } = await params;
  const detail = await getReceivable(id);
  if (!detail) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <PageHeader title="Cuenta a cobrar" description="Detalle del fiado, con historial de cobros." />
        <EmptyState
          title="En preparación"
          description="El detalle del fiado (saldo, vencimiento e historial de cobros parciales) llega cuando se active la cobranza."
        />
        {volver}
      </main>
    );
  }

  const aging = agingOf(detail.vencimiento, new Date());
  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <PageHeader
        title={detail.contraparte}
        description="Cuenta a cobrar (fiado) — saldo, vencimiento e historial de cobros."
        actions={volver}
      />
      <DebtDetailBody detail={detail} aging={aging} kind="cobrar" action={registerReceivableCollection} />
    </main>
  );
}
