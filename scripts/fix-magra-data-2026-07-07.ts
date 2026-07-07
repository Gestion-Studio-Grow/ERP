// Fix puntual de dato de PRODUCCIÓN para el tenant `magra` (M-2 branding + M-3
// catálogo), con OK del dueño (Gate 2), 2026-07-07.
//
// GUARDARRAÍLES DUROS (prod-data Neon): NUNCA seed, NUNCA deleteMany. Solo UPDATE/
// CREATE puntual, SIEMPRE scoped por `tenantId` de magra (un único tenant, resuelto
// por slug). Nada de otro tenant se toca. Reversible: los productos sin equivalente
// real confirmado se DESACTIVAN (`active:false`), nunca se borran.
//
// DRY-RUN por default (imprime diff actual→propuesto, no escribe nada). `--apply`
// ejecuta. Correr:
//   npx tsx scripts/fix-magra-data-2026-07-07.ts          (dry-run)
//   npx tsx scripts/fix-magra-data-2026-07-07.ts --apply  (aplica)
//
// FUENTES (todo dato es RELEVADO, nada inventado):
//   - M-2: magrameatmarket.com.ar (home + footer, relevado con navegador 2026-07-07)
//     y valor de dirección/IG tal como los especificó el dueño en el pedido de fix.
//   - M-3: el propio "LISTA DE PRECIOS" de la home (link a Bistrosoft, catálogo real
//     y vivo de magra) — categorías Carne Bovina (EDR = Estancia Don Ramón), Carne De
//     Cerdo (Lamberti), Pollo Orgánico (Coeco). NO se importan Pastas/Pescado/Quesos/
//     Conservas del mismo menú: son un catálogo de importados de alcance mucho mayor,
//     sin mapeo 1:1 claro con las "4 categorías gourmet" curadas de la vidriera —
//     queda pendiente que el dueño indique qué SKUs de ahí priorizar.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "magra";

// --- M-2: BusinessSettings ---------------------------------------------------
const BRANDING_FIX: Record<string, string> = {
  addressLine: "José Champagnat 4351, Canning",
  instagram: "@tiendamagra",
  hoursLabel: "Lunes a sábados de 10 a 20 h · Domingos de 9 a 13 h",
};

// --- M-3: catálogo real "envasados al vacío" (Bistrosoft, relevado 2026-07-07) ---
type SaleUnit = "UNIT" | "WEIGHT";
interface RealItem {
  name: string;
  unit: string;
  saleUnit: SaleUnit;
  price?: number;
  pricePerKg?: number;
  /** Nombre EXACTO de un Product genérico ya sembrado que este ítem reemplaza (in-place). */
  replaces?: string;
}

const REAL_CATALOG: RealItem[] = [
  // Carne Bovina — Estancia Don Ramón (EDR), distribuidor oficial (ya en el hero/replica)
  { name: "Asado Banderita (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 37500 },
  { name: "Asado del Medio (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 37500 },
  { name: "Bife Argentino (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 18500 },
  { name: "Bife de Chorizo (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 32800, replaces: "Bife de chorizo" },
  { name: "Carne Picada (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 18500, replaces: "Carne picada especial" },
  { name: "Churrasquito de Cuadril (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 24500 },
  { name: "Churrasquito Escondido (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 24150 },
  { name: "Colita de Cuadril (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 32950 },
  { name: "Entraña (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 42950, replaces: "Entraña" },
  { name: "Hamburguesas Gourmet Premium (Breaders, x4)", unit: "pack x4", saleUnit: "UNIT", price: 9900 },
  { name: "Lomo sin Cordón (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 41950, replaces: "Lomo" },
  { name: "Matambre (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 25000, replaces: "Matambre" },
  { name: "Medio Lomo (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 41950 },
  { name: "Picanha (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 27900 },
  { name: "Rack de Ojo x1 (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 33900, replaces: "Ojo de bife" },
  { name: "Rondelle (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 38500 },
  { name: "T-Bone (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 32500 },
  { name: "Tapa de Nalga (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 19300, replaces: "Milanesa de nalga" },
  { name: "Tomahawk (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 31850 },
  { name: "Vacío Fino (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 33500 },
  { name: "Vacío Pulpeta (Estancia Don Ramón)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 32500 },
  // Carne De Cerdo — Lamberti
  { name: "Ribs de Cerdo Congelado (Lamberti)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 18000 },
  { name: "Bondiola (Lamberti)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 15000, replaces: "Bondiola de cerdo" },
  { name: "Churrasquito de Cerdo (Lamberti)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 18000 },
  { name: "Lomito Ahumado (Lamberti)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 20000 },
  { name: "Matambrito Arrollado (Lamberti)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 20000 },
  { name: "Matambrito (Lamberti)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 27400 },
  { name: "Ribs de Cerdo (Lamberti)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 18000 },
  { name: "Solomillo (Lamberti)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 18400 },
  // Pollo Orgánico — Coeco
  { name: "Nuggets de Pollo Rebozados (540g)", unit: "pack 540g", saleUnit: "UNIT", price: 12900 },
  { name: "Pata y Muslo Deshuesada (Coeco)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 12500 },
  { name: "Suprema Deshuesada (Coeco)", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 18700, replaces: "Pechuga de pollo" },
];

// Genéricos del rubro `carniceria` sin equivalente real confirmado en las 3
// categorías relevadas (Bovina/Cerdo/Pollo). NO se borran (guardarraíl): se
// DESACTIVAN (`active:false`, reversible) para que el "Comprá online" deje de
// vender con precio inventado. Si el dueño confirma que sí existen en otra
// categoría del Bistrosoft real (embutidos/huevos/etc.), se reactivan con su
// precio real — no antes.
const DEACTIVATE_NO_REAL_MATCH = ["Chorizo parrillero", "Maple de huevos (x30)", "Asado de tira", "Pollo entero (~2 kg)"];

async function main() {
  const apply = process.argv.includes("--apply");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`No existe tenant con slug "${SLUG}". Abortado, no se tocó nada.`);
    const tenantId = tenant.id;
    console.log(`── Fix de dato — tenant "${tenant.name}" (${tenantId}) — ${apply ? "APLICANDO" : "DRY-RUN"} ──\n`);

    // --- M-2: diff de BusinessSettings ---
    const settings = await prisma.businessSettings.findUnique({ where: { tenantId } });
    if (!settings) throw new Error("magra no tiene BusinessSettings — no hay fila para hacer UPDATE. Abortado.");
    console.log("M-2 · BusinessSettings (branding):");
    const settingsChanges: Record<string, string> = {};
    for (const [key, proposed] of Object.entries(BRANDING_FIX)) {
      const current = (settings as unknown as Record<string, string | null>)[key];
      if (current !== proposed) {
        console.log(`  ${key}:\n    actual:     ${JSON.stringify(current)}\n    propuesto:  ${JSON.stringify(proposed)}`);
        settingsChanges[key] = proposed;
      } else {
        console.log(`  ${key}: sin cambios (ya es "${current}")`);
      }
    }

    // --- M-3: diff de catálogo ---
    const products = await prisma.product.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
    console.log(`\nM-3 · Catálogo (${products.length} productos existentes):`);

    const byName = new Map(products.map((p) => [p.name, p]));
    const toUpdate: { id: string; name: string; from: string; to: RealItem }[] = [];
    const toCreate: RealItem[] = [];

    for (const item of REAL_CATALOG) {
      if (byName.has(item.name)) continue; // ya aplicado (re-correr es idempotente)
      const replaceTarget = item.replaces ? byName.get(item.replaces) : undefined;
      if (replaceTarget) {
        toUpdate.push({ id: replaceTarget.id, name: replaceTarget.name, from: replaceTarget.name, to: item });
      } else {
        toCreate.push(item);
      }
    }

    console.log(`\n  UPDATE in-place (genérico real → nombre/precio real, ${toUpdate.length}):`);
    for (const u of toUpdate) {
      const cur = byName.get(u.from)!;
      console.log(
        `    "${u.from}" ($${cur.saleUnit === "WEIGHT" ? cur.pricePerKg : cur.price}/${cur.saleUnit === "WEIGHT" ? "kg" : "u"})` +
          ` → "${u.to.name}" ($${u.to.pricePerKg ?? u.to.price}/${u.to.saleUnit === "WEIGHT" ? "kg" : "u"})`,
      );
    }

    console.log(`\n  CREATE nuevo (real, sin genérico previo, ${toCreate.length}):`);
    for (const c of toCreate) {
      console.log(`    + "${c.name}" ($${c.pricePerKg ?? c.price}/${c.saleUnit === "WEIGHT" ? "kg" : "u"})`);
    }

    const toDeactivate = products.filter((p) => DEACTIVATE_NO_REAL_MATCH.includes(p.name) && p.active);
    console.log(`\n  DESACTIVAR (sin equivalente real confirmado, active:false, reversible, ${toDeactivate.length}):`);
    for (const d of toDeactivate) console.log(`    - "${d.name}"`);

    if (!apply) {
      console.log("\n[dry-run] No se escribió nada. Correr con --apply para ejecutar exactamente este plan.");
      return;
    }

    // --- Aplicar: todo scoped por tenantId, todo UPDATE/CREATE puntual, cero deleteMany/seed ---
    if (Object.keys(settingsChanges).length > 0) {
      await prisma.businessSettings.update({ where: { tenantId }, data: settingsChanges });
      console.log(`\n✔ BusinessSettings actualizado (${Object.keys(settingsChanges).join(", ")}).`);
    }

    for (const u of toUpdate) {
      await prisma.product.update({
        where: { id: u.id },
        data: {
          name: u.to.name,
          unit: u.to.unit,
          saleUnit: u.to.saleUnit,
          price: u.to.price ?? null,
          pricePerKg: u.to.pricePerKg ?? null,
        },
      });
    }
    console.log(`✔ ${toUpdate.length} productos actualizados in-place.`);

    for (const c of toCreate) {
      await prisma.product.create({
        data: {
          tenantId,
          name: c.name,
          unit: c.unit,
          saleUnit: c.saleUnit,
          price: c.price ?? null,
          pricePerKg: c.pricePerKg ?? null,
          trackStock: false,
        },
      });
    }
    console.log(`✔ ${toCreate.length} productos nuevos creados.`);

    for (const d of toDeactivate) {
      await prisma.product.update({ where: { id: d.id }, data: { active: false } });
    }
    console.log(`✔ ${toDeactivate.length} productos desactivados (reversible).`);

    console.log("\n✔ Fix aplicado. Cero deleteMany, cero seed, todo scoped a tenantId de magra.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\n✖ Abortado:\n" + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
});
