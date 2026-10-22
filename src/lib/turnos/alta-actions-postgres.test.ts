/**
 * «Dar turno» (reingeniería CH, Tanda 2, agente 2-A), EJECUTADO contra Postgres con RLS, con las
 * Server Actions reales y la sesión de la recepción:
 *
 *   · CH-017 · «Ya la mandó»: el turno queda CONFIRMED con la seña cobrada por TRANSFERENCIA, saldo
 *     $9.000, y la acción devuelve el id (para el Listo ✓ y «Atender ahora»);
 *   · CH-021 · «Pedírsela»: queda PENDING con la marca «seña pedida» (AuditLog deposit_requested),
 *     que `seniasPedidas` lee;
 *   · CH-020 · clienta nueva: la ficha se crea con el teléfono normalizado y el turno queda en ella;
 *   · CH-019 · «Atender ahora»: sólo la profesional libre en la franja de ahora;
 *   · aislamiento (CH-060/061/063 en espíritu): marcar la seña de un turno de OTRO negocio contesta
 *     «ya no existe» y no escribe; la lectura de marcas no ve las del otro negocio;
 *   · CH-069 · los servicios no cambian (ni una fila de `Service` se escribe).
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 * Borde conocido: el horario de prueba es 00:00-23:59; entre 23:30 y 24:00 de Buenos Aires la franja
 * de «ahora» no entra y CH-019 se saltea diciéndolo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz, wallHourMinuteInBusinessTz } from "@/lib/datetime";
import { inicioDeLaHora, camposDelAlta, franjaDeAhora } from "@/app/admin/(dashboard)/turnos/_agenda/alta-core";
import { aFormData } from "@/app/admin/(dashboard)/turnos/_agenda/campos";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;

type Negocio = { piernas: string; axilas: string; caro: string; lu: string; boxCaro: string };
type Sembrado = { base: BaseEfimera; a: Negocio; b: Negocio; tOtro: string; manana: string };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);

  const negocio = async (tenantId: string): Promise<Negocio> => {
    const box1 = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
    const box3 = await duenio.box.create({ data: { tenantId, name: "Box 3" } });
    const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas completas", durationMin: 30, price: 14000, depositAmount: 5000 } });
    const axilas = await duenio.service.create({ data: { tenantId, name: "Axilas", durationMin: 15, price: 6000, depositAmount: 5000 } });
    const conecta = { connect: [{ id: piernas.id }, { id: axilas.id }] };
    const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box1.id, services: conecta } });
    const lu = await duenio.professional.create({ data: { tenantId, name: "Lu", boxId: box3.id, services: conecta } });
    for (const p of [caro, lu]) {
      await duenio.workingHours.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId, professionalId: p.id, dayOfWeek, startTime: "00:00", endTime: "23:59" })),
      });
    }
    return { piernas: piernas.id, axilas: axilas.id, caro: caro.id, lu: lu.id, boxCaro: box1.id };
  };
  const a = await negocio(base.a.id);
  const b = await negocio(base.b.id);
  const manana = dateStrInBusinessTz(new Date(Date.now() + DIA));

  // Caro, ocupada AHORA (para «Atender ahora»): un turno que cubre la franja actual entera.
  const cliA = await duenio.client.create({ data: { tenantId: base.a.id, name: "Ocupa a Caro", phone: "1140009999" } });
  const desde = new Date(franjaDeAhora(new Date()));
  await duenio.appointment.create({
    data: {
      tenantId: base.a.id,
      clientId: cliA.id,
      professionalId: a.caro,
      serviceId: a.piernas,
      boxId: a.boxCaro,
      startsAt: desde,
      endsAt: new Date(desde.getTime() + 60 * 60_000),
      status: "CONFIRMED",
      priceAtBooking: 14000,
    },
  });

  // T-OTRO: un turno del negocio B, con su seña pedida por la recepción de B.
  const cliB = await duenio.client.create({ data: { tenantId: base.b.id, name: "T-OTRO", phone: "1140008888" } });
  const otro = await duenio.appointment.create({
    data: {
      tenantId: base.b.id,
      clientId: cliB.id,
      professionalId: b.caro,
      serviceId: b.piernas,
      boxId: (await duenio.professional.findUniqueOrThrow({ where: { id: b.caro } })).boxId!,
      startsAt: new Date(Date.now() + 3 * DIA),
      endsAt: new Date(Date.now() + 3 * DIA + 30 * 60_000),
      status: "PENDING",
      priceAtBooking: 14000,
    },
  });
  await duenio.auditLog.create({ data: { tenantId: base.b.id, actor: "user:b", action: "deposit_requested", entity: "Appointment", entityId: otro.id, channel: "admin" } });

  sembrado = { base, a, b, tOtro: otro.id, manana };
  return sembrado;
}

async function comoRecepcion<R>(s: Sembrado, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió (¿tiró crudo?): ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

async function fotoDeServicios(s: Sembrado) {
  const duenio = await prismaComoDuenio(s.base);
  const filas = await duenio.service.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, durationMin: true, price: true, depositAmount: true, updatedAt: true } });
  return JSON.stringify(filas);
}

test("CH-017 · «Ya la mandó»: CONFIRMED, seña por transferencia, saldo $9.000 y el id del turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const antes = await fotoDeServicios(s);
  const { darTurno } = await import("./alta-actions");
  const inicio = inicioDeLaHora(s.manana, "16:00");
  const fd = aFormData(
    camposDelAlta({ profesionalId: s.a.caro, servicioId: s.a.piernas, inicio, nombre: "Laura Gómez", telefono: "11 5566-7788", deLaZona: false, cupon: "", cobro: { monto: 5000, metodo: "TRANSFERENCIA" }, estado: "CONFIRMED", notas: "" }),
  );
  const r = await comoRecepcion(s, () => darTurno(fd, { pedirSenia: false, monto: 5000 }));
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;
  assert.ok(r.id, "devuelve el id del turno");
  assert.equal(r.seniaPedida, false);
  const duenio = await prismaComoDuenio(s.base);
  const turno = await duenio.appointment.findUniqueOrThrow({ where: { id: r.id! }, select: { status: true, tenantId: true, startsAt: true, professionalId: true } });
  assert.equal(turno.status, "CONFIRMED");
  assert.equal(turno.tenantId, s.base.a.id);
  assert.equal(turno.startsAt.toISOString(), inicio);
  const cobros = await duenio.collection.findMany({ where: { appointmentId: r.id! }, select: { amount: true, method: true } });
  assert.deepEqual(cobros.map((c) => [c.amount.toNumber(), c.method]), [[5000, "TRANSFERENCIA"]], "una sola seña, por transferencia: saldo 14.000 − 5.000 = 9.000");
  assert.equal(await fotoDeServicios(s), antes, "CH-069: ningún servicio cambió");
});

test("CH-021 · «Pedírsela»: PENDING con la marca «seña pedida», que la agenda puede leer", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { darTurno } = await import("./alta-actions");
  const { seniasPedidas } = await import("./senia-actions");
  const fd = aFormData(
    camposDelAlta({ profesionalId: s.a.lu, servicioId: s.a.piernas, inicio: inicioDeLaHora(s.manana, "17:00"), nombre: "Sofía Pérez", telefono: "11 4000-1234", deLaZona: false, cupon: "", cobro: null, estado: "PENDING", notas: "" }),
  );
  const r = await comoRecepcion(s, () => darTurno(fd, { pedirSenia: true, monto: 5000 }));
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok || !r.id) return;
  assert.equal(r.seniaPedida, true);
  const duenio = await prismaComoDuenio(s.base);
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: r.id } })).status, "PENDING");
  assert.equal(await duenio.collection.count({ where: { appointmentId: r.id } }), 0, "pedir la seña no cobra nada");
  const marca = await duenio.auditLog.findFirst({ where: { entityId: r.id, action: "deposit_requested" } });
  assert.equal(marca?.tenantId, s.base.a.id);
  const leidas = await comoRecepcion(s, () => seniasPedidas([r.id!, s.tOtro]));
  assert.deepEqual(Object.keys(leidas), [r.id], "lee la suya y NO la del otro negocio");
});

test("CH-020 · clienta nueva: la ficha se crea con el teléfono normalizado y el turno queda en ella", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { darTurno } = await import("./alta-actions");
  const fd = aFormData(
    camposDelAlta({ profesionalId: s.a.caro, servicioId: s.a.axilas, inicio: inicioDeLaHora(s.manana, "10:00"), nombre: "Martina Ruiz", telefono: "1123456789", deLaZona: false, cupon: "", cobro: null, estado: "PENDING", notas: "" }),
  );
  const r = await comoRecepcion(s, () => darTurno(fd));
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok || !r.id) return;
  const duenio = await prismaComoDuenio(s.base);
  const turno = await duenio.appointment.findUniqueOrThrow({ where: { id: r.id }, select: { client: { select: { name: true, phone: true, tenantId: true } } } });
  assert.deepEqual(turno.client, { name: "Martina Ruiz", phone: "1123456789", tenantId: s.base.a.id });
});

test("cert O-5 · CH-071 · dar un turno sin tocar «De la zona» no pasa la ficha de null a false; destildarla a propósito sí", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const { darTurno } = await import("./alta-actions");
  const ficha = await duenio.client.create({ data: { tenantId: s.base.a.id, name: "Noelia Paz", phone: "1140007001" } });
  const antes = await duenio.client.findUniqueOrThrow({ where: { id: ficha.id }, select: { isResident: true, updatedAt: true } });
  assert.equal(antes.isResident, null, "nunca se le preguntó");
  const alta = (hhmm: string, extra: { deLaZona: boolean; deLaZonaDeLaFicha?: boolean | null }) =>
    aFormData(
      camposDelAlta({ profesionalId: s.a.lu, servicioId: s.a.axilas, inicio: inicioDeLaHora(s.manana, hhmm), nombre: "Noelia Paz", telefono: "11 4000-7001", cupon: "", cobro: null, estado: "PENDING", notas: "", ...extra }),
    );
  const r = await comoRecepcion(s, () => darTurno(alta("08:00", { deLaZona: false, deLaZonaDeLaFicha: null })));
  assert.equal(r.ok, true, JSON.stringify(r));
  const sinTocar = await duenio.client.findUniqueOrThrow({ where: { id: ficha.id }, select: { isResident: true, updatedAt: true } });
  assert.deepEqual(sinTocar, antes, "ni isResident ni updatedAt: el maestro no se tocó");

  // Tildarla es una decisión: queda true. Destildarla después (la ficha decía que sí): false.
  assert.equal((await comoRecepcion(s, () => darTurno(alta("08:30", { deLaZona: true, deLaZonaDeLaFicha: null })))).ok, true);
  assert.equal((await duenio.client.findUniqueOrThrow({ where: { id: ficha.id } })).isResident, true);
  assert.equal((await comoRecepcion(s, () => darTurno(alta("09:00", { deLaZona: false, deLaZonaDeLaFicha: true })))).ok, true);
  assert.equal((await duenio.client.findUniqueOrThrow({ where: { id: ficha.id } })).isResident, false);
});

test("CH-019 · «Atender ahora»: sólo la profesional libre en la franja de ahora", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { hour, minute } = wallHourMinuteInBusinessTz(new Date());
  if (hour === 23 && minute >= 30) {
    t.skip("entre 23:30 y 24:00 la franja de ahora no entra en el horario de prueba (00:00-23:59)");
    return;
  }
  const { libresAhora } = await import("./alta-actions");
  const r = await comoRecepcion(s, () => libresAhora(s.a.axilas));
  assert.equal(r.inicio, franjaDeAhora(new Date()));
  assert.deepEqual(r.profesionales, [s.a.lu], "Caro está ocupada ahora; Lu libre");
  const ajeno = await comoRecepcion(s, () => libresAhora(s.b.axilas));
  assert.deepEqual(ajeno.profesionales, [], "un servicio de otro negocio no devuelve a nadie");
});

test("aislamiento · marcar la seña de un turno de otro negocio: «ya no existe» y no escribe", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { marcarSeniaPedida } = await import("./senia-actions");
  const duenio = await prismaComoDuenio(s.base);
  const antes = await duenio.auditLog.count({ where: { action: "deposit_requested" } });
  const fd = new FormData();
  fd.set("appointmentId", s.tOtro);
  const r = await comoRecepcion(s, () => marcarSeniaPedida(fd));
  assert.deepEqual(r, { ok: false, error: "Ese turno ya no existe. Recargá la agenda." });
  assert.equal(await duenio.auditLog.count({ where: { action: "deposit_requested" } }), antes, "ninguna fila nueva");
});
