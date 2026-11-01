/**
 * El aviso de la pantalla de comisiones no corta antes de saber qué turnos son un caso real (cert ronda 2,
 * V2-3). En su propio archivo: la app se apunta a una sola base efímera por proceso.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("el aviso de comisiones no esconde un caso real detrás de muchos turnos anulados y vueltos a cobrar (cert ronda 2, V2-3)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const { a } = base;
  const duenio = await prismaComoDuenio(base);
  const { getCommissionsOverview } = await import("@/lib/commission-actions");

  const box = await duenio.box.create({ data: { tenantId: a.id, name: "Box" } });
  const servicio = await duenio.service.create({ data: { tenantId: a.id, name: "Masaje", durationMin: 60, price: 15_000 } });
  const profesional = await duenio.professional.create({
    data: { tenantId: a.id, name: "Macarena", boxId: box.id, commissionPercent: 40, services: { connect: [{ id: servicio.id }] } },
  });
  const clienta = await duenio.client.create({ data: { tenantId: a.id, name: "Clienta", phone: "1170000000" } });
  const pago = await duenio.commissionPayout.create({
    data: { tenantId: a.id, professionalId: profesional.id, amount: 6_000, appointmentCount: 1, periodStart: new Date(0), periodEnd: new Date(), settledBy: "test" },
  });
  const inicioDe = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 3_600_000);
  const turno = (i: number) => ({
    id: `turno-${i}`,
    tenantId: a.id,
    clientId: clienta.id,
    professionalId: profesional.id,
    serviceId: servicio.id,
    boxId: box.id,
    startsAt: inicioDe(i),
    endsAt: new Date(inicioDe(i).getTime() + 1_800_000),
    status: "COMPLETED" as const,
    priceAtBooking: 15_000,
    commissionPayoutId: pago.id,
  });
  const fila = (i: number, amount: number, note: string) => ({
    tenantId: a.id,
    originType: "APPOINTMENT" as const,
    originId: `turno-${i}`,
    appointmentId: `turno-${i}`,
    amount,
    method: "EFECTIVO" as const,
    note,
    collectedBy: "test",
    createdAt: new Date(pago.createdAt.getTime() + 60_000),
  });
  const leer = async () => {
    const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => getCommissionsOverview());
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: Awaited<ReturnType<typeof getCommissionsOverview>> }).valor.conCobroAnulado.map((c) => c.turnoId);
  };

  // Un turno viejo anulado de verdad y, más nuevos, 60 anulados y vueltos a cobrar, que no avisan.
  const recobrados = Array.from({ length: 60 }, (_, i) => 100 + i);
  await duenio.appointment.createMany({ data: [turno(0), ...recobrados.map(turno)] });
  await duenio.collection.createMany({
    data: [fila(0, -15_000, "ANULACION:x0 — motivo"), ...recobrados.flatMap((i) => [fila(i, -15_000, `ANULACION:x${i} — motivo`), fila(i, 15_000, "Volvió a cobrarse")])],
  });
  assert.deepEqual(await leer(), ["turno-0"]);

  // Y si los casos reales son más de 50, se ven todos, del más nuevo al más viejo.
  const reales = Array.from({ length: 60 }, (_, i) => 200 + i);
  await duenio.appointment.createMany({ data: reales.map(turno) });
  await duenio.collection.createMany({ data: reales.map((i) => fila(i, -15_000, `ANULACION:x${i} — motivo`)) });
  assert.deepEqual(await leer(), [...reales.map((i) => `turno-${i}`).reverse(), "turno-0"]);
});
