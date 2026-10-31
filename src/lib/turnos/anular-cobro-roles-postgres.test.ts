/**
 * Orden del dueño, 31/10/2026: «no se anulan cobros, pero solamente recepcion con autorizacion de
 * caro». Con las Server Actions reales, contra la base y con la sesión de cada rol:
 *
 *   · dueña: anula directo, y saca el código;
 *   · recepción: con el código bueno anula; vencido, de otro cobro, de otro negocio o sin código, no;
 *   · profesional: ni por acción directa, ni por las otras puertas (devolver, deshacer la seña);
 *   · la segunda anulación la frena el control de siempre, y el tope corta los intentos;
 *   · la auditoría dice quién anuló, quién autorizó, el cobro, el monto y el motivo, nunca el código.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla). Con PGlite corre sin RLS.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const HORA = 3_600_000;

type Sembrado = {
  base: BaseEfimera;
  /** Un turno de $18.000 del negocio, con un cobro en efectivo y su asiento. */
  cobrado: (n: NegocioDePrueba, clienta: string, o?: { status?: "PENDING" | "COMPLETED"; cobraAparte?: boolean }) => Promise<{ turnoId: string; cobroId: string }>;
  profesional: { id: string; turnoSuyo: () => Promise<{ turnoId: string; cobroId: string }> };
};
let sembrado: Sembrado | null = null;
let n = 0;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);

  const cobradoDe = async (tenantId: string, professionalId: string, serviceId: string, boxId: string, clienta: string, status: "PENDING" | "COMPLETED") => {
    n += 1;
    const cliente = await duenio.client.create({ data: { tenantId, name: clienta, phone: `11500${String(n).padStart(5, "0")}` } });
    const inicio = new Date(Date.now() + (status === "PENDING" ? 1 : -1) * (24 + n) * HORA);
    const turno = await duenio.appointment.create({
      data: { tenantId, clientId: cliente.id, professionalId, serviceId, boxId, startsAt: inicio, endsAt: new Date(inicio.getTime() + HORA), status, priceAtBooking: 18_000 },
    });
    await duenio.payment.create({ data: { tenantId, appointmentId: turno.id, amount: 18_000, method: "EFECTIVO", status: "APPROVED" } });
    const cobro = await duenio.collection.create({
      data: { tenantId, originType: "APPOINTMENT", originId: turno.id, appointmentId: turno.id, amount: 18_000, method: "EFECTIVO", collectedBy: "test", idempotencyKey: `cobro:${turno.id}` },
    });
    await duenio.cashMovement.create({
      data: { tenantId, type: "VENTA", method: "EFECTIVO", amount: 18_000, reason: `Turno de ${clienta}`, occurredAt: new Date(), collectionId: cobro.id, createdBy: "test" },
    });
    return { turnoId: turno.id, cobroId: cobro.id };
  };

  const catalogo = async (tenantId: string) => {
    const box = await duenio.box.create({ data: { tenantId, name: "Box" } });
    const servicio = await duenio.service.create({ data: { tenantId, name: "Masaje", durationMin: 60, price: 18_000 } });
    const p = await duenio.professional.create({ data: { tenantId, name: "Macarena", boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
    const aparte = await duenio.professional.create({ data: { tenantId, name: "Vero", boxId: box.id, cobraEnMostrador: false, services: { connect: [{ id: servicio.id }] } } });
    return { box, servicio, p, aparte };
  };
  const catalogos = new Map([[base.a.id, await catalogo(base.a.id)], [base.b.id, await catalogo(base.b.id)]]);
  const cobrado: Sembrado["cobrado"] = (negocio, clienta, o = {}) => {
    const c = catalogos.get(negocio.id)!;
    return cobradoDe(negocio.id, o.cobraAparte ? c.aparte.id : c.p.id, c.servicio.id, c.box.id, clienta, o.status ?? "COMPLETED");
  };

  const delA = catalogos.get(base.a.id)!;
  const usuaria = await duenio.user.create({
    data: { tenantId: base.a.id, name: "Macarena", email: `macarena-${Date.now()}@erp.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: delA.p.id },
    select: { id: true },
  });
  sembrado = { base, cobrado, profesional: { id: usuaria.id, turnoSuyo: () => cobrado(base.a, "Clienta de Macarena") } };
  return sembrado;
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function como<R>(negocio: NegocioDePrueba, usuario: { id: string }, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion({ negocio, usuario: usuario as never }, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió: ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

/** Filas de plata del turno, como dueño de la base: la contrapartida y el egreso del libro. */
async function plata(s: Sembrado, cobroId: string, turnoId: string) {
  const duenio = await prismaComoDuenio(s.base);
  const [cobros, egresos] = await Promise.all([
    duenio.collection.count({ where: { appointmentId: turnoId } }),
    duenio.cashMovement.count({ where: { collectionId: cobroId, type: "EGRESO" } }),
  ]);
  return { cobros, egresos };
}
const SIN_ANULAR = { cobros: 1, egresos: 0 };
const ANULADO = { cobros: 2, egresos: 1 };

async function codigoCon(o: { tenantId: string; collectionId: string; duenaId: string; hace?: number }) {
  const { emitirCodigo } = await import("./codigo-anulacion");
  const { authSecret } = await import("@/lib/auth");
  return emitirCodigo({ secreto: authSecret(), tenantId: o.tenantId, collectionId: o.collectionId, duenaId: o.duenaId }, Date.now() - (o.hace ?? 0)).codigo;
}

test("dueña: anula directo, sin código, y el rastro la dice a ella", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno } = await import("@/lib/actions");
  const { a } = s.base;
  const { turnoId, cobroId } = await s.cobrado(a, "Lucía");
  const r = await como(a, a.duenia, () => anularCobroTurno(fd({ collectionId: cobroId, appointmentId: turnoId, motivo: "medio equivocado" })));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(await plata(s, cobroId, turnoId), ANULADO);
  const duenio = await prismaComoDuenio(s.base);
  const log = await duenio.auditLog.findFirstOrThrow({ where: { entityId: turnoId, action: "void_collection" } });
  const c = log.changes as Record<string, unknown>;
  assert.equal(log.actor, `user:${a.duenia.id}`);
  assert.equal(c.autorizadaPor, a.duenia.id);
  assert.equal(c.anuladaPor, a.duenia.id);
});

test("recepción con código bueno: anula, y la auditoría dice quién, quién autorizó, cobro, monto y motivo; nunca el código", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno, autorizarAnulacionCobro } = await import("@/lib/actions");
  const { a } = s.base;
  const { turnoId, cobroId } = await s.cobrado(a, "Mora");

  // La dueña saca el código en ESE cobro: por sí solo no mueve plata.
  const aut = await como(a, a.duenia, () => autorizarAnulacionCobro(fd({ collectionId: cobroId, appointmentId: turnoId })));
  assert.ok(aut.ok, JSON.stringify(aut));
  if (!aut.ok) return;
  assert.match(aut.codigo, /^[2-9A-HJKMNP-Z]{6}$/);
  assert.match(aut.venceA, /^\d{1,2}:\d{2}$/);
  assert.deepEqual(await plata(s, cobroId, turnoId), SIN_ANULAR);

  const r = await como(a, a.recepcion, () =>
    anularCobroTurno(fd({ collectionId: cobroId, appointmentId: turnoId, motivo: "cobré de más", codigo: aut.codigo.toLowerCase() })),
  );
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(await plata(s, cobroId, turnoId), ANULADO);

  const duenio = await prismaComoDuenio(s.base);
  const log = await duenio.auditLog.findFirstOrThrow({ where: { entityId: turnoId, action: "void_collection" } });
  const c = log.changes as Record<string, unknown>;
  assert.equal(log.actor, `user:${a.recepcion.id}`);
  assert.equal(c.anuladaPor, a.recepcion.id);
  assert.equal(c.anuladaPorRol, "RECEPTION");
  assert.equal(c.autorizadaPor, a.duenia.id, "el rastro identifica a la dueña");
  assert.equal(c.autorizadaPorNombre, a.duenia.nombre);
  assert.equal(c.collectionId, cobroId);
  assert.equal(c.monto, 18_000);
  assert.equal(c.motivo, "cobré de más");

  const todos = await duenio.auditLog.findMany({ where: { entityId: turnoId } });
  assert.ok(todos.some((l) => l.action === "authorize_void_collection" && l.actor === `user:${a.duenia.id}`), "queda el rastro de la autorización");
  const texto = JSON.stringify(todos).toUpperCase();
  assert.ok(!texto.includes(aut.codigo), "el código no se guarda en la auditoría");
});

test("recepción: una segunda anulación con el mismo código la frena el control de siempre", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno } = await import("@/lib/actions");
  const { a } = s.base;
  const { turnoId, cobroId } = await s.cobrado(a, "Sol");
  const codigo = await codigoCon({ tenantId: a.id, collectionId: cobroId, duenaId: a.duenia.id });
  const campos = { collectionId: cobroId, appointmentId: turnoId, motivo: "doble toque", codigo };
  assert.deepEqual(await como(a, a.recepcion, () => anularCobroTurno(fd(campos))), { ok: true });
  assert.deepEqual(await como(a, a.recepcion, () => anularCobroTurno(fd(campos))), { ok: true });
  assert.deepEqual(await plata(s, cobroId, turnoId), ANULADO, "no hay dos reversas ni dos egresos");
  const duenio = await prismaComoDuenio(s.base);
  assert.equal(await duenio.auditLog.count({ where: { entityId: turnoId, action: "void_collection" } }), 1);
});

test("recepción: código vencido, de otro cobro, de otro negocio, de quien no es dueña, o sin código: no anula", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno } = await import("@/lib/actions");
  const { MENSAJE_CODIGO_MALO, MENSAJE_FALTA_CODIGO } = await import("./anulacion");
  const { VENTANA_CODIGO_MS } = await import("./codigo-anulacion");
  const { a, b } = s.base;
  const { turnoId, cobroId } = await s.cobrado(a, "Paz");
  const otro = await s.cobrado(a, "Vera");
  const intentar = (codigo?: string) =>
    como(a, a.recepcion, () => anularCobroTurno(fd({ collectionId: cobroId, appointmentId: turnoId, motivo: "probando", ...(codigo === undefined ? {} : { codigo }) })));

  assert.deepEqual(await intentar(), { ok: false, error: MENSAJE_FALTA_CODIGO }, "sin código");
  assert.deepEqual(await intentar("   "), { ok: false, error: MENSAJE_FALTA_CODIGO }, "en blanco");
  const malo = { ok: false, error: MENSAJE_CODIGO_MALO };
  assert.deepEqual(await intentar(await codigoCon({ tenantId: a.id, collectionId: cobroId, duenaId: a.duenia.id, hace: 2 * VENTANA_CODIGO_MS + 1000 })), malo, "vencido");
  assert.deepEqual(await intentar(await codigoCon({ tenantId: a.id, collectionId: otro.cobroId, duenaId: a.duenia.id })), malo, "de otro cobro");
  assert.deepEqual(await intentar(await codigoCon({ tenantId: b.id, collectionId: cobroId, duenaId: b.duenia.id })), malo, "de otro negocio, con su dueña");
  assert.deepEqual(await intentar(await codigoCon({ tenantId: a.id, collectionId: cobroId, duenaId: a.recepcion.id })), malo, "firmado por quien no es dueña");
  assert.deepEqual(await plata(s, cobroId, turnoId), SIN_ANULAR, "ningún intento escribió");
});

test("el tope de intentos corta, y corta también al código bueno mientras dure", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno } = await import("@/lib/actions");
  const { MENSAJE_TOPE_DE_CODIGOS } = await import("./anulacion");
  const { TOPE_POR_COBRO } = await import("./codigo-anulacion");
  const { a } = s.base;
  const { turnoId, cobroId } = await s.cobrado(a, "Ana");
  const intentar = (codigo: string) => como(a, a.recepcion, () => anularCobroTurno(fd({ collectionId: cobroId, appointmentId: turnoId, motivo: "probando", codigo })));
  for (let i = 0; i < TOPE_POR_COBRO.max; i++) assert.equal((await intentar("ZZZZZZ")).ok, false);
  const bueno = await codigoCon({ tenantId: a.id, collectionId: cobroId, duenaId: a.duenia.id });
  assert.deepEqual(await intentar(bueno), { ok: false, error: MENSAJE_TOPE_DE_CODIGOS });
  assert.deepEqual(await plata(s, cobroId, turnoId), SIN_ANULAR);
});

test("otro negocio: la recepción de B con un código bueno de A no llega al cobro de A, y la dueña de B no autoriza cobros de A", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno, autorizarAnulacionCobro } = await import("@/lib/actions");
  const { a, b } = s.base;
  const { turnoId, cobroId } = await s.cobrado(a, "Noa");
  const codigo = await codigoCon({ tenantId: a.id, collectionId: cobroId, duenaId: a.duenia.id });
  const r = await como(b, b.recepcion, () => anularCobroTurno(fd({ collectionId: cobroId, appointmentId: turnoId, motivo: "de otro negocio", codigo })));
  assert.equal(r.ok, false);
  const aut = await como(b, b.duenia, () => autorizarAnulacionCobro(fd({ collectionId: cobroId, appointmentId: turnoId })));
  assert.equal(aut.ok, false);
  assert.deepEqual(await plata(s, cobroId, turnoId), SIN_ANULAR);
});

test("profesional, por acción directa: no anula ni lo suyo, aunque traiga un código bueno; tampoco autoriza", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno, autorizarAnulacionCobro } = await import("@/lib/actions");
  const { MENSAJE_SIN_ANULAR } = await import("./anulacion");
  const { a } = s.base;
  const { turnoId, cobroId } = await s.profesional.turnoSuyo();
  const codigo = await codigoCon({ tenantId: a.id, collectionId: cobroId, duenaId: a.duenia.id });
  const prof = { id: s.profesional.id };
  assert.deepEqual(await como(a, prof, () => anularCobroTurno(fd({ collectionId: cobroId, appointmentId: turnoId, motivo: "lo mío" }))), { ok: false, error: MENSAJE_SIN_ANULAR });
  assert.deepEqual(await como(a, prof, () => anularCobroTurno(fd({ collectionId: cobroId, appointmentId: turnoId, motivo: "lo mío", codigo }))), { ok: false, error: MENSAJE_SIN_ANULAR });
  const aut = await como(a, prof, () => autorizarAnulacionCobro(fd({ collectionId: cobroId, appointmentId: turnoId })));
  assert.equal(aut.ok, false);
  assert.deepEqual(await plata(s, cobroId, turnoId), SIN_ANULAR);
});

test("recepción no autoriza: sacar el código es de la dueña", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { autorizarAnulacionCobro } = await import("@/lib/actions");
  const { a } = s.base;
  const { turnoId, cobroId } = await s.cobrado(a, "Inés");
  const aut = await como(a, a.recepcion, () => autorizarAnulacionCobro(fd({ collectionId: cobroId, appointmentId: turnoId })));
  assert.equal(aut.ok, false);
});

test("recepción no anula el turno de la profesional que cobra aparte, ni con código; la dueña sí", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularCobroTurno } = await import("@/lib/actions");
  const { a } = s.base;
  const { turnoId, cobroId } = await s.cobrado(a, "Lola", { cobraAparte: true });
  const codigo = await codigoCon({ tenantId: a.id, collectionId: cobroId, duenaId: a.duenia.id });
  const r = await como(a, a.recepcion, () => anularCobroTurno(fd({ collectionId: cobroId, appointmentId: turnoId, motivo: "probando", codigo })));
  assert.deepEqual(r, { ok: false, error: "Vero cobra aparte: anular este cobro lo hace la dueña." });
  assert.deepEqual(await plata(s, cobroId, turnoId), SIN_ANULAR);
  assert.deepEqual(await como(a, a.duenia, () => anularCobroTurno(fd({ collectionId: cobroId, appointmentId: turnoId, motivo: "lo resuelve ella" }))), { ok: true });
});

test("no hay otra puerta: devolver la plata al cerrar el turno es directo sólo para la dueña", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cerrarTurnoSinPrestar } = await import("@/lib/actions");
  const { mensajeSinDevolver } = await import("./anulacion");
  const { a } = s.base;
  const conSenia = await s.cobrado(a, "Jazmín", { status: "PENDING" });
  const cerrar = (u: { id: string }) => como(a, u, () => cerrarTurnoSinPrestar(fd({ appointmentId: conSenia.turnoId, accion: "cancelar", senia: "devolver" })));
  assert.deepEqual(await cerrar(a.recepcion), { ok: false, error: mensajeSinDevolver("con-autorizacion") });
  assert.deepEqual(await plata(s, conSenia.cobroId, conSenia.turnoId), SIN_ANULAR, "recepción: sin plata ni cambio");
  const duenio = await prismaComoDuenio(s.base);
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: conSenia.turnoId } })).status, "PENDING");
  const r = await cerrar(a.duenia);
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(await plata(s, conSenia.cobroId, conSenia.turnoId), ANULADO);
});

test("no hay otra puerta: «no vino» con devolver, la profesional no", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { cerrarTurnoSinPrestar } = await import("@/lib/actions");
  const { mensajeSinDevolver } = await import("./anulacion");
  const { a } = s.base;
  const duenio = await prismaComoDuenio(s.base);
  const { turnoId, cobroId } = await s.profesional.turnoSuyo();
  await duenio.appointment.update({ where: { id: turnoId }, data: { status: "CONFIRMED" } });
  const r = await como(a, { id: s.profesional.id }, () => cerrarTurnoSinPrestar(fd({ appointmentId: turnoId, accion: "no-vino", senia: "devolver" })));
  assert.deepEqual(r, { ok: false, error: mensajeSinDevolver(null) });
  assert.deepEqual(await plata(s, cobroId, turnoId), SIN_ANULAR);
});
