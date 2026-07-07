// Ajuste de dato de PRODUCCIÓN para el tenant `magra`: el dueño aclaró que
// horario y precios NO necesitan ser reales — mock razonable coherente con el
// rubro alcanza (no escalar, no bloquear). Se mantiene la estructura/nombres
// reales relevados del sitio (Estancia Don Ramón / Lamberti / Coeco, la línea
// "envasados al vacío") de `fix-magra-data-2026-07-07.ts`, solo se reemplazan
// los precios REALES de Bistrosoft por precios MOCK del mismo orden que el
// blueprint `carniceria` (rubros.ts, ya marcado ahí como "provisional/demo").
// El horario NO se toca: el valor relevado ya es un horario plausible, así que
// ya cumple "mock razonable" — tocarlo de nuevo sería trabajo sin sentido.
//
// GUARDARRAÍLES DUROS (prod-data Neon), iguales al fix anterior: NUNCA seed,
// NUNCA deleteMany. Solo UPDATE puntual scoped por `tenantId` de magra. Dry-run
// por default, `--apply` para escribir.
//   npx tsx scripts/fix-magra-mock-prices-2026-07-07.ts          (dry-run)
//   npx tsx scripts/fix-magra-mock-prices-2026-07-07.ts --apply  (aplica)

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "magra";

// name → precio mock (mismo orden de magnitud que rubros.ts, NO el precio real
// de Bistrosoft). saleUnit se infiere del producto ya existente (no se cambia).
const MOCK_PRICES: Record<string, number> = {
  "Asado Banderita (Estancia Don Ramón)": 10500,
  "Asado del Medio (Estancia Don Ramón)": 10500,
  "Bife Argentino (Estancia Don Ramón)": 9800,
  "Bife de Chorizo (Estancia Don Ramón)": 12500,
  "Carne Picada (Estancia Don Ramón)": 7800,
  "Churrasquito de Cuadril (Estancia Don Ramón)": 11200,
  "Churrasquito Escondido (Estancia Don Ramón)": 11000,
  "Colita de Cuadril (Estancia Don Ramón)": 12800,
  "Entraña (Estancia Don Ramón)": 14500,
  "Hamburguesas Gourmet Premium (Breaders, x4)": 8900,
  "Lomo sin Cordón (Estancia Don Ramón)": 15900,
  "Matambre (Estancia Don Ramón)": 9500,
  "Medio Lomo (Estancia Don Ramón)": 15900,
  "Picanha (Estancia Don Ramón)": 13200,
  "Rack de Ojo x1 (Estancia Don Ramón)": 13800,
  "Rondelle (Estancia Don Ramón)": 12600,
  "T-Bone (Estancia Don Ramón)": 13500,
  "Tapa de Nalga (Estancia Don Ramón)": 10200,
  "Tomahawk (Estancia Don Ramón)": 14200,
  "Vacío Fino (Estancia Don Ramón)": 11800,
  "Vacío Pulpeta (Estancia Don Ramón)": 11500,
  "Ribs de Cerdo Congelado (Lamberti)": 8200,
  "Bondiola (Lamberti)": 8600,
  "Churrasquito de Cerdo (Lamberti)": 8000,
  "Lomito Ahumado (Lamberti)": 9200,
  "Matambrito Arrollado (Lamberti)": 8800,
  "Matambrito (Lamberti)": 9000,
  "Ribs de Cerdo (Lamberti)": 8200,
  "Solomillo (Lamberti)": 8900,
  "Nuggets de Pollo Rebozados (540g)": 6500,
  "Pata y Muslo Deshuesada (Coeco)": 6200,
  "Suprema Deshuesada (Coeco)": 6900,
};

async function main() {
  const apply = process.argv.includes("--apply");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`No existe tenant con slug "${SLUG}". Abortado.`);
    const tenantId = tenant.id;
    console.log(`── Mock de precios — tenant "${tenant.name}" (${tenantId}) — ${apply ? "APLICANDO" : "DRY-RUN"} ──\n`);

    const products = await prisma.product.findMany({
      where: { tenantId, name: { in: Object.keys(MOCK_PRICES) } },
    });
    const byName = new Map(products.map((p) => [p.name, p]));

    const changes: { id: string; name: string; field: "price" | "pricePerKg"; from: number | null; to: number }[] = [];
    for (const [name, mockPrice] of Object.entries(MOCK_PRICES)) {
      const p = byName.get(name);
      if (!p) {
        console.log(`  ⚠ "${name}" no existe en el catálogo de magra — se omite (no se crea nada acá).`);
        continue;
      }
      const field = p.saleUnit === "WEIGHT" ? "pricePerKg" : "price";
      const current = field === "pricePerKg" ? p.pricePerKg : p.price;
      if (current !== mockPrice) {
        changes.push({ id: p.id, name, field, from: current, to: mockPrice });
      }
    }

    console.log(`Cambios de precio (real Bistrosoft → mock rubro), ${changes.length}:`);
    for (const c of changes) {
      console.log(`  "${c.name}" [${c.field}]: ${c.from} → ${c.to}`);
    }

    if (!apply) {
      console.log("\n[dry-run] No se escribió nada. Correr con --apply para ejecutar exactamente este plan.");
      return;
    }

    for (const c of changes) {
      await prisma.product.update({ where: { id: c.id }, data: { [c.field]: c.to } });
    }
    console.log(`\n✔ ${changes.length} precios actualizados a mock. Cero deleteMany, cero seed, scoped a tenantId de magra.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\n✖ Abortado:\n" + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
});
