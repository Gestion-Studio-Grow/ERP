// Blueprint "Retail / Mostrador" — familia reutilizable (ADR-002 / ADR-003).
//
// UN blueprint retail, en código, del que la carnicería `magra` es la primera
// instancia y verdulería / dietética / kiosco / fiambrería / indumentaria son otras
// — cambiando SÓLO config (el rubro: catálogo + wording + branding + módulos, en
// `rubros.ts`), nunca código. Comparte con todos los rubros: la capability POS/Orden
// del Core, stock (`Product.stock`) y venta por peso/unidad (`Product.saleUnit`).
//
// Se integra con el registro de blueprints del onboarding (../index.ts) exportando
// `RETAIL_BLUEPRINTS` (un Blueprint por rubro, listo para spread en el REGISTRY) y
// `RETAIL_RUBRO_HINTS` (pistas rubro→blueprint para su `resolveBlueprint`).

import type { Blueprint, PrismaTx } from "../types";
import { RETAIL_RUBROS, RETAIL_RUBRO_IDS, getRetailRubro, type RetailRubro } from "./rubros";

// Capabilities del Core que todo rubro retail usa de forma central (gating efectivo
// por rol en capabilities.ts; acá es config para la futura activación por tenant).
// NO incluye agenda: el retail de mostrador no trabaja por turnos.
const RETAIL_CAPABILITIES = ["catalog:manage", "orders:manage", "clients:manage", "reports:read"];

// Seeder del catálogo del rubro: crea Products del Core desde `rubro.catalog`
// (kg → venta por peso; u → por unidad). Idempotente: sólo siembra si el tenant no
// tiene productos (re-provisionar no pisa lo cargado, ADR-019 §2.b).
function seederFor(rubro: RetailRubro) {
  return async (tx: PrismaTx, tenantId: string): Promise<boolean> => {
    const productCount = await tx.product.count({ where: { tenantId } });
    if (productCount > 0) return false;
    for (const c of rubro.catalog) {
      if (c.sale === "kg") {
        await tx.product.create({
          data: { tenantId, name: c.name, unit: "kg", saleUnit: "WEIGHT", pricePerKg: c.pricePerKg, stock: c.stock, lowStockAt: 5, trackStock: true },
        });
      } else {
        await tx.product.create({
          data: { tenantId, name: c.name, unit: "u", saleUnit: "UNIT", price: c.price, stock: c.stock, lowStockAt: 3, trackStock: true },
        });
      }
    }
    return true;
  };
}

// Construye el Blueprint retail de un rubro. `id` = id del rubro, así el rubro es
// alcanzable como `--blueprint <rubro>` (atajo) además de `--blueprint retail --rubro <rubro>`.
export function makeRetailBlueprint(rubroId: string): Blueprint {
  const rubro = getRetailRubro(rubroId);
  if (!rubro) {
    throw new Error(`Rubro retail desconocido: "${rubroId}". Rubros: ${RETAIL_RUBRO_IDS.join(", ")}.`);
  }
  return {
    id: rubro.id,
    label: `Retail · ${rubro.label}`,
    description:
      `Blueprint Retail/Mostrador (rubro ${rubro.label}): POS, stock y venta por peso/unidad, ` +
      `con catálogo, wording y marca del rubro. Config pura sobre el Core, sin fork.`,
    capabilities: RETAIL_CAPABILITIES,
    brandingDefaults: rubro.brandingDefaults,
    seedCatalog: seederFor(rubro),
  };
}

// Un Blueprint por rubro, listo para spread en el REGISTRY del registro central:
//   const REGISTRY = { ...base, ...RETAIL_BLUEPRINTS }
export const RETAIL_BLUEPRINTS: Record<string, Blueprint> = Object.fromEntries(
  RETAIL_RUBRO_IDS.map((id) => [id, makeRetailBlueprint(id)]),
);

// Pistas rubro→blueprint para el `resolveBlueprint(rubro)` del onboarding (keyword
// match sobre el rubro libre del descubrimiento). Listo para concatenar a sus HINTS.
export const RETAIL_RUBRO_HINTS: { id: string; keywords: string[] }[] = [
  { id: "carniceria", keywords: ["carniceria", "carne", "carnes", "achuras", "pollo", "cerdo", "frigorifico", "granja"] },
  { id: "verduleria", keywords: ["verduleria", "verduras", "verdura", "fruteria", "frutas", "fruta"] },
  { id: "dietetica", keywords: ["dietetica", "almacen natural", "frutos secos", "granel", "organico", "natural"] },
  { id: "kiosco", keywords: ["kiosco", "kiosko", "maxikiosco", "golosinas", "autoservicio", "drugstore"] },
  { id: "fiambreria", keywords: ["fiambreria", "fiambres", "queseria", "quesos", "picada"] },
  { id: "indumentaria", keywords: ["indumentaria", "ropa", "boutique", "moda", "textil", "vestimenta"] },
  { id: "padel", keywords: ["padel", "pádel", "paddle", "palas", "paletas", "zapatillas de padel", "tienda de padel"] },
  { id: "velas", keywords: ["velas", "vela", "aromas", "aromatizante", "difusor", "difusores", "fragancia", "soja", "deco", "hogar", "bazar"] },
];

// Wording del rubro para la vidriera, resuelto por el slug del tenant (mientras no
// exista `Tenant.blueprintId`). Cae al wording genérico retail si el rubro no matchea.
import { GENERIC_RETAIL_WORDING, resolveRubroIdBySlug, type RetailWording } from "./rubros";

export function retailWordingForSlug(slug: string | null | undefined): RetailWording {
  const rubroId = resolveRubroIdBySlug(slug);
  const rubro = rubroId ? getRetailRubro(rubroId) : null;
  return rubro?.wording ?? GENERIC_RETAIL_WORDING;
}

export { RETAIL_RUBROS, RETAIL_RUBRO_IDS, getRetailRubro, resolveRubroIdBySlug, GENERIC_RETAIL_WORDING } from "./rubros";
export type { RetailWording, RetailRubro, RetailModuleId, RetailCatalogItem } from "./rubros";
