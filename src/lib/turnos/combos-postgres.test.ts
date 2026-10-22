/**
 * Combos y tarjeta (reingeniería CH, Tanda 3 · 3-B), EJECUTADOS contra Postgres local en una base
 * EFÍMERA propia (nunca Neon), con las Server Actions reales y la sesión de la recepción / la dueña.
 *
 * CON las migraciones M1 y M3 (la base del arnés corre todo `prisma migrate deploy`):
 *   · CH-033 · combo B: 4 zonas con Caro → UN turno 10:00-11:10 (70′), $32.000, UNA seña, sus 4 ítems
 *     en orden con la suma igual al precio; la agenda lo lee «4 zonas · 70′»;
 *   · CH-054 · los huecos de Caro ese día: después del combo, 11:20 (no 11:30 ni 12:00);
 *   · reporte por servicio: el turno cobrado entero reparte su plata entre las 4 zonas y suma $32.000;
 *   · ADR-055 / aislamiento: una zona de OTRO negocio, o una zona que la profesional no hace, se
 *     rechaza sin escribir nada;
 *   · mover el combo conserva sus 70′;
 *   · CH-034 · combo A: la dueña da de alta «Piernas + axilas + cavado» (Catálogo → Combos) y los
 *     servicios existentes quedan IDÉNTICOS (id, precio, duración, `updatedAt`); el turno con ese
 *     combo dura 60′ y cuesta el precio del combo; la recepción no puede dar de alta combos;
 *   · CH-031 · Débito: el cobro queda DEBITO y el libro lo asienta en TARJETA, separado de MP.
 *
 * SIN las migraciones (se simulan en ESTA base efímera: la tabla `AppointmentItem` se renombra y los
 * valores DEBITO/CREDITO del enum también — es lo que ve el código en producción hoy):
 *   · el alta con varias zonas se rechaza con «falta activar» y NO deja turno ni seña (también si la
 *     guarda previa dijera que sí: la transacción entera vuelve atrás);
 *   · el alta de una zona (camino A), la agenda y el reporte andan igual;
 *   · CH-032 · un DEBITO forjado se rechaza con la frase de qué hacer en registrarCobroTurno,
 *     completeAppointment, cobrarSeniaYConfirmar, terminarYCobrarDividido y el alta con seña; nada
 *     se escribe.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { camposDelAlta, inicioDeLaHora } from "@/app/admin/(dashboard)/turnos/_agenda/alta-core";
import { aFormData, camposDeCobro, camposDeDividir, camposDeSenia, camposDeTerminar } from "@/app/admin/(dashboard)/turnos/_agenda/campos";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;

type Negocio = { bozo: string; axilas: string; piernas: string; cavado: string; caro: string; lu: string };
type Sembrado = { base: BaseEfimera; a: Negocio; b: Negocio; manana: string; ayer: string; pasado: string };
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
    const s = async (name: string, durationMin: number, price: number, depositAmount: number | null = null) =>
      (await duenio.service.create({ data: { tenantId, name, durationMin, price, depositAmount, updatedAt: new Date("2026-10-01T12:00:00Z") } })).id;
    const bozo = await s("Bozo", 10, 4000);
    const axilas = await s("Axilas", 15, 6000, 5000);
    const piernas = await s("Piernas completas", 30, 14000, 5000);
    const cavado = await s("Cavado c/tira", 15, 8000);
    const caro = await duenio.professional.create({
      data: { tenantId, name: "Caro", boxId: box1.id, services: { connect: [bozo, axilas, piernas, cavado].map((id) => ({ id })) } },
    });
    // Lu NO hace bozo ni cavado (ADR-055: la asignación es por profesional).
    const lu = await duenio.professional.create({ data: { tenantId, name: "Lu", boxId: box3.id, services: { connect: [{ id: axilas }, { id: piernas }] } } });
    for (const p of [caro, lu]) {
      await duenio.workingHours.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId, professionalId: p.id, dayOfWeek, startTime: "00:00", endTime: "23:59" })),
      });
    }
    return { bozo, axilas, piernas, cavado, caro: caro.id, lu: lu.id };
  };
  const a = await negocio(base.a.id);
  const b = await negocio(base.b.id);
  const ahora = Date.now();
  sembrado = {
    base,
    a,
    b,
    manana: dateStrInBusinessTz(new Date(ahora + DIA)),
    pasado: dateStrInBusinessTz(new Date(ahora + 2 * DIA)),
    ayer: dateStrInBusinessTz(new Date(ahora - DIA)),
  };
  return sembrado;
}

async function como<R>(s: Sembrado, quien: "recepcion" | "duenia", fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a[quien] }, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió (¿tiró crudo?): ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

async function fotoDeServicios(s: Sembrado) {
  const duenio = await prismaComoDuenio(s.base);
  const filas = await duenio.service.findMany({
    where: { id: { in: [...Object.values(s.a), ...Object.values(s.b)] } },
    orderBy: { id: "asc" },
    select: { id: true, name: true, durationMin: true, price: true, residentPrice: true, depositAmount: true, active: true, updatedAt: true },
  });
  return JSON.stringify(filas);
}

const CUATRO = (n: Negocio) => [n.bozo, n.axilas, n.piernas, n.cavado];

function altaCombo(s: Sembrado, p: { dia: string; hora: string; telefono: string; nombre?: string; ids?: string[]; profesional?: string; cobro?: { monto: number; metodo: string } | null }) {
  const ids = p.ids ?? CUATRO(s.a);
  return aFormData(
    camposDelAlta({
      profesionalId: p.profesional ?? s.a.caro,
      servicioId: ids[0],
      servicioIds: ids,
      inicio: inicioDeLaHora(p.dia, p.hora),
      nombre: p.nombre ?? "Laura Gómez",
      telefono: p.telefono,
      deLaZona: false,
      cupon: "",
      cobro: p.cobro === undefined ? { monto: 5000, metodo: "TRANSFERENCIA" } : p.cobro,
      estado: p.cobro === null ? "PENDING" : "CONFIRMED",
      notas: "",
    }),
  );
}

async function turnosDe(s: Sembrado, telefono: string) {
  const duenio = await prismaComoDuenio(s.base);
  return duenio.appointment.findMany({
    where: { tenantId: s.base.a.id, client: { phone: telefono } },
    select: { id: true, startsAt: true, endsAt: true, priceAtBooking: true, serviceId: true, status: true, collections: { select: { amount: true, method: true } } },
  });
}

// ── CON las migraciones (la base del arnés las tiene todas) ─────────────────────────────────

test("CH-033 · combo B: un turno de 70′, $32.000, una seña, 4 ítems que suman el precio; la agenda dice «4 zonas · 70′»", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const antes = await fotoDeServicios(s);
  const { darTurno } = await import("./alta-actions");
  const r = await como(s, "recepcion", () => darTurno(altaCombo(s, { dia: s.manana, hora: "10:00", telefono: "1155667788" }), { monto: 5000 }));
  assert.equal(r.ok, true, JSON.stringify(r));

  const [turno, ...otros] = await turnosDe(s, "1155667788");
  assert.equal(otros.length, 0, "es UN turno");
  assert.equal(turno.startsAt.toISOString(), inicioDeLaHora(s.manana, "10:00"));
  assert.equal((turno.endsAt.getTime() - turno.startsAt.getTime()) / 60000, 70);
  assert.equal(turno.priceAtBooking, 32000);
  assert.equal(turno.serviceId, s.a.bozo, "el principal es la primera zona");
  assert.equal(turno.status, "CONFIRMED");
  assert.deepEqual(turno.collections.map((c) => [Number(c.amount), c.method]), [[5000, "TRANSFERENCIA"]], "UNA seña");
  if (r.ok) assert.equal(r.id, turno.id);

  const duenio = await prismaComoDuenio(s.base);
  const items = await duenio.appointmentItem.findMany({ where: { appointmentId: turno.id }, orderBy: { order: "asc" } });
  assert.deepEqual(
    items.map((i) => [i.serviceId, i.order, i.durationMin, Number(i.priceAtBooking), i.tenantId]),
    [
      [s.a.bozo, 0, 10, 4000, s.base.a.id],
      [s.a.axilas, 1, 15, 6000, s.base.a.id],
      [s.a.piernas, 2, 30, 14000, s.base.a.id],
      [s.a.cavado, 3, 15, 8000, s.base.a.id],
    ],
  );
  assert.equal(items.reduce((x, i) => x + Number(i.priceAtBooking), 0), turno.priceAtBooking);

  // La agenda del día (loader real + proyección): «4 zonas», 70′.
  const { getAgendaDay } = await import("@/lib/actions");
  const { proyectarAgenda } = await import("@/app/admin/(dashboard)/turnos/agenda.server");
  const cruda = await como(s, "recepcion", () => getAgendaDay(s.manana));
  const { turnos } = proyectarAgenda(cruda, { role: "RECEPTION" });
  const enLaAgenda = turnos.find((x) => x.id === turno.id);
  assert.ok(enLaAgenda);
  assert.equal(enLaAgenda.servicio, "4 zonas");
  assert.equal((new Date(enLaAgenda.fin).getTime() - new Date(enLaAgenda.inicio).getTime()) / 60000, 70);
  assert.equal(enLaAgenda.precio, 32000);
  assert.equal(enLaAgenda.saldo, 27000);

  assert.equal(await fotoDeServicios(s), antes, "CH-069: ningún servicio cambió");
});

test("CH-054 · después del combo de 10:00 a 11:10, el próximo horario de Caro es 11:20", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { getAvailableSlotsRange } = await import("@/lib/actions");
  const porDia = await como(s, "recepcion", () => getAvailableSlotsRange(s.a.caro, s.a.piernas, [s.manana], undefined, { pegados: true }));
  const slots = porDia[s.manana];
  const diez = inicioDeLaHora(s.manana, "10:00");
  const siguiente = slots.find((x) => x > diez);
  assert.equal(siguiente, inicioDeLaHora(s.manana, "11:20"));
  // Y para OTRO combo de 70′ ese día, tampoco se ofrece nada que lo pise.
  const combo = await como(s, "recepcion", () => getAvailableSlotsRange(s.a.caro, s.a.bozo, [s.manana], undefined, { serviceIds: CUATRO(s.a), pegados: true }));
  const fin = new Date(inicioDeLaHora(s.manana, "11:10")).getTime();
  const inicio = new Date(diez).getTime();
  for (const x of combo[s.manana]) {
    const a = new Date(x).getTime();
    assert.ok(a + 70 * 60000 + 10 * 60000 <= inicio || a >= fin + 10 * 60000, `${x} pisa el combo de las 10:00`);
  }
  assert.ok(combo[s.manana].includes(inicioDeLaHora(s.manana, "11:20")));
});

test("reporte por servicio: el combo cobrado entero suma cada zona y el total es el precio del turno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { darTurno } = await import("./alta-actions");
  const { completeAppointment, getReportData } = await import("@/lib/actions");
  // Ayer (ya pasó: se puede terminar). Seña $5.000 + saldo $27.000 en efectivo.
  const r = await como(s, "recepcion", () => darTurno(altaCombo(s, { dia: s.ayer, hora: "15:00", telefono: "1144443333", nombre: "Sofía Pérez" }), { monto: 5000 }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const [turno] = await turnosDe(s, "1144443333");
  const fin = await como(s, "recepcion", () => completeAppointment(aFormData(camposDeTerminar({ turnoId: turno.id, saldo: 27000, cobro: { metodo: "EFECTIVO" }, estado: "CONFIRMED" }))));
  assert.equal(fin.ok, true, JSON.stringify(fin));

  const reporte = await como(s, "duenia", () => getReportData(30));
  const porServicio = Object.fromEntries(reporte.porServicio.map((f) => [f.label, Math.round(f.total * 100) / 100]));
  // Sólo este turno está cobrado entero: sus 4 zonas suman $32.000 (la seña del combo de mañana
  // también entra, repartida; se descuenta para mirar sólo éste).
  const total = Math.round(reporte.porServicio.reduce((x, f) => x + f.total, 0) * 100) / 100;
  assert.equal(total, reporte.totalIngresos, "«Por servicio» suma lo mismo que el total");
  const deMananaSenia = { Bozo: 625, Axilas: 937.5, "Piernas completas": 2187.5, "Cavado c/tira": 1250 };
  for (const [servicio, monto] of Object.entries({ Bozo: 4000, Axilas: 6000, "Piernas completas": 14000, "Cavado c/tira": 8000 })) {
    assert.equal(porServicio[servicio], monto + deMananaSenia[servicio as keyof typeof deMananaSenia], servicio);
  }
});

test("ADR-055 / aislamiento: una zona de otro negocio o una que la profesional no hace se rechaza sin escribir", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { darTurno } = await import("./alta-actions");
  const ajena = await como(s, "recepcion", () =>
    darTurno(altaCombo(s, { dia: s.pasado, hora: "12:00", telefono: "1133332222", ids: [s.a.bozo, s.b.axilas] }), { monto: 5000 }),
  );
  assert.deepEqual(ajena, { ok: false, error: "Una de las zonas ya no está disponible. Elegí de nuevo." });
  const luNoHace = await como(s, "recepcion", () =>
    darTurno(altaCombo(s, { dia: s.pasado, hora: "12:00", telefono: "1133332222", ids: [s.a.axilas, s.a.bozo], profesional: s.a.lu }), { monto: 5000 }),
  );
  assert.equal(luNoHace.ok, false);
  if (!luNoHace.ok) assert.match(luNoHace.error, /Lu no hace todas esas zonas/);
  assert.deepEqual(await turnosDe(s, "1133332222"), []);
});

test("mover un combo conserva sus 70′", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { rescheduleAppointment } = await import("@/lib/actions");
  const [turno] = await turnosDe(s, "1155667788");
  const fd = new FormData();
  fd.set("appointmentId", turno.id);
  fd.set("startsAt", inicioDeLaHora(s.pasado, "15:00"));
  const r = await como(s, "recepcion", () => rescheduleAppointment(fd));
  assert.equal(r.ok, true, JSON.stringify(r));
  const [movido] = await turnosDe(s, "1155667788");
  assert.equal(movido.startsAt.toISOString(), inicioDeLaHora(s.pasado, "15:00"));
  assert.equal((movido.endsAt.getTime() - movido.startsAt.getTime()) / 60000, 70);
});

test("CH-034 · combo A: la dueña lo da de alta sin tocar los servicios; el turno con el combo es de 60′ al precio del combo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const antes = await fotoDeServicios(s);
  const { crearCombo, darDeBajaCombo } = await import("@/lib/catalogo/combos-actions");
  const pedido = () => {
    const fd = new FormData();
    fd.set("nombre", "Piernas + axilas + cavado");
    for (const id of [s.a.piernas, s.a.axilas, s.a.cavado]) fd.append("serviceIds", id);
    fd.set("precio", "26000");
    fd.set("duracion", "60");
    fd.append("profesionales", s.a.caro);
    return fd;
  };
  // La recepción no da de alta combos (catalog:manage es de la dueña): la guardia la manda a su inicio.
  const deRecepcion = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => crearCombo(pedido()));
  assert.equal(deRecepcion.tipo, "redireccion");

  const r = await como(s, "duenia", () => crearCombo(pedido()));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(await fotoDeServicios(s), antes, "CH-034: los servicios existentes quedaron idénticos (id, precio, duración, updatedAt)");

  const duenio = await prismaComoDuenio(s.base);
  const combo = await duenio.service.findFirstOrThrow({
    where: { tenantId: s.base.a.id, name: "Piernas + axilas + cavado" },
    select: { id: true, price: true, durationMin: true, description: true, category: { select: { name: true } }, professionals: { select: { id: true } } },
  });
  assert.deepEqual(
    { price: combo.price, durationMin: combo.durationMin, description: combo.description, categoria: combo.category?.name, quienes: combo.professionals.map((p) => p.id) },
    { price: 26000, durationMin: 60, description: "Combo: Piernas completas + Axilas + Cavado c/tira", categoria: "Combos", quienes: [s.a.caro] },
  );
  // Lu no hace cavado: no se le puede asignar el combo. Y el nombre no se repite.
  const conLu = pedido();
  conLu.set("nombre", "Otro combo");
  conLu.append("profesionales", s.a.lu);
  const rLu = await como(s, "duenia", () => crearCombo(conLu));
  assert.equal(rLu.ok, false);
  const repetido = await como(s, "duenia", () => crearCombo(pedido()));
  assert.equal(repetido.ok, false);

  // Se da el turno con el combo como un servicio más (camino A): 60′ y $26.000.
  const { darTurno } = await import("./alta-actions");
  const fd = aFormData(
    camposDelAlta({ profesionalId: s.a.caro, servicioId: combo.id, inicio: inicioDeLaHora(s.pasado, "09:00"), nombre: "Martina Ruiz", telefono: "1122221111", deLaZona: false, cupon: "", cobro: null, estado: "PENDING", notas: "" }),
  );
  const t1 = await como(s, "recepcion", () => darTurno(fd));
  assert.equal(t1.ok, true, JSON.stringify(t1));
  const [turno] = await turnosDe(s, "1122221111");
  assert.equal((turno.endsAt.getTime() - turno.startsAt.getTime()) / 60000, 60);
  assert.equal(turno.priceAtBooking, 26000);
  assert.equal(await fotoDeServicios(s), antes);

  // Baja: sólo de un combo; un servicio común no se da de baja por acá.
  const comun = new FormData();
  comun.set("id", s.a.piernas);
  assert.equal((await como(s, "duenia", () => darDeBajaCombo(comun))).ok, false);
  const baja = new FormData();
  baja.set("id", combo.id);
  assert.equal((await como(s, "duenia", () => darDeBajaCombo(baja))).ok, true);
  assert.equal(await fotoDeServicios(s), antes);
});

test("CH-031 · Débito con M1: el cobro queda DEBITO y el libro lo asienta en TARJETA, separado de MP", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { olvidarMediosDePago } = await import("./medios-habilitados.server");
  olvidarMediosDePago();
  const { registrarCobroTurno } = await import("@/lib/actions");
  const [turno] = await turnosDe(s, "1155667788"); // el combo con saldo $27.000
  const r = await como(s, "recepcion", () => registrarCobroTurno(aFormData(camposDeCobro({ turnoId: turno.id, clave: "debito-1", monto: 14000, metodo: "DEBITO" }))));
  assert.equal(r.ok, true, JSON.stringify(r));
  const duenio = await prismaComoDuenio(s.base);
  const cobro = await duenio.collection.findFirstOrThrow({ where: { appointmentId: turno.id, method: "DEBITO" }, select: { id: true, amount: true } });
  assert.equal(Number(cobro.amount), 14000);
  const asiento = await duenio.cashMovement.findFirst({ where: { collectionId: cobro.id }, select: { method: true, amount: true } });
  assert.deepEqual(asiento && [asiento.method, Number(asiento.amount)], ["TARJETA", 14000]);
});

// ── SIN las migraciones (simuladas en esta base efímera) ──────────────────────────────────────

async function sinMigraciones(s: Sembrado) {
  const c = new pg.Client({ connectionString: s.base.urlDuenio });
  await c.connect();
  try {
    // Producción sin M1 no tiene ninguna fila con DEBITO: la del test CH-031 (de ESTA base efímera) se
    // pasa a Mercado Pago antes de «quitar» el valor del enum, si no Prisma no podría leerla.
    await c.query(`UPDATE "Collection" SET method = 'MERCADOPAGO' WHERE method IN ('DEBITO', 'CREDITO')`);
    await c.query(`UPDATE "Payment" SET method = 'MERCADOPAGO' WHERE method IN ('DEBITO', 'CREDITO')`);
    await c.query(`ALTER TABLE "AppointmentItem" RENAME TO "AppointmentItem_sin_migrar"`);
    await c.query(`ALTER TYPE "PaymentMethod" RENAME VALUE 'DEBITO' TO 'DEBITO_sin_migrar'`);
    await c.query(`ALTER TYPE "PaymentMethod" RENAME VALUE 'CREDITO' TO 'CREDITO_sin_migrar'`);
  } finally {
    await c.end();
  }
  const { olvidarMediosDePago } = await import("./medios-habilitados.server");
  const { olvidarCombosHabilitados } = await import("./combos.server");
  olvidarMediosDePago();
  olvidarCombosHabilitados();
}

test("sin M3 · varias zonas: se rechaza con «falta activar» y no queda ni turno ni seña (la tx vuelve atrás entera)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinMigraciones(s);
  const { combosHabilitados, faltaLaTablaDeItems, olvidarCombosHabilitados } = await import("./combos.server");
  const { MENSAJE_COMBOS_SIN_ACTIVAR } = await import("./combos");
  assert.equal(await combosHabilitados(), false);
  const { darTurno } = await import("./alta-actions");
  const r = await como(s, "recepcion", () => darTurno(altaCombo(s, { dia: s.pasado, hora: "18:00", telefono: "1177776666" }), { monto: 5000 }));
  assert.deepEqual(r, { ok: false, error: MENSAJE_COMBOS_SIN_ACTIVAR });
  assert.deepEqual(await turnosDe(s, "1177776666"), []);

  // Aunque la guarda previa dijera que sí (una carrera con el deploy), la escritura de los ítems
  // falla ADENTRO de la transacción: no queda el turno ni la seña, y se dice lo mismo.
  olvidarCombosHabilitados();
  await combosHabilitados({ $queryRaw: (async () => [{ existe: true }]) as never });
  const r2 = await como(s, "recepcion", () => darTurno(altaCombo(s, { dia: s.pasado, hora: "18:00", telefono: "1177776666" }), { monto: 5000 }));
  assert.deepEqual(r2, { ok: false, error: MENSAJE_COMBOS_SIN_ACTIVAR });
  assert.deepEqual(await turnosDe(s, "1177776666"), []);
  const duenio = await prismaComoDuenio(s.base);
  assert.equal(await duenio.collection.count({ where: { tenantId: s.base.a.id, note: "Seña al reservar", appointment: { client: { phone: "1177776666" } } } }), 0);
  olvidarCombosHabilitados();
  await assert.rejects(duenio.appointmentItem.findMany(), (e) => faltaLaTablaDeItems(e));
});

test("sin M3 · camino A: el alta de una zona, la agenda y el reporte andan igual", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { darTurno } = await import("./alta-actions");
  const { getAgendaDay, getReportData } = await import("@/lib/actions");
  const fd = aFormData(
    camposDelAlta({ profesionalId: s.a.lu, servicioId: s.a.piernas, servicioIds: [s.a.piernas], inicio: inicioDeLaHora(s.pasado, "20:00"), nombre: "Ana Paz", telefono: "1166665555", deLaZona: false, cupon: "", cobro: null, estado: "PENDING", notas: "" }),
  );
  const r = await como(s, "recepcion", () => darTurno(fd));
  assert.equal(r.ok, true, JSON.stringify(r));
  const [turno] = await turnosDe(s, "1166665555");
  assert.equal((turno.endsAt.getTime() - turno.startsAt.getTime()) / 60000, 30);
  // La agenda de mañana (con el combo de antes de «desmigrar»): se lee sin ítems, sin caerse.
  const cruda = await como(s, "recepcion", () => getAgendaDay(s.pasado));
  assert.ok(cruda.appointments.length >= 2);
  assert.ok(cruda.appointments.every((a) => !("items" in a) || a.items === undefined));
  const reporte = await como(s, "duenia", () => getReportData(30));
  assert.ok(reporte.totalIngresos > 0);
});

test("CH-032 · sin M1: DEBITO forjado se rechaza en cada acción de cobro y no se escribe nada", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { mediosDePagoHabilitados } = await import("./medios-habilitados.server");
  const { metodosDePago } = await import("./cobros");
  assert.deepEqual(metodosDePago(await mediosDePagoHabilitados()), ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"]);
  const { registrarCobroTurno, completeAppointment, createManualAppointment } = await import("@/lib/actions");
  const { cobrarSeniaYConfirmar, terminarYCobrarDividido } = await import("./cobro-actions");
  const duenio = await prismaComoDuenio(s.base);
  const [turno] = await turnosDe(s, "1155667788");
  const [reservado] = await turnosDe(s, "1166665555");
  const cobrosAntes = await duenio.collection.count({ where: { tenantId: s.base.a.id } });
  const TARJETA = /Débito y Crédito todavía no están activados/;

  const r1 = await como(s, "recepcion", () => registrarCobroTurno(aFormData(camposDeCobro({ turnoId: turno.id, clave: "debito-2", monto: 1000, metodo: "DEBITO" }))));
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.error, TARJETA);

  const r2 = await como(s, "recepcion", () => completeAppointment(aFormData(camposDeTerminar({ turnoId: turno.id, saldo: 13000, cobro: { metodo: "CREDITO" }, estado: "CONFIRMED" }))));
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.error, TARJETA);

  const r3 = await como(s, "recepcion", () => cobrarSeniaYConfirmar(aFormData(camposDeSenia({ turnoId: reservado.id, monto: 5000, metodo: "DEBITO" }))));
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.match(r3.error, TARJETA);

  const r4 = await como(s, "recepcion", () =>
    terminarYCobrarDividido(aFormData(camposDeDividir({ turnoId: turno.id, lineas: [{ metodo: "EFECTIVO", monto: 6500 }, { metodo: "DEBITO", monto: 6500 }], estado: "CONFIRMED" }))),
  );
  assert.equal(r4.ok, false);
  if (!r4.ok) assert.match(r4.error, TARJETA);

  const alta = aFormData(
    camposDelAlta({ profesionalId: s.a.lu, servicioId: s.a.axilas, inicio: inicioDeLaHora(s.pasado, "21:00"), nombre: "Julia R.", telefono: "1155554444", deLaZona: false, cupon: "", cobro: { monto: 5000, metodo: "DEBITO" }, estado: "CONFIRMED", notas: "" }),
  );
  const r5 = await como(s, "recepcion", () => createManualAppointment(alta));
  assert.equal(r5.ok, false);
  if (!r5.ok) assert.match(r5.error, TARJETA);
  assert.deepEqual(await turnosDe(s, "1155554444"), []);

  assert.equal(await duenio.collection.count({ where: { tenantId: s.base.a.id } }), cobrosAntes, "no se escribió ningún cobro");
  const sigue = await turnosDe(s, "1155667788");
  assert.equal(sigue[0].status, "CONFIRMED", "el turno no se terminó");
});
