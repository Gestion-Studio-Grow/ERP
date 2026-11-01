// UAT CH 31/10, E1: la comisión pagada por transferencia salía de Mercado Pago, porque la pantalla
// ofrecía «Transferencia / MP» y grababa `MP`. Contra la base y con la acción real: cada medio cae
// en SU columna del libro, y el monto sigue siendo el porcentaje de lo cobrado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra la base: la comisión por transferencia sale de Transferencia, y la de Mercado Pago, de Mercado Pago", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a } = laBase;
  const { settleCommissions } = await import("@/lib/commission-actions");
  const { olvidarTransferenciaEnElLibro } = await import("@/lib/caja/transferencia-en-el-libro");
  olvidarTransferenciaEnElLibro();

  const box = await duenio.box.create({ data: { tenantId: a.id, name: "Box" } });
  const servicio = await duenio.service.create({ data: { tenantId: a.id, name: "Masaje", durationMin: 60, price: 15_000 } });

  /** Una profesional al 40 % con un turno de $15.000 cobrado. */
  const profesionalConTurnoCobrado = async (nombre: string) => {
    const p = await duenio.professional.create({ data: { tenantId: a.id, name: nombre, boxId: box.id, commissionPercent: 40, services: { connect: [{ id: servicio.id }] } } });
    const clienta = await duenio.client.create({ data: { tenantId: a.id, name: `Clienta de ${nombre}`, phone: `11${Math.floor(Math.random() * 1e8)}` } });
    const inicio = new Date(Date.now() - 2 * 3_600_000);
    const turno = await duenio.appointment.create({
      data: { tenantId: a.id, clientId: clienta.id, professionalId: p.id, serviceId: servicio.id, boxId: box.id, startsAt: inicio, endsAt: new Date(inicio.getTime() + 3_600_000), status: "COMPLETED", priceAtBooking: 15_000 },
    });
    await duenio.payment.create({ data: { tenantId: a.id, appointmentId: turno.id, amount: 15_000, method: "EFECTIVO", status: "APPROVED" } });
    await duenio.collection.create({ data: { tenantId: a.id, originType: "APPOINTMENT", originId: turno.id, appointmentId: turno.id, amount: 15_000, method: "EFECTIVO", collectedBy: "test" } });
    return p;
  };

  const pagarPor = async (profesionalId: string, method: string) => {
    const f = new FormData();
    f.set("professionalId", profesionalId);
    f.set("method", method);
    const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => settleCommissions(f));
    assert.equal(r.tipo, "redireccion", `la liquidación no volvió a la pantalla: ${JSON.stringify(r)}`);
    assert.match(String((r as { destino?: string }).destino), /status=ok_settled/);
    const pago = await duenio.commissionPayout.findFirstOrThrow({ where: { tenantId: a.id, professionalId: profesionalId } });
    return duenio.cashMovement.findFirstOrThrow({ where: { tenantId: a.id, createdBy: `comision:${pago.id}` }, select: { type: true, method: true, amount: true, reason: true } });
  };

  // A mano: 40 % de $15.000 = $6.000. Los dos medios, el mismo monto: el medio no toca el cálculo.
  const porTransferencia = await pagarPor((await profesionalConTurnoCobrado("Macarena")).id, "TRANSFERENCIA");
  assert.deepEqual([porTransferencia.type, porTransferencia.method, Number(porTransferencia.amount)], ["EGRESO", "TRANSFERENCIA", 6_000]);
  assert.doesNotMatch(String(porTransferencia.reason), /asumido/, "el medio se eligió: no puede decir que se asumió");

  const porMercadoPago = await pagarPor((await profesionalConTurnoCobrado("Romina")).id, "MP");
  assert.deepEqual([porMercadoPago.type, porMercadoPago.method, Number(porMercadoPago.amount)], ["EGRESO", "MP", 6_000]);
});
