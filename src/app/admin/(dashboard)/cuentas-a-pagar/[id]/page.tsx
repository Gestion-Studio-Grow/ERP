import Link from "next/link";
import { requireCapability } from "@/lib/authz";
import { getActiveProfile } from "@/lib/profile-gating";
import { getPayable } from "@/lib/cuentas/loader";
import { agingOf } from "@/lib/cuentas/aging";
import { PageHeader, EmptyState } from "@/components/ui";
import { DebtDetailBody } from "@/components/cuentas/DebtDetailBody";
import { registerPayablePayment } from "../actions";

export const dynamic = "force-dynamic";

const volver = (
  <Link href="/admin/cuentas-a-pagar" className="text-sm font-medium text-accent hover:underline">
    ← Volver a cuentas a pagar
  </Link>
);

export default async function CuentaAPagarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("billing:manage");
  const profile = await getActiveProfile();
  if (profile !== "enterprise") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Cuenta a pagar" description="Saldo con un proveedor." />
        <EmptyState title="Disponible en la edición Empresa" description="Las cuentas a pagar son parte de la edición Empresa." />
      </main>
    );
  }

  const { id } = await params;
  const detail = await getPayable(id);
  if (!detail) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <PageHeader title="Cuenta a pagar" description="Detalle de la deuda con el proveedor, con cheque diferido e historial de pagos." />
        <EmptyState
          title="En preparación"
          description="El detalle (saldo, cheque diferido e historial de pagos parciales) llega cuando se active la cuenta a pagar."
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
        description="Cuenta a pagar — saldo, cheque diferido e historial de pagos."
        actions={volver}
      />
      <DebtDetailBody detail={detail} aging={aging} kind="pagar" action={registerPayablePayment} />
    </main>
  );
}
