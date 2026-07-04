import {
  getCommissionLiquidation,
  getPayoutHistory,
} from "@/lib/commission-actions";
import { fmtShortDate } from "@/lib/datetime";
import CommissionTable from "./CommissionTable";

export const dynamic = "force-dynamic";

// TODO(RBAC): esta página todavía NO está en el nav del AdminShell. La otra sesión
// (RBAC Fase 2) está tocando ese componente; para no chocar, el link
// (`/admin/comisiones`, visible para quien tenga `reports:read`) lo engancha RBAC al
// mergear. Mientras tanto la página es accesible por URL directa y la guarda de
// capability ya protege los loaders/acciones (getCommissionLiquidation, settleCommission).

function money(n: number): string {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

export default async function ComisionesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const [data, history] = await Promise.all([
    getCommissionLiquidation({ from, to }),
    getPayoutHistory(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">Liquidación de comisiones</h1>
      <p className="text-neutral-500 mb-6">
        Comisiones devengadas sobre turnos completados y cobrados, por profesional y
        período. Marcá un período como pagado para llevar el histórico.
      </p>

      {/* Selector de rango — form GET nativo, igual que la agenda: sin componente
          client, el server re-renderiza con el rango elegido. */}
      <form action="/admin/comisiones" className="flex flex-wrap items-end gap-3 mb-6">
        <label className="flex flex-col text-sm">
          <span className="text-neutral-500 mb-1">Desde</span>
          <input
            type="date"
            name="from"
            defaultValue={data.from}
            className="rounded-md border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="text-neutral-500 mb-1">Hasta</span>
          <input
            type="date"
            name="to"
            defaultValue={data.to}
            className="rounded-md border px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Aplicar
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-neutral-500">Comisión total del período</p>
          <p className="text-2xl font-semibold">{money(data.totalCommission)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-neutral-500">Base (ingresos con comisión)</p>
          <p className="text-2xl font-semibold">{money(data.totalBase)}</p>
        </div>
      </div>

      <CommissionTable data={data} />

      <div className="mt-10">
        <h2 className="text-lg font-medium mb-1">Histórico de liquidaciones</h2>
        <p className="text-xs text-neutral-500 mb-3">
          Períodos ya marcados como pagados (últimos 100).
        </p>
        {history.length === 0 && (
          <p className="text-sm text-neutral-500 rounded-lg border p-4">
            Todavía no registraste ninguna liquidación.
          </p>
        )}
        {history.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b">
                  <th className="p-3 font-normal">Profesional</th>
                  <th className="p-3 font-normal">Período</th>
                  <th className="p-3 font-normal text-right">Turnos</th>
                  <th className="p-3 font-normal text-right">Base</th>
                  <th className="p-3 font-normal text-right">Comisión</th>
                  <th className="p-3 font-normal">Pagado</th>
                  <th className="p-3 font-normal">Nota</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{h.professionalName}</td>
                    <td className="p-3 whitespace-nowrap">
                      {fmtShortDate(new Date(`${h.from}T12:00:00.000Z`))} –{" "}
                      {fmtShortDate(new Date(`${h.to}T12:00:00.000Z`))}
                    </td>
                    <td className="p-3 text-right">{h.appointmentCount}</td>
                    <td className="p-3 text-right">{money(h.baseAmount)}</td>
                    <td className="p-3 text-right font-medium">{money(h.amount)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {new Date(h.paidAt).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="p-3 text-neutral-500">{h.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
