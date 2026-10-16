/**
 * UAT 16/10 (B8), EJECUTADO contra Postgres con RLS y ARCA en modo stub: si la factura del turno
 * queda rechazada al completarlo, `completeAppointment` (la Server Action real, con la sesión de
 * la dueña) termina el turno igual y DEVUELVE el aviso para recepción. Antes quedaba sólo en el
 * log del servidor.
 *
 * El rechazo es uno real del despacho: un consumidor final sin identificar desde el umbral de la
 * RG 5700 (la misma tabla de vigencias que usa la decisión fiscal).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, vigenteEn } from "@/lib/fiscal/vigencias";

test("completar un turno cuya factura ARCA rechaza: el turno queda terminado y recepción ve el aviso", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const duenio = await prismaComoDuenio(base);
  const { completeAppointment } = await import("@/lib/actions");
  const { fechaFiscalDelDia } = await import("@/lib/libros/fecha-fiscal");
  const vig = vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, fechaFiscalDelDia());
  assert.ok(vig, "la tabla de vigencias tiene que tener un umbral vigente hoy");

  const tenantId = base.a.id;
  await duenio.tenant.update({ where: { id: tenantId }, data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true } });
  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const pro = await duenio.professional.create({ data: { tenantId, name: "Carla", boxId: box.id } });

  /** Un turno de hace dos horas, ya pagado entero: completarlo no cobra nada, sólo factura. */
  const turnoPagado = async (precio: number, horasAtras: number) => {
    const service = await duenio.service.create({ data: { tenantId, name: `Servicio ${precio}`, durationMin: 60, price: precio } });
    const startsAt = new Date(Date.now() - horasAtras * 3_600_000);
    const ap = await duenio.appointment.create({
      data: {
        tenantId,
        clientId: base.a.clientes[0],
        professionalId: pro.id,
        serviceId: service.id,
        boxId: box.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        status: "CONFIRMED",
        priceAtBooking: precio,
      },
    });
    await duenio.payment.create({ data: { tenantId, appointmentId: ap.id, amount: precio, method: "EFECTIVO", status: "APPROVED" } });
    return ap.id;
  };
  const completar = (appointmentId: string) => {
    const fd = new FormData();
    fd.set("appointmentId", appointmentId);
    return ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => completeAppointment(fd));
  };

  const rechazado = await turnoPagado(vig.valor, 3);
  const r = await completar(rechazado);
  assert.equal(r.tipo, "respuesta");
  const valor = r.tipo === "respuesta" ? r.valor : null;
  assert.ok(valor && valor.ok, "el turno tiene que quedar terminado aunque la factura no salga");
  assert.match(valor.ok ? (valor.aviso ?? "") : "", /^El turno quedó terminado, pero ARCA rechazó la factura \(.*identificar.*\)\. Quedó en Facturación/);
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: rechazado } })).status, "COMPLETED");
  assert.equal((await duenio.invoice.findFirstOrThrow({ where: { tenantId, appointmentId: rechazado } })).status, "REJECTED");

  // Un turno chico se factura bien: sin aviso.
  const bien = await completar(await turnoPagado(30_000, 2));
  assert.deepEqual(bien.tipo === "respuesta" && bien.valor, { ok: true });
});
