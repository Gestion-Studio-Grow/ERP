// R6: la cuenta de los turnos que esperan a que se cobre el saldo, contra Postgres. Sólo lectura.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { leerTurnosEsperandoSaldo } from "@/lib/reports/comisiones-lectura";

test("contra Postgres: cuenta sólo los terminados, sin liquidar y con saldo, de ese negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const duenio = await prismaComoDuenio(base);
  const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000);

  const negocio = async (tenantId: string) => {
    const box = await duenio.box.create({ data: { tenantId, name: "Box" } });
    const servicio = await duenio.service.create({ data: { tenantId, name: "Masaje", durationMin: 60, price: 15000 } });
    const pro = await duenio.professional.create({ data: { tenantId, name: "Laura", boxId: box.id, commissionPercent: 40, services: { connect: [{ id: servicio.id }] } } });
    let n = 0;
    return async (o: { status?: "COMPLETED" | "PENDING"; pagado: number }) => {
      const cliente = await duenio.client.create({ data: { tenantId, name: `Ana ${++n}`, phone: `11300${tenantId.slice(-3)}${n}` } });
      const a = await duenio.appointment.create({
        data: {
          tenantId,
          clientId: cliente.id,
          professionalId: pro.id,
          serviceId: servicio.id,
          boxId: box.id,
          startsAt: hace(3 + n * 2),
          endsAt: hace(2 + n * 2),
          status: o.status ?? "COMPLETED",
          priceAtBooking: 15000,
        },
      });
      if (o.pagado > 0) await duenio.payment.create({ data: { tenantId, appointmentId: a.id, amount: o.pagado, method: "EFECTIVO", status: "APPROVED" } });
      return a.id;
    };
  };

  const turnoA = await negocio(base.a.id);
  assert.equal(await leerTurnosEsperandoSaldo(duenio, base.a.id), 0, "sin turnos no hay nada que decir");

  await turnoA({ pagado: 15000 });
  await turnoA({ status: "PENDING", pagado: 0 });
  assert.equal(await leerTurnosEsperandoSaldo(duenio, base.a.id), 0, "saldado o sin terminar no esperan");

  await turnoA({ pagado: 5000 });
  await turnoA({ pagado: 0 });
  assert.equal(await leerTurnosEsperandoSaldo(duenio, base.a.id), 2, "con seña y sin cobrar nada, los dos esperan");

  const turnoB = await negocio(base.b.id);
  await turnoB({ pagado: 0 });
  assert.equal(await leerTurnosEsperandoSaldo(duenio, base.a.id), 2, "los de otro negocio no cuentan");
  assert.equal(await leerTurnosEsperandoSaldo(duenio, base.b.id), 1);
});
