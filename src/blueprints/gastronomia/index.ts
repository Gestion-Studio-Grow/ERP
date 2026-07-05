// Blueprint "Gastronomía" — familia reutilizable (ADR-002 / ADR-003).
//
// Archetipo gastronómico: carta/menú como `Product` + POS/pedidos del Core (mostrador,
// retiro, delivery). Instancias por rubro (restaurante, cafetería, panadería, rotisería,
// pizzería, heladería) con SÓLO config (`rubros.ts`), cero código por rubro.
//
// Integra con el registro central (../index.ts): `GASTRO_BLUEPRINTS` + `GASTRO_RUBRO_HINTS`.

import type { Blueprint, PrismaTx } from "../types";
import {
  GASTRO_RUBROS,
  GASTRO_RUBRO_IDS,
  getGastroRubro,
  GENERIC_GASTRO_WORDING,
  type GastroRubro,
  type GastroWording,
} from "./rubros";

// Capabilities centrales: carta (catálogo), POS/pedidos, clientes, reportes. Sin agenda.
const GASTRO_CAPABILITIES = ["catalog:manage", "orders:manage", "clients:manage", "reports:read"];

// Seeder: crea la carta como Products del Core (u → por unidad; kg → por peso).
// Idempotente: sólo siembra si el tenant no tiene productos (ADR-019 §2.b).
function seederFor(rubro: GastroRubro) {
  return async (tx: PrismaTx, tenantId: string): Promise<boolean> => {
    const productCount = await tx.product.count({ where: { tenantId } });
    if (productCount > 0) return false;
    for (const item of rubro.menu) {
      if (item.sale === "kg") {
        await tx.product.create({
          data: { tenantId, name: item.name, unit: "kg", saleUnit: "WEIGHT", pricePerKg: item.pricePerKg, stock: 0, lowStockAt: 0 },
        });
      } else {
        await tx.product.create({
          data: { tenantId, name: item.name, unit: "u", saleUnit: "UNIT", price: item.price, stock: 0, lowStockAt: 0 },
        });
      }
    }
    return true;
  };
}

export function makeGastroBlueprint(rubroId: string): Blueprint {
  const rubro = getGastroRubro(rubroId);
  if (!rubro) {
    throw new Error(`Rubro gastronómico desconocido: "${rubroId}". Rubros: ${GASTRO_RUBRO_IDS.join(", ")}.`);
  }
  return {
    id: rubro.id,
    label: `Gastronomía · ${rubro.label}`,
    description:
      `Blueprint Gastronomía (rubro ${rubro.label}): carta como catálogo + POS/pedidos ` +
      `(mostrador, retiro, delivery), con wording y marca del rubro. Config pura sobre el Core, sin fork.`,
    capabilities: GASTRO_CAPABILITIES,
    brandingDefaults: rubro.brandingDefaults,
    seedCatalog: seederFor(rubro),
  };
}

export const GASTRO_BLUEPRINTS: Record<string, Blueprint> = Object.fromEntries(
  GASTRO_RUBRO_IDS.map((id) => [id, makeGastroBlueprint(id)]),
);

export const GASTRO_RUBRO_HINTS: { id: string; keywords: string[] }[] = GASTRO_RUBROS.map((r) => ({
  id: r.id,
  keywords: r.keywords,
}));

export function gastroWordingForRubro(rubroId: string | null | undefined): GastroWording {
  const rubro = rubroId ? getGastroRubro(rubroId) : null;
  return rubro?.wording ?? GENERIC_GASTRO_WORDING;
}

export { GASTRO_RUBROS, GASTRO_RUBRO_IDS, getGastroRubro, GENERIC_GASTRO_WORDING } from "./rubros";
export type { GastroRubro, GastroWording, GastroItem } from "./rubros";
