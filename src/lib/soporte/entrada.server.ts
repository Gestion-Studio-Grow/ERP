// ============================================================================
// CONSOLA DE SOPORTE GSG — un mensaje de un canal abre un ticket (GSG-MANT-001, T-A).
// ============================================================================
//
// WhatsApp, mail o el botón «Pedir ayuda» del sistema → ticket del negocio `tenantId`. Las reglas
// (disparador, origen, secretos tapados) son de canales-core.ts; acá sólo la base: la transacción
// PARADA en el negocio (enElNegocio, RLS) y el alta idempotente por origen (crearTicketEnTx). El
// mismo mensaje dos veces —o dos veces en paralelo— deja UN ticket. Sin "use server": lo llama el
// receptor de cada canal, nunca un formulario.

import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { enElNegocio } from "@/lib/operator-db";
import { crearTicketEnTx, esTablaAusente } from "./alta.server";
import { ticketDesdeMensaje, type MensajeEntrante } from "./canales-core";
import { negocioEnVivo } from "./decisiones-core";

export type ResultadoEntrada = { numero: number; nuevo: boolean } | { rechazado: true; motivo: string } | { sinTabla: true };

/**
 * Crea (o reencuentra) el ticket del mensaje. Si se taparon secretos, el ticket nuevo lleva un
 * evento «tapado_automatico» con la CANTIDAD de tramos tapados (nunca el texto). Es de MEJOR
 * ESFUERZO: dice que se tapó algo, NO que no quede ningún secreto (DISENO-MANT-001 §7.7). Sin la tabla (migración sin
 * aplicar, Gate 2) devuelve {sinTabla}; cualquier otro error se relanza.
 */
export async function crearTicketDesdeCanal(
  db: PrismaClient,
  tenantId: string,
  mensaje: MensajeEntrante,
  ahora: Date = new Date(),
): Promise<ResultadoEntrada> {
  if (typeof tenantId !== "string" || !tenantId.trim()) return { rechazado: true, motivo: "Falta el negocio." };
  // D2: el reloj de un P1 corre a toda hora sólo si el negocio está en vivo. `Tenant` no tiene RLS.
  const negocio = await db.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
  if (!negocio) return { rechazado: true, motivo: "Ese negocio no existe." };
  const r = ticketDesdeMensaje(mensaje, ahora, { enVivo: negocioEnVivo(negocio.status) });
  if (!r.ok) return { rechazado: true, motivo: r.motivo };
  const { datos, tapados } = r;
  try {
    const hecho = await enElNegocio(
      tenantId,
      async (tx) => {
        const alta = await crearTicketEnTx(tx, tenantId, datos);
        if (!alta) return null;
        if (alta.nuevo && tapados > 0 && datos.origenId) {
          const t = await tx.supportTicket.findUniqueOrThrow({
            where: { tenantId_origenId: { tenantId, origenId: datos.origenId } },
            select: { id: true },
          });
          await tx.supportTicketEvento.create({
            data: { tenantId, ticketId: t.id, tipo: "tapado_automatico", actor: datos.creadoPor, datos: { cantidad: tapados, canal: datos.canal } },
            select: { id: true },
          });
        }
        return alta;
      },
      db,
    );
    return hecho ?? { sinTabla: true };
  } catch (e) {
    if (esTablaAusente(e)) return { sinTabla: true };
    throw e;
  }
}
