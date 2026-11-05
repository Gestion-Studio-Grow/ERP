// La historia de una clienta CONTRA POSTGRES, con el rol de la app (app_rls, sin BYPASSRLS) y RLS
// encendido, en dos negocios:
//   · el negocio B no ve la historia de una clienta de A (ni con su id);
//   · una PROFESIONAL no abre una clienta que nunca atendió; la suya, sí, con plata sólo de sus turnos;
//   · la recepción ve los turnos y cómo terminaron, sin notas, plata ni rastro;
//   · los filtros y el paginado de 20 cortan en la base.
// Base: una efímera propia (src/test/base-efimera.ts); sin Postgres local se saltea (en CI falla).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { SIN_FILTROS_DE_HISTORIA } from "./historia-core";

const H = 3_600_000;

test("contra Postgres (app_rls + RLS): la historia sólo se abre en su negocio y para quien puede verla", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const tenantId = base.a.id;

  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas completas", durationMin: 45, price: 14000 } });
  const cejas = await duenio.service.create({ data: { tenantId, name: "Cejas", durationMin: 30, price: 6000 } });
  const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id } });
  const vero = await duenio.professional.create({ data: { tenantId, name: "Vero", boxId: box.id } });
  const laura = await duenio.client.create({ data: { tenantId, name: "Laura Gómez", phone: "11 5566-7788" } });
  const marta = await duenio.client.create({ data: { tenantId, name: "Marta Ríos", phone: "11 5566-1234" } });
  const ahora = Date.now();
  const turno = async (clientId: string, professionalId: string, serviceId: string, enDias: number, status: "COMPLETED" | "NO_SHOW" | "CANCELLED" | "PENDING", notes: string | null = null) => {
    const startsAt = new Date(ahora + enDias * 24 * H);
    return (
      await duenio.appointment.create({
        data: { tenantId, clientId, professionalId, serviceId, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + 45 * 60_000), status, priceAtBooking: 14000, notes },
      })
    ).id;
  };
  const deCaro = await turno(laura.id, caro.id, piernas.id, -10, "COMPLETED", "Piel sensible");
  const deVero = await turno(laura.id, vero.id, cejas.id, -5, "NO_SHOW");
  await turno(marta.id, vero.id, piernas.id, -3, "COMPLETED", "Alergia al látex");
  // 22 turnos viejos más de Laura con Vero, para el paginado.
  for (let i = 0; i < 22; i++) await turno(laura.id, vero.id, cejas.id, -100 - i, "COMPLETED");
  await duenio.collection.create({
    data: { tenantId, originType: "APPOINTMENT", originId: deCaro, appointmentId: deCaro, amount: 14000, method: "EFECTIVO", collectedBy: `user:${base.a.duenia.id}` },
  });
  await duenio.auditLog.create({ data: { tenantId, actor: `user:${base.a.recepcion.id}`, action: "no_show", entity: "Appointment", entityId: deVero, channel: "admin" } });
  await duenio.auditLog.create({
    data: { tenantId, actor: `user:${base.a.duenia.id}`, action: "complete", entity: "Appointment", entityId: deCaro, channel: "admin", changes: { saldoCobrado: { amount: 14000, method: "EFECTIVO" } } },
  });

  const { leerHistoriaDeLaClienta, clientasDeLaProfesional } = await import("./historia.server");
  const leer = (tid: string, clienteId: string, role: string, professionalId: string | null = null, f = SIN_FILTROS_DE_HISTORIA) =>
    leerHistoriaDeLaClienta(tid, clienteId, { role, professionalId }, f);

  // B no ve a Laura de A, ni con su id.
  assert.equal(await leer(base.b.id, laura.id, "OWNER"), null);

  // La dueña: todo, nuevo arriba, 20 por página.
  const duenia = await leer(tenantId, laura.id, "OWNER");
  assert.ok(duenia);
  assert.equal(duenia.total, 24);
  assert.equal(duenia.paginas, 2);
  assert.equal(duenia.turnos.length, 20);
  assert.deepEqual(duenia.turnos.slice(0, 2).map((x) => x.id), [deVero, deCaro]);
  const cerrado = duenia.turnos[1];
  assert.equal(cerrado.notaDelEquipo, "Piel sensible");
  assert.equal(cerrado.estado.quien, `Lo cerró ${base.a.duenia.nombre}`);
  assert.equal(cerrado.cobrado, 14000);
  assert.ok(cerrado.rastro.length >= 1);
  assert.equal(duenia.turnos[0].estado.texto, "No vino");
  assert.deepEqual(duenia.opciones.profesionales.map((p) => p.nombre), ["Caro", "Vero"]);
  const pagina2 = await leer(tenantId, laura.id, "OWNER", null, { ...SIN_FILTROS_DE_HISTORIA, pagina: 2 });
  assert.equal(pagina2?.turnos.length, 4);
  const soloCaro = await leer(tenantId, laura.id, "OWNER", null, { ...SIN_FILTROS_DE_HISTORIA, profesional: caro.id });
  assert.deepEqual(soloCaro?.turnos.map((x) => x.id), [deCaro]);
  const conFechas = await leer(tenantId, laura.id, "OWNER", null, {
    ...SIN_FILTROS_DE_HISTORIA,
    desde: new Date(ahora - 30 * 24 * H).toISOString().slice(0, 10),
    hasta: new Date(ahora).toISOString().slice(0, 10),
  });
  assert.equal(conFechas?.total, 2);

  // La recepción: el turno y cómo terminó; sin notas, plata ni rastro (pero sí quién lo cerró).
  const recepcion = await leer(tenantId, laura.id, "RECEPTION");
  const r = recepcion?.turnos[1];
  assert.equal(r?.notaDelEquipo, null);
  assert.equal(r?.cobrado, null);
  assert.deepEqual(r?.rastro, []);
  assert.equal(r?.estado.quien, `Lo cerró ${base.a.duenia.nombre}`);

  // Caro (profesional): abre a Laura (la atendió), no a Marta (nunca la atendió).
  assert.equal(await leer(tenantId, marta.id, "PROFESSIONAL", caro.id), null);
  assert.equal(await leer(tenantId, laura.id, "PROFESSIONAL", null), null, "sin profesional vinculada, ninguna");
  const deCaroVe = await leer(tenantId, laura.id, "PROFESSIONAL", caro.id);
  assert.ok(deCaroVe);
  const suyo = deCaroVe.turnos.find((x) => x.id === deCaro)!;
  const ajeno = deCaroVe.turnos.find((x) => x.id === deVero)!;
  assert.equal(suyo.cobrado, 14000, "la plata de su turno");
  assert.equal(ajeno.cobrado, null, "la de Vero, no");
  assert.equal(suyo.notaDelEquipo, "Piel sensible");
  assert.doesNotMatch(ajeno.rastro.map((x) => x.frase).join(" "), /\$/);
  // Y su buscador sólo trae sus clientas; en otro negocio, ninguna.
  assert.deepEqual((await clientasDeLaProfesional(tenantId, caro.id, "")).map((c) => c.nombre), ["Laura Gómez"]);
  assert.deepEqual((await clientasDeLaProfesional(tenantId, vero.id, "rí")).map((c) => c.nombre), ["Marta Ríos"]);
  assert.deepEqual(await clientasDeLaProfesional(base.b.id, caro.id, ""), []);
});
