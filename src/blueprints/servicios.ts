// Blueprint "Servicios" (spa / estética / turnos) — el vertical original del ERP
// (ADR-010, Fase 1). Catálogo mínimo editable neutro: un box, una categoría, dos
// servicios de ejemplo y un profesional con horario Lun–Sáb 9–19. Extraído tal
// cual del seed inline que tenía `provision-tenant.ts` (comportamiento idéntico).

import type { Blueprint, PrismaTx } from "./types";

async function seedCatalog(tx: PrismaTx, tenantId: string): Promise<boolean> {
  // Idempotente: sólo siembra si el tenant no tiene ningún servicio todavía →
  // re-provisionar jamás pisa lo que el negocio ya cargó (ADR-019 §2.b).
  const serviceCount = await tx.service.count({ where: { tenantId } });
  if (serviceCount > 0) return false;

  const box = await tx.box.create({
    data: { tenantId, name: "Box de ejemplo (editable)" },
  });
  const category = await tx.serviceCategory.create({
    data: { tenantId, name: "General", order: 0 },
  });
  const serviceA = await tx.service.create({
    data: {
      tenantId,
      categoryId: category.id,
      name: "Servicio de ejemplo A (editable)",
      durationMin: 60,
      price: 0,
    },
  });
  const serviceB = await tx.service.create({
    data: {
      tenantId,
      categoryId: category.id,
      name: "Servicio de ejemplo B (editable)",
      durationMin: 30,
      price: 0,
    },
  });
  const mondayToSaturday = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    tenantId,
    dayOfWeek,
    startTime: "09:00",
    endTime: "19:00",
  }));
  await tx.professional.create({
    data: {
      tenantId,
      name: "Profesional de ejemplo (editable)",
      boxId: box.id,
      services: { connect: [{ id: serviceA.id }, { id: serviceB.id }] },
      workingHours: { create: mondayToSaturday },
    },
  });
  return true;
}

export const serviciosBlueprint: Blueprint = {
  id: "servicios",
  label: "Servicios / Turnos",
  description:
    "Estética, spa, peluquería: agenda de turnos por profesional, boxes y catálogo de servicios.",
  capabilities: ["agenda:manage", "clients:manage", "catalog:manage", "reports:read"],
  seedCatalog,
};
