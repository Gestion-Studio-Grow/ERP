// Blueprint "Servicios & Oficios" — familia reutilizable (ADR-002 / ADR-003).
//
// Archetipo para oficios a domicilio (plomería, electricidad, cerrajería, refrigeración,
// fletes): catálogo de trabajos + agenda de visitas, sin mostrador ni stock. Instancias
// por rubro con SÓLO config (`rubros.ts`), cero código por rubro.
//
// Integra con el registro central (../index.ts): `OFICIOS_BLUEPRINTS` + `OFICIOS_RUBRO_HINTS`.

import type { Blueprint, PrismaTx } from "../types";
import {
  OFICIOS_RUBROS,
  OFICIOS_RUBRO_IDS,
  getOficiosRubro,
  GENERIC_OFICIOS_WORDING,
  type OficiosRubro,
  type OficiosWording,
} from "./rubros";

// Capabilities centrales: catálogo de trabajos, agenda de visitas, clientes, reportes.
const OFICIOS_CAPABILITIES = ["catalog:manage", "agenda:manage", "clients:manage", "reports:read"];

// Los oficios suelen atender por franjas más amplias; horario de visitas por defecto.
const MONDAY_TO_SATURDAY = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "08:00",
  endTime: "18:00",
}));

// Seeder: categorías + servicios (trabajos) + un profesional (el que ejecuta) con
// horarios de visita, conectado a los trabajos. Sin box (trabajan a domicilio).
// Idempotente (ADR-019 §2.b).
function seederFor(rubro: OficiosRubro) {
  return async (tx: PrismaTx, tenantId: string): Promise<boolean> => {
    const serviceCount = await tx.service.count({ where: { tenantId } });
    if (serviceCount > 0) return false;

    const catId = new Map<string, string>();
    for (let i = 0; i < rubro.categories.length; i++) {
      const c = await tx.serviceCategory.create({ data: { tenantId, name: rubro.categories[i], order: i } });
      catId.set(rubro.categories[i], c.id);
    }

    const serviceIds: string[] = [];
    for (const s of rubro.services) {
      const svc = await tx.service.create({
        data: {
          tenantId,
          categoryId: catId.get(s.cat) ?? null,
          name: s.name,
          durationMin: s.durationMin,
          price: s.price,
          description: rubro.wording.priceNote,
        },
      });
      serviceIds.push(svc.id);
    }

    await tx.professional.create({
      data: {
        tenantId,
        name: rubro.exampleProfessional,
        services: { connect: serviceIds.map((id) => ({ id })) },
        workingHours: { create: MONDAY_TO_SATURDAY.map((w) => ({ tenantId, ...w })) },
      },
    });
    return true;
  };
}

export function makeOficiosBlueprint(rubroId: string): Blueprint {
  const rubro = getOficiosRubro(rubroId);
  if (!rubro) {
    throw new Error(`Rubro de oficios desconocido: "${rubroId}". Rubros: ${OFICIOS_RUBRO_IDS.join(", ")}.`);
  }
  return {
    id: rubro.id,
    label: `Oficios · ${rubro.label}`,
    description:
      `Blueprint Servicios&Oficios (rubro ${rubro.label}): catálogo de trabajos + agenda de ` +
      `visitas, con wording y marca del rubro. Config pura sobre el Core, sin fork.`,
    capabilities: OFICIOS_CAPABILITIES,
    brandingDefaults: rubro.brandingDefaults,
    seedCatalog: seederFor(rubro),
  };
}

export const OFICIOS_BLUEPRINTS: Record<string, Blueprint> = Object.fromEntries(
  OFICIOS_RUBRO_IDS.map((id) => [id, makeOficiosBlueprint(id)]),
);

export const OFICIOS_RUBRO_HINTS: { id: string; keywords: string[] }[] = OFICIOS_RUBROS.map((r) => ({
  id: r.id,
  keywords: r.keywords,
}));

export function oficiosWordingForRubro(rubroId: string | null | undefined): OficiosWording {
  const rubro = rubroId ? getOficiosRubro(rubroId) : null;
  return rubro?.wording ?? GENERIC_OFICIOS_WORDING;
}

export { OFICIOS_RUBROS, OFICIOS_RUBRO_IDS, getOficiosRubro, GENERIC_OFICIOS_WORDING } from "./rubros";
export type { OficiosRubro, OficiosWording, OficiosService } from "./rubros";
