// ============================================================================
// DATOS DE CONTACTO Y MATRÍCULA DE PDC PROPIEDADES — por orden del dueño (13/10/2026).
// ============================================================================
//
// Completa, en el negocio ya dado de alta, lo que el alta no cargó: la matrícula del corredor
// (sale al pie del sitio) y el contacto público (mail, Instagram, mapa). Todo tomado de su sitio
// público con la autorización registrada en docs/tenants/inmobiliaria/README.md. Idempotente.
//
//   DATABASE_URL=<producción, rol dueño> npx tsx scripts/inmobiliaria/datos-pdc.ts
//   (la cadena la pasa scripts/inmobiliaria/alta-produccion.mjs o el dueño; nunca va por argv)

import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = process.env.INMO_SEED_SLUG ?? "pdcinmobiliaria";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) });

async function main() {
  const t = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true, name: true } });
  if (!t) throw new Error(`No existe el negocio "${SLUG}".`);
  await prisma.inmoConfig.upsert({
    where: { tenantId: t.id },
    create: { tenantId: t.id, prefijoCodigo: "PDC", comisionAdminPct: 8, punitorioDiarioPct: 0.1, punitoriosAlPropietario: true, matricula: "Ariel Eduardo Pericullo · Corredor y Martillero Público · Mat. 3721 CPMCLZ" },
    update: { matricula: "Ariel Eduardo Pericullo · Corredor y Martillero Público · Mat. 3721 CPMCLZ" },
  });
  await prisma.businessSettings.updateMany({
    where: { tenantId: t.id },
    data: {
      email: "info@pdcpropiedades.com.ar",
      instagram: "@pdcpropiedades",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Ram%C3%B3n+Santamarina+1128%2C+Monte+Grande",
    },
  });
  console.log(`✅ ${t.name} (${SLUG}): matrícula y contacto cargados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
