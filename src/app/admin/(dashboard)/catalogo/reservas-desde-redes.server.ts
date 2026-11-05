import "server-only";

// «Reservas desde redes (30 días)»: turnos de ESTE negocio cuya nota empieza con la marca de
// origen «[via:…]» (la pone la reserva online cuando el link trae utm; ver src/lib/link-reserva.ts).
// Mismo `prisma` con scope de negocio que usa el resto del catálogo, y `tenantId` explícito.

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantBrand } from "@/lib/branding";
import { agruparOrigenes, type OrigenContado } from "./compartir-core";

const DIAS = 30;

export async function reservasDesdeRedes(ahora: Date = new Date()): Promise<OrigenContado[]> {
  const tenantId = await getCurrentTenantId();
  const desde = new Date(ahora.getTime() - DIAS * 24 * 60 * 60 * 1000);
  const filas = await prisma.appointment.findMany({
    where: { tenantId, notes: { startsWith: "[via:" }, createdAt: { gte: desde } },
    select: { notes: true },
  });
  return agruparOrigenes(filas.map((f) => f.notes));
}

/** Nombre del negocio para el título de la vista previa: el mismo que usan la tarjeta OG y el <head> de /reserva. */
export async function nombreDelNegocio(): Promise<string> {
  return (await getTenantBrand()).name;
}
