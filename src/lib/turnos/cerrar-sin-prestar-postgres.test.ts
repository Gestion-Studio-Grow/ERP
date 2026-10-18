/**
 * Agenda práctica (T10 + E3): cancelar o marcar «no vino» decidiendo qué pasa con la seña, EJECUTADO contra
 * Postgres con RLS, con las Server Actions reales y la sesión de la recepción.
 *
 *   · con plata cobrada, sin elegir qué pasa con la seña, no se cambia nada;
 *   · «devolver»: el turno queda cancelado y la seña sale del libro (contrapartida + egreso), en una transacción;
 *   · «retener»: el turno queda cancelado, la plata queda y la decisión queda en la auditoría.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const HORA = 3_600_000;

type Sembrado = { base: BaseEfimera; turno: (clienta: string) => Promise<string> };
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
  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const masaje = await duenio.service.create({ data: { tenantId, name: "Masaje", durationMin: 60, price: 15000, depositAmount: 5000 } });
  const laura = await duenio.professional.create({
    data: { tenantId, name: "Laura", boxId: box.id, services: { connect: [{ id: masaje.id }] } },
  });
  let n = 0;
  const turno = async (clienta: string) => {
    const client = await duenio.client.create({ data: { tenantId, name: clienta, phone: `113000100${n}` } });
    const startsAt = new Date(Date.now() + (48 + 2 * n++) * HORA);
    const a = await duenio.appointment.create({
      data: {
        tenantId,
        clientId: client.id,
        professionalId: laura.id,
        serviceId: masaje.id,
        boxId: box.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + HORA),
        status: "PENDING",
        priceAtBooking: 15000,
      },
    });
    return a.id;
  };
  sembrado = { base, turno };
  return sembrado;
}

async function cobrarSenia(s: Sembrado, appointmentId: string) {
  const { registrarCobroTurno } = await import("@/lib/actions");
  const fd = new FormData();
  for (const [k, v] of Object.entries({ appointmentId, amount: "5000", method: "EFECTIVO", idempotencyKey: randomUUID() })) fd.set(k, v);
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => registrarCobroTurno(fd));
  assert.deepEqual(r.tipo === "respuesta" && r.valor, { ok: true });
}

async function cerrar(s: Sembrado, appointmentId: string, senia: string) {
  const { cerrarTurnoSinPrestar } = await import("@/lib/actions");
  const fd = new FormData();
  for (const [k, v] of Object.entries({ appointmentId, accion: "cancelar", senia })) fd.set(k, v);
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => cerrarTurnoSinPrestar(fd));
  assert.equal(r.tipo, "respuesta");
  return r.tipo === "respuesta" ? r.valor : null;
}

async function foto(s: Sembrado, appointmentId: string) {
  const duenio = await prismaComoDuenio(s.base);
  const [turno, cobros, egresos, auditoria] = await Promise.all([
    duenio.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { status: true } }),
    duenio.collection.findMany({ where: { appointmentId }, select: { amount: true } }),
    duenio.cashMovement.findMany({ where: { tenantId: s.base.a.id, type: "EGRESO", reason: { contains: "Devolución de la seña" } } }),
    duenio.auditLog.findMany({ where: { entityId: appointmentId, action: "cancel" }, select: { changes: true } }),
  ]);
  return {
    status: turno.status,
    cobrado: cobros.reduce((t, c) => t + c.amount.toNumber(), 0),
    egresos: egresos.length,
    auditoria: auditoria.map((a) => a.changes as Record<string, unknown>),
  };
}

test("E3 · con seña cobrada, cancelar sin decir qué pasa con la plata no cambia nada", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await s.turno("Ana");
  await cobrarSenia(s, id);
  const r = await cerrar(s, id, "");
  assert.deepEqual(r, { ok: false, error: "Elegí qué pasa con la seña: se la queda el negocio o se le devuelve." });
  assert.equal((await foto(s, id)).status, "PENDING");
});

test("E3 · «devolver»: el turno queda cancelado y la seña sale del libro con su egreso, todo junto", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await s.turno("Bea");
  await cobrarSenia(s, id);
  assert.deepEqual(await cerrar(s, id, "devolver"), { ok: true });
  const f = await foto(s, id);
  assert.equal(f.status, "CANCELLED");
  assert.equal(f.cobrado, 0, "la contrapartida deja lo cobrado en cero");
  assert.equal(f.egresos, 1, "un egreso en el libro por la seña devuelta");
  assert.equal(f.auditoria[0]?.senia, "devolver");
  assert.equal(f.auditoria[0]?.devuelto, 5000);
});

test("E3 · «retener»: el turno queda cancelado, la plata queda y la decisión queda escrita", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await s.turno("Caro");
  await cobrarSenia(s, id);
  assert.deepEqual(await cerrar(s, id, "retener"), { ok: true });
  const f = await foto(s, id);
  assert.equal(f.status, "CANCELLED");
  assert.equal(f.cobrado, 5000);
  assert.equal(f.auditoria[0]?.senia, "retener");
});

test("T10 · un turno ya cancelado no se vuelve a cancelar (la condición va en la escritura)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await s.turno("Dani");
  assert.deepEqual(await cerrar(s, id, ""), { ok: true }, "sin plata no se pregunta por la seña");
  const otra = await cerrar(s, id, "");
  assert.equal(otra?.ok, false);
});
