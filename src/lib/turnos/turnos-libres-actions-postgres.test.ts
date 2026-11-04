/**
 * Vender · «Turnos libres» (`turnosLibresDelServicio`), EJECUTADO contra Postgres con RLS, con la
 * acción real y la sesión de cada negocio:
 *   · con el interruptor `agenda-interaccion` apagado contesta que no está prendido (no lee huecos);
 *   · prendido, A ve los huecos de SUS dos profesionales que hacen el servicio (y no la que no lo hace);
 *   · los huecos de A no aparecen en B: B con el servicio de A contesta «ya no está», y con el suyo
 *     ve sólo a su profesional;
 *   · un horario ocupado de A no se ofrece (el motor de siempre).
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, CANAL_INTERRUPTOR, PREFIJO_ACTOR_OPERADOR } from "@/cambios/interruptores";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;

test("Turnos libres: apagado no responde; prendido, A ve sus huecos y B no ve los de A", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);

  const negocio = async (tenantId: string, nombres: string[]) => {
    const peeling = await duenio.service.create({ data: { tenantId, name: "Peeling químico", durationMin: 60, price: 22000 } });
    const otro = await duenio.service.create({ data: { tenantId, name: "Cejas", durationMin: 30, price: 8000 } });
    const profs = [];
    for (const [i, name] of nombres.entries()) {
      const box = await duenio.box.create({ data: { tenantId, name: `Box ${i + 1}` } });
      const p = await duenio.professional.create({ data: { tenantId, name, boxId: box.id, services: { connect: [{ id: peeling.id }] } } });
      await duenio.workingHours.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId, professionalId: p.id, dayOfWeek, startTime: "09:00", endTime: "18:00" })),
      });
      profs.push({ id: p.id, boxId: box.id });
    }
    // Una que NO hace peeling: no tiene que aparecer.
    const box = await duenio.box.create({ data: { tenantId, name: "Box cejas" } });
    const sinPeeling = await duenio.professional.create({ data: { tenantId, name: "Zoe", boxId: box.id, services: { connect: [{ id: otro.id }] } } });
    return { peeling: peeling.id, profs, sinPeeling: sinPeeling.id };
  };
  const a = await negocio(base.a.id, ["Laura", "Marina"]);
  const b = await negocio(base.b.id, ["Bea"]);
  const prender = (tenantId: string) =>
    duenio.auditLog.create({
      data: { tenantId, entity: ENTIDAD_INTERRUPTOR, entityId: "agenda-interaccion", action: ACCION_ENCENDER, channel: CANAL_INTERRUPTOR, actor: PREFIJO_ACTOR_OPERADOR + "test" },
    });

  const { turnosLibresDelServicio } = await import("@/lib/turnos/turnos-libres-actions");
  const comoA = (id: string) => ejecutarAccion({ negocio: base.a, usuario: base.a.recepcion }, () => turnosLibresDelServicio(id));
  const comoB = (id: string) => ejecutarAccion({ negocio: base.b, usuario: base.b.recepcion }, () => turnosLibresDelServicio(id));

  // Apagado: no se lee nada.
  const apagado = await comoA(a.peeling);
  assert.equal(apagado.tipo, "respuesta");
  assert.equal(apagado.tipo === "respuesta" && apagado.valor.ok, false);

  await prender(base.a.id);
  await prender(base.b.id);

  // Mañana a las 10 (Buenos Aires), Laura ocupada una hora: ese horario no se ofrece para ella.
  const manana = dateStrInBusinessTz(new Date(Date.now() + DIA));
  const diez = new Date(`${manana}T10:00:00-03:00`);
  const cli = await duenio.client.create({ data: { tenantId: base.a.id, name: "Ocupa a Laura", phone: "1140007777" } });
  await duenio.appointment.create({
    data: { tenantId: base.a.id, clientId: cli.id, professionalId: a.profs[0].id, serviceId: a.peeling, boxId: a.profs[0].boxId, startsAt: diez, endsAt: new Date(diez.getTime() + 60 * 60_000), status: "CONFIRMED", priceAtBooking: 22000 },
  });

  const rA = await comoA(a.peeling);
  assert.equal(rA.tipo, "respuesta");
  if (rA.tipo !== "respuesta" || !rA.valor.ok) throw new Error(`A no recibió huecos: ${JSON.stringify(rA)}`);
  assert.deepEqual(rA.valor.profesionales.map((p) => p.nombre), ["Laura", "Marina"]);
  assert.equal(rA.valor.puedeDarTurno, true);
  const laura = rA.valor.profesionales[0];
  const marina = rA.valor.profesionales[1];
  assert.ok((marina.huecos[manana] ?? []).includes(diez.toISOString()), "Marina está libre mañana a las 10");
  assert.ok(!(laura.huecos[manana] ?? []).includes(diez.toISOString()), "Laura, ocupada a las 10, no ofrece ese horario");
  assert.ok((laura.huecos[manana] ?? []).length > 0, "Laura tiene otros huecos mañana");
  const idsDeA = new Set(rA.valor.profesionales.map((p) => p.id));
  assert.ok(!idsDeA.has(a.sinPeeling));

  // B con el servicio de A: no existe para B. Con el suyo: sólo Bea, ningún id de A.
  const cruzado = await comoB(a.peeling);
  assert.equal(cruzado.tipo === "respuesta" && cruzado.valor.ok, false);
  const rB = await comoB(b.peeling);
  if (rB.tipo !== "respuesta" || !rB.valor.ok) throw new Error(`B no recibió huecos: ${JSON.stringify(rB)}`);
  assert.deepEqual(rB.valor.profesionales.map((p) => p.nombre), ["Bea"]);
  assert.ok(rB.valor.profesionales.every((p) => !idsDeA.has(p.id)));
  // El turno de Laura (A) no le quita nada a Bea (B): mañana a las 10 está libre.
  assert.ok((rB.valor.profesionales[0].huecos[manana] ?? []).includes(diez.toISOString()));
});
