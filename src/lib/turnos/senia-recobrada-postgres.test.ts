/**
 * La seña vuelta a cobrar (cert ronda 2, F1), EJECUTADA contra Postgres con RLS y las Server Actions
 * reales. La clave `senia:<turno>` es por turno: cuando esa seña se deshacía, se anulaba o se devolvía
 * y volvía a llegar, el cobro chocaba contra la clave de la fila ya anulada, contestaba «ya estaba
 * cobrada», no dejaba asiento y confirmaba el turno. La plata quedaba en la mano y fuera del libro.
 *
 *   · las tres vías: deshacer, anular y devolver, más la seña cobrada al reservar;
 *   · varias vueltas sobre el mismo turno;
 *   · la clave sigue frenando el doble cobro verdadero: seguidos, a la vez y con la seña vigente;
 *   · el cierre del día da sin diferencias con la seña vuelta a cobrar (corre último: congela el día).
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const HORA = 3_600_000;

type Sembrado = {
  base: BaseEfimera;
  servicioId: string;
  turno: (clienta: string, status?: "PENDING" | "CONFIRMED") => Promise<string>;
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
  const tenantId = base.a.id;
  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 30, price: 18000, depositAmount: 5000 } });
  const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
  let n = 0;
  const turno = async (clienta: string, status: "PENDING" | "CONFIRMED" = "PENDING") => {
    n += 1;
    const cliente = await duenio.client.create({ data: { tenantId, name: clienta, phone: `11600${String(n).padStart(5, "0")}` } });
    const startsAt = new Date(Date.now() + (24 + n * 24) * HORA);
    const a = await duenio.appointment.create({
      data: { tenantId, clientId: cliente.id, professionalId: caro.id, serviceId: servicio.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + HORA / 2), status, priceAtBooking: 18000 },
    });
    return a.id;
  };
  sembrado = { base, servicioId: servicio.id, turno };
  return sembrado;
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function como<R>(s: Sembrado, usuario: { id: string }, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion({ negocio: s.base.a, usuario }, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió (¿tiró crudo?): ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

async function cobrar(s: Sembrado, id: string, method: string, usuario: { id: string } = s.base.a.recepcion) {
  const { cobrarSeniaYConfirmar } = await import("./cobro-actions");
  return como(s, usuario, () => cobrarSeniaYConfirmar(fd({ appointmentId: id, method, amount: "5000" })));
}

/** Cobra y exige que haya entrado de verdad: devuelve el id del cobro. */
async function cobroNuevo(s: Sembrado, id: string, method: string): Promise<string> {
  const r = await cobrar(s, id, method);
  assert.ok(r.ok && r.cobroId && r.monto === 5000, `la seña tenía que entrar: ${JSON.stringify(r)}`);
  return r.ok ? r.cobroId! : "";
}

async function deshacer(s: Sembrado, id: string, cobroId: string) {
  const { deshacerCierre } = await import("./cobro-actions");
  assert.deepEqual(await como(s, s.base.a.duenia, () => deshacerCierre(fd({ appointmentId: id, que: "senia", cobroId }))), { ok: true });
}

/** Lo que mira quien concilia: turno, filas, libro, `Payment` y saldo. */
async function foto(s: Sembrado, id: string) {
  const duenio = await prismaComoDuenio(s.base);
  const [a, cobros, pago] = await Promise.all([
    duenio.appointment.findUniqueOrThrow({ where: { id }, select: { status: true, priceAtBooking: true } }),
    duenio.collection.findMany({ where: { appointmentId: id }, select: { id: true, amount: true }, orderBy: { createdAt: "asc" } }),
    duenio.payment.findUnique({ where: { appointmentId: id }, select: { amount: true, status: true } }),
  ]);
  const libro = await duenio.cashMovement.findMany({
    where: { collectionId: { in: cobros.map((c) => c.id) } },
    select: { type: true, method: true, amount: true },
    orderBy: { createdAt: "asc" },
  });
  const cobrado = cobros.reduce((x, c) => x + c.amount.toNumber(), 0);
  return {
    status: a.status,
    filas: cobros.map((c) => c.amount.toNumber()),
    libro: libro.map((m) => `${m.type} ${m.method} ${Number(m.amount)}`),
    pago: pago ? { amount: Number(pago.amount), status: pago.status } : null,
    saldo: (a.priceAtBooking ?? 0) - cobrado,
  };
}

const COBRADA = { amount: 5000, status: "APPROVED" };

test("deshacer: la seña vuelta a cobrar entra al libro por su monto y su medio", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await s.turno("Deshacer");
  const primero = await cobroNuevo(s, id, "TRANSFERENCIA");
  await deshacer(s, id, primero);
  assert.equal((await foto(s, id)).status, "PENDING");

  const r = await cobrar(s, id, "EFECTIVO");
  assert.ok(r.ok && r.cobroId && r.monto === 5000 && r.confirmo, JSON.stringify(r));
  assert.equal(r.ok && r.aviso, undefined, "no dice que ya estaba cobrada");
  assert.deepEqual(await foto(s, id), {
    status: "CONFIRMED",
    filas: [5000, -5000, 5000],
    libro: ["VENTA TRANSFERENCIA 5000", "EGRESO TRANSFERENCIA 5000", "VENTA EFECTIVO 5000"],
    pago: COBRADA,
    saldo: 13000,
  });
});

test("anular: la seña anulada y vuelta a cobrar entra al libro; el turno sigue confirmado", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno } = await import("@/lib/actions");
  const id = await s.turno("Anular");
  const collectionId = await cobroNuevo(s, id, "TRANSFERENCIA");
  const anulada = await como(s, s.base.a.duenia, () => anularCobroTurno(fd({ collectionId, appointmentId: id, motivo: "La transferencia rebotó" })));
  assert.equal(anulada.ok, true, JSON.stringify(anulada));
  assert.equal((await foto(s, id)).status, "CONFIRMED");

  const r = await cobrar(s, id, "MERCADOPAGO");
  assert.ok(r.ok && r.cobroId && r.monto === 5000, JSON.stringify(r));
  const f = await foto(s, id);
  assert.equal(f.status, "CONFIRMED");
  assert.deepEqual(f.filas, [5000, -5000, 5000]);
  assert.equal(f.libro.length, 3);
  assert.equal(f.libro[2].startsWith("VENTA "), true);
  assert.equal(f.libro[2].endsWith(" 5000"), true);
  assert.deepEqual(f.pago, COBRADA);
  assert.equal(f.saldo, 13000);
});

test("devolver: cancelar devolviendo, deshacer la cancelación y volver a cobrar entra al libro", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cerrarTurnoSinPrestar } = await import("@/lib/actions");
  const { deshacerCierre } = await import("./cobro-actions");
  const id = await s.turno("Devolver");
  await cobroNuevo(s, id, "EFECTIVO");
  const cerrado = await como(s, s.base.a.duenia, () => cerrarTurnoSinPrestar(fd({ appointmentId: id, accion: "cancelar", senia: "devolver" })));
  assert.deepEqual(cerrado, { ok: true });
  assert.deepEqual(await como(s, s.base.a.duenia, () => deshacerCierre(fd({ appointmentId: id, que: "cancelacion" }))), { ok: true });

  const r = await cobrar(s, id, "EFECTIVO");
  assert.ok(r.ok && r.cobroId && r.monto === 5000, JSON.stringify(r));
  assert.deepEqual(await foto(s, id), {
    status: "CONFIRMED",
    filas: [5000, -5000, 5000],
    libro: ["VENTA EFECTIVO 5000", "EGRESO EFECTIVO 5000", "VENTA EFECTIVO 5000"],
    pago: COBRADA,
    saldo: 13000,
  });
});

test("seña cobrada al reservar (misma clave), anulada y vuelta a cobrar: entra al libro", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno } = await import("@/lib/actions");
  const { claveCobroTurno } = await import("./cobros");
  const duenio = await prismaComoDuenio(s.base);
  const tenantId = s.base.a.id;
  const id = await s.turno("Reserva", "CONFIRMED");
  await duenio.payment.create({ data: { tenantId, appointmentId: id, amount: 5000, method: "EFECTIVO", status: "APPROVED" } });
  const cobro = await duenio.collection.create({
    data: { tenantId, originType: "APPOINTMENT", originId: id, appointmentId: id, amount: 5000, method: "EFECTIVO", note: "Seña al reservar", collectedBy: "test", idempotencyKey: claveCobroTurno("senia", id) },
  });
  await duenio.cashMovement.create({
    data: { tenantId, type: "VENTA", method: "EFECTIVO", amount: 5000, reason: "Seña al reservar", occurredAt: new Date(), collectionId: cobro.id, createdBy: "test" },
  });
  const anulada = await como(s, s.base.a.duenia, () => anularCobroTurno(fd({ collectionId: cobro.id, appointmentId: id, motivo: "Se cargó en otro turno" })));
  assert.equal(anulada.ok, true, JSON.stringify(anulada));

  const r = await cobrar(s, id, "EFECTIVO");
  assert.ok(r.ok && r.cobroId && r.monto === 5000, JSON.stringify(r));
  const f = await foto(s, id);
  assert.deepEqual(f.libro, ["VENTA EFECTIVO 5000", "EGRESO EFECTIVO 5000", "VENTA EFECTIVO 5000"]);
  assert.deepEqual(f.pago, COBRADA);
});

test("varias vueltas sobre el mismo turno: cada cobro tiene su asiento y cada anulación el suyo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const id = await s.turno("Vueltas");
  for (let i = 0; i < 2; i++) await deshacer(s, id, await cobroNuevo(s, id, "EFECTIVO"));
  await cobroNuevo(s, id, "EFECTIVO");
  const f = await foto(s, id);
  assert.deepEqual(f.filas, [5000, -5000, 5000, -5000, 5000]);
  assert.equal(f.libro.filter((m) => m.startsWith("VENTA")).length, 3);
  assert.equal(f.libro.filter((m) => m.startsWith("EGRESO")).length, 2);
  assert.deepEqual(f.pago, COBRADA);
  assert.equal(f.saldo, 13000);
});

test("doble cobro verdadero: vuelta a cobrar, dos toques seguidos o a la vez dan un solo asiento nuevo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarSeniaYConfirmar } = await import("./cobro-actions");
  const esperado = {
    status: "CONFIRMED",
    filas: [5000, -5000, 5000],
    libro: ["VENTA EFECTIVO 5000", "EGRESO EFECTIVO 5000", "VENTA EFECTIVO 5000"],
    pago: COBRADA,
    saldo: 13000,
  };

  // Seguidos.
  const a = await s.turno("Seguidos");
  await deshacer(s, a, await cobroNuevo(s, a, "EFECTIVO"));
  await cobroNuevo(s, a, "EFECTIVO");
  const otra = await cobrar(s, a, "EFECTIVO");
  assert.deepEqual(otra, { ok: true, cobroId: null, monto: 0, confirmo: false, aviso: "La seña ya estaba cobrada y el turno confirmado." });
  assert.deepEqual(await foto(s, a), esperado);

  // A la vez: los dos ven la misma anulación, calculan la misma clave y el índice único deja pasar a uno.
  for (const clienta of ["Carrera1", "Carrera2", "Carrera3"]) {
    const b = await s.turno(clienta);
    await deshacer(s, b, await cobroNuevo(s, b, "EFECTIVO"));
    const campos = { appointmentId: b, method: "EFECTIVO", amount: "5000" };
    const [x, y] = await Promise.all([
      ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => cobrarSeniaYConfirmar(fd(campos))),
      ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => cobrarSeniaYConfirmar(fd(campos))),
    ]);
    assert.ok(x.tipo === "respuesta" && x.valor.ok && y.tipo === "respuesta" && y.valor.ok, `los dos toques contestan bien: ${JSON.stringify([x, y])}`);
    assert.deepEqual(await foto(s, b), esperado, clienta);
  }
});

test("doble cobro verdadero, seña vigente: a la vez, un solo asiento; y una clave vigente nunca cobra otra vez", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cobrarSeniaYConfirmar } = await import("./cobro-actions");
  const id = await s.turno("Vigente");
  const campos = { appointmentId: id, method: "TRANSFERENCIA", amount: "5000" };
  const [x, y] = await Promise.all([
    ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => cobrarSeniaYConfirmar(fd(campos))),
    ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => cobrarSeniaYConfirmar(fd(campos))),
  ]);
  assert.ok(x.tipo === "respuesta" && x.valor.ok && y.tipo === "respuesta" && y.valor.ok);
  assert.deepEqual((await foto(s, id)).libro, ["VENTA TRANSFERENCIA 5000"]);

  // La seña del servicio subió con la anterior en pie: la plata dice «falta» y la clave, «ya está».
  // Regla de siempre: se contesta sin cobrar. El arreglo sólo destraba claves de cobros anulados.
  const otro = await s.turno("SubioLaSenia");
  await cobroNuevo(s, otro, "EFECTIVO");
  const duenio = await prismaComoDuenio(s.base);
  await duenio.service.update({ where: { id: s.servicioId }, data: { depositAmount: 7000 } });
  try {
    const { cobrarSeniaYConfirmar: cobrarOtra } = await import("./cobro-actions");
    const r = await como(s, s.base.a.recepcion, () => cobrarOtra(fd({ appointmentId: otro, method: "EFECTIVO", amount: "2000" })));
    assert.ok(r.ok && r.cobroId === null && r.monto === 0, JSON.stringify(r));
    assert.deepEqual((await foto(s, otro)).libro, ["VENTA EFECTIVO 5000"]);
  } finally {
    await duenio.service.update({ where: { id: s.servicioId }, data: { depositAmount: 5000 } });
  }
});

// Último del archivo: cerrar congela el día y los demás ya no podrían cobrar.
test("cierre: el día con la seña deshecha y vuelta a cobrar cierra sin diferencias, sin sobrante", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cerrarDia, getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const { dateStrInBusinessTz } = await import("@/lib/datetime");
  const duenio = await prismaComoDuenio(s.base);
  const tenantId = s.base.a.id;
  const hoy = dateStrInBusinessTz(new Date());
  const id = await s.turno("Cierre");
  await deshacer(s, id, await cobroNuevo(s, id, "EFECTIVO"));
  await cobroNuevo(s, id, "EFECTIVO");

  assert.equal((await foto(s, id)).libro.filter((m) => m === "VENTA EFECTIVO 5000").length, 2, "la seña vuelta a cobrar está en el libro");

  // El esperado de efectivo del cierre, la cuenta a mano del libro de hoy y la seña en pie: tres veces lo mismo.
  const movs = await duenio.cashMovement.findMany({ where: { tenantId, method: "EFECTIVO" }, select: { type: true, amount: true } });
  const aMano = movs.reduce((x, m) => x + (m.type === "EGRESO" ? -Number(m.amount) : Number(m.amount)), 0);
  const antes = await como(s, s.base.a.duenia, () => getCierreDiarioData(hoy));
  assert.ok(antes, "el cierre del día se puede leer");
  const delCierre = antes.preview.porMedio.EFECTIVO.expected;
  assert.equal(delCierre, aMano, "el cierre espera lo que dice el libro");

  const antesDeCerrar = movs.length;
  const r = await como(s, s.base.a.duenia, () => cerrarDia(fd({ day: hoy, columnas: "1", declarado_EFECTIVO: String(delCierre) })));
  assert.equal(r.ok, true, JSON.stringify(r));
  const sinAjustes = await duenio.cashMovement.count({ where: { tenantId, method: "EFECTIVO" } });
  assert.equal(sinAjustes, antesDeCerrar, "contando lo que entró no hay faltante ni sobrante");
});
