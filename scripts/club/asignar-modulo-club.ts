// Asigna el módulo `club` a UN negocio (O4 de docs/producto/PLAN-TERMINALES-MOSTRADOR.md §7): suma "club" a
// `Tenant.modules` del slug dado. Idempotente (si ya lo tiene, no hace nada) y atómico (el `push` sólo corre si el
// módulo todavía no está). Patrón DX-7: dry-run por defecto → --apply → verificación.
//
//   npx tsx scripts/club/asignar-modulo-club.ts --slug <slug>            # dry-run: muestra antes y después
//   npx tsx scripts/club/asignar-modulo-club.ts --slug <slug> --apply    # escribe
//
// ⚠️ Asignar `club` a un negocio real lo deja entrar a /admin/club: es exposición al cliente. Con --apply contra
// producción corre SÓLO con el OK del dueño (ADR-055: el objeto se asigna con una relación explícita, nunca «a todos
// con todo»). Scopeado por el id del slug; no toca otros campos ni otros negocios. Rol: `DATABASE_URL` del entorno
// (la tabla `Tenant` no lleva RLS).
//
// — Elaborado por GSG
import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { clubModule } from "../../src/modules/descriptors/club";

const MODULO = clubModule.id;

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("slug");
  const aplicar = process.argv.includes("--apply");
  if (!slug) {
    console.error("uso: npx tsx scripts/club/asignar-modulo-club.ts --slug <slug> [--apply]");
    process.exit(2);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, modules: true } });
    if (!t) throw new Error(`No existe el negocio «${slug}» — abortado.`);
    console.log(`── Negocio ${t.slug} (id=${t.id})`);
    console.log(`   ANTES:   modules=${JSON.stringify(t.modules)}`);
    // Dependencias del descriptor (clients, pos): se avisan; asignarlas es otra decisión.
    const faltan = (clubModule.dependencias ?? []).map((d) => d.id).filter((id) => !t.modules.includes(id));
    if (faltan.length) console.log(`   ⚠ Le faltan dependencias del módulo: ${faltan.join(", ")} (no se asignan solas).`);
    if (t.modules.includes(MODULO)) {
      console.log(`\nYa tiene «${MODULO}»: no hay nada que hacer.`);
      return;
    }
    console.log(`   DESPUÉS: modules=${JSON.stringify([...t.modules, MODULO])}`);
    if (!aplicar) {
      console.log("\n[dry-run] No se escribió nada. Reejecutá con --apply (con el OK del dueño).");
      return;
    }
    const { count } = await prisma.tenant.updateMany({ where: { id: t.id, NOT: { modules: { has: MODULO } } }, data: { modules: { push: MODULO } } });
    const despues = await prisma.tenant.findUnique({ where: { id: t.id }, select: { modules: true } });
    const ok = despues?.modules.includes(MODULO) === true;
    console.log(`\n${ok ? "✔" : "✖"} ${count ? "Asignado" : "Ya estaba (otra corrida se adelantó)"}. Verificado: modules=${JSON.stringify(despues?.modules)}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`\n✖ Abortado: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
