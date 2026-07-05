import { getAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { fmtDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

// Traduce el `actor` guardado a algo legible. Los registros nuevos guardan
// `user:<id>` (ADR-017 §2.f); los históricos previos al modelo de usuarios dicen
// "admin"; los del sitio público, `cliente:<tel>`.
function formatActor(actor: string, userNames: Map<string, string>): string {
  if (actor.startsWith("user:")) {
    return userNames.get(actor.slice(5)) ?? "Usuario eliminado";
  }
  if (actor === "admin") return "admin (histórico)";
  if (actor.startsWith("cliente:")) return `Cliente ${actor.slice(8)}`;
  if (actor === "cliente") return "Cliente";
  return actor;
}

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
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const userNames = new Map(users.map((u) => [u.id, u.name]));

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold mb-1">Auditoría</h1>
      <p className="text-muted mb-8">
        Registro de las últimas acciones sobre turnos, catálogo y reseñas. Quién, cuándo y qué
        cambió — útil ante cualquier duda o disputa.
      </p>

      <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
        <table className="block sm:table w-full text-left text-sm">
          <thead className="hidden sm:table-header-group">
            <tr className="border-b border-line bg-surface-sunken text-xs uppercase tracking-wide text-muted">
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
                className="block sm:table-row rounded-lg border border-line sm:border-0 sm:border-b sm:border-line sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0"
              >
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5 text-body whitespace-nowrap">
                  {fmtDateTime(e.createdAt)}
                </td>
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5 text-body">
                  <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Quién:</span>
                  {formatActor(e.actor, userNames)}
                </td>
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5">
                  {actionLabel[e.action] ?? e.action}{" "}
                  <span className="text-muted">{entityLabel[e.entity] ?? e.entity}</span>
                </td>
                <td className="block sm:table-cell px-0 sm:px-4 py-0.5 sm:py-2.5 text-muted">
                  {e.changes ? (
                    <code className="text-xs break-all">{JSON.stringify(e.changes)}</code>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr className="block sm:table-row">
                <td colSpan={4} className="block sm:table-cell px-0 sm:px-4 py-4 text-muted">
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
