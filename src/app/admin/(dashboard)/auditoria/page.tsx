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

import { resumenCierre } from "@/lib/caja/cierre-resumen";
import { CIERRE_DIARIO_ENTITY } from "@/lib/caja/frontera-cierre";
import { ACCION_CAMBIO_DE_PRECIO, ACCION_ETIQUETA_IMPRESA, resumenDeFilaDePrecio } from "@/lib/catalogo/precios-auditoria";
import { fmtMoneyARS } from "@/components/ui/format";
import { ACCION_CUPON_DEL_PEDIDO } from "@/lib/venta-reglas";

const actionLabel: Record<string, string> = {
  create: "Creó",
  create_manual: "Cargó (manual)",
  update: "Editó",
  confirm_payment: "Confirmó pago",
  complete: "Completó",
  cancel: "Canceló",
  no_show: "No se presentó",
  delete: "Eliminó",
  "caja.cierre-diario": "Cerró la caja del",
  "caja.corte-inicial": "Hizo el corte inicial del",
  // La constancia del aviso 1 a 1 (registrarAvisoWhatsApp, order-actions.ts).
  whatsapp: "Avisó por WhatsApp",
  // Catálogo y precios (precios-auditoria.ts): una fila por producto.
  [ACCION_CAMBIO_DE_PRECIO]: "Cambió el precio del",
  [ACCION_ETIQUETA_IMPRESA]: "Imprimió la etiqueta del",
  // La regla del cupón de un pedido, que el alta escribe para poder pesarlo (order-core.ts).
  [ACCION_CUPON_DEL_PEDIDO]: "Guardó el cupón del",
};

const entityLabel: Record<string, string> = {
  Appointment: "turno",
  Service: "servicio",
  Box: "box",
  Product: "producto",
  Professional: "profesional",
  Review: "reseña",
  // El cierre de caja no es sólo un rastro: es el registro del arqueo del día
  // (esperado, contado y diferencia por medio quedan en `changes`). Ver
  // src/lib/caja/frontera-cierre.ts.
  CierreDiario: "día",
  Order: "pedido",
};

// El cierre de caja se cuenta en castellano: esa fila ES el registro del arqueo del día
// (ver src/lib/caja/cierre-resumen.ts), y la dueña la va a leer buscando qué pasó el
// martes. El resto de las entidades sigue con el volcado de siempre — cambiarlo para
// todas es otra tarea.
function DetalleCambios({ entity, action, changes }: { entity: string; action: string; changes: unknown }) {
  if (!changes) return <span className="text-faint">—</span>;
  // Un cambio de precio o una etiqueta impresa: "Vacío: $9.000 → $9.900 /kg".
  const precio = resumenDeFilaDePrecio(action, changes, (n) => fmtMoneyARS(n));
  if (precio) return <span className="text-xs text-body">{precio}</span>;
  const cierre = entity === CIERRE_DIARIO_ENTITY ? resumenCierre(changes) : null;
  if (!cierre) return <code className="text-xs break-all">{JSON.stringify(changes)}</code>;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="text-body">{cierre.titulo}</span>
      {cierre.medios.map((m) => (
        <span key={m}>{m}</span>
      ))}
      {cierre.nota && <span className="text-faint">“{cierre.nota}”</span>}
    </div>
  );
}

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
                  <DetalleCambios entity={e.entity} action={e.action} changes={e.changes} />
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
