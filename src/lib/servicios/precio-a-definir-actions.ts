"use server";

// «Precio a definir»: el servicio se reserva sin precio (Service.price = 0) y el precio del TURNO se
// fija a mano en el cobro. Esta acción sólo escribe `Appointment.priceAtBooking` de un turno que
// todavía no tiene precio; el cobro en sí sigue siendo el de siempre (cobro-actions.ts), que a partir
// de ahí ve un saldo y valida cada monto contra él.
//
// Plata: dentro de una transacción Serializable del negocio, y la escritura es condicional
// (`updateMany` sólo si el turno sigue sin precio): dos recepciones que fijan el precio a la vez no
// se pisan; la segunda recibe «cambió recién». Reenviar el mismo monto con el precio ya fijado
// tampoco cambia nada (idempotente por condición, no por clave).

import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { importeONaN } from "@/lib/dinero/leer";
import { round2 } from "@/lib/round";
import { revalidatePath } from "next/cache";
import { RechazoDeDominio, rechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { precioADefinir } from "./ficha";
import { volverAReservadoSiFaltaLaSenia } from "@/lib/turnos/sena-obligatoria";

export type ResultadoPrecio = { ok: true; precio: number } | { ok: false; error: string };

const TOPE = 1e9;

export async function fijarPrecioDelTurno(fd: FormData): Promise<ResultadoPrecio> {
  const user = await requireCapability("agenda:collect");
  const appointmentId = typeof fd.get("appointmentId") === "string" ? String(fd.get("appointmentId")).trim() : "";
  const monto = importeONaN(fd.get("monto"));
  if (!appointmentId) return { ok: false, error: "Falta el turno." };
  if (!Number.isFinite(monto) || monto <= 0 || monto >= TOPE) return { ok: false, error: "Cargá el precio del turno: un monto mayor a cero." };
  const precio = round2(monto);
  const tenantId = await getCurrentTenantId();
  try {
    await tenantTransaction(
      async (tx) => {
        const t = await tx.appointment.findFirst({
          where: { id: appointmentId, tenantId },
          select: { status: true, priceAtBooking: true, professionalId: true, service: { select: { price: true } } },
        });
        if (!t) throw new RechazoDeDominio("Ese turno ya no existe. Recargá la agenda.");
        if (user.role === "PROFESSIONAL" && t.professionalId !== user.professionalId) {
          throw new RechazoDeDominio("Ese turno es de otra profesional: sólo podés tocar los tuyos.");
        }
        if (t.status === "CANCELLED" || t.status === "NO_SHOW") throw new RechazoDeDominio("Un turno cancelado o que no vino no se cobra.");
        if (!precioADefinir(t.service.price, t.priceAtBooking)) throw new RechazoDeDominio("Este turno ya tiene precio.");
        const r = await tx.appointment.updateMany({
          where: { id: appointmentId, tenantId, OR: [{ priceAtBooking: null }, { priceAtBooking: { lte: 0 } }] },
          data: { priceAtBooking: precio },
        });
        if (r.count !== 1) throw new RechazoDeDominio("Ese turno cambió recién. Recargá la agenda.");
        // Seña obligatoria: con precio, el servicio puede pedir una seña que no entró; un Confirmado
        // que todavía no empezó vuelve a Reservado (misma tx, auditado). Apagado, nada.
        await volverAReservadoSiFaltaLaSenia(tx, {
          tenantId,
          appointmentId,
          actor: `user:${user.id}`,
          porque: "Se fijó el precio y el turno pide una seña que no entró.",
        });
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    return { ok: false, error: rechazoDeDominio(e, "No se pudo fijar el precio y no cambió nada. Probá de nuevo; si sigue, avisá.", "turnos.precio-a-definir") };
  }
  await auditAdmin({ action: "update", entity: "Appointment", entityId: appointmentId, changes: { priceAtBooking: { from: null, to: precio }, motivo: "precio a definir" } });
  revalidatePath("/admin/turnos");
  return { ok: true, precio };
}
