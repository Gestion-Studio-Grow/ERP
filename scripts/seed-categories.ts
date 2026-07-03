import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Categorías relevadas con Carolina (ADR-011 G16). Orden = cómo se muestran.
const CATEGORIES = [
  "Faciales",
  "Cejas y pestañas",
  "Manos",
  "Pies",
  "Masajes",
  "Corporales",
  "Spa",
];

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });

  for (let i = 0; i < CATEGORIES.length; i++) {
    const name = CATEGORIES[i];
    const existing = await prisma.serviceCategory.findFirst({
      where: { tenantId: tenant.id, name },
    });
    if (existing) {
      await prisma.serviceCategory.update({ where: { id: existing.id }, data: { order: i } });
      console.log(`= ${name} (ya existía, orden ${i})`);
    } else {
      await prisma.serviceCategory.create({
        data: { tenantId: tenant.id, name, order: i },
      });
      console.log(`+ ${name} (orden ${i})`);
    }
  }

  const total = await prisma.serviceCategory.count({ where: { tenantId: tenant.id } });
  console.log(`Categorías del tenant: ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
