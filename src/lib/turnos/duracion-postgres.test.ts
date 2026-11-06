/**
 * ESTIRAR UN TURNO (AGENDA-INTERACCION.md §2.3, T2), EJECUTADO contra Postgres con RLS: la Server
 * Action real `cambiarDuracionDelTurno` con la sesión de la recepción.
 *
 *   · estirar 15' sobre un hueco libre guarda `endsAt`, audita `resize` y no toca nada más;
 *   · Deshacer = la misma action con el fin anterior;
 *   · estirar sobre otro turno se rechaza con «Se pisa con X a las HH:MM» y queda como estaba;
 *   · `endsAt` ≤ `startsAt` (un POST a mano) y pasos que no son de 15' se rechazan;
 *   · concurrencia: estirar y mover al mismo hueco a la vez → uno solo pasa, sin solape;
 *   · aislamiento: la recepción de A no estira un turno de B;
 *   · un PROFESSIONAL no estira (no tiene `agenda:manage`), menos uno ajeno.
 *   · (cert T2) Deshacer vuelve a un fin fuera del paso de 15' (el del último resize o el del servicio);
 *     un turno que ya empezó no se estira; mover con `conservarDuracion=1` no pierde el estiramiento.
 *   Los casos de la cert usan PASADO MAÑANA (`a2`) para no chocar con los de arriba.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const MIN = 60_000;

type Sembrado = {
  base: BaseEfimera;
  caro: string;
  lu: string;
  turno: (hhmm: string, o?: { profesional?: string; minutos?: number; status?: "PENDING" | "CONFIRMED" | "CANCELLED"; clienta?: string; inicio?: string; servicio?: string }) => Promise<string>;
  tOtro: string;
  /** Usuaria PROFESSIONAL de Lu, en el negocio A. */
  usuariaLu: { id: string };
  a: (hhmm: string) => string;
  /** Pasado mañana a esa hora (ISO). */
  a2: (hhmm: string) => string;
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
  const pasado = new Date(new Date(`${todayInBusinessTz()}T12:00:00Z`).getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const a2 = (hhmm: string) => businessWallTimeToUtc(pasado, hhmm).toISOString();

  const negocio = async (tenantId: string) => {
    const [b1, b2] = await Promise.all(["Box 1", "Box 2"].map((name) => duenio.box.create({ data: { tenantId, name } })));
    const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas completas", durationMin: 60, price: 14000 } });
    const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: b1.id, services: { connect: [{ id: piernas.id }] } } });
    const lu = await duenio.professional.create({ data: { tenantId, name: "Lu", boxId: b2.id, services: { connect: [{ id: piernas.id }] } } });
    for (const professionalId of [caro.id, lu.id]) {
      await duenio.workingHours.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ tenantId, professionalId, dayOfWeek, startTime: "09:00", endTime: "20:00" })),
      });
    }
    const boxDe: Record<string, string> = { [caro.id]: b1.id, [lu.id]: b2.id };
    let n = 0;
    const turno: Sembrado["turno"] = async (hhmm, o = {}) => {
      const client = await duenio.client.create({ data: { tenantId, name: o.clienta ?? `Clienta ${n}`, phone: `11400040${String(n++).padStart(2, "0")}` } });
      const profesional = o.profesional ?? caro.id;
      const startsAt = new Date(o.inicio ?? a(hhmm));
      const t = await duenio.appointment.create({
        data: {
          tenantId,
          clientId: client.id,
          professionalId: profesional,
          serviceId: o.servicio ?? piernas.id,
          boxId: boxDe[profesional],
          startsAt,
          endsAt: new Date(startsAt.getTime() + (o.minutos ?? 60) * MIN),
          status: o.status ?? "PENDING",
          priceAtBooking: 14000,
        },
      });
      return t.id;
    };
    return { caro: caro.id, lu: lu.id, turno };
  };
  const A = await negocio(base.a.id);
  const B = await negocio(base.b.id);
  const tOtro = await B.turno("16:00");
  const usuariaLu = await duenio.user.create({
    data: { tenantId: base.a.id, name: "Lu", email: `lu-${Date.now()}@erp.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: A.lu },
  });
  sembrado = { base, caro: A.caro, lu: A.lu, turno: A.turno, tOtro, usuariaLu, a, a2 };
  return sembrado;
}

async function estirar(s: Sembrado, turnoId: string, endsAt: string, o: { quien?: "a" | "b"; usuario?: { id: string } } = {}) {
  const { cambiarDuracionDelTurno } = await import("./duracion-actions");
  const n = (o.quien ?? "a") === "a" ? s.base.a : s.base.b;
  const fd = new FormData();
  fd.set("appointmentId", turnoId);
  fd.set("endsAt", endsAt);
  return ejecutarAccion({ negocio: n, usuario: o.usuario ?? n.recepcion }, () => cambiarDuracionDelTurno(fd));
}

async function estirarValor(s: Sembrado, turnoId: string, endsAt: string, quien: "a" | "b" = "a") {
  const r = await estirar(s, turnoId, endsAt, { quien });
  assert.equal(r.tipo, "respuesta");
  return r.tipo === "respuesta" ? r.valor : { ok: false as const, error: "sin respuesta" };
}

async function mover(s: Sembrado, turnoId: string, profesionalId: string, inicio: string, o: { conservarDuracion?: boolean } = {}) {
  const { rescheduleAppointment } = await import("@/lib/actions");
  const fd = new FormData();
  fd.set("appointmentId", turnoId);
  fd.set("startsAt", inicio);
  fd.set("professionalId", profesionalId);
  if (o.conservarDuracion) fd.set("conservarDuracion", "1");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => rescheduleAppointment(fd));
  return r.tipo === "respuesta" ? r.valor : { ok: false as const, error: r.tipo };
}

test("estirar 15' sobre un hueco libre guarda endsAt, audita resize y Deshacer vuelve al fin anterior", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ana = await s.turno("10:00");
  const antes = await duenio.appointment.findUniqueOrThrow({ where: { id: ana } });
  assert.deepEqual(await estirarValor(s, ana, s.a("11:15")), { ok: true });
  const despues = await duenio.appointment.findUniqueOrThrow({ where: { id: ana } });
  assert.equal(despues.endsAt.toISOString(), s.a("11:15"));
  assert.deepEqual(
    { i: despues.startsAt.toISOString(), p: despues.professionalId, b: despues.boxId, e: despues.status, $: despues.priceAtBooking },
    { i: antes.startsAt.toISOString(), p: antes.professionalId, b: antes.boxId, e: antes.status, $: antes.priceAtBooking },
    "sólo cambia el fin",
  );
  assert.ok(await duenio.auditLog.findFirst({ where: { tenantId: s.base.a.id, action: "resize", entityId: ana } }), "queda en la auditoría");
  // Deshacer: la misma action con el fin de antes.
  assert.deepEqual(await estirarValor(s, ana, antes.endsAt.toISOString()), { ok: true });
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: ana } })).endsAt.toISOString(), s.a("11:00"));
});

test("estirar sobre otro turno se rechaza con «Se pisa con X a las HH:MM» y queda como estaba", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ana = await s.turno("12:00", { profesional: s.lu });
  await s.turno("13:30", { profesional: s.lu, status: "CONFIRMED", clienta: "Marta" });
  const r = await estirarValor(s, ana, s.a("14:00"));
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /^Se pisa con Marta a las 13:30\.$/);
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: ana } })).endsAt.toISOString(), s.a("13:00"));
});

test("un POST a mano con endsAt ≤ startsAt, o que no va de a 15', se rechaza sin tocar nada", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ana = await s.turno("15:00");
  assert.deepEqual(await estirarValor(s, ana, s.a("15:00")), { ok: false, error: "El turno tiene que terminar después de que empieza." });
  assert.deepEqual(await estirarValor(s, ana, s.a("14:00")), { ok: false, error: "El turno tiene que terminar después de que empieza." });
  assert.deepEqual(await estirarValor(s, ana, s.a("16:10")), { ok: false, error: "La duración va de a 15 minutos." });
  assert.deepEqual(await estirarValor(s, ana, "no-es-fecha"), { ok: false, error: "Esa hora de fin no se pudo leer. Probá de nuevo." });
  assert.deepEqual(await estirarValor(s, ana, s.a("20:30")), { ok: false, error: "A esa hora la profesional ya no atiende (cierra a las 20:00)." });
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: ana } })).endsAt.toISOString(), s.a("16:00"));
  assert.equal(await duenio.auditLog.count({ where: { tenantId: s.base.a.id, action: "resize", entityId: ana } }), 0);
});

test("un turno cancelado no se estira", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const cancelado = await s.turno("17:00", { status: "CANCELLED" });
  assert.deepEqual(await estirarValor(s, cancelado, s.a("18:15")), { ok: false, error: "Sólo se cambia la duración de un turno reservado o confirmado." });
});

test("concurrencia: estirar un turno y mover otro al hueco que ocuparía, a la vez → uno solo pasa y no hay solape", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  // Caro 18:00–18:30 (se estira a 19:30) y Lu 09:00 (se mueve a Caro 19:00): cada uno solo entra; juntos se pisan.
  const largo = await s.turno("18:00", { minutos: 30 });
  const movido = await s.turno("09:00", { profesional: s.lu });
  const [r1, r2] = await Promise.all([estirarValor(s, largo, s.a("19:30")), mover(s, movido, s.caro, s.a("19:00"))]);
  const pasaron = [r1, r2].filter((r) => r.ok).length;
  assert.equal(pasaron, 1, `pasó exactamente uno: estirar=${JSON.stringify(r1)} mover=${JSON.stringify(r2)}`);
  const vivos = await duenio.appointment.findMany({
    where: { tenantId: s.base.a.id, professionalId: s.caro, status: { in: ["PENDING", "CONFIRMED"] } },
    orderBy: { startsAt: "asc" },
  });
  for (let i = 1; i < vivos.length; i++) assert.ok(vivos[i].startsAt >= vivos[i - 1].endsAt, "ningún turno de Caro se pisa con el anterior");
});

test("concurrencia: dos estiramientos del mismo turno a la vez no dejan solape con el de al lado", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ana = await s.turno("14:00", { profesional: s.lu, minutos: 30 });
  await s.turno("16:00", { profesional: s.lu, clienta: "Rosa" });
  const r = await Promise.all([estirarValor(s, ana, s.a("15:30")), estirarValor(s, ana, s.a("16:30"))]);
  assert.equal(r[1].ok, false, "el que se pisa con Rosa se rechaza");
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: ana } })).endsAt.toISOString(), r[0].ok ? s.a("15:30") : s.a("14:30"));
});

test("aislamiento: la recepción de A no estira un turno de B", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const antes = await duenio.appointment.findUniqueOrThrow({ where: { id: s.tOtro } });
  assert.deepEqual(await estirarValor(s, s.tOtro, s.a("17:15"), "a"), { ok: false, error: "Ese turno ya no existe. Recargá la agenda." });
  const igual = await duenio.appointment.findUniqueOrThrow({ where: { id: s.tOtro } });
  assert.equal(igual.endsAt.toISOString(), antes.endsAt.toISOString());
  assert.equal(igual.updatedAt.toISOString(), antes.updatedAt.toISOString());
  // Y la de B, en cambio, sí puede con lo suyo (el de A no lo pisa: otro negocio, mismos nombres).
  assert.deepEqual(await estirarValor(s, s.tOtro, s.a("17:15"), "b"), { ok: true });
});

test("un PROFESSIONAL no estira: ni un turno ajeno ni el suyo (no tiene agenda:manage)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const deCaro = await s.turno("11:30");
  const r = await estirar(s, deCaro, s.a("12:45"), { usuario: s.usuariaLu });
  assert.notEqual(r.tipo === "respuesta" && r.valor.ok, true, `no debía pasar: ${JSON.stringify(r)}`);
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: deCaro } })).endsAt.toISOString(), s.a("12:30"));
});

// ── Certificación T2 (certif-t2.md): M-1, B-1, B-3 ──

test("ATQ-1 · Deshacer de un turno de 20' estirado a 30' vuelve a 10:20 (el fin del último resize)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ana = await s.turno("10:00", { inicio: s.a2("10:00"), minutos: 20 });
  assert.deepEqual(await estirarValor(s, ana, s.a2("10:30")), { ok: true }, "estira 10:20 → 10:30");
  assert.deepEqual(await estirarValor(s, ana, s.a2("10:20")), { ok: true }, "Deshacer vuelve a 10:20");
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: ana } })).endsAt.toISOString(), s.a2("10:20"));
  // Ya deshecho, un fin suelto que el turno no tuvo nunca (10:25) sigue rechazado.
  assert.deepEqual(await estirarValor(s, ana, s.a2("10:25")), { ok: false, error: "La duración va de a 15 minutos." });
});

test("M-1 · se vuelve a la duración exacta del servicio (20') aunque no vaya de a 15'; otro valor suelto, no", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const cejas = await duenio.service.create({ data: { tenantId: s.base.a.id, name: "Cejas", durationMin: 20, price: 5000 } });
  const ana = await s.turno("11:00", { inicio: s.a2("11:00"), minutos: 30, servicio: cejas.id });
  assert.deepEqual(await estirarValor(s, ana, s.a2("11:25")), { ok: false, error: "La duración va de a 15 minutos." });
  assert.deepEqual(await estirarValor(s, ana, s.a2("11:20")), { ok: true });
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: ana } })).endsAt.toISOString(), s.a2("11:20"));
});

test("B-1 · un turno que ya empezó (ayer, todavía Reservado) no se estira ni se acorta", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ayer = new Date(new Date(s.a("10:00")).getTime() - 2 * 86_400_000);
  const viejo = await s.turno("10:00", { inicio: ayer.toISOString(), profesional: s.lu });
  const r = await estirarValor(s, viejo, new Date(ayer.getTime() + 30 * MIN).toISOString());
  assert.deepEqual(r, { ok: false, error: "Ese turno ya empezó: no se le cambia la duración desde la agenda." });
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: viejo } })).endsAt.getTime(), ayer.getTime() + 60 * MIN);
});

test("B-3 · estirar → mover con conservarDuracion=1 conserva la duración; sin el campo, la del servicio", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ana = await s.turno("13:00", { inicio: s.a2("13:00") }); // Piernas: 60'
  assert.deepEqual(await estirarValor(s, ana, s.a2("14:30")), { ok: true }, "estira a 1 h 30'");
  assert.deepEqual(await mover(s, ana, s.lu, s.a2("15:00"), { conservarDuracion: true }), { ok: true });
  const movido = await duenio.appointment.findUniqueOrThrow({ where: { id: ana } });
  assert.deepEqual([movido.startsAt.toISOString(), movido.endsAt.toISOString(), movido.professionalId], [s.a2("15:00"), s.a2("16:30"), s.lu]);
  // Deshacer del mover (también con el campo): vuelve con su 1 h 30'.
  assert.deepEqual(await mover(s, ana, s.caro, s.a2("13:00"), { conservarDuracion: true }), { ok: true });
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: ana } })).endsAt.toISOString(), s.a2("14:30"));
  // Sin el campo (la hoja de siempre, interruptor apagado): la duración del servicio.
  assert.deepEqual(await mover(s, ana, s.caro, s.a2("17:00")), { ok: true });
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: ana } })).endsAt.toISOString(), s.a2("18:00"));
});
