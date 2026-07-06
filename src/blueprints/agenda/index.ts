// Blueprint "Agenda & Servicios" — familia reutilizable (ADR-002 / ADR-003).
//
// UN archetipo de agenda por turnos, del que estética / peluquería / veterinaria /
// consultorio son instancias — cambiando SÓLO config (`rubros.ts`: catálogo + wording
// + branding + módulos), nunca código. Comparte con todos los rubros: `Service`,
// `Professional`, `WorkingHours`, `ServiceCategory`, `Box` y la agenda del Core.
//
// Se integra con el registro central (../index.ts) exportando `AGENDA_BLUEPRINTS`
// (un Blueprint por rubro) y `AGENDA_RUBRO_HINTS` (pistas rubro→blueprint).

import type { Blueprint, PrismaTx } from "../types";
import {
  AGENDA_RUBROS,
  AGENDA_RUBRO_IDS,
  getAgendaRubro,
  GENERIC_AGENDA_WORDING,
  type AgendaRubro,
  type AgendaWording,
} from "./rubros";

// Capabilities del Core que todo rubro de agenda usa de forma central (gating efectivo
// por rol en capabilities.ts; acá es config para la activación por tenant).
const AGENDA_CAPABILITIES = ["agenda:manage", "catalog:manage", "clients:manage", "reports:read"];

// Horarios de atención por defecto Lun–Sáb 9–19 (como el seed histórico), colgados del
// profesional de ejemplo.
const MONDAY_TO_SATURDAY = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "19:00",
}));

// Seeder del catálogo del rubro: categorías + servicios + un box + un profesional de
// ejemplo con horarios, conectado a los servicios. Idempotente: sólo siembra si el
// tenant no tiene servicios (re-provisionar no pisa lo cargado, ADR-019 §2.b).
function seederFor(rubro: AgendaRubro) {
  return async (tx: PrismaTx, tenantId: string): Promise<boolean> => {
    const serviceCount = await tx.service.count({ where: { tenantId } });
    if (serviceCount > 0) return false;

    // Categorías por nombre → id.
    const catId = new Map<string, string>();
    for (let i = 0; i < rubro.categories.length; i++) {
      const c = await tx.serviceCategory.create({
        data: { tenantId, name: rubro.categories[i], order: i },
      });
      catId.set(rubro.categories[i], c.id);
    }

    // Servicios.
    const serviceIds: string[] = [];
    for (const s of rubro.services) {
      const svc = await tx.service.create({
        data: {
          tenantId,
          categoryId: catId.get(s.cat) ?? null,
          name: s.name,
          durationMin: s.durationMin,
          price: s.price,
        },
      });
      serviceIds.push(svc.id);
    }

    // Box + profesional de ejemplo con horarios, conectado a los servicios.
    const box = await tx.box.create({ data: { tenantId, name: "Box de ejemplo (editable)" } });
    await tx.professional.create({
      data: {
        tenantId,
        name: rubro.exampleProfessional,
        boxId: box.id,
        services: { connect: serviceIds.map((id) => ({ id })) },
        workingHours: { create: MONDAY_TO_SATURDAY.map((w) => ({ tenantId, ...w })) },
      },
    });
    return true;
  };
}

export function makeAgendaBlueprint(rubroId: string): Blueprint {
  const rubro = getAgendaRubro(rubroId);
  if (!rubro) {
    throw new Error(`Rubro de agenda desconocido: "${rubroId}". Rubros: ${AGENDA_RUBRO_IDS.join(", ")}.`);
  }
  return {
    id: rubro.id,
    label: `Agenda · ${rubro.label}`,
    description:
      `Blueprint Agenda&Servicios (rubro ${rubro.label}): turnos por profesional, boxes y ` +
      `catálogo de servicios, con wording y marca del rubro. Config pura sobre el Core, sin fork.`,
    capabilities: AGENDA_CAPABILITIES,
    brandingDefaults: rubro.brandingDefaults,
    seedCatalog: seederFor(rubro),
  };
}

// Un Blueprint por rubro, listo para spread en el REGISTRY central.
export const AGENDA_BLUEPRINTS: Record<string, Blueprint> = Object.fromEntries(
  AGENDA_RUBRO_IDS.map((id) => [id, makeAgendaBlueprint(id)]),
);

// Pistas rubro→blueprint para el selector del onboarding.
export const AGENDA_RUBRO_HINTS: { id: string; keywords: string[] }[] = AGENDA_RUBROS.map((r) => ({
  id: r.id,
  keywords: r.keywords,
}));

// Wording del rubro para la vidriera (resuelto por el rubro; cae al genérico de agenda).
export function agendaWordingForRubro(rubroId: string | null | undefined): AgendaWording {
  const rubro = rubroId ? getAgendaRubro(rubroId) : null;
  return rubro?.wording ?? GENERIC_AGENDA_WORDING;
}

export {
  AGENDA_RUBROS,
  AGENDA_RUBRO_IDS,
  getAgendaRubro,
  GENERIC_AGENDA_WORDING,
  resolveAgendaRubroIdBySlug,
  agendaBookingCopyFor,
  agendaBookingCopyForSlug,
} from "./rubros";
export type { AgendaRubro, AgendaWording, AgendaService, AgendaBookingCopy } from "./rubros";
