import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { baseLocalParaSeed } from "../src/lib/seed/guarda-base";

// Datos de ejemplo para desarrollo local. Borra y recarga SÓLO el negocio de muestra, en una
// transacción, y nunca corre contra una base que no sea de esta máquina (ENG-001).
const guarda = baseLocalParaSeed(process.env.DATABASE_URL);
if (!guarda.ok) {
  console.error(`seed: abortado. ${guarda.motivo}`);
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.$transaction(sembrar, { timeout: 60_000 });
  console.log("Seed completo.");
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function sembrar(prisma: Tx) {
  // Todo cuelga de un tenant (ADR-001 / ADR-010 G1). En un alta fresca se crea
  // el tenant primero y cada entidad se le asigna.
  const tenant = await prisma.tenant.upsert({
    where: { slug: "beauty-spa" },
    update: {},
    create: { name: "Beauty & Spa", slug: "beauty-spa" },
  });
  const tenantId = tenant.id;

  // Se vacía sólo el negocio de muestra; los demás negocios de la base quedan como estaban.
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.appointment.deleteMany({ where: { tenantId } });
  await prisma.client.deleteMany({ where: { tenantId } });
  await prisma.serviceProduct.deleteMany({ where: { tenantId } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.service.deleteMany({ where: { tenantId } });
  await prisma.professional.deleteMany({ where: { tenantId } });
  await prisma.boxBlock.deleteMany({ where: { tenantId } });
  await prisma.box.deleteMany({ where: { tenantId } });

  const box1 = await prisma.box.create({ data: { tenantId, name: "Box 1" } });
  const box2 = await prisma.box.create({ data: { tenantId, name: "Box 2" } });
  const box3 = await prisma.box.create({ data: { tenantId, name: "Box 3" } });

  const masajes = await prisma.service.create({
    data: { tenantId, name: "Masaje descontracturante", durationMin: 60, price: 15000 },
  });
  const masajePiedras = await prisma.service.create({
    data: { tenantId, name: "Masaje con piedras calientes", durationMin: 75, price: 18000 },
  });
  const limpiezaFacial = await prisma.service.create({
    data: { tenantId, name: "Limpieza facial profunda", durationMin: 50, price: 20000 },
  });
  const peeling = await prisma.service.create({
    data: { tenantId, name: "Peeling químico", durationMin: 40, price: 22000 },
  });
  const radiofrecuencia = await prisma.service.create({
    data: { tenantId, name: "Radiofrecuencia corporal", durationMin: 45, price: 25000 },
  });

  // Lunes a sábado, 9 a 19hs por defecto (se ajusta después desde Catálogo).
  const mondayToSaturday = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    tenantId,
    dayOfWeek,
    startTime: "09:00",
    endTime: "19:00",
  }));

  await prisma.professional.create({
    data: {
      tenantId,
      name: "Laura Gómez",
      phone: "1122334455",
      boxId: box1.id,
      services: { connect: [{ id: masajes.id }, { id: masajePiedras.id }] },
      workingHours: { create: mondayToSaturday },
    },
  });

  await prisma.professional.create({
    data: {
      tenantId,
      name: "Marina Suárez",
      phone: "1133445566",
      boxId: box2.id,
      services: { connect: [{ id: limpiezaFacial.id }, { id: peeling.id }] },
      workingHours: { create: mondayToSaturday },
    },
  });

  await prisma.professional.create({
    data: {
      tenantId,
      name: "Carla Díaz",
      phone: "1144556677",
      boxId: box3.id,
      services: {
        connect: [{ id: radiofrecuencia.id }, { id: peeling.id }],
      },
      workingHours: { create: mondayToSaturday },
    },
  });

  await prisma.client.create({
    data: { tenantId, name: "Sofía Pérez", phone: "1155667788", email: "sofia@example.com" },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
