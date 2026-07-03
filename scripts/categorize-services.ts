import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Clasificación por nombre (ADR-011 G16, corrección de agrupación). Reglas en
// orden de prioridad; lo ambiguo queda SIN categoría (no se adivina, se deja
// para que Carolina lo revise puntualmente en Catálogo).
const RULES: { category: string; test: RegExp }[] = [
  { category: "Cejas y pestañas", test: /cejas|pesta[ñn]as/i },
  { category: "Spa", test: /experiencia spa/i },
  {
    category: "Manos",
    test: /manos|u[ñn]as|esmalt|gel|nail|carey|cromad|flor 3d|polvo au[eé]rora|baby boomer/i,
  },
  { category: "Pies", test: /\bpies\b|pedicuria|podal/i },
  { category: "Masajes", test: /masaje|drenaje linf/i },
  {
    category: "Corporales",
    test: /corporal|radiofrecuencia|exfoliaci[oó]n|maderoterapia/i,
  },
  { category: "Faciales", test: /facial|higiene|peeling|dermapen|dermaplaning|exosomas|hidra ?lips|hidrataci[oó]n\s*de\s*labios|microneedling|punta de diamante/i },
];

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });

  // Asegura que exista la categoría Depilación (faltaba en el relevamiento original).
  const existingCategories = await prisma.serviceCategory.findMany({ where: { tenantId: tenant.id } });
  let depilacion = existingCategories.find((c) => c.name === "Depilación");
  if (!depilacion) {
    const maxOrder = Math.max(0, ...existingCategories.map((c) => c.order));
    depilacion = await prisma.serviceCategory.create({
      data: { tenantId: tenant.id, name: "Depilación", order: maxOrder + 1 },
    });
    console.log("+ Categoría creada: Depilación");
  }
  const categoryByName = new Map(
    [...existingCategories.filter((c) => c.name !== "Depilación"), depilacion].map((c) => [c.name, c.id])
  );

  const services = await prisma.service.findMany({
    where: { categoryId: null },
    select: { id: true, name: true },
  });

  const assigned: { name: string; category: string }[] = [];
  const left: string[] = [];

  for (const s of services) {
    const rule = RULES.find((r) => r.test.test(s.name));
    if (rule) {
      const categoryId = categoryByName.get(rule.category);
      if (categoryId) {
        await prisma.service.update({ where: { id: s.id }, data: { categoryId } });
        assigned.push({ name: s.name, category: rule.category });
        continue;
      }
    }
    // Zona corporal + género sin otra palabra clave (patrón depilación por zona).
    if (/\((\s*masculina\s*|\s*femenina\s*)\)/i.test(s.name) || /depilaci[oó]n/i.test(s.name)) {
      const categoryId = categoryByName.get("Depilación");
      if (categoryId) {
        await prisma.service.update({ where: { id: s.id }, data: { categoryId } });
        assigned.push({ name: s.name, category: "Depilación" });
        continue;
      }
    }
    left.push(s.name);
  }

  console.log(`\nAsignados: ${assigned.length}`);
  const byCategory = new Map<string, number>();
  for (const a of assigned) byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + 1);
  console.table(Object.fromEntries(byCategory));

  console.log(`\nSin categorizar (${left.length}) — quedan pendientes de revisión manual:`);
  left.forEach((n) => console.log("  -", n));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
