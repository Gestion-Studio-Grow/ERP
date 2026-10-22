/**
 * MOVER UN TURNO (CH Tanda 2 · 2-C), EJECUTADO contra Postgres con RLS: las Server Actions reales con
 * la sesión de la recepción.
 *
 *   · `huecosParaMover`: quiénes hacen el servicio (sólo id, nombre y box) y sus huecos sin contar el
 *     propio turno; un turno de otro negocio o ya cerrado no se consulta.
 *   · CH-025 con `rescheduleAppointment` (lo que llaman el arrastre y «Mover»): el MISMO turno pasa a
 *     otra profesional y hora, no se crea otro, se borra el «avisada»; si choca, no se mueve y el
 *     motivo vuelve en castellano.
 *   · Cert T2: al mismo horario (F-3) no toca nada; al pasado (O-7) se rechaza.
 *   · Aislamiento (CH-060/061 análogo): la recepción de otro negocio no lo ve ni lo mueve.
 *   · Maestros intactos (CH-069/070): servicios, profesionales y boxes no cambian.
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
  servicio: string;
  /** Un turno de mañana a las `hhmm` (hora del negocio) con Caro, en el negocio A. */
  turno: (hhmm: string, o?: { status?: "PENDING" | "CONFIRMED" | "CANCELLED"; profesional?: string; avisada?: boolean }) => Promise<string>;
  tOtro: string;
  /** Instante (ISO) de mañana a las `hhmm` de pared. */
  a: (hhmm: string) => string;
};
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const { todayInBusinessTz, businessWallTimeToUtc } = await import("@/lib/datetime");
  const manana = new Date(new Date(`${todayInBusinessTz()}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const a = (hhmm: string) => businessWallTimeToUtc(manana, hhmm).toISOString();

  const negocio = async (tenantId: string) => {
    const [b1, b2, b3] = await Promise.all(["Box 1", "Box 2", "Box 3"].map((name) => duenio.box.create({ data: { tenantId, name } })));
    const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas completas", durationMin: 60, price: 14000 } });
    const otro = await duenio.service.create({ data: { tenantId, name: "Esmaltado", durationMin: 45, price: 9000 } });
    const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: b1.id, services: { connect: [{ id: piernas.id }] } } });
    const lu = await duenio.professional.create({ data: { tenantId, name: "Lu", boxId: b2.id, email: "lu@privado.test", commissionPercent: 40, services: { connect: [{ id: piernas.id }] } } });
    const vero = await duenio.professional.create({ data: { tenantId, name: "Vero", boxId: b3.id, services: { connect: [{ id: otro.id }] } } });
    for (const professionalId of [caro.id, lu.id, vero.id]) {
      await duenio.workingHours.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ tenantId, professionalId, dayOfWeek, startTime: "09:00", endTime: "20:00" })),
      });
    }
    const boxDe: Record<string, string> = { [caro.id]: b1.id, [lu.id]: b2.id, [vero.id]: b3.id };
    let n = 0;
    const turno: Sembrado["turno"] = async (hhmm, o = {}) => {
      const client = await duenio.client.create({ data: { tenantId, name: `Clienta ${n}`, phone: `11400030${String(n++).padStart(2, "0")}` } });
      const profesional = o.profesional ?? caro.id;
      const startsAt = new Date(a(hhmm));
      const t = await duenio.appointment.create({
        data: {
          tenantId,
          clientId: client.id,
          professionalId: profesional,
          serviceId: piernas.id,
          boxId: boxDe[profesional],
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * MIN),
          status: o.status ?? "PENDING",
          priceAtBooking: 14000,
          reminderSentAt: o.avisada ? new Date() : null,
        },
      });
      return t.id;
    };
    return { caro: caro.id, lu: lu.id, vero: vero.id, servicio: piernas.id, turno };
  };
  const A = await negocio(base.a.id);
  const B = await negocio(base.b.id);
  const tOtro = await B.turno("16:00");
  sembrado = { base, manana, caro: A.caro, lu: A.lu, vero: A.vero, servicio: A.servicio, turno: A.turno, tOtro, a };
  return sembrado;
}

async function huecos(s: Sembrado, turnoId: string, quien: "a" | "b" = "a") {
  const { huecosParaMover } = await import("./mover-actions");
  const n = quien === "a" ? s.base.a : s.base.b;
  const r = await ejecutarAccion({ negocio: n, usuario: n.recepcion }, () => huecosParaMover(turnoId, [s.manana], null));
  assert.equal(r.tipo, "respuesta");
  return r.tipo === "respuesta" ? r.valor : { ok: false as const, error: "sin respuesta" };
}

async function mover(s: Sembrado, turnoId: string, profesionalId: string, inicio: string, quien: "a" | "b" = "a") {
  const { rescheduleAppointment } = await import("@/lib/actions");
  const n = quien === "a" ? s.base.a : s.base.b;
  const fd = new FormData();
  fd.set("appointmentId", turnoId);
  fd.set("startsAt", inicio);
  fd.set("professionalId", profesionalId);
  const r = await ejecutarAccion({ negocio: n, usuario: n.recepcion }, () => rescheduleAppointment(fd));
  assert.equal(r.tipo, "respuesta");
  return r.tipo === "respuesta" ? r.valor : { ok: false as const, error: "sin respuesta" };
}

const ms = (iso: string) => new Date(iso).getTime();

test("huecosParaMover: sólo quienes hacen el servicio, sin datos de más, y sin contar el propio turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const laura = await s.turno("16:00");
  await s.turno("18:30", { profesional: s.lu, status: "CONFIRMED" });
  const r = await huecos(s, laura);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.deepEqual(
    r.profesionales.map((p) => p.nombre),
    ["Caro", "Lu"],
    "Vero no hace Piernas completas",
  );
  for (const p of r.profesionales) assert.deepEqual(Object.keys(p).sort(), ["box", "id", "nombre"], "ni email ni comisión al navegador");
  const deLu = (r.huecos[s.lu]?.[s.manana] ?? []).map(ms);
  assert.ok(deLu.includes(ms(s.a("17:00"))), "17:00-18:00 de Lu entra (con el margen, antes de las 18:30)");
  assert.ok(!deLu.includes(ms(s.a("18:00"))), "18:00 se pisa con el turno de las 18:30");
  const deCaro = (r.huecos[s.caro]?.[s.manana] ?? []).map(ms);
  assert.ok(deCaro.includes(ms(s.a("16:00"))), "su propio horario no cuenta como ocupado");
});

test("CH-025 · mover a las 13:00 de Lu: el mismo turno, otra profesional y hora, sin crear otro", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const laura = await s.turno("12:00", { avisada: true });
  const antes = await duenio.appointment.count({ where: { tenantId: s.base.a.id } });
  const r = await mover(s, laura, s.lu, s.a("13:00"));
  assert.deepEqual(r, { ok: true });
  const despues = await duenio.appointment.findUniqueOrThrow({ where: { id: laura } });
  assert.equal(despues.professionalId, s.lu);
  assert.equal(despues.startsAt.toISOString(), s.a("13:00"));
  assert.equal(despues.endsAt.getTime() - despues.startsAt.getTime(), 60 * MIN, "la duración la fija el servicio");
  assert.equal(despues.status, "PENDING", "el estado no cambia");
  assert.equal(despues.reminderSentAt, null, "el aviso era para el horario viejo");
  assert.equal(await duenio.appointment.count({ where: { tenantId: s.base.a.id } }), antes, "no se creó ningún turno");
  const audit = await duenio.auditLog.findFirst({ where: { tenantId: s.base.a.id, action: "reschedule", entityId: laura } });
  assert.ok(audit, "queda en la auditoría");
});

test("CH-025 · si choca, no se mueve y vuelve el motivo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const laura = await s.turno("09:00");
  await s.turno("10:00", { profesional: s.lu, status: "CONFIRMED" });
  const r = await mover(s, laura, s.lu, s.a("10:30"));
  assert.deepEqual(r, { ok: false, error: "Ese horario ya no está disponible para este profesional. Elegí otro horario." });
  const igual = await duenio.appointment.findUniqueOrThrow({ where: { id: laura } });
  assert.equal(igual.professionalId, s.caro);
  assert.equal(igual.startsAt.toISOString(), s.a("09:00"));
});

test("cert F-3 · al MISMO horario con la MISMA profesional: «Ya está en ese horario», sin tocar «avisada» ni auditar", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const laura = await s.turno("14:00", { avisada: true });
  const antes = await duenio.appointment.findUniqueOrThrow({ where: { id: laura } });
  assert.ok(antes.reminderSentAt, "arranca avisada");
  const r = await mover(s, laura, s.caro, s.a("14:00"));
  assert.deepEqual(r, { ok: false, error: "Ya está en ese horario: no se movió nada." });
  // Sin profesional en el formulario (= la misma), igual.
  assert.deepEqual(await mover(s, laura, "", s.a("14:00")), { ok: false, error: "Ya está en ese horario: no se movió nada." });
  const despues = await duenio.appointment.findUniqueOrThrow({ where: { id: laura } });
  assert.equal(despues.reminderSentAt?.toISOString(), antes.reminderSentAt?.toISOString(), "«avisada» intacta");
  assert.equal(despues.updatedAt.toISOString(), antes.updatedAt.toISOString(), "la fila no se tocó");
  assert.equal(await duenio.auditLog.count({ where: { tenantId: s.base.a.id, action: "reschedule", entityId: laura } }), 0);
});

test("cert O-7 · mover a un horario que ya pasó se rechaza en el servidor (un POST a mano tampoco)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const laura = await s.turno("15:00");
  const hace1h = new Date(Date.now() - 60 * MIN).toISOString();
  assert.deepEqual(await mover(s, laura, s.caro, hace1h), { ok: false, error: "Ese horario ya pasó. Elegí uno que venga." });
  const igual = await duenio.appointment.findUniqueOrThrow({ where: { id: laura } });
  assert.equal(igual.startsAt.toISOString(), s.a("15:00"));
});

test("un turno cancelado no se consulta ni se mueve", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const cancelado = await s.turno("14:00", { status: "CANCELLED" });
  assert.deepEqual(await huecos(s, cancelado), { ok: false, error: "Sólo se mueve un turno reservado o confirmado." });
  const r = await mover(s, cancelado, s.caro, s.a("15:00"));
  assert.equal(r.ok, false);
});

test("aislamiento: la recepción de otro negocio no ve ni mueve el turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ajeno = await duenio.appointment.findUniqueOrThrow({ where: { id: s.tOtro } });
  // Desde el negocio A, con el id de B.
  assert.deepEqual(await huecos(s, s.tOtro, "a"), { ok: false, error: "Ese turno ya no existe. Recargá la agenda." });
  assert.deepEqual(await mover(s, s.tOtro, s.caro, s.a("19:00"), "a"), { ok: false, error: "Ese turno ya no existe. Recargá la agenda." });
  const igual = await duenio.appointment.findUniqueOrThrow({ where: { id: s.tOtro } });
  assert.deepEqual(
    { p: igual.professionalId, i: igual.startsAt.toISOString(), u: igual.updatedAt?.toISOString?.() },
    { p: ajeno.professionalId, i: ajeno.startsAt.toISOString(), u: ajeno.updatedAt?.toISOString?.() },
  );
});

test("CH-069/070 · mover no toca servicios, profesionales ni boxes", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const foto = async () =>
    JSON.stringify([
      await duenio.service.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, durationMin: true, price: true, updatedAt: true } }),
      await duenio.professional.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, boxId: true, updatedAt: true } }),
      await duenio.box.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, updatedAt: true } }),
    ]);
  const antes = await foto();
  const laura = await s.turno("19:00");
  await huecos(s, laura);
  assert.deepEqual(await mover(s, laura, s.caro, s.a("18:00")), { ok: true });
  assert.equal(await foto(), antes);
});
