import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { getPayableDetail } from "@/lib/debts/payable-repo";
import { committedChequeTotal } from "@/lib/debts/cheque";
import { diaDe } from "@/lib/debts/resumen-cuentas";
import { medioDelPago } from "@/lib/cuentas/loader";
import { agingOf } from "@/lib/cuentas/aging";
import type { DebtAccountDetail } from "@/lib/cuentas/types";
import { diaLegible } from "@/lib/libros/fecha-fiscal";
import { round2 } from "@/lib/round";
import { cuentasCorrientesEnabled } from "@/lib/settlement/asiento-libro";
import { PageHeader, EmptyState } from "@/components/ui";
import { DebtDetailBody } from "@/components/cuentas/DebtDetailBody";
import type { ChequeVista } from "@/components/cuentas/ChequesDeLaDeuda";
import { agregarCheque, cambiarEstadoCheque, registerPayablePayment } from "../actions";

export const dynamic = "force-dynamic";

const volver = (
  <Link href="/admin/cuentas-a-pagar" className="inline-flex h-11 items-center text-sm font-medium text-accent hover:underline">
    ← Volver a cuentas a pagar
  </Link>
);

// El detalle de una deuda con un proveedor: saldo, vencimiento, pagos parciales y los cheques
// propios (alta y cambio de estado). La guardia es la de la app (rol, módulo y edición); las
// tres acciones pasan por la misma regla (`requireAppAccion`). Antes la página decía
// "Disponible en la edición Empresa" con el motor de perfiles apagado, o sea siempre.
export default async function CuentaAPagarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("cuentas-a-pagar");
  const tenantId = await getCurrentTenantId();

  const { id } = await params;
  const d = await getPayableDetail(tenantId, id);
  if (!d) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <PageHeader title="Cuenta a pagar" description="Detalle de la deuda con el proveedor, con sus pagos y cheques." />
        <EmptyState
          title="No encontramos esa cuenta"
          description="Puede que el enlace sea viejo o que la deuda se haya anulado. Volvé al listado y elegila de nuevo."
          action={volver}
        />
      </main>
    );
  }

  const detail: DebtAccountDetail = {
    id: d.id,
    contraparte: d.supplierName,
    total: d.amount,
    saldado: d.paid,
    saldo: d.balance,
    vencimiento: d.dueDate,
    referencia: d.concept,
    historial: d.payments.map((p) => ({ id: p.id, fecha: p.at, monto: p.amount, metodo: medioDelPago(p.method, p.note), nota: p.note })),
  };
  const cheques: ChequeVista[] = d.cheques.map((c) => ({
    id: c.id,
    numero: c.chequeNumber,
    banco: c.bank,
    monto: c.amount,
    fecha: diaLegible(diaDe(c.dueDate) ?? ""),
    estado: c.status,
  }));
  // Lo que todavía no cubre ningún cheque sin debitar: hasta ahí puede llegar uno nuevo.
  const libre = d.status === "OPEN" ? Math.max(0, round2(d.balance - committedChequeTotal(d.cheques))) : 0;

  const aging = agingOf(detail.vencimiento, new Date());
  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <PageHeader
        title={detail.contraparte}
        description={detail.referencia ? `Deuda · ${detail.referencia}` : "Deuda con el proveedor: saldo, vencimiento, pagos y cheques."}
        actions={volver}
      />
      <DebtDetailBody
        detail={detail}
        aging={aging}
        kind="pagar"
        action={registerPayablePayment}
        asientaEnLibro={cuentasCorrientesEnabled()}
        cheques={{ lista: cheques, libre, agregar: agregarCheque, cambiarEstado: cambiarEstadoCheque }}
        anulada={d.status !== "OPEN"}
      />
    </main>
  );
}
