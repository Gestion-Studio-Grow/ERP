// ============================================================================
// Vínculo ARM → negocio destino (GSG-CRM-017 · T4). Lo carga SÓLO GSG, como dueño de la base.
// ============================================================================
//
// El ARM (p. ej. `arm-mia`) asigna oportunidades a un tipo de destino (Agencia o Taller); este vínculo dice en qué
// negocio nace el proyecto. La app no puede escribir esta tabla (REVOKE a `app_rls` en la migración y en
// prisma/rls/0002_app_role.sql): por eso corre con la URL del dueño (MIGRATE_DATABASE_URL, o DATABASE_URL local).
//
//   npx tsx scripts/crm-comercial/cargar-vinculo.ts --arm arm-mia --destino AGENCIA --negocio mia-producciones [--marcar-arm] [--apply]
//   npx tsx scripts/crm-comercial/cargar-vinculo.ts --arm arm-mia --destino AGENCIA --desactivar [--apply]
//
// Dry-run por defecto: muestra el antes y el después y no escribe. Con `--apply` escribe UNA fila (alta o cambio del
// vínculo de ese destino). `--marcar-arm` además marca el negocio ARM con el blueprint `arm` (sólo si no lo tiene).
// En producción es un cambio de datos de plataforma: se corre con orden del dueño (Gate de datos), nunca desde un agente.

import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BLUEPRINT_ARM, esNegocioArm } from "../../src/lib/crm-comercial/arm";

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : undefined;
}
const flag = (n: string) => process.argv.includes(`--${n}`);

const armSlug = arg("arm");
const destino = arg("destino")?.toUpperCase();
const negocioSlug = arg("negocio");
const desactivar = flag("desactivar");
const apply = flag("apply");
const marcarArm = flag("marcar-arm");

if (!armSlug || (destino !== "AGENCIA" && destino !== "TALLER") || (!desactivar && !negocioSlug)) {
  console.error("Uso: --arm <slug> --destino AGENCIA|TALLER (--negocio <slug> | --desactivar) [--marcar-arm] [--apply]");
  process.exit(2);
}

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Falta MIGRATE_DATABASE_URL (o DATABASE_URL local): la URL del dueño de la base.");
  process.exit(2);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const arm = await prisma.tenant.findUnique({ where: { slug: armSlug }, select: { id: true, slug: true, name: true, blueprintId: true } });
  if (!arm) throw new Error(`No existe un negocio con el slug «${armSlug}».`);
  if (!esNegocioArm(arm.blueprintId) && !marcarArm) {
    throw new Error(`«${arm.slug}» no es un ARM (blueprint ${JSON.stringify(arm.blueprintId)}). Si lo es, sumá --marcar-arm.`);
  }
  const negocio = negocioSlug ? await prisma.tenant.findUnique({ where: { slug: negocioSlug }, select: { id: true, slug: true, name: true, blueprintId: true } }) : null;
  if (negocioSlug && !negocio) throw new Error(`No existe un negocio con el slug «${negocioSlug}».`);
  if (negocio && negocio.id === arm.id) throw new Error("El ARM no puede ser su propio destino.");
  if (negocio && esNegocioArm(negocio.blueprintId)) throw new Error(`«${negocio.slug}» es un ARM: el destino tiene que ser el negocio que hace el proyecto.`);

  const antes = await prisma.vinculoNegocio.findFirst({
    where: { tenantId: arm.id, destino: destino as "AGENCIA" | "TALLER" },
    select: { id: true, activo: true, destinoTenant: { select: { slug: true } } },
  });
  console.log(`ARM: ${arm.slug} (${arm.name}) · blueprint ${JSON.stringify(arm.blueprintId)}${!esNegocioArm(arm.blueprintId) ? ` → se marca «${BLUEPRINT_ARM}»` : ""}`);
  console.log(`Antes:   ${destino} → ${antes ? `${antes.destinoTenant.slug} (${antes.activo ? "activo" : "inactivo"})` : "sin vínculo"}`);
  console.log(`Después: ${destino} → ${desactivar ? (antes ? `${antes.destinoTenant.slug} (inactivo)` : "sin vínculo (nada que desactivar)") : `${negocio!.slug} (activo)`}`);
  if (!apply) {
    console.log("\n[dry-run] No se escribió nada. Reejecutá con --apply.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (!esNegocioArm(arm.blueprintId)) await tx.tenant.update({ where: { id: arm.id }, data: { blueprintId: BLUEPRINT_ARM }, select: { id: true } });
    if (desactivar) {
      if (antes) await tx.vinculoNegocio.update({ where: { id: antes.id }, data: { activo: false }, select: { id: true } });
      return;
    }
    const data = { destinoTenantId: negocio!.id, activo: true, cargadoPor: "GSG (scripts/crm-comercial/cargar-vinculo.ts)" };
    if (antes) await tx.vinculoNegocio.update({ where: { id: antes.id }, data, select: { id: true } });
    else await tx.vinculoNegocio.create({ data: { tenantId: arm.id, destino: destino as "AGENCIA" | "TALLER", ...data }, select: { id: true } });
  });
  console.log("Listo: vínculo guardado.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
