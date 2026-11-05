/**
 * EDITAR UN TURNO (agenda interactiva, pedido del dueño de CH), EJECUTADO contra Postgres con RLS: las
 * Server Actions reales (`editarTurno`, `opcionesParaEditar`, `huecosParaEditar`) con la sesión de la
 * recepción.
 *
 *   · cambiar servicio + hora + profesional: el MISMO turno, fin = inicio + duración del servicio
 *     nuevo, box de la profesional, precio vigente del servicio, audita `edit`; Deshacer vuelve EXACTO
 *     (precio congelado incluido);
 *   · sólo la hora: es la reprogramación de siempre (audita `reschedule`, conserva la duración);
 *   · solape rechazado; profesional que no hace el servicio rechazada;
 *   · turno con cobro: el servicio no cambia («Ya tiene un cobro…»), la hora sí;
 *   · un PROFESSIONAL no edita (no tiene agenda:manage); la recepción de otro negocio no lo ve;
 *   · concurrencia: editar y mover al mismo hueco a la vez → uno solo pasa, sin solape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const MIN = 60_000;

type Sembrado = {
  base: BaseEfimera;
  manana: string;
  caro: string;
  lu: string;
  vero: string;
  piernas: string;
  esmaltado: string;
  turno: (hhmm: string, o?: { profesional?: string; servicio?: string; minutos?: number; precio?: number }) => Promise<string>;
  tOtro: string;
  usuariaLu: { id: string };
  a: (hhmm: string) => string;
};
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const { todayInBusinessTz, businessWallTimeToUtc } = await import("@/lib/datetime");
  const manana = new Date(new Date(`${todayInBusinessTz()}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const a = (hhmm: string) => businessWallTimeToUtc(manana, hhmm).toISOString();

  const negocio = async (tenantId: string) => {
    const [b1, b2, b3] = await Promise.all(["Box 1", "Box 2", "Box 3"].map((name) => duenio.box.create({ data: { tenantId, name } })));
    const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas completas", durationMin: 60, price: 14000 } });
    const esmaltado = await duenio.service.create({ data: { tenantId, name: "Esmaltado", durationMin: 45, price: 9000 } });
    const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: b1.id, services: { connect: [{ id: piernas.id }] } } });
    const lu = await duenio.professional.create({ data: { tenantId, name: "Lu", boxId: b2.id, services: { connect: [{ id: piernas.id }] } } });
    const vero = await duenio.professional.create({ data: { tenantId, name: "Vero", boxId: b3.id, services: { connect: [{ id: esmaltado.id }] } } });
    for (const professionalId of [caro.id, lu.id, vero.id]) {
      await duenio.workingHours.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ tenantId, professionalId, dayOfWeek, startTime: "09:00", endTime: "20:00" })),
      });
    }
    const boxDe: Record<string, string> = { [caro.id]: b1.id, [lu.id]: b2.id, [vero.id]: b3.id };
    let n = 0;
    const turno: Sembrado["turno"] = async (hhmm, o = {}) => {
      const client = await duenio.client.create({ data: { tenantId, name: `Clienta ${n}`, phone: `11400050${String(n++).padStart(2, "0")}` } });
      const profesional = o.profesional ?? caro.id;
      const startsAt = new Date(a(hhmm));
      const t = await duenio.appointment.create({
        data: {
          tenantId,
          clientId: client.id,
          professionalId: profesional,
          serviceId: o.servicio ?? piernas.id,
          boxId: boxDe[profesional],
          startsAt,
          endsAt: new Date(startsAt.getTime() + (o.minutos ?? 60) * MIN),
          status: "PENDING",
          priceAtBooking: o.precio ?? 14000,
        },
      });
      return t.id;
    };
    return { caro: caro.id, lu: lu.id, vero: vero.id, piernas: piernas.id, esmaltado: esmaltado.id, turno };
  };
  // Editar turno vive detrás de «Agenda interactiva» (certificación del pase 05/11, F2): se prende en los dos negocios
  // por el canal del operador, como lo hace la consola.
  const { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, CANAL_INTERRUPTOR, AGENDA_INTERACCION } = await import("@/cambios/interruptores");
  await duenio.auditLog.createMany({
    data: [base.a.id, base.b.id].map((tenantId) => ({ tenantId, actor: "operator:test", action: ACCION_ENCENDER, entity: ENTIDAD_INTERRUPTOR, entityId: AGENDA_INTERACCION, channel: CANAL_INTERRUPTOR })),
  });
  const A = await negocio(base.a.id);
  const B = await negocio(base.b.id);
  const tOtro = await B.turno("16:00");
  const usuariaLu = await duenio.user.create({
    data: { tenantId: base.a.id, name: "Lu", email: `lu-editar-${Date.now()}@erp.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: A.lu },
  });
  sembrado = { base, manana, caro: A.caro, lu: A.lu, vero: A.vero, piernas: A.piernas, esmaltado: A.esmaltado, turno: A.turno, tOtro, usuariaLu, a };
  return sembrado;
}

type Pedido = { servicio?: string; inicio?: string; profesional?: string; deshacer?: boolean };

async function editar(s: Sembrado, turnoId: string, p: Pedido, o: { quien?: "a" | "b"; usuario?: { id: string } } = {}) {
  const { editarTurno } = await import("./editar-actions");
  const n = (o.quien ?? "a") === "a" ? s.base.a : s.base.b;
  const fd = new FormData();
  fd.set("appointmentId", turnoId);
  if (p.servicio) fd.set("serviceId", p.servicio);
  if (p.inicio) fd.set("startsAt", p.inicio);
  if (p.profesional) fd.set("professionalId", p.profesional);
  if (p.deshacer) fd.set("deshacer", "1");
  return ejecutarAccion({ negocio: n, usuario: o.usuario ?? n.recepcion }, () => editarTurno(fd));
}

async function editarValor(s: Sembrado, turnoId: string, p: Pedido, quien: "a" | "b" = "a") {
  const r = await editar(s, turnoId, p, { quien });
  assert.equal(r.tipo, "respuesta");
  return r.tipo === "respuesta" ? r.valor : { ok: false as const, error: "sin respuesta" };
}

async function mover(s: Sembrado, turnoId: string, profesionalId: string, inicio: string) {
  const { rescheduleAppointment } = await import("@/lib/actions");
  const fd = new FormData();
  fd.set("appointmentId", turnoId);
  fd.set("startsAt", inicio);
  fd.set("professionalId", profesionalId);
  fd.set("conservarDuracion", "1");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => rescheduleAppointment(fd));
  return r.tipo === "respuesta" ? r.valor : { ok: false as const, error: r.tipo };
}

test("opciones y huecos: servicios con quién los hace, plata del turno; los huecos son del servicio elegido", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { opcionesParaEditar, huecosParaEditar } = await import("./editar-actions");
  const ana = await s.turno("09:00");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => opcionesParaEditar(ana));
  assert.equal(r.tipo, "respuesta");
  const o = r.tipo === "respuesta" ? r.valor : null;
  assert.ok(o?.ok, JSON.stringify(o));
  if (!o?.ok) return;
  assert.deepEqual(
    o.servicios.map((x) => [x.nombre, x.precio, x.profesionales.length]),
    [
      ["Esmaltado", 9000, 1],
      ["Piernas completas", 14000, 2],
    ],
  );
  assert.equal(o.tienePlata, false);
  const h = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => huecosParaEditar(ana, s.esmaltado, s.vero, [s.manana]));
  assert.ok(h.tipo === "respuesta" && h.valor.ok && (h.valor.huecos[s.manana] ?? []).length > 0, "Vero tiene huecos para Esmaltado");
  const mal = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => huecosParaEditar(ana, s.esmaltado, s.caro, [s.manana]));
  assert.deepEqual(mal.tipo === "respuesta" ? mal.valor : null, { ok: false, error: "Esa profesional no hace ese servicio. Elegí otra." });
});

test("cambiar servicio, hora y profesional: el mismo turno, duración y precio del servicio nuevo; Deshacer vuelve exacto", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ana = await s.turno("10:45", { precio: 12000 }); // precio congelado viejo (no el de lista)
  const antes = await duenio.appointment.findUniqueOrThrow({ where: { id: ana } });
  const cuantos = await duenio.appointment.count({ where: { tenantId: s.base.a.id } });
  assert.deepEqual(await editarValor(s, ana, { servicio: s.esmaltado, inicio: s.a("10:00"), profesional: s.vero }), { ok: true });
  const despues = await duenio.appointment.findUniqueOrThrow({ where: { id: ana } });
  assert.deepEqual(
    [despues.serviceId, despues.professionalId, despues.startsAt.toISOString(), despues.endsAt.toISOString(), despues.priceAtBooking, despues.status],
    [s.esmaltado, s.vero, s.a("10:00"), s.a("10:45"), 9000, "PENDING"],
  );
  assert.notEqual(despues.boxId, antes.boxId, "el box sigue a la profesional");
  assert.equal(await duenio.appointment.count({ where: { tenantId: s.base.a.id } }), cuantos, "no se creó otro turno");
  const audit = await duenio.auditLog.findFirst({ where: { tenantId: s.base.a.id, action: "edit", entityId: ana } });
  assert.ok(audit, "queda en la auditoría con antes y después");

  assert.deepEqual(await editarValor(s, ana, { deshacer: true }), { ok: true });
  const vuelta = await duenio.appointment.findUniqueOrThrow({ where: { id: ana } });
  assert.deepEqual(
    [vuelta.serviceId, vuelta.professionalId, vuelta.boxId, vuelta.startsAt.toISOString(), vuelta.endsAt.toISOString(), vuelta.priceAtBooking],
    [antes.serviceId, antes.professionalId, antes.boxId, antes.startsAt.toISOString(), antes.endsAt.toISOString(), 12000],
  );
  // Deshacer dos veces no hace nada raro: el último `edit` ya no describe el turno de ahora.
  const otra = await editarValor(s, ana, { deshacer: true });
  assert.equal(otra.ok, false);
});

test("sólo la hora: la reprogramación de siempre (audita reschedule, conserva la duración)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ana = await s.turno("13:00", { profesional: s.lu, minutos: 90 });
  assert.deepEqual(await editarValor(s, ana, { servicio: s.piernas, inicio: s.a("15:00"), profesional: s.lu }), { ok: true });
  const d = await duenio.appointment.findUniqueOrThrow({ where: { id: ana } });
  assert.deepEqual([d.startsAt.toISOString(), d.endsAt.toISOString(), d.priceAtBooking], [s.a("15:00"), s.a("16:30"), 14000]);
  assert.ok(await duenio.auditLog.findFirst({ where: { tenantId: s.base.a.id, action: "reschedule", entityId: ana } }));
  assert.equal(await duenio.auditLog.count({ where: { tenantId: s.base.a.id, action: "edit", entityId: ana } }), 0);
});

test("solape: cambiar a un servicio en un horario ocupado se rechaza y queda como estaba", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  await s.turno("12:00", { profesional: s.vero, servicio: s.esmaltado, minutos: 45 });
  const ana = await s.turno("12:00");
  const r = await editarValor(s, ana, { servicio: s.esmaltado, inicio: s.a("12:15"), profesional: s.vero });
  assert.deepEqual(r, { ok: false, error: "Ese horario ya no está disponible para este profesional. Elegí otro horario." });
  const igual = await duenio.appointment.findUniqueOrThrow({ where: { id: ana } });
  assert.deepEqual([igual.serviceId, igual.professionalId, igual.startsAt.toISOString()], [s.piernas, s.caro, s.a("12:00")]);
});

test("una profesional que no hace el servicio se rechaza", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const ana = await s.turno("14:00");
  assert.deepEqual(await editarValor(s, ana, { servicio: s.esmaltado, inicio: s.a("14:00"), profesional: s.caro }), {
    ok: false,
    error: "Caro no hace Esmaltado. Elegí una profesional que lo haga.",
  });
});

test("turno con cobro: el servicio no cambia («Ya tiene un cobro…»); la hora sí", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ana = await s.turno("16:00", { profesional: s.lu });
  await duenio.collection.create({
    data: { tenantId: s.base.a.id, originType: "APPOINTMENT", originId: ana, appointmentId: ana, amount: 5000, method: "TRANSFERENCIA", note: "Seña al reservar", collectedBy: "user:x" },
  });
  assert.deepEqual(await editarValor(s, ana, { servicio: s.esmaltado, inicio: s.a("16:00"), profesional: s.vero }), {
    ok: false,
    error: "Ya tiene un cobro: cancelalo y dá un turno nuevo.",
  });
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: ana } })).serviceId, s.piernas);
  assert.deepEqual(await editarValor(s, ana, { servicio: s.piernas, inicio: s.a("17:00"), profesional: s.lu }), { ok: true }, "mover la hora, sí");
});

test("un PROFESSIONAL no edita (no tiene agenda:manage), y la recepción de otro negocio no ve el turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const deCaro = await s.turno("19:00");
  const r = await editar(s, deCaro, { servicio: s.esmaltado, inicio: s.a("19:00"), profesional: s.vero }, { usuario: s.usuariaLu });
  assert.notEqual(r.tipo === "respuesta" && r.valor.ok, true, `no debía pasar: ${JSON.stringify(r)}`);
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: deCaro } })).serviceId, s.piernas);
  const ajeno = await duenio.appointment.findUniqueOrThrow({ where: { id: s.tOtro } });
  assert.deepEqual(await editarValor(s, s.tOtro, { servicio: s.esmaltado, inicio: s.a("16:00"), profesional: s.vero }, "a"), {
    ok: false,
    error: "Ese turno ya no existe. Recargá la agenda.",
  });
  const igual = await duenio.appointment.findUniqueOrThrow({ where: { id: s.tOtro } });
  assert.equal(igual.updatedAt.toISOString(), ajeno.updatedAt.toISOString());
});

test("concurrencia: editar un turno y mover otro al mismo hueco, a la vez → uno solo pasa y no hay solape", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const deCaro = await s.turno("09:00", { minutos: 60 });
  await duenio.appointment.update({ where: { id: deCaro }, data: { startsAt: new Date(s.a("17:00")), endsAt: new Date(s.a("18:00")) } });
  const deVero = await s.turno("09:00", { profesional: s.vero, servicio: s.esmaltado, minutos: 45 });
  const [r1, r2] = await Promise.all([
    editarValor(s, deCaro, { servicio: s.esmaltado, inicio: s.a("18:00"), profesional: s.vero }),
    mover(s, deVero, s.vero, s.a("18:00")),
  ]);
  assert.equal([r1, r2].filter((r) => r.ok).length, 1, `pasó exactamente uno: editar=${JSON.stringify(r1)} mover=${JSON.stringify(r2)}`);
  const vivos = await duenio.appointment.findMany({
    where: { tenantId: s.base.a.id, professionalId: s.vero, status: { in: ["PENDING", "CONFIRMED"] } },
    orderBy: { startsAt: "asc" },
  });
  for (let i = 1; i < vivos.length; i++) assert.ok(vivos[i].startsAt >= vivos[i - 1].endsAt, "ningún turno de Vero se pisa con el anterior");
});

// Resguardo: la carrera la reprodujo el certificador con su arnés (C8, 12 de 16 vueltas); acá depende de los tiempos y
// puede no aparecer. El arreglo es `sigueVivo` con profesional y servicio (src/lib/actions.ts).
test("concurrencia (cert. pase 05/11, F1): cambiar el servicio y mover a otra profesional a la vez nunca deja a una profesional con un servicio que no hace", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  for (let vuelta = 0; vuelta < 16; vuelta++) {
    const hora = `${String(9 + (vuelta % 10)).padStart(2, "0")}:${vuelta < 10 ? "00" : "30"}`;
    const turno: string = await s.turno(hora, { minutos: 30 }); // Piernas con Caro
    await Promise.all([
      editarValor(s, turno, { servicio: s.esmaltado, inicio: s.a(hora), profesional: s.vero }),
      mover(s, turno, s.lu, s.a(hora)),
    ]);
    const final: { professionalId: string; serviceId: string } = await duenio.appointment.findUniqueOrThrow({ where: { id: turno }, select: { professionalId: true, serviceId: true } });
    const lohace: number = await duenio.professional.count({ where: { id: final.professionalId, services: { some: { id: final.serviceId } } } });
    assert.equal(lohace, 1, `vuelta ${vuelta}: la profesional del turno hace su servicio`);
  }
});

test("interruptor (cert. pase 05/11, F2) → incorporado: una fila vieja de «apagar» de «Agenda interactiva» no frena editar", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, ACCION_APAGAR, CANAL_INTERRUPTOR, AGENDA_INTERACCION } = await import("@/cambios/interruptores");
  const fila = (action: string) => duenio.auditLog.create({
    data: { tenantId: s.base.a.id, actor: "operator:test", action, entity: ENTIDAD_INTERRUPTOR, entityId: AGENDA_INTERACCION, channel: CANAL_INTERRUPTOR },
  });
  const turno = await s.turno("19:00", { minutos: 60 });
  await fila(ACCION_APAGAR);
  try {
    // Decisión del dueño (05/11/2026): «Agenda interactiva» es una mejora incorporada; ya no hay
    // «apagado» que frene la edición. Lo que pase después lo decide el motor de siempre (horario,
    // choques, servicio), nunca el interruptor.
    const r = await editarValor(s, turno, { servicio: s.piernas, inicio: s.a("19:15"), profesional: s.caro });
    assert.doesNotMatch(String((r as { error?: string }).error ?? ""), /no está prendido/);
  } finally {
    await fila(ACCION_ENCENDER);
  }
});
