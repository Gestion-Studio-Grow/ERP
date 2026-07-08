// ============================================================================
// SEED — Tenant de DEMO Empresa para la vidriera de venta (ADR-030 · ADR-059 D8).
// ============================================================================
//
// Decisión registrada: `docs/estrategia/decisiones-set-empresa-2026-07-08.md` (S5).
//
// QUÉ HACE: crea/actualiza (idempotente, upsert por `slug`) un tenant de ejemplo con
// `profile = "enterprise"` (edición "Empresa") para poder MOSTRAR/VENDER el perfil
// Empresa y para que S4 lo verifique de punta a punta sobre el path real de persistencia.
//
// 🔴 SOLO DESARROLLO — NUNCA prod (ADR-059 D8: demo sobre rubro/marca de EJEMPLO, jamás
//    un cliente real ni la carnicería). No trae datos reales, no toca fiscal/ARCA real.
//    Se corre contra una DB de DEV; nunca contra Neon prod.
//
// CÓMO SE CORRE (manual, en dev, NO se ejecuta como parte del publish):
//    DATABASE_URL="<dev>" npx tsx prisma/seed-demo-empresa.ts
//    Requiere que la migración `add_tenant_profile` esté aplicada en esa DB de dev.
//
// IDEMPOTENTE: correrlo N veces deja el mismo estado (upsert por slug; el `update`
// re-fija `profile`/marca por si un run previo lo dejó a medias). No borra nada.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Marca/rubro de EJEMPLO (no un cliente real, no carnicería). Una distribuidora
// mayorista cuenta bien la historia "Empresa" (proceso completo: compras, cuentas,
// reportes) sin parecerse a ningún tenant real.
const DEMO_EMPRESA = {
  slug: "demo-empresa",
  name: "Distribuidora Demo — Empresa",
  blueprintId: "generico",
  accentPreset: "indigo",
  frontTheme: "light",
} as const;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  // Baranda dura: si la URL parece de producción, ABORTAR (esto es demo de dev).
  if (/neon\.tech|prod|production/i.test(url)) {
    throw new Error(
      "seed-demo-empresa: DATABASE_URL parece de PRODUCCIÓN. Este seed es SOLO dev " +
        "(ADR-059 D8). Abortado para no ensuciar prod.",
    );
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_EMPRESA.slug },
    // Re-fija el perfil y la marca en cada corrida (idempotente y auto-reparador).
    update: {
      name: DEMO_EMPRESA.name,
      profile: "enterprise",
      blueprintId: DEMO_EMPRESA.blueprintId,
      accentPreset: DEMO_EMPRESA.accentPreset,
      frontTheme: DEMO_EMPRESA.frontTheme,
      status: "TRIAL",
    },
    create: {
      slug: DEMO_EMPRESA.slug,
      name: DEMO_EMPRESA.name,
      profile: "enterprise",
      blueprintId: DEMO_EMPRESA.blueprintId,
      accentPreset: DEMO_EMPRESA.accentPreset,
      frontTheme: DEMO_EMPRESA.frontTheme,
      status: "TRIAL",
    },
  });

  console.log(
    `✔ Tenant demo Empresa listo: slug="${tenant.slug}" profile="${tenant.profile}" ` +
      `(id=${tenant.id}). Entrá por su subdominio/slug en dev para ver la edición Empresa.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
