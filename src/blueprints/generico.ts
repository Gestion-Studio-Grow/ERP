// Blueprint "Genérico / Comodín" — el vertical universal para cualquier negocio cuyo
// rubro todavía NO está modelado (ADR-002 / ADR-019 §2.b). Es la materialización del
// guardrail comercial: "si tu negocio no está acá, lo solucionamos" = se lo acomoda
// sobre lo que YA existe (config + este blueprint), NUNCA con un desarrollo a medida
// para un solo cliente. Config pura sobre el Core: cero schema propio.
//
// Da un arranque flexible y usable desde el día uno, sin asumir un flujo puntual:
//   - Catálogo de servicios de ejemplo (categoría "General") → catálogo/facturación.
//   - Productos de ejemplo → caja / venta de mostrador (POS/Orden del Core).
//   - Clientes, cobros (Payment) y facturación (Core + plugin ARCA) ya vienen del Core.
//   - Branding neutro y editable (BusinessSettings).
// No siembra profesionales/box/horarios: un negocio genérico puede o no trabajar por
// turnos. Si trabaja con agenda, agrega sus profesionales desde el panel (la capability
// está disponible); si no, usa catálogo + caja y listo. Nada de esto es una pantalla
// vacía: Catálogo, Clientes y Caja/Pedidos abren con contenido de ejemplo editable.

import type { Blueprint, PrismaTx } from "./types";

// Nota de plantilla: todo lo sembrado es de EJEMPLO y editable/borrable. Precios en 0
// a propósito ("poné tu precio"), como el blueprint Servicios.
const EJEMPLO = "(ejemplo — editable)";

async function seedCatalog(tx: PrismaTx, tenantId: string): Promise<boolean> {
  // Idempotente: sólo siembra si el tenant no tiene NI servicios NI productos todavía.
  // Re-provisionar jamás pisa lo que el negocio ya cargó (ADR-019 §2.b).
  const [serviceCount, productCount] = await Promise.all([
    tx.service.count({ where: { tenantId } }),
    tx.product.count({ where: { tenantId } }),
  ]);
  if (serviceCount > 0 || productCount > 0) return false;

  // Catálogo de servicios flexible (sirve para facturar y para listar lo que ofrece
  // el negocio, tenga o no agenda).
  const category = await tx.serviceCategory.create({
    data: { tenantId, name: "General", order: 0 },
  });
  await tx.service.create({
    data: { tenantId, categoryId: category.id, name: `Servicio de ejemplo A ${EJEMPLO}`, durationMin: 30, price: 0 },
  });
  await tx.service.create({
    data: { tenantId, categoryId: category.id, name: `Servicio de ejemplo B ${EJEMPLO}`, durationMin: 60, price: 0 },
  });

  // Productos para la caja / venta de mostrador (Capability POS/Orden del Core).
  await tx.product.create({
    data: { tenantId, name: `Producto de ejemplo 1 ${EJEMPLO}`, unit: "u", saleUnit: "UNIT", price: 0, stock: 0, lowStockAt: 5 },
  });
  await tx.product.create({
    data: { tenantId, name: `Producto de ejemplo 2 ${EJEMPLO}`, unit: "u", saleUnit: "UNIT", price: 0, stock: 0, lowStockAt: 5 },
  });

  return true;
}

export const genericoBlueprint: Blueprint = {
  id: "generico",
  label: "Genérico / Comodín",
  description:
    "Base universal para cualquier rubro no modelado: catálogo flexible (servicios + productos), clientes, caja y facturación. Se personaliza con branding y módulos, sin desarrollo a medida.",
  // Comodín = superset sensato: todo disponible para que ningún negocio quede sin la
  // capacidad que necesita. El gating efectivo sigue siendo por rol (capabilities.ts);
  // este arreglo es documental/config del vertical (ADR-002).
  capabilities: [
    "catalog:manage", // catálogo de servicios/productos flexible
    "clients:manage", // ficha de clientes
    "orders:manage", // caja / venta de mostrador (POS)
    "agenda:manage", // disponible si el negocio trabaja por turnos (no se pre-siembra)
    "reports:read", // reportes de caja/ingresos
  ],
  // Branding neutro y editable — el descubrimiento (ONBOARDING-TENANT §3.2) lo pisa con
  // los datos reales del cliente para que se sienta hecho para su negocio.
  brandingDefaults: {
    shortLabel: "Tu negocio",
    hoursLabel: "Lun a vie · 9 a 18 h",
    contactNote: "Configurá acá los datos de tu negocio (nombre, contacto, horarios).",
  },
  seedCatalog,
};
