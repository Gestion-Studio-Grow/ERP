/**
 * Orden del dueño, 31/10/2026, extendida a Taller: «no se anulan cobros, pero solamente recepcion con
 * autorizacion de caro». Con las Server Actions reales, contra la base y con la sesión de cada rol.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla). Con PGlite corre sin RLS y sin bloqueos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const MONTO = 50_000;

type Sembrado = { base: BaseEfimera; mecanico: { id: string } };
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
  const box = await duenio.box.create({ data: { tenantId: base.a.id, name: "Elevador" } });
  const prof = await duenio.professional.create({ data: { tenantId: base.a.id, name: "Tito", boxId: box.id } });
  const mecanico = await duenio.user.create({
    data: { tenantId: base.a.id, name: "Tito", email: `tito-${Date.now()}@erp.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: prof.id },
    select: { id: true },
  });
  sembrado = { base, mecanico };
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

/** Una orden con un cobro real, por la acción de cobrar: el pago y su VENTA en el libro. */
async function cobro(s: Sembrado, negocio: NegocioDePrueba): Promise<string> {
  const { registrarPago } = await import("./acciones");
  const duenio = await prismaComoDuenio(s.base);
  n += 1;
  const vehiculo = await duenio.tallerVehiculo.create({ data: { tenantId: negocio.id, clientId: negocio.clientes[0], patente: `AB${100 + n}CD` } });
  const orden = await duenio.tallerOrden.create({ data: { tenantId: negocio.id, numero: n, vehiculoId: vehiculo.id, clientId: negocio.clientes[0], token: `t-${negocio.id}-${n}` } });
  await como(negocio, negocio.recepcion, () => registrarPago(fd({ ordenId: orden.id, medio: "EFECTIVO", monto: String(MONTO) })));
  const pago = await duenio.tallerPago.findFirstOrThrow({ where: { ordenId: orden.id } });
  return pago.id;
}

async function estado(s: Sembrado, pagoId: string) {
  const duenio = await prismaComoDuenio(s.base);
  const pago = await duenio.tallerPago.findUniqueOrThrow({ where: { id: pagoId }, select: { anuladoEl: true } });
  const movs = await duenio.cashMovement.findMany({ where: { tallerPagoId: pagoId }, select: { type: true, method: true, amount: true } });
  return {
    anulado: pago.anuladoEl !== null,
    egresos: movs.filter((m) => m.type === "EGRESO").length,
    saldo: movs.reduce((t, m) => t + (m.type === "EGRESO" ? -m.amount : m.amount), 0),
  };
}
const SIN_ANULAR = { anulado: false, egresos: 0, saldo: MONTO };
const ANULADO = { anulado: true, egresos: 1, saldo: 0 };

async function codigoCon(o: { tenantId: string; objetoId: string; duenaId: string; hace?: number }) {
  const { emitirCodigo } = await import("@/lib/turnos/codigo-anulacion");
  const { authSecret } = await import("@/lib/auth");
  return emitirCodigo({ secreto: authSecret(), tenantId: o.tenantId, objetoId: o.objetoId, duenaId: o.duenaId }, Date.now() - (o.hace ?? 0)).codigo;
}

test("dueña: anula directo, con motivo; el libro vuelve a cero", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularPago } = await import("./acciones");
  const { a } = s.base;
  const id = await cobro(s, a);
  assert.deepEqual(await como(a, a.duenia, () => anularPago(fd({ id, motivo: "medio equivocado" }))), { ok: true });
  assert.deepEqual(await estado(s, id), ANULADO);
  const duenio = await prismaComoDuenio(s.base);
  const log = await duenio.auditLog.findFirstOrThrow({ where: { entityId: id, action: "taller.cobro.anulado" } });
  const c = log.changes as Record<string, unknown>;
  assert.equal(c.autorizadaPor, a.duenia.id);
  assert.equal(c.motivo, "medio equivocado");
  const reversa = await duenio.cashMovement.findFirstOrThrow({ where: { tallerPagoId: id, type: "EGRESO" } });
  assert.match(String(reversa.reason), /medio equivocado/);
});

test("el motivo es obligatorio: sin motivo no anula nadie", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularPago } = await import("./acciones");
  const { a } = s.base;
  const id = await cobro(s, a);
  const r = await como(a, a.duenia, () => anularPago(fd({ id, motivo: "" })));
  assert.equal(r.ok, false);
  assert.deepEqual(await estado(s, id), SIN_ANULAR);
});

test("recepción con código bueno: anula, y la auditoría dice quién, quién autorizó, cobro, monto y motivo; nunca el código", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularPago, autorizarAnulacionPago } = await import("./acciones");
  const { a } = s.base;
  const id = await cobro(s, a);
  const aut = await como(a, a.duenia, () => autorizarAnulacionPago(fd({ id })));
  assert.ok(aut.ok, JSON.stringify(aut));
  if (!aut.ok) return;
  assert.deepEqual(await estado(s, id), SIN_ANULAR, "sacar el código no mueve plata");
  assert.deepEqual(await como(a, a.recepcion, () => anularPago(fd({ id, motivo: "se cobró de más", codigo: aut.codigo.toLowerCase() }))), { ok: true });
  assert.deepEqual(await estado(s, id), ANULADO);

  const duenio = await prismaComoDuenio(s.base);
  const log = await duenio.auditLog.findFirstOrThrow({ where: { entityId: id, action: "taller.cobro.anulado" } });
  const c = log.changes as Record<string, unknown>;
  assert.equal(log.actor, `user:${a.recepcion.id}`);
  assert.equal(c.anuladaPor, a.recepcion.id);
  assert.equal(c.anuladaPorRol, "RECEPTION");
  assert.equal(c.autorizadaPor, a.duenia.id);
  assert.equal(c.autorizadaPorNombre, a.duenia.nombre);
  assert.equal(c.monto, MONTO);
  assert.equal(c.motivo, "se cobró de más");
  const todos = await duenio.auditLog.findMany({ where: { entityId: id } });
  assert.ok(todos.some((l) => l.action === "authorize_void_collection" && l.actor === `user:${a.duenia.id}`), "queda el rastro de la autorización");
  assert.ok(!JSON.stringify(todos).toUpperCase().includes(aut.codigo), "el código no se guarda en la auditoría");
});

test("recepción: sin código, vencido, de otro cobro, de otro negocio, de quien no es dueña o de otra clase de objeto: no anula", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularPago } = await import("./acciones");
  const { VENTANA_CODIGO_MS, objetoDeCobroDeTaller, objetoDeVenta } = await import("@/lib/turnos/codigo-anulacion");
  const { a, b } = s.base;
  const id = await cobro(s, a);
  const otro = await cobro(s, a);
  const objeto = objetoDeCobroDeTaller(id);
  const intentar = (codigo?: string) => como(a, a.recepcion, () => anularPago(fd({ id, motivo: "probando", ...(codigo === undefined ? {} : { codigo }) })));
  assert.match(String((await intentar()) && ((await intentar()) as { error?: string }).error), /hace falta el código de la dueña/, "sin código");
  assert.equal((await intentar(await codigoCon({ tenantId: a.id, objetoId: objeto, duenaId: a.duenia.id, hace: 2 * VENTANA_CODIGO_MS + 1000 }))).ok, false, "vencido");
  assert.equal((await intentar(await codigoCon({ tenantId: a.id, objetoId: objetoDeCobroDeTaller(otro), duenaId: a.duenia.id }))).ok, false, "de otro cobro");
  assert.equal((await intentar(await codigoCon({ tenantId: b.id, objetoId: objeto, duenaId: b.duenia.id }))).ok, false, "de otro negocio");
  assert.equal((await intentar(await codigoCon({ tenantId: a.id, objetoId: objeto, duenaId: a.recepcion.id }))).ok, false, "firmado por quien no es dueña");
  const id2 = await cobro(s, a);
  const intentar2 = (codigo: string) => como(a, a.recepcion, () => anularPago(fd({ id: id2, motivo: "probando", codigo })));
  assert.equal((await intentar2(await codigoCon({ tenantId: a.id, objetoId: id2, duenaId: a.duenia.id }))).ok, false, "firmado como cobro de turno");
  assert.equal((await intentar2(await codigoCon({ tenantId: a.id, objetoId: objetoDeVenta(id2), duenaId: a.duenia.id }))).ok, false, "firmado como venta");
  assert.deepEqual(await estado(s, id), SIN_ANULAR);
  assert.deepEqual(await estado(s, id2), SIN_ANULAR);
});

test("una segunda anulación no escribe otra contrapartida", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularPago } = await import("./acciones");
  const { objetoDeCobroDeTaller } = await import("@/lib/turnos/codigo-anulacion");
  const { b } = s.base;
  const id = await cobro(s, b);
  const codigo = await codigoCon({ tenantId: b.id, objetoId: objetoDeCobroDeTaller(id), duenaId: b.duenia.id });
  assert.deepEqual(await como(b, b.recepcion, () => anularPago(fd({ id, motivo: "doble toque", codigo }))), { ok: true });
  assert.equal((await como(b, b.recepcion, () => anularPago(fd({ id, motivo: "doble toque", codigo })))).ok, false);
  assert.deepEqual(await estado(s, id), ANULADO);
});

test("otro negocio: ni la recepción ni la dueña de B llegan al cobro de A", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularPago, autorizarAnulacionPago } = await import("./acciones");
  const { objetoDeCobroDeTaller } = await import("@/lib/turnos/codigo-anulacion");
  const { a, b } = s.base;
  const id = await cobro(s, a);
  const codigo = await codigoCon({ tenantId: a.id, objetoId: objetoDeCobroDeTaller(id), duenaId: a.duenia.id });
  assert.equal((await como(b, b.recepcion, () => anularPago(fd({ id, motivo: "de otro negocio", codigo })))).ok, false);
  assert.equal((await como(b, b.duenia, () => anularPago(fd({ id, motivo: "de otro negocio" })))).ok, false);
  assert.equal((await como(b, b.duenia, () => autorizarAnulacionPago(fd({ id })))).ok, false);
  assert.deepEqual(await estado(s, id), SIN_ANULAR);
});

test("mecánico, por acción directa: no anula ni autoriza, aunque traiga un código bueno; no se mueve plata", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularPago, autorizarAnulacionPago } = await import("./acciones");
  const { objetoDeCobroDeTaller } = await import("@/lib/turnos/codigo-anulacion");
  const { a } = s.base;
  const id = await cobro(s, a);
  const codigo = await codigoCon({ tenantId: a.id, objetoId: objetoDeCobroDeTaller(id), duenaId: a.duenia.id });
  const anula = await ejecutarAccion({ negocio: a, usuario: s.mecanico as never }, () => anularPago(fd({ id, motivo: "lo mío", codigo })));
  assert.notEqual(anula.tipo, "respuesta", "la guardia lo saca antes de responder");
  const autoriza = await ejecutarAccion({ negocio: a, usuario: s.mecanico as never }, () => autorizarAnulacionPago(fd({ id })));
  assert.notEqual(autoriza.tipo, "respuesta");
  assert.deepEqual(await estado(s, id), SIN_ANULAR);
});

test("recepción no autoriza: sacar el código es de la dueña", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { autorizarAnulacionPago } = await import("./acciones");
  const { a } = s.base;
  const id = await cobro(s, a);
  assert.equal((await como(a, a.recepcion, () => autorizarAnulacionPago(fd({ id })))).ok, false);
});

test("proceso automático: el asiento de reversa no pide código; el permiso vive en la acción de la persona", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { revertirCobroInTx } = await import("./caja");
  const duenio = await prismaComoDuenio(s.base);
  const { a } = s.base;
  const id = await cobro(s, a);
  const r = await duenio.$transaction((tx) => revertirCobroInTx(tx, a.id, { pagoId: id, detalle: "Reintento del sistema", actor: "sistema:prueba" }));
  assert.deepEqual(r, { revertido: true });
  const movs = await duenio.cashMovement.findMany({ where: { tallerPagoId: id } });
  assert.equal(movs.filter((m) => m.type === "EGRESO").length, 1);
});
