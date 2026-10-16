/**
 * La reserva de turnos (UAT 16/10, B5–B7), EJECUTADA contra Postgres con RLS: las Server Actions
 * reales, anónimas (la web de la clienta) o con la sesión de la dueña (el mostrador).
 *
 *   · B5 — no se ofrece ni se acepta un horario de hoy que ya empezó (la web); el mostrador sí
 *     puede cargar uno en curso (la clienta llegó sin turno).
 *   · B6 — el servidor no reserva ni reprograma un servicio con un profesional que no lo hace
 *     (ADR-055); antes sólo lo filtraba la pantalla.
 *   · B7 — las acciones públicas DEVUELVEN el motivo en castellano en vez de tirar (tirado, en
 *     producción llega un genérico en inglés).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const TELEFONO = "11 4000 7919";

type Sembrado = { base: BaseEfimera; hace: string; noHace: string; carla: string; juli: string; manana: string };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const tenantId = base.a.id;
  const box1 = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const box2 = await duenio.box.create({ data: { tenantId, name: "Box 2" } });
  const hace = await duenio.service.create({ data: { tenantId, name: "Limpieza facial", durationMin: 60, price: 30000 } });
  const noHace = await duenio.service.create({ data: { tenantId, name: "Depilación láser", durationMin: 30, price: 20000 } });
  // Carla hace la limpieza; Juli sólo la depilación. Las dos trabajan todos los días, todo el día.
  const carla = await duenio.professional.create({
    data: { tenantId, name: "Carla", boxId: box1.id, services: { connect: [{ id: hace.id }] } },
  });
  const juli = await duenio.professional.create({
    data: { tenantId, name: "Juli", boxId: box2.id, services: { connect: [{ id: noHace.id }] } },
  });
  for (const professionalId of [carla.id, juli.id]) {
    await duenio.workingHours.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ tenantId, professionalId, dayOfWeek, startTime: "00:00", endTime: "23:30" })),
    });
  }
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const manana = new Date(new Date(`${todayInBusinessTz()}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  sembrado = { base, hace: hace.id, noHace: noHace.id, carla: carla.id, juli: juli.id, manana };
  return sembrado;
}

async function franjasDeManana(s: Sembrado): Promise<string[]> {
  const { getAvailableSlots } = await import("@/lib/actions");
  const r = await ejecutarAccion({ negocio: s.base.a }, () => getAvailableSlots(s.carla, s.hace, s.manana));
  assert.equal(r.tipo, "respuesta");
  return r.tipo === "respuesta" ? r.valor : [];
}

test("B5 · hoy no se ofrece ni se acepta en la web un horario que ya empezó", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { getAvailableSlots, createBookingFromModal } = await import("@/lib/actions");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const ahora = Date.now();
  const hoy = await ejecutarAccion({ negocio: s.base.a }, () => getAvailableSlots(s.carla, s.hace, todayInBusinessTz()));
  assert.equal(hoy.tipo, "respuesta");
  for (const iso of hoy.tipo === "respuesta" ? hoy.valor : []) {
    assert.ok(new Date(iso).getTime() >= ahora - 1000, `se ofreció ${iso}, que ya pasó`);
  }
  // Un pedido armado a mano con un horario de hace una hora, en media hora redonda.
  const pasado = new Date(Math.floor((ahora - 3_600_000) / 1_800_000) * 1_800_000).toISOString();
  const r = await ejecutarAccion({ negocio: s.base.a }, () =>
    createBookingFromModal({ professionalId: s.carla, serviceId: s.hace, startsAtIso: pasado, clientName: "Ana", clientPhone: TELEFONO }),
  );
  assert.equal(r.tipo, "respuesta");
  assert.deepEqual(r.tipo === "respuesta" && r.valor, { ok: false, error: "Ese horario ya pasó. Elegí otro horario." });
});

test("B6 · el servidor no reserva un servicio con quien no lo hace (web, formulario y mostrador)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { createBookingFromModal, createAppointment, createManualAppointment } = await import("@/lib/actions");
  const duenio = await prismaComoDuenio(s.base);
  const [horario] = await franjasDeManana(s);
  const antes = await duenio.appointment.count({ where: { tenantId: s.base.a.id } });
  const motivo = "Juli no hace Limpieza facial. Elegí otro profesional para ese servicio.";

  const modal = await ejecutarAccion({ negocio: s.base.a }, () =>
    createBookingFromModal({ professionalId: s.juli, serviceId: s.hace, startsAtIso: horario, clientName: "Ana", clientPhone: TELEFONO }),
  );
  assert.deepEqual(modal.tipo === "respuesta" && modal.valor, { ok: false, error: motivo });

  const datos = (extra: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ professionalId: s.juli, serviceId: s.hace, startsAt: horario, clientName: "Ana", clientPhone: TELEFONO, ...extra })) fd.set(k, v);
    return fd;
  };
  const formulario = await ejecutarAccion({ negocio: s.base.a }, () => createAppointment(datos()));
  assert.deepEqual(formulario.tipo === "respuesta" && formulario.valor, { ok: false, error: motivo });

  const mostrador = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.duenia }, () => createManualAppointment(datos({ status: "CONFIRMED" })));
  assert.deepEqual(mostrador.tipo === "respuesta" && mostrador.valor, { ok: false, error: motivo });

  assert.equal(await duenio.appointment.count({ where: { tenantId: s.base.a.id } }), antes, "no tenía que quedar ningún turno");
});

test("B6 · reprogramar desde la agenda a un profesional que no hace el servicio se rechaza con el motivo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { createBookingFromModal, rescheduleAppointment } = await import("@/lib/actions");
  const duenio = await prismaComoDuenio(s.base);
  const [, , horario] = await franjasDeManana(s);
  const alta = await ejecutarAccion({ negocio: s.base.a }, () =>
    createBookingFromModal({ professionalId: s.carla, serviceId: s.hace, startsAtIso: horario, clientName: "Ana", clientPhone: TELEFONO }),
  );
  assert.ok(alta.tipo === "respuesta" && alta.valor.ok, "la reserva válida tenía que entrar");
  const id = alta.tipo === "respuesta" && alta.valor.ok ? alta.valor.id : "";

  const fd = new FormData();
  fd.set("appointmentId", id);
  fd.set("startsAt", horario);
  fd.set("professionalId", s.juli);
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.duenia }, () => rescheduleAppointment(fd));
  assert.deepEqual(r.tipo === "respuesta" && r.valor, {
    ok: false,
    error: "Juli no hace Limpieza facial. Elegí un profesional que haga ese servicio.",
  });
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id } })).professionalId, s.carla);
});

test("B7 · la web devuelve el motivo en castellano: horario tomado, turno que no existe, éxito con redirección", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { createBookingFromModal, createAppointment } = await import("@/lib/actions");
  const { cancelMyAppointment, rescheduleMyAppointment } = await import("@/lib/client-actions");
  const [, , , , horario] = await franjasDeManana(s);
  const reservar = (nombre: string) =>
    ejecutarAccion({ negocio: s.base.a }, () =>
      createBookingFromModal({ professionalId: s.carla, serviceId: s.hace, startsAtIso: horario, clientName: nombre, clientPhone: TELEFONO }),
    );
  const primera = await reservar("Ana");
  assert.ok(primera.tipo === "respuesta" && primera.valor.ok);
  const segunda = await reservar("Bea");
  assert.deepEqual(segunda.tipo === "respuesta" && segunda.valor, {
    ok: false,
    error: "Ese horario ya no está disponible para este profesional. Elegí otro horario.",
  });

  // El formulario de /reserva: con datos válidos redirige a la confirmación (no devuelve nada).
  const [, , , , , , otro] = await franjasDeManana(s);
  const fd = new FormData();
  for (const [k, v] of Object.entries({ professionalId: s.carla, serviceId: s.hace, startsAt: otro, clientName: "Ana", clientPhone: TELEFONO })) fd.set(k, v);
  const ok = await ejecutarAccion({ negocio: s.base.a }, () => createAppointment(fd));
  assert.equal(ok.tipo, "redireccion");

  // La página "Tu turno" con un id que no es de este negocio (o no existe).
  const noExiste = new FormData();
  noExiste.set("id", "no-existe");
  noExiste.set("startsAt", horario);
  const turnoAjeno = { ok: false, error: "No encontramos ese turno. Revisá el link que te llegó por WhatsApp." };
  const cancelar = await ejecutarAccion({ negocio: s.base.a }, () => cancelMyAppointment(noExiste));
  assert.deepEqual(cancelar.tipo === "respuesta" && cancelar.valor, turnoAjeno);
  const mover = await ejecutarAccion({ negocio: s.base.a }, () => rescheduleMyAppointment(noExiste));
  assert.deepEqual(mover.tipo === "respuesta" && mover.valor, turnoAjeno);
  // El turno del negocio A, pedido desde el host del negocio B: tampoco se encuentra.
  const deA = new FormData();
  deA.set("id", primera.tipo === "respuesta" && primera.valor.ok ? primera.valor.id : "");
  const cruzado = await ejecutarAccion({ negocio: s.base.b }, () => cancelMyAppointment(deA));
  assert.deepEqual(cruzado.tipo === "respuesta" && cruzado.valor, turnoAjeno);
});
