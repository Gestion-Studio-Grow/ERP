// «Hoy» del Inicio, EJECUTADO contra Postgres con RLS (app_rls): dos negocios en la misma base, y los
// turnos, cobros, ventas y señas de B no aparecen en el Hoy de A (ni al revés). Lecciones MT-1/MT-5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("contra Postgres: el Hoy de A no ve los cobros, turnos ni señas de B", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { businessWallTimeToUtc, dateStrInBusinessTz } = await import("@/lib/datetime");
  const { nextDayKey } = await import("@/lib/caja/cierre-diario");
  const { leerHoyDelNegocio } = await import("./lector");

  const hoy = dateStrInBusinessTz(new Date());
  const manana = nextDayKey(hoy);
  const a = laBase.a.id;
  const b = laBase.b.id;

  async function agenda(tenantId: string, nombre: string) {
    const box = await duenio.box.create({ data: { tenantId, name: `Box ${nombre}` } });
    const servicio = await duenio.service.create({ data: { tenantId, name: `Piernas ${nombre}`, durationMin: 30, price: 14_000, depositAmount: 5_000 } });
    const pro = await duenio.professional.create({ data: { tenantId, name: `Caro ${nombre}`, boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
    const clienta = await duenio.client.create({ data: { tenantId, name: `Clienta ${nombre}`, phone: `11400${nombre === "A" ? "1" : "2"}1111` } });
    return async (dia: string, hora: string, status: "PENDING" | "COMPLETED" | "CONFIRMED", seniaPedida = false) => {
      const startsAt = businessWallTimeToUtc(dia, hora);
      const turno = await duenio.appointment.create({
        data: { tenantId, clientId: clienta.id, professionalId: pro.id, serviceId: servicio.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), status, priceAtBooking: 14_000 },
      });
      if (seniaPedida) {
        await duenio.auditLog.create({ data: { tenantId, actor: "user:seed", action: "deposit_requested", entity: "Appointment", entityId: turno.id, channel: "admin" } });
      }
      return turno.id;
    };
  }

  const turnoA = await agenda(a, "A");
  await turnoA(hoy, "10:00", "COMPLETED");
  const seniaA = await turnoA(hoy, "16:00", "PENDING", true);

  const turnoB = await agenda(b, "B");
  await turnoB(hoy, "09:00", "COMPLETED");
  await turnoB(hoy, "11:00", "CONFIRMED");
  await turnoB(hoy, "12:00", "CONFIRMED");
  const seniaB = await turnoB(manana, "10:00", "PENDING", true);

  const venta = (tenantId: string, method: "EFECTIVO" | "MP", amount: number) => ({
    tenantId,
    type: "VENTA" as const,
    method,
    amount,
    occurredAt: businessWallTimeToUtc(hoy, "12:00"),
    createdBy: "seed",
  });
  await duenio.cashMovement.createMany({ data: [venta(a, "EFECTIVO", 5_000), venta(b, "EFECTIVO", 7_000), venta(b, "MP", 9_000)] });

  const desde = businessWallTimeToUtc(hoy, "00:00");
  const hasta = businessWallTimeToUtc(manana, "00:00");
  const ventasDe = (tenantId: string) => duenio.order.count({ where: { tenantId, createdAt: { gte: desde, lt: hasta }, status: { not: "CANCELLED" } } });
  const [ventasA, ventasB] = await Promise.all([ventasDe(a), ventasDe(b)]);

  const hoyA = await leerHoyDelNegocio(a, hoy);
  assert.deepEqual(hoyA.sinLeer, [], "todo se pudo leer");
  assert.deepEqual(hoyA.cobrado?.filas.map((f) => [f.etiqueta, f.monto]), [["Efectivo", 5_000]]);
  assert.equal(hoyA.cobrado?.total, 5_000);
  assert.deepEqual(hoyA.turnos, { total: 2, atendidos: 1, faltan: 1, noVinieron: 0 });
  assert.deepEqual(hoyA.senias?.map((s) => s.id), [seniaA]);
  assert.equal(hoyA.ventas?.cantidad, ventasA);

  const hoyB = await leerHoyDelNegocio(b, hoy);
  assert.deepEqual(hoyB.sinLeer, []);
  assert.equal(hoyB.cobrado?.total, 16_000);
  assert.deepEqual(hoyB.turnos, { total: 3, atendidos: 1, faltan: 2, noVinieron: 0 });
  assert.deepEqual(hoyB.senias?.map((s) => s.id), [seniaB]);
  assert.equal(hoyB.ventas?.cantidad, ventasB);
});
