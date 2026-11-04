// Fantasma Agenda · los puertos del dispatcher de WhatsApp (src/lib/wa-dispatch.ts) contra la agenda
// de UN negocio. El negocio llega explícito (`tenantId`) y va en cada `where` además del candado de
// RLS: el webhook no tiene sesión, así que todo corre dentro de `runInTenantContext(tenantId)`.
//
// Sin seña (no hay `createPaymentLink`: el dispatcher deriva el pago al local) y sin IA.
// El turno queda PENDING, con la nota que lo identifica, para que el local lo confirme.

import "server-only";
import { prisma } from "@/lib/prisma";
import { bookingTransaction } from "@/lib/rls";
import { runInTenantContext } from "@/lib/tenant-context";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";
import { getAvailableSlotsRange } from "@/lib/actions";
import { buscarFichaPorTelefono } from "@/lib/clientes/ficha-por-telefono";
import { businessWallTimeToUtc, wallHourMinuteInBusinessTz } from "@/lib/datetime";
import { normalizePhone } from "@/lib/wa-provider";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import type { WaPorts, WaServiceInfo } from "@/lib/wa-dispatch";

export const NOTA_FANTASMA = "Reservado por WhatsApp (Fantasma Agenda), pendiente de confirmar";

const hhmm = (iso: string): string => {
  const { hour, minute } = wallHourMinuteInBusinessTz(new Date(iso));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

/** Las profesionales activas, con box, que hacen el servicio (mismo filtro que `libresAhora`). */
async function profesionalesDelServicio(tenantId: string, serviceId: string) {
  const servicio = await prisma.service.findFirst({
    where: { id: serviceId, tenantId, active: true, deletedAt: null },
    select: {
      id: true,
      price: true,
      durationMin: true,
      professionals: {
        where: { tenantId, active: true, deletedAt: null, boxId: { not: null } },
        select: { id: true, boxId: true },
        orderBy: { name: "asc" },
      },
    },
  });
  return servicio;
}

export function puertosDelNegocio(tenantId: string, contacto: { contactName?: string } = {}): WaPorts {
  const enNegocio = <T>(fn: () => Promise<T>): Promise<T> => runInTenantContext(tenantId, async () => await fn());

  return {
    listServices: () =>
      enNegocio(async (): Promise<WaServiceInfo[]> => {
        const filas = await prisma.service.findMany({
          where: { tenantId, active: true, deletedAt: null },
          select: { id: true, name: true, price: true, durationMin: true },
          orderBy: { name: "asc" },
        });
        return filas.map((s) => ({ id: s.id, name: s.name, price: Number(s.price), durationMin: s.durationMin }));
      }),

    availableSlots: (serviceId, dateISO) =>
      enNegocio(async () => {
        const servicio = await profesionalesDelServicio(tenantId, serviceId);
        if (!servicio) return [];
        const todos = new Set<string>();
        for (const p of servicio.professionals) {
          const porDia = await getAvailableSlotsRange(p.id, servicio.id, [dateISO]);
          for (const iso of porDia[dateISO] ?? []) todos.add(hhmm(iso));
        }
        return [...todos].sort();
      }),

    createBooking: ({ serviceId, dateISO, time, from }) =>
      enNegocio(async () => {
        const servicio = await profesionalesDelServicio(tenantId, serviceId);
        if (!servicio) throw new RechazoDeDominio("Este servicio ya no está disponible.");
        const startsAt = businessWallTimeToUtc(dateISO, time);
        if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now()) {
          throw new RechazoDeDominio("Ese horario ya pasó.");
        }
        const endsAt = new Date(startsAt.getTime() + servicio.durationMin * 60_000);

        // Sólo las que trabajan en esa franja Y ofrecen esa hora en su grilla (la misma que lista
        // `availableSlots`): una hora inventada ("18:07") se rechaza igual que un horario ocupado.
        // La ventana y la grilla se leen fuera de la transacción, como el alta.
        const candidatas: { id: string; boxId: string }[] = [];
        for (const p of servicio.professionals) {
          const ventana = await getWorkingWindow(p.id, dateISO);
          if (!ventana || startsAt < ventana.dayStart || endsAt > ventana.dayEnd) continue;
          const grilla = (await getAvailableSlotsRange(p.id, servicio.id, [dateISO]))[dateISO] ?? [];
          if (!grilla.some((iso) => hhmm(iso) === time)) continue;
          candidatas.push({ id: p.id, boxId: p.boxId as string });
        }
        if (candidatas.length === 0) throw new RechazoDeDominio("Ese horario ya no está disponible.");

        const telefono = normalizePhone(from);
        return bookingTransaction(
          async (tx) => {
            const ficha = await buscarFichaPorTelefono(tx, tenantId, telefono);
            // El mismo cliente no queda con dos turnos que se pisan (dos "sí" seguidos, otra profesional).
            if (ficha) {
              const pisado = await tx.appointment.findFirst({
                where: {
                  tenantId,
                  clientId: ficha.id,
                  status: { in: ["PENDING", "CONFIRMED"] },
                  startsAt: { lt: endsAt },
                  endsAt: { gt: startsAt },
                },
                select: { id: true },
              });
              if (pisado) throw new RechazoDeDominio("Ya tenés un turno en ese horario.");
            }

            // Primera profesional libre: el re-chequeo va DENTRO de la transacción Serializable.
            let elegida: { id: string; boxId: string } | null = null;
            for (const p of candidatas) {
              try {
                await assertSlotAvailable(tx, { professionalId: p.id, boxId: p.boxId, serviceId, startsAt, endsAt });
                elegida = p;
                break;
              } catch (e) {
                if (e instanceof RechazoDeDominio) continue;
                throw e;
              }
            }
            if (!elegida) throw new RechazoDeDominio("Ese horario ya no está disponible.");

            const clientId =
              ficha?.id ??
              (
                await tx.client.create({
                  data: { tenantId, name: contacto.contactName?.trim() || `WhatsApp +${telefono}`, phone: telefono },
                  select: { id: true },
                })
              ).id;

            const turno = await tx.appointment.create({
              data: {
                tenantId,
                clientId,
                professionalId: elegida.id,
                serviceId,
                boxId: elegida.boxId,
                startsAt,
                endsAt,
                status: "PENDING",
                priceAtBooking: servicio.price,
                notes: NOTA_FANTASMA,
              },
              select: { id: true },
            });
            return { id: turno.id, pending: true };
          },
          { tenantId },
        );
      }),

    businessInfo: () =>
      enNegocio(async () => {
        const s = await prisma.businessSettings.findFirst({
          where: { tenantId },
          select: { hoursLabel: true, addressLine: true, city: true },
        });
        const address = [s?.addressLine, s?.city].filter(Boolean).join(", ");
        return {
          hours: s?.hoursLabel || "Consultá los horarios con el local",
          address: address || "Consultá la dirección con el local",
        };
      }),
  };
}
