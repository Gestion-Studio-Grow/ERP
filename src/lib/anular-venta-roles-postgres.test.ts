/**
 * Orden del dueño, 31/10/2026, extendida a las ventas de mostrador: «no se anulan cobros, pero
 * solamente recepcion con autorizacion de caro». Con las Server Actions reales, contra la base y con
 * la sesión de cada rol:
 *
 *   · dueña: anula directo, y saca el código;
 *   · recepción: con el código bueno anula; vencido, de otra venta, de otro negocio, de otra clase de
 *     objeto o sin código, no; un pedido sin cobrar no lo pide;
 *   · profesional: no llega, ni con un código bueno;
 *   · la caja y el stock quedan coherentes tras anular, también con pago en varios medios;
 *   · un proceso automático no pasa por el código;
 *   · la auditoría dice quién anuló, quién autorizó, la venta, el monto y el motivo; nunca el código.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla). Con PGlite corre sin RLS y sin bloqueos:
 * lo que dependa de la concurrencia real queda pendiente en Postgres.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const TOTAL = 12_000;

type Sembrado = { base: BaseEfimera; profesional: { id: string }; productoDe: Map<string, string> };
let sembrado: Sembrado | null = null;
let n = 100;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const productoDe = new Map<string, string>();
  for (const negocio of [base.a, base.b]) {
    const p = await duenio.product.create({ data: { tenantId: negocio.id, name: "Vacío", saleUnit: "UNIT", price: 6_000, stock: 100, trackStock: true } });
    productoDe.set(negocio.id, p.id);
  }
  const box = await duenio.box.create({ data: { tenantId: base.a.id, name: "Box" } });
  const prof = await duenio.professional.create({ data: { tenantId: base.a.id, name: "Macarena", boxId: box.id } });
  const usuaria = await duenio.user.create({
    data: { tenantId: base.a.id, name: "Macarena", email: `macarena-v-${Date.now()}@erp.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: prof.id },
    select: { id: true },
  });
  sembrado = { base, profesional: usuaria, productoDe };
  return sembrado;
}

type Forma = "un-medio" | "mixto" | "a-cuenta" | "sin-cobrar";

/** Una venta de 2 unidades ($12.000), ya descontada del stock, con su plata en la caja según la forma. */
async function venta(s: Sembrado, negocio: NegocioDePrueba, forma: Forma = "un-medio"): Promise<string> {
  const duenio = await prismaComoDuenio(s.base);
  n += 1;
  const conPlata = forma !== "sin-cobrar";
  const orden = await duenio.order.create({
    data: {
      tenantId: negocio.id,
      code: n,
      customerName: "Mostrador",
      customerPhone: "",
      status: conPlata ? "DELIVERED" : "READY",
      subtotal: TOTAL,
      total: TOTAL,
      paid: conPlata,
      paymentMethod: forma === "un-medio" ? "EFECTIVO" : forma === "mixto" ? "EFECTIVO" : null,
      items: { create: [{ tenantId: negocio.id, productId: s.productoDe.get(negocio.id)!, name: "Vacío", saleUnit: "UNIT", quantity: 2, unitPrice: 6_000, lineTotal: TOTAL }] },
    },
    select: { id: true },
  });
  await duenio.product.update({ where: { id: s.productoDe.get(negocio.id)! }, data: { stock: { decrement: 2 } } });
  if (forma === "un-medio") {
    await duenio.cashMovement.create({ data: { tenantId: negocio.id, type: "VENTA", method: "EFECTIVO", amount: TOTAL, orderId: orden.id, occurredAt: new Date(), createdBy: "test" } });
  }
  if (forma === "mixto") {
    for (const [method, cash, monto] of [["EFECTIVO", "EFECTIVO", 7_000], ["MERCADOPAGO", "MP", 5_000]] as const) {
      const c = await duenio.collection.create({
        data: { tenantId: negocio.id, originType: "ORDER", originId: orden.id, orderId: orden.id, amount: monto, method, collectedBy: "test", idempotencyKey: `pago-mixto:${orden.id}:${method}` },
      });
      await duenio.cashMovement.create({ data: { tenantId: negocio.id, type: "VENTA", method: cash, amount: monto, collectionId: c.id, occurredAt: new Date(), createdBy: `pago-mixto:${orden.id}` } });
    }
  }
  return orden.id;
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

/** La cuenta del libro y del stock de ESA venta, leída como dueño de la base. */
async function estado(s: Sembrado, negocio: NegocioDePrueba, orderId: string) {
  const duenio = await prismaComoDuenio(s.base);
  const orden = await duenio.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, collections: { select: { id: true } } } });
  const movs = await duenio.cashMovement.findMany({
    where: { tenantId: negocio.id, OR: [{ orderId }, { collectionId: { in: orden.collections.map((c) => c.id) } }] },
    select: { type: true, method: true, amount: true },
  });
  const saldo: Record<string, number> = {};
  for (const m of movs) saldo[m.method] = (saldo[m.method] ?? 0) + (m.type === "EGRESO" ? -m.amount : m.amount);
  const stock = await duenio.stockMovement.count({ where: { orderId } });
  return { status: orden.status, egresos: movs.filter((m) => m.type === "EGRESO").length, saldo, movimientosDeStock: stock };
}

const stockDe = async (s: Sembrado, negocio: NegocioDePrueba) =>
  (await (await prismaComoDuenio(s.base)).product.findUniqueOrThrow({ where: { id: s.productoDe.get(negocio.id)! }, select: { stock: true } })).stock;

async function codigoCon(o: { tenantId: string; objetoId: string; duenaId: string; hace?: number }) {
  const { emitirCodigo } = await import("@/lib/turnos/codigo-anulacion");
  const { authSecret } = await import("@/lib/auth");
  return emitirCodigo({ secreto: authSecret(), tenantId: o.tenantId, objetoId: o.objetoId, duenaId: o.duenaId }, Date.now() - (o.hace ?? 0)).codigo;
}

const SIN_TOCAR = (saldo: Record<string, number>) => ({ status: "DELIVERED", egresos: 0, saldo, movimientosDeStock: 0 });

test("dueña: anula directo, sin código; la caja vuelve a cero, el stock vuelve y el rastro la dice a ella", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta } = await import("@/lib/order-actions");
  const { a } = s.base;
  const id = await venta(s, a);
  const antes = await stockDe(s, a);
  const r = await como(a, a.duenia, () => anularVenta(null, fd({ id, motivo: "se pesó mal" })));
  assert.equal(r?.ok, true, JSON.stringify(r));
  assert.deepEqual(await estado(s, a, id), { status: "CANCELLED", egresos: 1, saldo: { EFECTIVO: 0 }, movimientosDeStock: 1 });
  assert.equal(await stockDe(s, a), antes + 2);
  const duenio = await prismaComoDuenio(s.base);
  const log = await duenio.auditLog.findFirstOrThrow({ where: { entityId: id, action: "update" } });
  const c = log.changes as Record<string, unknown>;
  assert.equal(log.actor, `user:${a.duenia.id}`);
  assert.equal(c.autorizadaPor, a.duenia.id);
});

test("dueña: el motivo le sigue siendo opcional, como antes de la orden", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta } = await import("@/lib/order-actions");
  const { a } = s.base;
  const id = await venta(s, a);
  const r = await como(a, a.duenia, () => anularVenta(null, fd({ id, motivo: "" })));
  assert.equal(r?.ok, true, JSON.stringify(r));
});

test("recepción con código bueno: anula, y la auditoría dice quién, quién autorizó, venta, monto y motivo; nunca el código", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta, autorizarAnulacionVenta } = await import("@/lib/order-actions");
  const { a } = s.base;
  const id = await venta(s, a);
  const stockAntes = await stockDe(s, a);

  const aut = await como(a, a.duenia, () => autorizarAnulacionVenta(fd({ orderId: id })));
  assert.ok(aut.ok, JSON.stringify(aut));
  if (!aut.ok) return;
  assert.match(aut.codigo, /^[2-9A-HJKMNP-Z]{6}$/);
  assert.deepEqual(await estado(s, a, id), SIN_TOCAR({ EFECTIVO: TOTAL }), "sacar el código no mueve plata");

  const r = await como(a, a.recepcion, () => anularVenta(null, fd({ id, motivo: "se pesó mal", codigo: aut.codigo.toLowerCase() })));
  assert.equal(r?.ok, true, JSON.stringify(r));
  assert.deepEqual(await estado(s, a, id), { status: "CANCELLED", egresos: 1, saldo: { EFECTIVO: 0 }, movimientosDeStock: 1 });
  assert.equal(await stockDe(s, a), stockAntes + 2);

  const duenio = await prismaComoDuenio(s.base);
  const log = await duenio.auditLog.findFirstOrThrow({ where: { entityId: id, action: "update" } });
  const c = log.changes as Record<string, unknown>;
  assert.equal(log.actor, `user:${a.recepcion.id}`);
  assert.equal(c.por, a.recepcion.nombre);
  assert.equal(c.autorizadaPor, a.duenia.id);
  assert.equal(c.autorizadaPorNombre, a.duenia.nombre);
  assert.equal(c.montoRevertido, TOTAL);
  assert.equal(c.motivo, "se pesó mal");

  const todos = await duenio.auditLog.findMany({ where: { entityId: id } });
  assert.ok(todos.some((l) => l.action === "authorize_void_collection" && l.actor === `user:${a.duenia.id}`), "queda el rastro de la autorización");
  assert.ok(!JSON.stringify(todos).toUpperCase().includes(aut.codigo), "el código no se guarda en la auditoría");
});

test("recepción con código bueno, venta con varios medios: un solo código, y cada medio vuelve a cero en su columna", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta } = await import("@/lib/order-actions");
  const { objetoDeVenta } = await import("@/lib/turnos/codigo-anulacion");
  const { a } = s.base;
  const id = await venta(s, a, "mixto");
  const codigo = await codigoCon({ tenantId: a.id, objetoId: objetoDeVenta(id), duenaId: a.duenia.id });
  const r = await como(a, a.recepcion, () => anularVenta(null, fd({ id, motivo: "cliente arrepentido", codigo })));
  assert.equal(r?.ok, true, JSON.stringify(r));
  assert.deepEqual(await estado(s, a, id), { status: "CANCELLED", egresos: 2, saldo: { EFECTIVO: 0, MP: 0 }, movimientosDeStock: 1 });
});

test("recepción: sin código, malo, vencido, de otra venta, de otro negocio, de quien no es dueña o de otra clase de objeto: no anula", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta } = await import("@/lib/order-actions");
  const { MENSAJE_CODIGO_MALO_VENTA, MENSAJE_FALTA_CODIGO_VENTA } = await import("@/lib/order-anulacion");
  const { VENTANA_CODIGO_MS, objetoDeVenta, objetoDeCobroDeTaller } = await import("@/lib/turnos/codigo-anulacion");
  const { a, b } = s.base;
  const id = await venta(s, a);
  const otra = await venta(s, a);
  const stockAntes = await stockDe(s, a);
  const intentar = (codigo?: string) => como(a, a.recepcion, () => anularVenta(null, fd({ id, motivo: "probando", ...(codigo === undefined ? {} : { codigo }) })));
  const objeto = objetoDeVenta(id);

  assert.deepEqual(await intentar(), { ok: false, error: MENSAJE_FALTA_CODIGO_VENTA }, "sin código");
  assert.deepEqual(await intentar("   "), { ok: false, error: MENSAJE_FALTA_CODIGO_VENTA }, "en blanco");
  const malo = { ok: false, error: MENSAJE_CODIGO_MALO_VENTA };
  assert.deepEqual(await intentar("ZZZZZZ"), malo, "inventado");
  assert.deepEqual(await intentar(await codigoCon({ tenantId: a.id, objetoId: objeto, duenaId: a.duenia.id, hace: 2 * VENTANA_CODIGO_MS + 1000 })), malo, "vencido");
  assert.deepEqual(await intentar(await codigoCon({ tenantId: a.id, objetoId: objetoDeVenta(otra), duenaId: a.duenia.id })), malo, "de otra venta");
  // Cinco fallos por venta: el tope corta. Lo que sigue va contra otra venta, con otro contador.
  const id2 = await venta(s, a);
  const intentar2 = (codigo: string) => como(a, a.recepcion, () => anularVenta(null, fd({ id: id2, motivo: "probando", codigo })));
  assert.deepEqual(await intentar2(await codigoCon({ tenantId: b.id, objetoId: objetoDeVenta(id2), duenaId: b.duenia.id })), malo, "de otro negocio, con su dueña");
  assert.deepEqual(await intentar2(await codigoCon({ tenantId: a.id, objetoId: objetoDeVenta(id2), duenaId: a.recepcion.id })), malo, "firmado por quien no es dueña");
  assert.deepEqual(await intentar2(await codigoCon({ tenantId: a.id, objetoId: id2, duenaId: a.duenia.id })), malo, "firmado como un cobro de turno con ese id");
  assert.deepEqual(await intentar2(await codigoCon({ tenantId: a.id, objetoId: objetoDeCobroDeTaller(id2), duenaId: a.duenia.id })), malo, "firmado como un cobro de Taller");

  assert.deepEqual(await estado(s, a, id), SIN_TOCAR({ EFECTIVO: TOTAL }), "ningún intento escribió");
  assert.deepEqual(await estado(s, a, id2), SIN_TOCAR({ EFECTIVO: TOTAL }), "ningún intento escribió");
  assert.equal(await stockDe(s, a), stockAntes - 2, "el stock sólo bajó por la venta nueva");
});

test("recepción: una venta a cuenta también pide el código, y un pedido sin cobrar no", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta } = await import("@/lib/order-actions");
  const { MENSAJE_FALTA_CODIGO_VENTA } = await import("@/lib/order-anulacion");
  const { objetoDeVenta } = await import("@/lib/turnos/codigo-anulacion");
  const { a } = s.base;

  const aCuenta = await venta(s, a, "a-cuenta");
  assert.deepEqual(await como(a, a.recepcion, () => anularVenta(null, fd({ id: aCuenta, motivo: "probando" }))), { ok: false, error: MENSAJE_FALTA_CODIGO_VENTA });
  const codigo = await codigoCon({ tenantId: a.id, objetoId: objetoDeVenta(aCuenta), duenaId: a.duenia.id });
  assert.equal((await como(a, a.recepcion, () => anularVenta(null, fd({ id: aCuenta, motivo: "probando", codigo }))))?.ok, true);

  const stockAntes = await stockDe(s, a);
  const sinCobrar = await venta(s, a, "sin-cobrar");
  const r = await como(a, a.recepcion, () => anularVenta(null, fd({ id: sinCobrar, motivo: "no lo retiró" })));
  assert.equal(r?.ok, true, JSON.stringify(r));
  assert.deepEqual(await estado(s, a, sinCobrar), { status: "CANCELLED", egresos: 0, saldo: {}, movimientosDeStock: 1 });
  assert.equal(await stockDe(s, a), stockAntes, "lo que salió volvió");
});

test("recepción: el límite de «sólo lo de hoy» sigue en pie aunque traiga un código bueno", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta } = await import("@/lib/order-actions");
  const { objetoDeVenta } = await import("@/lib/turnos/codigo-anulacion");
  const { a } = s.base;
  const duenio = await prismaComoDuenio(s.base);
  const id = await venta(s, a);
  await duenio.cashMovement.updateMany({ where: { orderId: id }, data: { occurredAt: new Date(Date.now() - 48 * 3_600_000) } });
  const codigo = await codigoCon({ tenantId: a.id, objetoId: objetoDeVenta(id), duenaId: a.duenia.id });
  const r = await como(a, a.recepcion, () => anularVenta(null, fd({ id, motivo: "de anteayer", codigo })));
  assert.equal(r?.ok, false);
  assert.match(String(r && !r.ok ? r.error : ""), /sólo se anulan las ventas cobradas hoy/);
});

test("una segunda anulación con el mismo código la frena el control de siempre", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta } = await import("@/lib/order-actions");
  const { objetoDeVenta } = await import("@/lib/turnos/codigo-anulacion");
  const { a } = s.base;
  const id = await venta(s, a);
  const codigo = await codigoCon({ tenantId: a.id, objetoId: objetoDeVenta(id), duenaId: a.duenia.id });
  const campos = { id, motivo: "doble toque", codigo };
  assert.equal((await como(a, a.recepcion, () => anularVenta(null, fd(campos))))?.ok, true);
  const otra = await como(a, a.recepcion, () => anularVenta(null, fd(campos)));
  assert.equal(otra?.ok, true);
  assert.deepEqual(await estado(s, a, id), { status: "CANCELLED", egresos: 1, saldo: { EFECTIVO: 0 }, movimientosDeStock: 1 }, "no hay dos reversas");
});

test("el tope de intentos corta, y corta también al código bueno mientras dure", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta } = await import("@/lib/order-actions");
  const { MENSAJE_TOPE_DE_CODIGOS } = await import("@/lib/turnos/anulacion");
  const { TOPE_POR_COBRO, objetoDeVenta } = await import("@/lib/turnos/codigo-anulacion");
  const { a, b } = s.base;
  // Con la recepción de B: la de A ya gastó parte del tope por usuario en otros tests.
  const id = await venta(s, b);
  const intentar = (codigo: string) => como(b, b.recepcion, () => anularVenta(null, fd({ id, motivo: "probando", codigo })));
  for (let i = 0; i < TOPE_POR_COBRO.max; i++) assert.equal((await intentar("ZZZZZZ"))?.ok, false);
  const bueno = await codigoCon({ tenantId: b.id, objetoId: objetoDeVenta(id), duenaId: b.duenia.id });
  assert.deepEqual(await intentar(bueno), { ok: false, error: MENSAJE_TOPE_DE_CODIGOS });
  assert.deepEqual(await estado(s, b, id), SIN_TOCAR({ EFECTIVO: TOTAL }));
  assert.ok(a.id !== b.id);
});

test("otro negocio: la recepción de B con un código bueno de A no llega a la venta de A, y la dueña de B no autoriza ventas de A", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta, autorizarAnulacionVenta } = await import("@/lib/order-actions");
  const { objetoDeVenta } = await import("@/lib/turnos/codigo-anulacion");
  const { a, b } = s.base;
  const id = await venta(s, a);
  const codigo = await codigoCon({ tenantId: a.id, objetoId: objetoDeVenta(id), duenaId: a.duenia.id });
  assert.equal((await como(b, b.recepcion, () => anularVenta(null, fd({ id, motivo: "de otro negocio", codigo }))))?.ok, false);
  assert.equal((await como(b, b.duenia, () => autorizarAnulacionVenta(fd({ orderId: id })))).ok, false);
  assert.deepEqual(await estado(s, a, id), SIN_TOCAR({ EFECTIVO: TOTAL }));
});

test("profesional, por acción directa: no anula ni autoriza, aunque traiga un código bueno; no se mueve plata", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta, autorizarAnulacionVenta } = await import("@/lib/order-actions");
  const { objetoDeVenta } = await import("@/lib/turnos/codigo-anulacion");
  const { a } = s.base;
  const id = await venta(s, a);
  const codigo = await codigoCon({ tenantId: a.id, objetoId: objetoDeVenta(id), duenaId: a.duenia.id });
  const anula = await ejecutarAccion({ negocio: a, usuario: s.profesional as never }, () => anularVenta(null, fd({ id, motivo: "lo mío", codigo })));
  assert.notEqual(anula.tipo, "respuesta", "la guardia la saca antes de responder");
  const autoriza = await ejecutarAccion({ negocio: a, usuario: s.profesional as never }, () => autorizarAnulacionVenta(fd({ orderId: id })));
  assert.notEqual(autoriza.tipo, "respuesta");
  assert.deepEqual(await estado(s, a, id), SIN_TOCAR({ EFECTIVO: TOTAL }));
});

test("recepción no autoriza: sacar el código es de la dueña. Y sin plata o ya anulada, no hay código que sacar", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVenta, autorizarAnulacionVenta } = await import("@/lib/order-actions");
  const { a } = s.base;
  const id = await venta(s, a);
  assert.equal((await como(a, a.recepcion, () => autorizarAnulacionVenta(fd({ orderId: id })))).ok, false);
  const sinCobrar = await venta(s, a, "sin-cobrar");
  assert.equal((await como(a, a.duenia, () => autorizarAnulacionVenta(fd({ orderId: sinCobrar })))).ok, false);
  await como(a, a.duenia, () => anularVenta(null, fd({ id, motivo: "ya está" })));
  assert.equal((await como(a, a.duenia, () => autorizarAnulacionVenta(fd({ orderId: id })))).ok, false);
});

test("adentro de la transacción: sin autorización no se anula plata, aunque se saltee la acción; vuelve atrás entera", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVentaConSuCuentaEnTx } = await import("@/lib/order-core");
  const { AnulacionVentaRechazada, MENSAJE_FALTA_CODIGO_VENTA } = await import("@/lib/order-anulacion");
  const duenio = await prismaComoDuenio(s.base);
  const { a } = s.base;
  const id = await venta(s, a);
  const args = (soloSinPlata: boolean) => ({
    orderId: id,
    motivo: "probando",
    actor: "user:x",
    devuelveStock: true,
    diaCerradoHasta: null,
    esDiaCerrado: () => false,
    diaDe: (d: Date) => d.toISOString().slice(0, 10),
    soloSinPlata,
  });
  await assert.rejects(
    duenio.$transaction((tx) => anularVentaConSuCuentaEnTx(tx, a.id, args(true), { conCuentas: false })),
    (e: unknown) => e instanceof AnulacionVentaRechazada && e.message === MENSAJE_FALTA_CODIGO_VENTA,
  );
  assert.deepEqual(await estado(s, a, id), SIN_TOCAR({ EFECTIVO: TOTAL }));
});

test("proceso automático: sin persona no hay código que pedir, y la reversa sale igual", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { anularVentaInTx } = await import("@/lib/order-anulacion");
  const duenio = await prismaComoDuenio(s.base);
  const { a } = s.base;
  const id = await venta(s, a);
  const r = await duenio.$transaction((tx) =>
    anularVentaInTx(tx, a.id, {
      orderId: id,
      motivo: "Devolución avisada por Mercado Pago",
      actor: "sistema:mercadopago",
      devuelveStock: false,
      diaCerradoHasta: null,
      esDiaCerrado: () => false,
      diaDe: (d: Date) => d.toISOString().slice(0, 10),
    }),
  );
  assert.equal(r.applied, true);
  assert.deepEqual(await estado(s, a, id), { status: "CANCELLED", egresos: 1, saldo: { EFECTIVO: 0 }, movimientosDeStock: 0 });
});
