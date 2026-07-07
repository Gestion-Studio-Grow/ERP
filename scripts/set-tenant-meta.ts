// Setea metadata de un tenant (nombre de marca y/o blueprint del rubro) que muestra
// el control-plane. PUNTUAL, SCOPEADO por el `id` del slug dado (nunca otros tenants),
// NO destructivo (solo UPDATE de los campos pasados). Dry-run por defecto; escribe con
// `--apply`. Rol OWNER (DATABASE_URL = neondb_owner).
//
//   node --import tsx scripts/set-tenant-meta.ts --slug beauty-spa --name "CH Estética" --blueprint servicios [--apply]
//
// NO toca servicios, agenda, catálogo ni branding del front (el front lee su marca de
// src/lib/branding.ts por slug, y el routing no lee blueprintId — ver (site)/page.tsx).

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
const apply = process.argv.includes("--apply");

const slug = arg("slug");
const name = arg("name");
const blueprint = arg("blueprint");

if (!slug || (!name && !blueprint)) {
  console.error("Uso: --slug <slug> [--name <marca>] [--blueprint <id>] [--apply]");
  process.exit(2);
}
if (blueprint) getBlueprint(blueprint); // valida el blueprint ANTES de tocar la base

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const t = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, blueprintId: true },
  });
  if (!t) throw new Error(`No existe tenant con slug "${slug}" — abortado.`);

  const data: { name?: string; blueprintId?: string } = {};
  if (name !== undefined) data.name = name;
  if (blueprint !== undefined) data.blueprintId = blueprint;

  console.log(`── Tenant ${t.slug} (id=${t.id})`);
  console.log(`   ANTES:   name=${JSON.stringify(t.name)} · blueprintId=${JSON.stringify(t.blueprintId)}`);
  console.log(`   CAMBIOS: ${JSON.stringify(data)}`);

  if (!apply) {
    console.log("\n[dry-run] No se escribió nada. Reejecutá con --apply.");
    return;
  }
  await prisma.tenant.update({ where: { id: t.id }, data }); // scopeado por id
  const after = await prisma.tenant.findUnique({
    where: { id: t.id },
    select: { name: true, blueprintId: true },
  });
  console.log(`\n✔ Aplicado.`);
  console.log(`   DESPUÉS: name=${JSON.stringify(after!.name)} · blueprintId=${JSON.stringify(after!.blueprintId)}`);
}

main()
  .catch((e) => {
    console.error("\n✖ Abortado:\n" + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
