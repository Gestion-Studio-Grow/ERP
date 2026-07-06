// Convierte un tenant de un blueprint a otro (pivot de modelo de negocio). PUNTUAL
// y SCOPEADO: toda operación filtra por el `tenantId` del slug dado — NUNCA toca
// otros tenants. Transaccional (todo-o-nada). Dry-run por defecto; escribe solo con
// `--apply`. Corre con el rol OWNER (DATABASE_URL = neondb_owner; bypassa RLS, por
// eso cada operación va explícitamente scopeada por tenantId).
//
//   node --import tsx scripts/convert-tenant-blueprint.ts --slug adosmanos --to padel --purge-servicios [--apply]
//
// Qué hace (en orden, dentro de una transacción):
//   1. UPDATE Tenant.blueprintId = <to>  (solo ese tenant).
//   2. Si --purge-servicios: BORRA la semilla demo de la familia "servicios/turnos"
//      de ESE tenant (Professional → cascada WorkingHours/blocks/commissions;
//      Service → cascada ServiceProduct/Resource; ServiceCategory; Box → cascada
//      BoxBlock). Se ABORTA si hay Appointment > 0 (no borra sobre reservas reales).
//   3. Siembra el catálogo del blueprint destino (idempotente: solo si 0 productos).
//
// NUNCA usa `prisma/seed.ts` (ese hace deleteMany global). Este borra SOLO by tenantId.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getBlueprint } from "../src/blueprints";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const slug = arg("slug");
const to = arg("to");
const purgeServicios = has("purge-servicios");
const apply = has("apply");

if (!slug || !to) {
  console.error("Uso: --slug <slug> --to <rubro/blueprint> [--purge-servicios] [--apply]");
  process.exit(2);
}
const blueprint = getBlueprint(to); // valida el destino ANTES de tocar la base (lanza si no existe)

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function counts(tenantId: string) {
  const [service, serviceCategory, professional, workingHours, box, appointment, product] =
    await Promise.all([
      prisma.service.count({ where: { tenantId } }),
      prisma.serviceCategory.count({ where: { tenantId } }),
      prisma.professional.count({ where: { tenantId } }),
      prisma.workingHours.count({ where: { tenantId } }),
      prisma.box.count({ where: { tenantId } }),
      prisma.appointment.count({ where: { tenantId } }),
      prisma.product.count({ where: { tenantId } }),
    ]);
  return { service, serviceCategory, professional, workingHours, box, appointment, product };
}

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, blueprintId: true, name: true },
  });
  if (!tenant) throw new Error(`No existe tenant con slug "${slug}" — abortado.`);
  const tenantId = tenant.id;

  const before = await counts(tenantId);
  console.log(`── Tenant: ${tenant.name} (${tenant.slug}) · id=${tenantId}`);
  console.log(`   blueprint actual: ${tenant.blueprintId ?? "(null)"} → destino: ${to}`);
  console.log("   ANTES:", JSON.stringify(before));

  if (purgeServicios && before.appointment > 0) {
    throw new Error(
      `ABORTADO: ${before.appointment} Appointment(s) en ${slug}. No se purga sobre reservas reales; ` +
        "revisar a mano.",
    );
  }
  if (!apply) {
    console.log("\n[dry-run] No se escribió nada. Reejecutá con --apply para aplicar.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Cambiar el blueprint del tenant.
    await tx.tenant.update({ where: { id: tenantId }, data: { blueprintId: to } });

    // 2. Purga demo servicios/turnos SOLO de este tenant (cascadas via onDelete).
    if (purgeServicios) {
      await tx.professional.deleteMany({ where: { tenantId } }); // → WorkingHours, blocks, commissions, M2M
      await tx.service.deleteMany({ where: { tenantId } }); // → ServiceProduct/Resource, M2M
      await tx.serviceCategory.deleteMany({ where: { tenantId } });
      await tx.box.deleteMany({ where: { tenantId } }); // → BoxBlock
    }

    // 3. Sembrar el catálogo del blueprint destino (idempotente: solo si 0 productos).
    await blueprint.seedCatalog(tx, tenantId);
  });

  const after = await counts(tenantId);
  console.log("\n✔ Conversión aplicada.");
  console.log("   DESPUÉS:", JSON.stringify(after));
}

main()
  .catch((e) => {
    console.error("\n✖ Abortado:\n" + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
