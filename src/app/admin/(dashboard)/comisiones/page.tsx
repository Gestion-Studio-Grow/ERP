// COMISIONES — lo que le toca a cada profesional, liquidarlo y el historial.
//
// Era una sección al final de Reportes; ahora es una app propia en Finanzas, con su número en
// el Inicio ("$412.000 a liquidar a 4 profesionales"). La base de cálculo NO cambia: es la de
// la liquidación de siempre (reports/comisiones.ts). Si la comisión va sobre el bruto o sobre
// el neto es una decisión abierta del dueño y esta pantalla no la toma.
//
// CH sigue liquidando desde Reportes, que se ve igual que antes: las dos pantallas postean a
// la misma liquidación, y ésta vuelve a la pantalla desde la que se hizo.

import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { getCommissionsOverview } from "@/lib/commission-actions";
import { totalALiquidar } from "@/lib/reports/comisiones";
import { PageHeader, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import ComisionesPendientes from "./ComisionesPendientes";

export const dynamic = "force-dynamic";

// Lo que devuelve la liquidación (redirige con ?status=...). Mismo código que Reportes.
const ESTADOS: Record<string, { texto: string; ok: boolean }> = {
  ok_settled: { texto: "Comisión liquidada. Quedó registrada en el historial y el egreso en el libro de caja.", ok: true },
  error_nada: { texto: "Ese profesional no tiene comisiones pendientes de liquidar.", ok: false },
  error_prof: { texto: "No se pudo identificar al profesional. Recargá la pantalla y volvé a intentar.", ok: false },
};

export default async function ComisionesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireApp("comisiones");
  const { status } = await searchParams;
  const overview = await getCommissionsOverview();
  const total = totalALiquidar(overview.pending);
  const canSettle = roleHasCapability(user.role, "commissions:manage");
  const banner = status ? ESTADOS[status] : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Comisiones"
        description="Lo que le toca a cada profesional por los turnos completados y cobrados. Al liquidar, el monto queda congelado y el pago sale del libro de caja."
      />

      {banner && (
        <p
          role="status"
          className={`mb-6 rounded-md px-3 py-2 text-sm ${banner.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
        >
          {banner.texto}
        </p>
      )}

      <div className="mb-6 rounded-lg border border-line p-4">
        <p className="text-sm text-muted">A liquidar</p>
        <p className="text-2xl font-semibold tabular-nums text-strong">{fmtMoneyARS(total.monto, 0)}</p>
        <p className="mt-1 text-xs text-muted">
          {total.profesionales === 0
            ? "Nadie tiene comisiones pendientes."
            : `A ${fmtNumberAR(total.profesionales)} ${total.profesionales === 1 ? "profesional" : "profesionales"}. Un turno con saldo sin cobrar espera: se liquida cuando está saldado.`}
        </p>
      </div>

      <ComisionesPendientes overview={overview} canSettle={canSettle} volver="/admin/comisiones" />
    </main>
  );
}
