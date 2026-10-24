/**
 * Cobro dividido, «Llegó la seña», deuda vieja y «Deshacer» (reingeniería CH, Tanda 2), EJECUTADOS
 * contra Postgres con RLS, con las Server Actions reales y la sesión de la recepción:
 *
 *   · CH-023 · dos cobros + COMPLETED + dos asientos en el libro, en una transacción; si la base se
 *     corta en el segundo cobro, no queda ningún cobro, ningún asiento, y el turno no cambia;
 *   · CH-022 · «Llegó la seña» cobra $5.000 por transferencia y confirma; idempotente (dos toques
 *     seguidos y dos a la vez → un solo cobro);
 *   · CH-049 · deshacer la seña recién cobrada la anula (contrapartida + egreso) y vuelve a Reservado;
 *   · CH-024 · «+ Sumar lo que debe»: dos cobros imputados cada uno a su turno, ambos en saldo $0;
 *   · CH-026 · deshacer una cancelación: vuelve a Reservado; con el hueco ocupado o pasados 10 min, no;
 *   · CH-061 · con el id de OTRO negocio: «ya no existe» (no un error crudo), 0 cobros y 0 asientos;
 *   · CH-007 · el turno de la profesional que cobra aparte no se cobra dividido desde la recepción;
 *   · cert F-1 · la profesional registra la seña de SU turno sin redirección (cobra, no confirma) y la deshace;
 *   · caja cerrada · el cobro dividido se rechaza con el motivo y no cobra nada.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const HORA = 3_600_000;

type OpcionesDeTurno = {
  /** Horas desde ahora (negativo = pasado). Por defecto, ayer. */
  horas?: number;
  status?: "PENDING" | "CONFIRMED" | "COMPLETED";
  precio?: number;
  vero?: boolean;
  /** Otro turno de la MISMA clienta. */
  clientId?: string;
};
type Turno = { id: string; clientId: string; professionalId: string; startsAt: Date };

type Sembrado = {
  base: BaseEfimera;
  turnoA: (clienta: string, o?: OpcionesDeTurno) => Promise<Turno>;
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
    const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas + axilas", durationMin: 30, price: 18000, depositAmount: 5000 } });
    const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
    const vero = await duenio.professional.create({
      data: { tenantId, name: "Vero", boxId: box.id, cobraEnMostrador: false, services: { connect: [{ id: servicio.id }] } },
    });
    return async (clienta: string, o: OpcionesDeTurno = {}): Promise<Turno> => {
      const clientId = o.clientId ?? (await duenio.client.create({ data: { tenantId, name: clienta, phone: `114000300${n}` } })).id;
      // Cada turno corrido n días más lejos (hacia atrás o hacia adelante) para que no se pisen.
      const h = o.horas ?? -24;
      const startsAt = new Date(Date.now() + h * HORA + Math.sign(h) * n++ * 24 * HORA);
      const a = await duenio.appointment.create({
        data: {
          tenantId,
          clientId,
          professionalId: o.vero ? vero.id : caro.id,
          serviceId: servicio.id,
          boxId: box.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HORA / 2),
          status: o.status ?? "PENDING",
          priceAtBooking: o.precio ?? 18000,
        },
      });
      return { id: a.id, clientId, professionalId: a.professionalId, startsAt };
    };
  };
  const turnoA = await negocio(base.a.id);
  const turnoB = await negocio(base.b.id);
  const tOtro = (await turnoB("T-OTRO")).id;
  sembrado = { base, turnoA, tOtro };
  return sembrado;
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function comoRecepcion<R>(s: Sembrado, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió (¿tiró crudo?): ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

/** Turno, cobros (con nota) y asientos del libro de esos cobros, mirados como dueño de la base. */
async function foto(s: Sembrado, appointmentId: string) {
  const duenio = await prismaComoDuenio(s.base);
  const [turno, cobros] = await Promise.all([
    duenio.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { status: true } }),
    duenio.collection.findMany({ where: { appointmentId }, select: { id: true, amount: true, method: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const libro = await duenio.cashMovement.findMany({
    where: { collectionId: { in: cobros.map((c) => c.id) } },
    select: { type: true, method: true, amount: true },
    orderBy: { createdAt: "asc" },
  });
  return {
    status: turno.status,
    cobros: cobros.map((c) => ({ amount: c.amount.toNumber(), method: c.method })),
    libro: libro.map((m) => ({ type: m.type, method: m.method, amount: Number(m.amount) })),
  };
}

const saldoDe = async (s: Sembrado, id: string) => {
  const duenio = await prismaComoDuenio(s.base);
  const [a, cobros] = await Promise.all([
    duenio.appointment.findUniqueOrThrow({ where: { id }, select: { priceAtBooking: true } }),
    duenio.collection.findMany({ where: { appointmentId: id }, select: { amount: true } }),
  ]);
  return (a.priceAtBooking ?? 0) - cobros.reduce((x, c) => x + c.amount.toNumber(), 0);
};

const YA_NO_EXISTE = { ok: false, error: "Ese turno ya no existe. Recargá la agenda." };
const PAGOS_18000 = JSON.stringify([
  { metodo: "EFECTIVO", monto: 10000 },
  { metodo: "MERCADOPAGO", monto: 8000 },
]);

test("CH-023 · dos cobros + COMPLETED + dos asientos, atómicos; un segundo envío no cobra de nuevo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { terminarYCobrarDividido } = await import("./cobro-actions");
  const { id } = await s.turnoA("Laura");
  const campos = { appointmentId: id, pagos: PAGOS_18000, vino: "on" };
  assert.deepEqual(await comoRecepcion(s, () => terminarYCobrarDividido(fd(campos))), { ok: true });
  const esperado = {
    status: "COMPLETED",
    cobros: [
      { amount: 10000, method: "EFECTIVO" },
      { amount: 8000, method: "MERCADOPAGO" },
    ],
    libro: [
      { type: "VENTA", method: "EFECTIVO", amount: 10000 },
      { type: "VENTA", method: "MP", amount: 8000 },
    ],
  };
  assert.deepEqual(await foto(s, id), esperado);
  assert.deepEqual(await comoRecepcion(s, () => terminarYCobrarDividido(fd(campos))), { ok: false, error: "Ese turno ya está cerrado." });
  assert.deepEqual(await foto(s, id), esperado, "el segundo envío no tocó nada");
});

test("CH-023 · si la base se corta en el SEGUNDO cobro, no queda ningún cobro ni asiento y el turno no cambia", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { terminarYCobrarDividido } = await import("./cobro-actions");
  const { id } = await s.turnoA("Martina");
  // El corte: un disparador que hace fallar la inserción de la línea 2 de 2 de ESTE turno, después de
  // que la línea 1 (cobro + asiento) ya se escribió adentro de la misma transacción.
  await duenio.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION corte_simulado() RETURNS trigger AS $$
    BEGIN
      IF NEW."appointmentId" = '${id}' AND NEW.note = 'Saldo al terminar (2 de 2)' THEN
        RAISE EXCEPTION 'corte simulado a la mitad del cobro';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  await duenio.$executeRawUnsafe(`CREATE TRIGGER corte_simulado BEFORE INSERT ON "Collection" FOR EACH ROW EXECUTE FUNCTION corte_simulado()`);
  try {
    const r = await comoRecepcion(s, () => terminarYCobrarDividido(fd({ appointmentId: id, pagos: PAGOS_18000, vino: "on" })));
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /no se registró ningún cobro/);
  } finally {
    await duenio.$executeRawUnsafe(`DROP TRIGGER IF EXISTS corte_simulado ON "Collection"`);
  }
  assert.deepEqual(await foto(s, id), { status: "PENDING", cobros: [], libro: [] }, "ni el cobro de $10.000 quedó suelto");
});

test("CH-022 · «Llegó la seña»: $5.000 por transferencia + Confirmado; dos toques seguidos o a la vez, un solo cobro", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarSeniaYConfirmar } = await import("./cobro-actions");
  const { id } = await s.turnoA("Sofía", { horas: 48 });
  const campos = { appointmentId: id, method: "TRANSFERENCIA", amount: "5000" };
  const r = await comoRecepcion(s, () => cobrarSeniaYConfirmar(fd(campos)));
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.cobroId && r.monto === 5000 && r.confirmo);
  const esperado = { status: "CONFIRMED", cobros: [{ amount: 5000, method: "TRANSFERENCIA" }], libro: [{ type: "VENTA", method: "MP", amount: 5000 }] };
  assert.deepEqual(await foto(s, id), esperado);
  // Comprobante informado ≠ cobrado: el cobro y su auditoría dicen «verificada por recepción».
  {
    const duenio = await prismaComoDuenio(s.base);
    const [cobro] = await duenio.collection.findMany({ where: { appointmentId: id }, select: { note: true } });
    assert.match(cobro.note ?? "", /verificada por recepción/);
    const audit = await duenio.auditLog.findFirst({ where: { entityId: id, action: "collect_payment" }, select: { changes: true } });
    assert.match(JSON.stringify(audit?.changes ?? null), /verificada por recepción/);
  }
  const otra = await comoRecepcion(s, () => cobrarSeniaYConfirmar(fd(campos)));
  assert.deepEqual(otra, { ok: true, cobroId: null, monto: 0, confirmo: false, aviso: "La seña ya estaba cobrada y el turno confirmado." });
  assert.deepEqual(await foto(s, id), esperado, "el doble toque no cobró dos veces");

  // Dos toques A LA VEZ (dos recepcionistas, o un doble clic que se escapó).
  const { id: otroId } = await s.turnoA("Julia", { horas: 72 });
  const camposOtro = { appointmentId: otroId, method: "TRANSFERENCIA", amount: "5000" };
  const [x, y] = await Promise.all([
    ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => cobrarSeniaYConfirmar(fd(camposOtro))),
    ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => cobrarSeniaYConfirmar(fd(camposOtro))),
  ]);
  assert.ok(x.tipo === "respuesta" && x.valor.ok && y.tipo === "respuesta" && y.valor.ok, "los dos toques contestan bien");
  assert.deepEqual(await foto(s, otroId), {
    status: "CONFIRMED",
    cobros: [{ amount: 5000, method: "TRANSFERENCIA" }],
    libro: [{ type: "VENTA", method: "MP", amount: 5000 }],
  });
});

test("CH-049 · deshacer la seña recién cobrada: se anula con contrapartida y egreso, y vuelve a Reservado", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarSeniaYConfirmar, deshacerCierre } = await import("./cobro-actions");
  const { id } = await s.turnoA("Paula", { horas: 96 });
  const r = await comoRecepcion(s, () => cobrarSeniaYConfirmar(fd({ appointmentId: id, method: "TRANSFERENCIA", amount: "5000" })));
  assert.ok(r.ok && r.cobroId);
  const cobroId = r.ok ? r.cobroId! : "";
  assert.deepEqual(await comoRecepcion(s, () => deshacerCierre(fd({ appointmentId: id, que: "senia", cobroId }))), { ok: true });
  assert.deepEqual(await foto(s, id), {
    status: "PENDING",
    cobros: [
      { amount: 5000, method: "TRANSFERENCIA" },
      { amount: -5000, method: "TRANSFERENCIA" },
    ],
    libro: [
      { type: "VENTA", method: "MP", amount: 5000 },
      { type: "EGRESO", method: "MP", amount: 5000 },
    ],
  });
  const duenio = await prismaComoDuenio(s.base);
  const anulacion = await duenio.auditLog.findFirst({ where: { entityId: id, action: "void_collection" }, select: { changes: true } });
  assert.equal((anulacion?.changes as { motivo?: string } | null)?.motivo, "deshacer: la seña se marcó por error");
  // Un segundo «Deshacer» no anula dos veces.
  assert.deepEqual(await comoRecepcion(s, () => deshacerCierre(fd({ appointmentId: id, que: "senia", cobroId }))), { ok: true });
  assert.equal((await foto(s, id)).cobros.length, 2);
});

test("CH-024 · «+ Sumar lo que debe»: dos cobros, cada uno a su turno, ambos con saldo $0 y el de hoy terminado", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarVariosTurnos, deudaViejaDelTurno } = await import("./cobro-actions");
  const viejo = await s.turnoA("Lucía", { horas: -24 * 30, status: "COMPLETED", precio: 9000 });
  const hoy = await s.turnoA("Lucía", { horas: -1, precio: 6000, clientId: viejo.clientId });
  assert.deepEqual(await comoRecepcion(s, () => deudaViejaDelTurno(hoy.id)), [
    { turnoId: viejo.id, inicio: viejo.startsAt.toISOString(), servicio: "Piernas + axilas", saldo: 9000 },
  ]);
  const cobros = JSON.stringify([
    { id: hoy.id, monto: 6000 },
    { id: viejo.id, monto: 9000 },
  ]);
  assert.deepEqual(await comoRecepcion(s, () => cobrarVariosTurnos(fd({ cobros, method: "EFECTIVO", terminar: hoy.id, vino: "on" }))), { ok: true });
  assert.deepEqual(await foto(s, hoy.id), { status: "COMPLETED", cobros: [{ amount: 6000, method: "EFECTIVO" }], libro: [{ type: "VENTA", method: "EFECTIVO", amount: 6000 }] });
  assert.deepEqual(await foto(s, viejo.id), { status: "COMPLETED", cobros: [{ amount: 9000, method: "EFECTIVO" }], libro: [{ type: "VENTA", method: "EFECTIVO", amount: 9000 }] });
  assert.deepEqual([await saldoDe(s, hoy.id), await saldoDe(s, viejo.id)], [0, 0]);
  assert.deepEqual(await comoRecepcion(s, () => deudaViejaDelTurno(hoy.id)), [], "ya no debe nada");

  // Dos clientas distintas no se mezclan en un cobro.
  const deOtra = await s.turnoA("Mora", { horas: -24 * 40, status: "COMPLETED", precio: 5000 });
  const hoy2 = await s.turnoA("Nina", { horas: -2, precio: 6000 });
  const mezcla = JSON.stringify([
    { id: hoy2.id, monto: 6000 },
    { id: deOtra.id, monto: 5000 },
  ]);
  assert.deepEqual(await comoRecepcion(s, () => cobrarVariosTurnos(fd({ cobros: mezcla, method: "EFECTIVO", terminar: hoy2.id, vino: "on" }))), {
    ok: false,
    error: "Esos turnos son de clientas distintas: cobralos por separado.",
  });
  assert.deepEqual((await foto(s, deOtra.id)).cobros, []);
});

test("CH-026 · deshacer una cancelación: vuelve a Reservado; con el hueco ocupado o pasados 10 min, dice por qué", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { cancelAppointment } = await import("@/lib/actions");
  const { deshacerCierre } = await import("./cobro-actions");
  const turno = await s.turnoA("Rocío", { horas: 120 });
  assert.deepEqual(await comoRecepcion(s, () => cancelAppointment(fd({ appointmentId: turno.id, quien: "clienta" }))), { ok: true });
  assert.deepEqual(await comoRecepcion(s, () => deshacerCierre(fd({ appointmentId: turno.id, que: "cancelacion" }))), { ok: true });
  assert.equal((await foto(s, turno.id)).status, "PENDING");

  // Cancelado otra vez, y alguien ocupa el hueco: no se deshace y nada cambia.
  assert.deepEqual(await comoRecepcion(s, () => cancelAppointment(fd({ appointmentId: turno.id }))), { ok: true });
  const original = await duenio.appointment.findUniqueOrThrow({ where: { id: turno.id } });
  const ocupa = await duenio.appointment.create({
    data: { ...original, id: undefined, status: "PENDING", commissionPayoutId: null },
  });
  const r = await comoRecepcion(s, () => deshacerCierre(fd({ appointmentId: turno.id, que: "cancelacion" })));
  assert.deepEqual(r, { ok: false, error: "No se puede deshacer: ese horario ya se ocupó o se bloqueó. Dale otro turno desde «Dar turno»." });
  assert.equal((await foto(s, turno.id)).status, "CANCELLED");

  // Liberado el hueco pero pasados 10 minutos: tampoco.
  await duenio.appointment.update({ where: { id: ocupa.id }, data: { status: "CANCELLED" } });
  await duenio.auditLog.updateMany({ where: { entityId: turno.id, action: "cancel" }, data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
  const tarde = await comoRecepcion(s, () => deshacerCierre(fd({ appointmentId: turno.id, que: "cancelacion" })));
  assert.equal(tarde.ok, false);
  assert.match(tarde.ok ? "" : tarde.error, /más de 10 minutos/);
  assert.equal((await foto(s, turno.id)).status, "CANCELLED");
});

test("CH-061 · con el id de OTRO negocio: «ya no existe», sin error crudo, 0 cobros y 0 asientos en el otro negocio", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { terminarYCobrarDividido, cobrarSeniaYConfirmar, cobrarVariosTurnos, deshacerCierre, deudaViejaDelTurno } = await import("./cobro-actions");
  const contar = async () => ({
    cobros: await duenio.collection.count({ where: { tenantId: s.base.b.id } }),
    asientos: await duenio.cashMovement.count({ where: { tenantId: s.base.b.id } }),
    turno: (await duenio.appointment.findUniqueOrThrow({ where: { id: s.tOtro }, select: { status: true } })).status,
  });
  const antes = await contar();
  assert.deepEqual(await comoRecepcion(s, () => terminarYCobrarDividido(fd({ appointmentId: s.tOtro, pagos: PAGOS_18000, vino: "on" }))), YA_NO_EXISTE);
  assert.deepEqual(await comoRecepcion(s, () => cobrarSeniaYConfirmar(fd({ appointmentId: s.tOtro, method: "TRANSFERENCIA", amount: "5000" }))), YA_NO_EXISTE);
  assert.deepEqual(await comoRecepcion(s, () => cobrarVariosTurnos(fd({ cobros: JSON.stringify([{ id: s.tOtro, monto: 5000 }]), method: "EFECTIVO" }))), YA_NO_EXISTE);
  assert.deepEqual(await comoRecepcion(s, () => deshacerCierre(fd({ appointmentId: s.tOtro, que: "cancelacion" }))), YA_NO_EXISTE);
  assert.deepEqual(await comoRecepcion(s, () => deshacerCierre(fd({ appointmentId: s.tOtro, que: "senia", cobroId: "cualquiera" }))), YA_NO_EXISTE);
  assert.deepEqual(await comoRecepcion(s, () => deudaViejaDelTurno(s.tOtro)), []);
  // Mezclado con un turno propio: tampoco se cobra el propio (todo o nada).
  const propio = await s.turnoA("Ana", { horas: -24 * 50, status: "COMPLETED", precio: 5000 });
  const mezcla = JSON.stringify([
    { id: propio.id, monto: 5000 },
    { id: s.tOtro, monto: 5000 },
  ]);
  assert.deepEqual(await comoRecepcion(s, () => cobrarVariosTurnos(fd({ cobros: mezcla, method: "EFECTIVO" }))), YA_NO_EXISTE);
  assert.deepEqual((await foto(s, propio.id)).cobros, []);
  assert.deepEqual(await contar(), antes, "el otro negocio quedó igual");
});

test("CH-007 · el turno de la profesional que cobra aparte no se cobra dividido desde la recepción", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { terminarYCobrarDividido } = await import("./cobro-actions");
  const { id } = await s.turnoA("Carla", { vero: true });
  const r = await comoRecepcion(s, () => terminarYCobrarDividido(fd({ appointmentId: id, pagos: PAGOS_18000, vino: "on" })));
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /Vero cobra sus propios turnos/);
  assert.deepEqual(await foto(s, id), { status: "PENDING", cobros: [], libro: [] });
});

// Va ÚLTIMO: cierra la caja de hoy del negocio A.
test("cert F-1 · la profesional (sin agenda:manage) registra la seña de SU turno sin redirección: cobra, no confirma; deshace la suya; la de otra, no", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { cobrarSeniaYConfirmar, deshacerCierre } = await import("./cobro-actions");
  const suyo = await s.turnoA("Paula", { horas: 30, vero: true });
  const veroUser = await duenio.user.create({
    data: { tenantId: s.base.a.id, name: "Vero", email: `vero-f1-${Date.now()}@erp.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: suyo.professionalId },
    select: { id: true },
  });
  const comoVero = async <R,>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: s.base.a, usuario: veroUser as never }, fn);
    assert.equal(r.tipo, "respuesta", `la acción no respondió (¿redirigió?): ${JSON.stringify(r)}`);
    if (r.tipo !== "respuesta") throw new Error("sin respuesta");
    return r.valor;
  };

  const r = await comoVero(() => cobrarSeniaYConfirmar(fd({ appointmentId: suyo.id, method: "TRANSFERENCIA", amount: "5000" })));
  assert.ok(r.ok && r.cobroId && r.monto === 5000 && r.confirmo === false, JSON.stringify(r));
  assert.deepEqual(await foto(s, suyo.id), {
    status: "PENDING",
    cobros: [{ amount: 5000, method: "TRANSFERENCIA" }],
    libro: [{ type: "VENTA", method: "MP", amount: 5000 }],
  });
  const [cobro] = await duenio.collection.findMany({ where: { appointmentId: suyo.id }, select: { note: true } });
  assert.match(cobro.note ?? "", /verificada por la profesional/);
  // Un segundo toque no cobra ni confirma.
  assert.deepEqual(await comoVero(() => cobrarSeniaYConfirmar(fd({ appointmentId: suyo.id, method: "TRANSFERENCIA" }))), {
    ok: true,
    cobroId: null,
    monto: 0,
    confirmo: false,
    aviso: "La seña ya estaba registrada. El turno lo confirma la recepción.",
  });

  // Deshacer la suya: se anula y el turno sigue Reservado (no lo había confirmado).
  assert.deepEqual(await comoVero(() => deshacerCierre(fd({ appointmentId: suyo.id, que: "senia", cobroId: r.ok ? (r.cobroId ?? "") : "" }))), { ok: true });
  const despues = await foto(s, suyo.id);
  assert.equal(despues.status, "PENDING");
  assert.equal(despues.libro.length, 2, "VENTA + EGRESO de la anulación");

  // El de Caro: se rechaza con el motivo (nunca una redirección), sin cobro.
  const deCaro = await s.turnoA("Romina", { horas: 30 });
  const ajeno = await comoVero(() => cobrarSeniaYConfirmar(fd({ appointmentId: deCaro.id, method: "TRANSFERENCIA", amount: "5000" })));
  assert.equal(ajeno.ok, false);
  assert.deepEqual(await foto(s, deCaro.id), { status: "PENDING", cobros: [], libro: [] });
});

test("caja cerrada · el cobro dividido se rechaza con el motivo y no cobra nada", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const { terminarYCobrarDividido } = await import("./cobro-actions");
  const { id } = await s.turnoA("Olga");
  await duenio.auditLog.create({
    data: { tenantId: s.base.a.id, actor: "user:test", action: "caja.cierre-diario", entity: "CierreDiario", entityId: todayInBusinessTz(), changes: {} },
  });
  const r = await comoRecepcion(s, () => terminarYCobrarDividido(fd({ appointmentId: id, pagos: PAGOS_18000, vino: "on" })));
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /ya está cerrada/);
  assert.deepEqual(await foto(s, id), { status: "PENDING", cobros: [], libro: [] });
});
