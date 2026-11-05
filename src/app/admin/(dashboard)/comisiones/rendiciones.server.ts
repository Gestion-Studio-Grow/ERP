import "server-only";

// Lo que muestra la pestaña «Rendiciones» (NAIL-ARTIST.md §5): una fila por profesional que rinde, con
// lo calculado al vuelo si está pendiente y lo CONGELADO si ya se registró. Sólo lectura (`reports:read`);
// se llama únicamente con el interruptor `nail-artist` prendido.

import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { fmtShortDate } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { calcularRendicion, textoComprobanteRendicion, tieneRendicion, type PeriodoMensual } from "@/lib/reports/rendiciones";
import {
  leerConfigDeProfesionales,
  leerRendicionesDelPeriodo,
  leerTurnosRendibles,
  type ProfesionalConRendicion,
} from "@/lib/reports/rendiciones-lectura";

export type FilaDeRendicion = {
  professionalId: string;
  nombre: string;
  collectedTotal: number;
  rentPercent: number;
  percentAmount: number;
  rentAmount: number;
  amount: number;
  appointmentCount: number;
  /** `null` = pendiente. */
  recibida: { el: string; metodo: string | null; comprobante: string | null } | null;
};

export async function leerPestaniaRendiciones(periodo: PeriodoMensual): Promise<{ filas: FilaDeRendicion[]; config: ProfesionalConRendicion[] }> {
  await requireCapability("reports:read");
  const tenantId = await getCurrentTenantId();
  return tenantTransaction(
    async (tx) => {
      const [config, registradas, negocio] = await Promise.all([
        leerConfigDeProfesionales(tx, tenantId),
        leerRendicionesDelPeriodo(tx, tenantId, periodo),
        tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      ]);
      const porProf = new Map(registradas.map((r) => [r.professionalId, r]));
      const nombreNegocio = negocio?.name ?? "el salón";
      const filas: FilaDeRendicion[] = [];
      for (const p of config) {
        const hecha = porProf.get(p.id);
        if (!tieneRendicion(p) && !hecha) continue;
        if (hecha) {
          const el = fmtShortDate(hecha.createdAt);
          // El % CONGELADO en la rendición; la ficha sólo si la fila es anterior a esa columna.
          const rentPercent = hecha.rentPercent ?? p.rentPercent ?? 0;
          const texto = textoComprobanteRendicion({
            mes: periodo.mes,
            negocio: nombreNegocio,
            collectedTotal: hecha.collectedTotal,
            appointmentCount: hecha.appointmentCount,
            // Si el congelado no tiene parte por %, no se nombra.
            rentPercent: hecha.percentAmount > 0 ? rentPercent : 0,
            percentAmount: hecha.percentAmount,
            rentAmount: hecha.rentAmount,
            amount: hecha.amount,
            recibidoEl: el,
            metodo: hecha.metodo ?? "EFECTIVO",
          });
          filas.push({
            professionalId: p.id,
            nombre: p.name,
            collectedTotal: hecha.collectedTotal,
            rentPercent,
            percentAmount: hecha.percentAmount,
            rentAmount: hecha.rentAmount,
            amount: hecha.amount,
            appointmentCount: hecha.appointmentCount,
            recibida: { el, metodo: hecha.metodo, comprobante: waLinkClienta(p.phone, texto) }, // sin celular válido → null: la pantalla pide cargarlo
          });
          continue;
        }
        const calc = calcularRendicion(await leerTurnosRendibles(tx, tenantId, p.id, periodo), p);
        filas.push({ professionalId: p.id, nombre: p.name, ...calc, recibida: null });
      }
      return { filas, config };
    },
    { tenantId },
  );
}
