import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.payment.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.client.deleteMany();
  await prisma.serviceProduct.deleteMany();
  await prisma.product.deleteMany();
  await prisma.service.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.boxBlock.deleteMany();
  await prisma.box.deleteMany();

  const box1 = await prisma.box.create({ data: { name: "Box 1" } });
  const box2 = await prisma.box.create({ data: { name: "Box 2" } });
  const box3 = await prisma.box.create({ data: { name: "Box 3" } });

  const masajes = await prisma.service.create({
    data: { name: "Masaje descontracturante", durationMin: 60, price: 15000 },
  });
  const masajePiedras = await prisma.service.create({
    data: { name: "Masaje con piedras calientes", durationMin: 75, price: 18000 },
  });
  const limpiezaFacial = await prisma.service.create({
    data: { name: "Limpieza facial profunda", durationMin: 50, price: 20000 },
  });
  const peeling = await prisma.service.create({
    data: { name: "Peeling químico", durationMin: 40, price: 22000 },
  });
  const radiofrecuencia = await prisma.service.create({
    data: { name: "Radiofrecuencia corporal", durationMin: 45, price: 25000 },
  });

  await prisma.professional.create({
    data: {
      name: "Laura Gómez",
      phone: "1122334455",
      boxId: box1.id,
      services: { connect: [{ id: masajes.id }, { id: masajePiedras.id }] },
    },
  });

  await prisma.professional.create({
    data: {
      name: "Marina Suárez",
      phone: "1133445566",
      boxId: box2.id,
      services: { connect: [{ id: limpiezaFacial.id }, { id: peeling.id }] },
    },
  });

  await prisma.professional.create({
    data: {
      name: "Carla Díaz",
      phone: "1144556677",
      boxId: box3.id,
      services: {
        connect: [{ id: radiofrecuencia.id }, { id: peeling.id }],
      },
    },
  });

  await prisma.client.create({
    data: { name: "Sofía Pérez", phone: "1155667788", email: "sofia@example.com" },
  });

  console.log("Seed completo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
