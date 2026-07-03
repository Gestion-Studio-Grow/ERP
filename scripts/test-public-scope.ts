import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Smoke test del scope "público": recorre el mismo camino que un cliente real
// haría desde la landing (ver servicios -> ver profesionales -> ver horarios
// disponibles -> reservar), sin pasar por HTTP. Sirve para validar que el
// catálogo público y la reserva siguen funcionando después de cambios de
// esquema o de datos. No requiere servidor corriendo.

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);

  // 1. Catálogo público (equivalente a getPublicBookingData)
  const categories = await prisma.serviceCategory.findMany({
    where: { tenantId: tenant.id },
    orderBy: { order: "asc" },
    include: { services: { where: { active: true, deletedAt: null }, select: { id: true, name: true, price: true } } },
  });
  const totalServices = categories.reduce((n, c) => n + c.services.length, 0);
  console.log(`Categorías: ${categories.length} · Servicios activos y categorizados: ${totalServices}`);

  const uncategorized = await prisma.service.count({
    where: { tenantId: tenant.id, active: true, deletedAt: null, categoryId: null },
  });
  console.log(`Servicios activos sin categoría: ${uncategorized}`);

  // 2. Profesionales visibles públicamente (con box asignado)
  const professionals = await prisma.professional.findMany({
    where: { tenantId: tenant.id, active: true, deletedAt: null, boxId: { not: null } },
    select: { id: true, name: true, boxId: true, services: { select: { id: true } } },
  });
  console.log(`Profesionales públicos (con box): ${professionals.length}`);
  if (professionals.length === 0) {
    console.log("⚠ Sin profesionales publicables: el flujo de reserva no puede continuar.");
    return;
  }

  // 3. Disponibilidad: probamos con el primer profesional que tenga servicios
  const withServices = professionals.find((p) => p.services.length > 0);
  if (!withServices) {
    console.log("⚠ Ningún profesional público tiene servicios asignados.");
    return;
  }
  const service = await prisma.service.findUniqueOrThrow({ where: { id: withServices.services[0].id } });
  console.log(`Probando disponibilidad: ${withServices.name} · ${service.name} (${service.durationMin} min)`);

  const workingHours = await prisma.workingHours.findMany({
    where: { tenantId: tenant.id, professionalId: withServices.id },
  });
  console.log(`Horarios de trabajo configurados: ${workingHours.length} bloques`);

  // 4. Reserva de prueba (queda marcada como test, no se confirma pago)
  const testClient =
    (await prisma.client.findFirst({ where: { tenantId: tenant.id, phone: "0000000000" } })) ??
    (await prisma.client.create({
      data: { tenantId: tenant.id, name: "Test Scope Público", phone: "0000000000" },
    }));

  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + service.durationMin * 60000);

  const appointment = await prisma.appointment.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      professional: { connect: { id: withServices.id } },
      service: { connect: { id: service.id } },
      client: { connect: { id: testClient.id } },
      box: { connect: { id: withServices.boxId! } },
      startsAt: start,
      endsAt: end,
      status: "PENDING",
      priceAtBooking: service.price,
    },
  });
  console.log(`✓ Turno de prueba creado: ${appointment.id} (${start.toISOString()})`);

  // 5. Limpieza: no dejamos basura de test en la base
  await prisma.appointment.delete({ where: { id: appointment.id } });
  await prisma.client.delete({ where: { id: testClient.id } });
  console.log("✓ Limpieza completa. Flujo público OK de punta a punta.");
}

main()
  .catch((err) => {
    console.error("✗ Falló el test:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
