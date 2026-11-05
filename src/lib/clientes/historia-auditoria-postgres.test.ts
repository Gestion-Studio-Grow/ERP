// La auditoría ESTRICTA de la historia CONTRA POSTGRES, con el rol de la app (app_rls, sin BYPASSRLS)
// y RLS encendido. Archivo aparte de historia-postgres.test.ts: el Prisma de la app es un singleton por
// proceso y cada test de ahí usa su propia base efímera. Sin Postgres local se saltea (en CI falla).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { SIN_FILTROS_DE_HISTORIA } from "./historia-core";

const H = 3_600_000;

// La auditoría ESTRICTA de la historia (datos de salud): cada apertura deja `historia_vista`, cada
// intento que no se abre deja `historia_denegada` con el motivo, y si el registro no se escribe la
// historia no se devuelve. El registro de un negocio no se ve desde otro.
test("contra Postgres (app_rls + RLS): abrir una historia se audita en modo estricto, también lo denegado", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const tenantId = base.a.id;

  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas completas", durationMin: 45, price: 14000 } });
  const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id } });
  const vero = await duenio.professional.create({ data: { tenantId, name: "Vero", boxId: box.id } });
  const laura = await duenio.client.create({ data: { tenantId, name: "Laura Gómez", phone: "11 5566-7788" } });
  const marta = await duenio.client.create({ data: { tenantId, name: "Marta Ríos", phone: "11 5566-1234" } });
  const startsAt = new Date(Date.now() - 24 * H);
  for (const [clientId, professionalId] of [[laura.id, caro.id], [marta.id, vero.id]]) {
    await duenio.appointment.create({
      data: { tenantId, clientId, professionalId, serviceId: servicio.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + 45 * 60_000), status: "COMPLETED", priceAtBooking: 14000, notes: "Alergia al látex" },
    });
  }

  const { abrirHistoriaDeLaClienta } = await import("./historia.server");
  const { tenantTransaction } = await import("@/lib/rls");
  const { ACCION_HISTORIA_DENEGADA, ACCION_HISTORIA_VISTA } = await import("./historia-core");
  const registros = (tid: string) =>
    duenio.auditLog.findMany({ where: { tenantId: tid, action: { in: [ACCION_HISTORIA_VISTA, ACCION_HISTORIA_DENEGADA] } }, orderBy: { createdAt: "asc" } });
  const duenia = `user:${base.a.duenia.id}`;

  // La dueña abre a Laura: 1 registro, con quién, qué clienta y qué página.
  const abierta = await abrirHistoriaDeLaClienta(tenantId, laura.id, { role: "OWNER", professionalId: null }, SIN_FILTROS_DE_HISTORIA, duenia);
  assert.equal(abierta?.clienta.id, laura.id);
  let filas = await registros(tenantId);
  assert.equal(filas.length, 1);
  assert.deepEqual(
    { actor: filas[0].actor, action: filas[0].action, entity: filas[0].entity, entityId: filas[0].entityId, channel: filas[0].channel, changes: filas[0].changes },
    { actor: duenia, action: ACCION_HISTORIA_VISTA, entity: "Client", entityId: laura.id, channel: "admin", changes: { pagina: 1, filtros: false } },
  );

  // Caro (profesional) pide a Marta, que nunca atendió: no ve nada y queda `historia_denegada`.
  const caroUser = `user:caro-${caro.id}`;
  assert.equal(await abrirHistoriaDeLaClienta(tenantId, marta.id, { role: "PROFESSIONAL", professionalId: caro.id }, SIN_FILTROS_DE_HISTORIA, caroUser), null);
  // Un id de otro negocio, y un rol que la historia no conoce.
  const deB = base.b.clientes[0];
  assert.equal(await abrirHistoriaDeLaClienta(tenantId, deB, { role: "OWNER", professionalId: null }, SIN_FILTROS_DE_HISTORIA, duenia), null);
  assert.equal(await abrirHistoriaDeLaClienta(tenantId, laura.id, { role: "ADMIN", professionalId: null }, SIN_FILTROS_DE_HISTORIA, duenia), null);
  filas = await registros(tenantId);
  const denegadas = filas.filter((f) => f.action === ACCION_HISTORIA_DENEGADA).map((f) => ({ actor: f.actor, entityId: f.entityId, motivo: (f.changes as { motivo: string }).motivo }));
  assert.deepEqual(denegadas, [
    { actor: caroUser, entityId: marta.id, motivo: "sin turno con ella" },
    { actor: duenia, entityId: deB, motivo: "otro negocio" },
    { actor: duenia, entityId: laura.id, motivo: "rol" },
  ]);
  assert.equal(filas.filter((f) => f.action === ACCION_HISTORIA_VISTA).length, 1, "lo denegado no cuenta como vista");

  // Si el registro no se puede escribir, la historia NO se devuelve (y no queda nada a medias).
  await duenio.$executeRawUnsafe(`
    CREATE FUNCTION historia_falla_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.actor = 'user:falla' THEN RAISE EXCEPTION 'auditoria caida (simulada)'; END IF; RETURN NEW; END $$`);
  await duenio.$executeRawUnsafe(`CREATE TRIGGER historia_falla_auditoria BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION historia_falla_auditoria()`);
  await assert.rejects(abrirHistoriaDeLaClienta(tenantId, laura.id, { role: "OWNER", professionalId: null }, SIN_FILTROS_DE_HISTORIA, "user:falla"), /auditoria caida/);
  await assert.rejects(abrirHistoriaDeLaClienta(tenantId, marta.id, { role: "PROFESSIONAL", professionalId: caro.id }, SIN_FILTROS_DE_HISTORIA, "user:falla"), /auditoria caida/);
  assert.equal((await registros(tenantId)).length, 4, "ningún registro nuevo");

  // El negocio B no ve los registros de A (RLS), ni pidiéndolos con el tenantId de A.
  const desdeB = await tenantTransaction(
    async (tx) => ({
      todos: await tx.auditLog.count({ where: { action: { in: [ACCION_HISTORIA_VISTA, ACCION_HISTORIA_DENEGADA] } } }),
      deA: await tx.auditLog.count({ where: { tenantId } }),
    }),
    { tenantId: base.b.id },
  );
  assert.deepEqual(desdeB, { todos: 0, deA: 0 });
});
