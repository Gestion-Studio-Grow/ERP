import { getAuditLog } from "@/lib/audit";
import { fmtDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const actionLabel: Record<string, string> = {
  create: "Creó",
  create_manual: "Cargó (manual)",
  update: "Editó",
  confirm_payment: "Confirmó pago",
  complete: "Completó",
  cancel: "Canceló",
  no_show: "No se presentó",
  delete: "Eliminó",
};

const entityLabel: Record<string, string> = {
  Appointment: "turno",
  Service: "servicio",
  Box: "box",
  Product: "producto",
  Professional: "profesional",
  Review: "reseña",
};

export default async function AuditoriaPage() {
  const entries = await getAuditLog();

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">Auditoría</h1>
      <p className="text-neutral-500 mb-8">
        Registro de las últimas acciones sobre turnos, catálogo y reseñas. Quién, cuándo y qué
        cambió — útil ante cualquier duda o disputa.
      </p>

      <div className="sm:overflow-x-auto sm:rounded-lg sm:border">
        <table className="block sm:table w-full text-left text-sm">
          <thead className="hidden sm:table-header-group">
            <tr className="border-b bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2 font-medium">Cuándo</th>
              <th className="px-4 py-2 font-medium">Quién</th>
              <th className="px-4 py-2 font-medium">Acción</th>
              <th className="px-4 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {entries.map((e) => (
              <tr
                key={e.id}
                className="block sm:table-row rounded-lg border sm:border-0 sm:border-b sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0"
              >
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5 text-neutral-600 whitespace-nowrap">
                  {fmtDateTime(e.createdAt)}
                </td>
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5 text-neutral-600">
                  <span className="sm:hidden text-xs uppercase tracking-wide text-neutral-400 mr-1.5">Quién:</span>
                  {e.actor}
                </td>
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5">
                  {actionLabel[e.action] ?? e.action}{" "}
                  <span className="text-neutral-500">{entityLabel[e.entity] ?? e.entity}</span>
                </td>
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5 text-neutral-500">
                  {e.changes ? (
                    <code className="text-xs break-all">{JSON.stringify(e.changes)}</code>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr className="block sm:table-row">
                <td colSpan={4} className="block sm:table-cell px-0 sm:px-4 py-4 text-neutral-500">
                  Todavía no hay actividad registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
