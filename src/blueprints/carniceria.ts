// Blueprint "Carnicería / Retail" — el vertical de `magra` (carnicería premium,
// Canning). Config pura sobre el Core (FUNDAMENTOS §2, ADR-002): NO define schema
// propio; siembra `Product` del Core con la extensión de venta al público
// (saleUnit / pricePerKg / price) que ya vive en el schema. La venta se hace por
// la capability POS/Orden del Core (createOrder), no por turnos.
//
// DATOS PROVISIONALES: los cortes, precios/kg y stock de abajo son valores
// razonables de referencia (AR, mediados 2026) para poder mostrar la vidriera y el
// POS en la demo local. NO son la lista real de magra: el negocio los edita en el
// catálogo. Marcados como provisionales acá y en la doc del tenant.

import type { Blueprint, PrismaTx } from "./types";

// Catálogo de cortes de ejemplo. `kg` = venta por peso (precio por kilo); `u` =
// venta por unidad (precio unitario). Stock inicial provisional.
type SeedCut =
  | { name: string; sale: "kg"; pricePerKg: number; stockKg: number }
  | { name: string; sale: "u"; price: number; stockU: number };

const CUTS: SeedCut[] = [
  // Vacunos premium (por kg) — precios provisionales ARS/kg
  { name: "Lomo", sale: "kg", pricePerKg: 15900, stockKg: 18 },
  { name: "Ojo de bife", sale: "kg", pricePerKg: 13800, stockKg: 22 },
  { name: "Bife de chorizo", sale: "kg", pricePerKg: 12500, stockKg: 25 },
  { name: "Entraña", sale: "kg", pricePerKg: 14500, stockKg: 12 },
  { name: "Asado de tira", sale: "kg", pricePerKg: 8900, stockKg: 40 },
  { name: "Vacío", sale: "kg", pricePerKg: 9800, stockKg: 20 },
  { name: "Matambre", sale: "kg", pricePerKg: 9500, stockKg: 15 },
  { name: "Milanesa de nalga", sale: "kg", pricePerKg: 10200, stockKg: 30 },
  { name: "Carne picada especial", sale: "kg", pricePerKg: 7800, stockKg: 35 },
  // Cerdo y aves (por kg)
  { name: "Bondiola de cerdo", sale: "kg", pricePerKg: 8600, stockKg: 16 },
  { name: "Pechuga de pollo", sale: "kg", pricePerKg: 6900, stockKg: 28 },
  { name: "Chorizo parrillero", sale: "kg", pricePerKg: 7200, stockKg: 24 },
  // Por unidad
  { name: "Pollo entero (~2 kg)", sale: "u", price: 9800, stockU: 15 },
  { name: "Maple de huevos (x30)", sale: "u", price: 8500, stockU: 20 },
];

async function seedCatalog(tx: PrismaTx, tenantId: string): Promise<boolean> {
  // Idempotente: sólo siembra si el tenant no tiene productos todavía. Re-provisionar
  // no pisa lo que el negocio ya cargó/editó (ADR-019 §2.b).
  const productCount = await tx.product.count({ where: { tenantId } });
  if (productCount > 0) return false;

  for (const c of CUTS) {
    if (c.sale === "kg") {
      await tx.product.create({
        data: {
          tenantId,
          name: c.name,
          unit: "kg",
          saleUnit: "WEIGHT",
          pricePerKg: c.pricePerKg,
          stock: c.stockKg,
          lowStockAt: 5,
        },
      });
    } else {
      await tx.product.create({
        data: {
          tenantId,
          name: c.name,
          unit: "u",
          saleUnit: "UNIT",
          price: c.price,
          stock: c.stockU,
          lowStockAt: 3,
        },
      });
    }
  }
  return true;
}

export const carniceriaBlueprint: Blueprint = {
  id: "carniceria",
  label: "Carnicería / Retail",
  description:
    "Carnicería / retail de mostrador: catálogo de cortes con venta por kg, POS y toma de pedidos (retiro/envío). Sin turnos.",
  // La carnicería no usa agenda: su núcleo es catálogo + POS/Orden (venta por kg).
  capabilities: ["catalog:manage", "orders:manage", "clients:manage", "reports:read"],
  // Branding por defecto de magra (marca premium oxblood/hueso/latón). PROVISIONAL:
  // dirección, WhatsApp e Instagram son placeholders hasta tener los datos reales.
  brandingDefaults: {
    shortLabel: "magra · Canning",
    addressLine: "Av. Provisional 1234, Canning", // provisional
    city: "Canning, Buenos Aires",
    hoursLabel: "Mar a dom · 9 a 20 h",
    whatsapp: "5491100000000", // provisional
    instagram: "@magra.carniceria", // provisional
    contactNote: "Carnicería premium — cortes seleccionados. Retiro y envío en Canning.",
  },
  seedCatalog,
};
