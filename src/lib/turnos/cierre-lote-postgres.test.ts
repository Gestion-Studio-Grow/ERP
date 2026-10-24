/**
 * Cerrar lo pendiente en lote (reingeniería CH, Tanda 1), EJECUTADO contra Postgres con RLS, con las
 * Server Actions reales y la sesión de la recepción:
 *
 *   · CH-062 · el loader de pasados sin cerrar trae sólo los del negocio, con su veredicto;
 *   · CH-060 · un turno de OTRO negocio dentro del lote contesta «ya no existe» y no se toca;
 *   · CH-002 · un Reservado de ayer que vino y paga queda COMPLETED con su cobro, sin Confirmar;
 *   · CH-006 · una línea que falla (la caja de hoy cerrada) no frena a las demás;
 *   · CH-040 · la recepción no da de baja saldos;
 *   · cert O-1 · cobrar / anular / dar de baja con el id de OTRO negocio contesta «ya no existe»
 *     (un `ResultadoAccion`, no un P2025 crudo) y no toca nada;
 *   · cert O-2 · `cancelAppointment` forjado sobre un turno con seña se rechaza y no cambia nada;
 *   · cert O-3 · el segundo envío de un cierre dice «Ese turno ya está cerrado.»;
 *   · cert O-4 · el chip de la agenda cuenta lo mismo que trae la bandeja, con un `count`.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import type { PedidoDeCierre } from "./cierre-lote";

const laBase = baseEfimeraDelArchivo();
const HORA = 3_600_000;

type Sembrado = {
  base: BaseEfimera;
  /** Un turno pasado (ayer) en el negocio A; `vero`: de la profesional que cobra aparte. */
  turnoA: (clienta: string, o?: { status?: "PENDING" | "CONFIRMED"; vero?: boolean }) => Promise<string>;
  tOtro: string;
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

  let n = 0;
  const negocio = async (tenantId: string) => {
    const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
    const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas completas", durationMin: 30, price: 14000, depositAmount: 5000 } });
    const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: piernas.id }] } } });
    const vero = await duenio.professional.create({
      data: { tenantId, name: "Vero", boxId: box.id, cobraEnMostrador: false, services: { connect: [{ id: piernas.id }] } },
    });
    return async (clienta: string, o: { status?: "PENDING" | "CONFIRMED"; vero?: boolean } = {}) => {
      const client = await duenio.client.create({ data: { tenantId, name: clienta, phone: `114000200${n}` } });
      // Ayer, a horas distintas: pasados sin cerrar.
      const startsAt = new Date(Date.now() - (24 + n++) * HORA);
      const a = await duenio.appointment.create({
        data: {
          tenantId,
          clientId: client.id,
          professionalId: o.vero ? vero.id : caro.id,
          serviceId: piernas.id,
          boxId: box.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HORA / 2),
          status: o.status ?? "PENDING",
          priceAtBooking: 14000,
        },
      });
      return a.id;
    };
  };
  const turnoA = await negocio(base.a.id);
  const turnoB = await negocio(base.b.id);
  const tOtro = await turnoB("T-OTRO");
  sembrado = { base, turnoA, tOtro };
  return sembrado;
}

async function lote(s: Sembrado, pedidos: PedidoDeCierre[]) {
  const { cerrarTurnosEnLote } = await import("./cierre-lote-actions");
  const { formDataDelLote } = await import("./cierre-lote");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => cerrarTurnosEnLote(formDataDelLote(pedidos)));
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") throw new Error("el lote no respondió");
  return r.valor;
}

async function foto(s: Sembrado, appointmentId: string) {
  const duenio = await prismaComoDuenio(s.base);
  const [turno, cobros] = await Promise.all([
    duenio.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { status: true, tenantId: true } }),
    duenio.collection.findMany({ where: { appointmentId }, select: { amount: true, method: true } }),
  ]);
  return { status: turno.status, tenantId: turno.tenantId, cobros: cobros.map((c) => ({ amount: c.amount.toNumber(), method: c.method })) };
}

test("CH-062 · la bandeja trae sólo los pasados sin cerrar del negocio, cada uno con su veredicto", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const caro = await s.turnoA("Sofía");
  const vero = await s.turnoA("Carla", { vero: true, status: "CONFIRMED" });
  const { turnosSinCerrar } = await import("./sin-cerrar.server");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => turnosSinCerrar());
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  const b = r.valor;
  assert.deepEqual(
    b.turnos.map((x) => x.id).sort(),
    [caro, vero].sort(),
    "exactamente los dos de A: ni T-OTRO ni otro",
  );
  const deVero = b.turnos.find((x) => x.id === vero)!;
  assert.equal(deVero.veredicto.ok, false, "la recepción no cobra el turno de Vero");
  const deCaro = b.turnos.find((x) => x.id === caro)!;
  assert.deepEqual([deCaro.veredicto.ok, deCaro.saldo, deCaro.estado], [true, 14000, "PENDING"]);
  assert.deepEqual(b.permisos, { gestionar: true, cobrar: true, terminar: true, perdonar: false });
  assert.equal(b.cajaDeHoyCerrada, false);
});

test("CH-060 + CH-002 · el turno de otro negocio no se toca; el Reservado de ayer queda cobrado sin Confirmar", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const sofia = await s.turnoA("Martina");
  const r = await lote(s, [
    { id: s.tOtro, accion: "vino", method: "EFECTIVO" },
    { id: sofia, accion: "vino", method: "MERCADOPAGO" },
  ]);
  assert.deepEqual(r, {
    resultados: [
      { id: s.tOtro, ok: false, error: "Ese turno ya no existe. Recargá la agenda." },
      { id: sofia, ok: true },
    ],
  });
  assert.deepEqual(await foto(s, s.tOtro), { status: "PENDING", tenantId: s.base.b.id, cobros: [] }, "T-OTRO no cambia");
  assert.deepEqual(await foto(s, sofia), { status: "COMPLETED", tenantId: s.base.a.id, cobros: [{ amount: 14000, method: "MERCADOPAGO" }] });
});

test("CH-007 · un medio forzado sobre el turno de Vero se rechaza y el turno no cambia", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const carla = await s.turnoA("Julia", { vero: true });
  const r = await lote(s, [{ id: carla, accion: "vino", method: "EFECTIVO" }]);
  assert.equal(r.resultados[0]?.ok, false);
  assert.match(r.resultados[0]?.error ?? "", /Vero cobra sus propios turnos/);
  assert.deepEqual(await foto(s, carla), { status: "PENDING", tenantId: s.base.a.id, cobros: [] });
});

test("CH-040 · la recepción no da de baja saldos (agenda:forgive es de la dueña)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await s.turnoA("Ana");
  assert.deepEqual(await lote(s, [{ id, accion: "debe" }]), { resultados: [{ id, ok: true }] });
  const { condonarSaldoTurno } = await import("@/lib/actions");
  const fd = new FormData();
  fd.set("appointmentId", id);
  fd.set("motivo", "se mudó y no vuelve");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => condonarSaldoTurno(fd));
  assert.deepEqual(r.tipo === "respuesta" && r.valor, { ok: false, error: "Dar de baja un saldo lo decide la dueña. Pasale el turno a ella." });
  assert.deepEqual(await foto(s, id), { status: "COMPLETED", tenantId: s.base.a.id, cobros: [] }, "el saldo sigue ahí");
});

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function comoRecepcion<R>(s: Sembrado, fn: () => Promise<R>, quien: "recepcion" | "duenia" = "recepcion"): Promise<R> {
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a[quien] }, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió (¿tiró crudo?): ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

const YA_NO_EXISTE = { ok: false, error: "Ese turno ya no existe. Recargá la agenda." };

test("cert O-1 · cobrar, anular y dar de baja con el id de otro negocio: «ya no existe», sin error crudo ni cambios", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { registrarCobroTurno, anularCobroTurno, condonarSaldoTurno } = await import("@/lib/actions");
  const antes = await foto(s, s.tOtro);
  assert.deepEqual(
    await comoRecepcion(s, () => registrarCobroTurno(fd({ appointmentId: s.tOtro, amount: "5000", method: "EFECTIVO", idempotencyKey: `o1-${s.tOtro}` }))),
    YA_NO_EXISTE,
  );
  assert.deepEqual(
    await comoRecepcion(s, () => anularCobroTurno(fd({ appointmentId: s.tOtro, collectionId: "cualquiera", motivo: "prueba cruzada" }))),
    YA_NO_EXISTE,
  );
  assert.deepEqual(await comoRecepcion(s, () => condonarSaldoTurno(fd({ appointmentId: s.tOtro, motivo: "prueba cruzada" })), "duenia"), YA_NO_EXISTE);
  assert.deepEqual(await foto(s, s.tOtro), antes, "T-OTRO no cambia");
});

test("cert O-2 · cancelAppointment forjado sobre un turno con seña se rechaza y no cambia nada; sin seña cancela", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { registrarCobroTurno, cancelAppointment } = await import("@/lib/actions");
  const conSena = await s.turnoA("Paula");
  assert.deepEqual(
    await comoRecepcion(s, () => registrarCobroTurno(fd({ appointmentId: conSena, amount: "5000", method: "TRANSFERENCIA", idempotencyKey: `o2-${conSena}` }))),
    { ok: true },
  );
  const r = await comoRecepcion(s, () => cancelAppointment(fd({ appointmentId: conSena, quien: "clienta" })));
  assert.deepEqual(r, { ok: false, error: "Este turno tiene seña: cancelalo desde la hoja que pregunta qué pasa con la plata." });
  assert.deepEqual(
    await foto(s, conSena),
    { status: "PENDING", tenantId: s.base.a.id, cobros: [{ amount: 5000, method: "TRANSFERENCIA" }] },
    "el turno sigue Reservado y la seña donde estaba",
  );
  const duenio = await prismaComoDuenio(s.base);
  assert.equal(await duenio.auditLog.count({ where: { entityId: conSena, action: "cancel" } }), 0, "no se audita una cancelación que no pasó");

  const sinSena = await s.turnoA("Quimey");
  assert.deepEqual(await comoRecepcion(s, () => cancelAppointment(fd({ appointmentId: sinSena }))), { ok: true });
  assert.equal((await foto(s, sinSena)).status, "CANCELLED");
  // El id de otro negocio: «ya no existe», y T-OTRO sigue Reservado.
  assert.deepEqual(await comoRecepcion(s, () => cancelAppointment(fd({ appointmentId: s.tOtro }))), YA_NO_EXISTE);
  assert.equal((await foto(s, s.tOtro)).status, "PENDING");
});

test("cert O-3 · el segundo envío de un cierre dice «Ese turno ya está cerrado.» y no cobra dos veces", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { completeAppointment } = await import("@/lib/actions");
  const id = await s.turnoA("Rocío");
  const campos = { appointmentId: id, vino: "on", method: "MERCADOPAGO" };
  assert.deepEqual(await comoRecepcion(s, () => completeAppointment(fd(campos))), { ok: true });
  assert.deepEqual(await comoRecepcion(s, () => completeAppointment(fd(campos))), { ok: false, error: "Ese turno ya está cerrado." });
  assert.deepEqual(await foto(s, id), { status: "COMPLETED", tenantId: s.base.a.id, cobros: [{ amount: 14000, method: "MERCADOPAGO" }] });
});

test("cert O-4 · el chip de la agenda cuenta exactamente los que trae la bandeja (ni T-OTRO ni cerrados)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await s.turnoA("Sol");
  const { turnosSinCerrar, contarSinCerrarDeQuienMira } = await import("./sin-cerrar.server");
  const bandeja = await comoRecepcion(s, () => turnosSinCerrar());
  const cuenta = await comoRecepcion(s, () => contarSinCerrarDeQuienMira());
  assert.ok(bandeja.turnos.length > 0);
  assert.equal(cuenta, bandeja.turnos.length);
  assert.ok(!bandeja.turnos.some((x) => x.id === s.tOtro));
});

// Va ÚLTIMO: cierra la caja de hoy del negocio A.
test("CH-006 · con la caja de hoy cerrada, el cobro falla con su motivo y las demás líneas pasan", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const [paga, debe, noVino, deVero] = [await s.turnoA("Lola"), await s.turnoA("Mora"), await s.turnoA("Nina"), await s.turnoA("Olga", { vero: true })];
  const duenio = await prismaComoDuenio(s.base);
  const { todayInBusinessTz } = await import("@/lib/datetime");
  await duenio.auditLog.create({
    data: { tenantId: s.base.a.id, actor: "user:test", action: "caja.cierre-diario", entity: "CierreDiario", entityId: todayInBusinessTz(), changes: {} },
  });

  const r = await lote(s, [
    { id: paga, accion: "vino", method: "EFECTIVO" },
    { id: debe, accion: "debe" },
    { id: noVino, accion: "no-vino" },
    { id: deVero, accion: "vino" },
  ]);
  assert.equal(r.resultados.length, 4);
  assert.equal(r.resultados[0]?.ok, false);
  assert.match(r.resultados[0]?.error ?? "", /ya está cerrada/);
  assert.deepEqual(
    r.resultados.slice(1),
    [
      { id: debe, ok: true },
      { id: noVino, ok: true },
      { id: deVero, ok: true },
    ],
  );
  assert.deepEqual(await foto(s, paga), { status: "PENDING", tenantId: s.base.a.id, cobros: [] }, "la que falló no cambió ni cobró");
  assert.equal((await foto(s, debe)).status, "COMPLETED");
  assert.equal((await foto(s, noVino)).status, "NO_SHOW");
  assert.deepEqual(await foto(s, deVero), { status: "COMPLETED", tenantId: s.base.a.id, cobros: [] }, "Vero: terminado dejando el saldo");
});
