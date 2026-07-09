// ============================================================================
// FLIP de perfil de la Magra DEMO (QA) — Comercio ⇄ Empresa, SIN tocar los datos.
// ============================================================================
//
// Complementa a `seed-magra.ts`: el seed re-siembra (resetea) los datos; este flip SOLO
// cambia `Tenant.profile` del tenant demo, así el QA puede alternar Comercio ⇄ Empresa sobre
// los MISMOS datos sin perder lo que haya tocado. Idempotente. SOLO dev/QA (baranda anti-prod).
//
// USO (dev branch de QA):
//   DATABASE_URL="<neon-dev-branch>" npx tsx prisma/flip-magra-profile.ts             # alterna
//   DATABASE_URL="<neon-dev-branch>" MAGRA_PROFILE=enterprise npx tsx prisma/flip-magra-profile.ts  # fija Empresa
//   DATABASE_URL="<neon-dev-branch>" MAGRA_PROFILE=lite npx tsx prisma/flip-magra-profile.ts        # fija Comercio
// (Para VER el gating hay que tener PROFILES_ENABLED=1 en el server del preview.)

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SLUG = "magra-demo";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (/prod|production|\bmain\b/i.test(url)) {
    throw new Error("flip-magra-profile: DATABASE_URL parece PRODUCCIÓN/main. Solo dev/QA. Abortado.");
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true, profile: true } });
  if (!tenant) throw new Error(`No existe el tenant "${SLUG}". Corré primero prisma/seed-magra.ts.`);

  const forced = process.env.MAGRA_PROFILE;
  const target =
    forced === "enterprise" || forced === "lite"
      ? forced
      : tenant.profile === "enterprise"
        ? "lite"
        : "enterprise"; // sin env → alterna

  await prisma.tenant.update({ where: { id: tenant.id }, data: { profile: target } });
  console.log(
    `✔ Magra DEMO ahora es "${target === "enterprise" ? "Empresa" : "Comercio"}" (profile=${target}). ` +
      `Recargá el preview (con PROFILES_ENABLED=1) para ver el cambio.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
