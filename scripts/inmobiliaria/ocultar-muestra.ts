// ============================================================================
// ESCONDER LA CARTERA DE MUESTRA — cuando entra la cartera real del cliente.
// ============================================================================
//
//   DATABASE_URL=<base> INMO_SLUG=<slug> npx tsx scripts/inmobiliaria/ocultar-muestra.ts
//
// Las fichas de muestra del seed (código DEM-…) pasan a PAUSADA: dejan de verse en el sitio y
// en los números de la portada, pero no se borran (los contratos y consultas de muestra las
// referencian). Las que tienen contrato (ALQUILADA) ya no se ven y quedan como están.

import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

async function main() {
  const slug = process.env.INMO_SLUG ?? "pdcinmobiliaria";
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!t) throw new Error(`No existe el negocio "${slug}".`);
  const r = await prisma.inmoPropiedad.updateMany({
    where: { tenantId: t.id, codigo: { startsWith: "DEM-" }, estado: { notIn: ["ALQUILADA", "PAUSADA"] } },
    data: { estado: "PAUSADA", destacada: false },
  });
  const quedan = await prisma.inmoPropiedad.count({ where: { tenantId: t.id, estado: { in: ["PUBLICADA", "RESERVADA"] } } });
  console.log(`✅ ${slug}: ${r.count} fichas de muestra pausadas · ${quedan} a la vista en el sitio.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
