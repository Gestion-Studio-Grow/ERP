/**
 * Liquidación del lunes y cuenta de la administración del country (CH · La Alameda), EJECUTADO
 * contra Postgres con RLS (base efímera local; migraciones con `migrate deploy`, el enum VOUCHER
 * de prisma/pending-gate2/CH_voucher_enum.sql aplicado SÓLO en esta base):
 *
 *   · punta a punta: cobrar con voucher → saldo a cobrar a la administración (la caja no se entera)
 *     → liquidación de la semana → conciliación voucher por voucher → pago a cuenta → saldo 0;
 *   · un voucher en una liquidación no se anula desde el turno;
 *   · doble conciliación (en serie y a la vez): una sola pasa, un solo pago;
 *   · la misma semana dos veces (en serie y a la vez): una sola liquidación;
 *   · dos semanas a la vez con el mismo voucher pendiente: el voucher queda en una sola;
 *   · anular el cobro mientras se genera la liquidación: o se anula o se liquida, nunca las dos;
 *   · descartar una abierta libera sus vouchers; una conciliada no se descarta;
 *   · otro negocio no ve ni concilia la liquidación de A;
 *   · turno con la comisión ya pagada: no se cobra con voucher;
 *   · las Server Actions: apagadas rechazan; prendidas generan y concilian;
 *   · un impago vuelve en la próxima liquidación (también a la vez) o se da de baja con motivo.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const DIA = 24 * 3_600_000;

type Negocio = {
  cliente: (nombre: string) => Promise<string>;
  turno: (clientId: string) => Promise<string>;
  voucher: (clientId: string) => Promise<string>;
};
type Sembrado = { base: BaseEfimera; a: Negocio; b: Negocio };
let sembrado: Sembrado | null = null;
let n = 0;
let semanas = 0;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const sql = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/CH_voucher_enum.sql"), "utf8");
  for (const paso of sql.split("\n").filter((l) => /^ALTER TYPE/.test(l.trim()))) await duenio.$executeRawUnsafe(paso);
  const { olvidarSchemaProbe } = await import("@/lib/schema-probe");
  olvidarSchemaProbe();
  const negocio = async (tenantId: string): Promise<Negocio> => {
    const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
    const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 30, price: 14000 } });
    const prof = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
    const lote = await duenio.voucherLote.create({ data: { tenantId, numero: `L-${tenantId.slice(-4)}`, cantidad: 0 } });
    return {
      cliente: async (nombre) => (await duenio.client.create({ data: { tenantId, name: nombre, phone: `11500090${String(n++).padStart(2, "0")}` } })).id,
      turno: async (clientId) => {
        const startsAt = new Date(Date.now() + 2 * DIA + n++ * 3_600_000);
        return (
          await duenio.appointment.create({
            data: {
              tenantId,
              clientId,
              professionalId: prof.id,
              serviceId: servicio.id,
              boxId: box.id,
              startsAt,
              endsAt: new Date(startsAt.getTime() + 1_800_000),
              status: "CONFIRMED",
              priceAtBooking: 14000,
            },
          })
        ).id;
      },
      voucher: async (clientId) => {
        const numero = `LQ-${String(n++).padStart(4, "0")}`;
        await duenio.voucher.create({ data: { tenantId, numero, loteId: lote.id, clientId, estadoOpenKey: "DISPONIBLE" } });
        return numero;
      },
    };
  };
  sembrado = { base, a: await negocio(base.a.id), b: await negocio(base.b.id) };
  return sembrado;
}

/** Un «hoy» de mentira para liquidar una semana que incluye a ahora: cada llamada, un domingo distinto. */
async function semanaNueva(): Promise<{ hasta: string; hoy: string }> {
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const { sumarDias, ultimaSemanaCerrada } = await import("./liquidacion-core");
  const hoy = sumarDias(todayInBusinessTz(), 8 + 7 * semanas++);
  return { hasta: ultimaSemanaCerrada(hoy).hasta, hoy };
}

const liq = () => import("./liquidacion-repo");

/** Saca de en medio los vouchers usados de tests anteriores (como si ya estuvieran liquidados). */
async function sinPendientes(s: Sembrado) {
  const duenio = await prismaComoDuenio(s.base);
  await duenio.voucher.updateMany({ where: { tenantId: s.base.a.id, estado: "USADO", liquidacionSemanalId: null, liquidadoEn: null }, data: { liquidadoEn: new Date() } });
  // Los impagos de tests anteriores volverían en la próxima liquidación: se los saca igual.
  await duenio.voucher.updateMany({ where: { tenantId: s.base.a.id, resultadoLiquidacion: "IMPAGO", liquidadoEn: null }, data: { liquidadoEn: new Date() } });
  // Y los que quedaron en liquidaciones ABIERTAS de tests anteriores (el pago a cuenta FIFO los toma).
  await duenio.voucher.updateMany({ where: { tenantId: s.base.a.id, liquidadoEn: null, liquidacionSemanal: { estado: "ABIERTA" } }, data: { liquidadoEn: new Date() } });
}

async function voucherCobrado(s: Sembrado, nombre: string, monto?: number) {
  const { cobrarConVoucher } = await import("./voucher-repo");
  const c = await s.a.cliente(nombre);
  const turno = await s.a.turno(c);
  const numero = await s.a.voucher(c);
  const r = await cobrarConVoucher(s.base.a.id, { numero, appointmentId: turno, actor: "user:test", monto });
  return { numero, turno, collectionId: r.collectionId, voucherId: r.voucherId };
}

async function saldo(tenantId: string): Promise<number> {
  const { leerCuentaDeLaAdministracion } = await liq();
  return (await leerCuentaDeLaAdministracion(tenantId)).resumen.saldoCentavos;
}

async function anular(s: Sembrado, appointmentId: string, collectionId: string) {
  const { tenantTransaction } = await import("@/lib/rls");
  const { anularCobroTurnoInTx } = await import("@/lib/turnos/anulacion");
  const { isFrozenDay } = await import("@/lib/caja/cierre-diario");
  const { dateStrInBusinessTz } = await import("@/lib/datetime");
  const { Prisma } = await import("@/generated/prisma/client");
  return tenantTransaction(
    (tx) =>
      anularCobroTurnoInTx(tx, s.base.a.id, {
        collectionId,
        appointmentId,
        precio: 14000,
        motivo: "Se cargó en el turno equivocado",
        actor: "user:test",
        diaCerradoHasta: null,
        esDiaCerrado: isFrozenDay,
        diaDe: dateStrInBusinessTz,
        withSchema: true,
      }),
    { tenantId: s.base.a.id, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function rechaza(p: Promise<unknown>, patron: RegExp) {
  // El rechazo se engancha YA (antes del import): si no, la promesa rechazada queda sin manejar.
  const capturada = p.then(
    () => ({ ok: true as const }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  const { VoucherRechazado } = await import("./voucher-repo");
  const r = await capturada;
  await assert.rejects(r.ok ? Promise.resolve() : Promise.reject(r.e), (e: unknown) => {
    assert.ok(e instanceof VoucherRechazado, `esperaba VoucherRechazado, vino ${String(e)}`);
    assert.match(e.message, patron);
    return true;
  });
}

test("punta a punta: cobro con voucher → saldo de la administración → liquidación → conciliación → pago a cuenta", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const libroAntes = await duenio.cashMovement.count({ where: { tenantId: A } });
  const saldoAntes = await saldo(A);

  const v1 = await voucherCobrado(s, "Ana");
  const v2 = await voucherCobrado(s, "Bea", 4000);
  // Saldo a cobrar a la administración: 14.000 + 4.000. La caja no se enteró.
  assert.equal((await saldo(A)) - saldoAntes, 1_800_000);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: A } }), libroAntes, "el voucher no entra al libro de caja");
  const cuenta0 = await (await liq()).leerCuentaDeLaAdministracion(A);
  assert.deepEqual(cuenta0.sinLiquidar, { cantidad: 2, total: 18000 });

  const { generarLiquidacionSemanal, conciliarLiquidacionSemanal, registrarPagoACuenta, leerLiquidacion } = await liq();
  const sem = await semanaNueva();
  const g = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.equal(g.cantidad, 2);
  assert.equal(g.total, 18000);
  const det = await leerLiquidacion(A, g.liquidacionId);
  assert.deepEqual(
    det?.renglones.map((r) => [r.numero, r.servicio, r.valor]).sort(),
    [
      [v1.numero, "Piernas", 14000],
      [v2.numero, "Piernas", 4000],
    ].sort(),
  );
  // El saldo no cambia por liquidar: cambia por cobrar.
  assert.equal((await saldo(A)) - saldoAntes, 1_800_000);

  // Un voucher liquidado no se anula desde el turno.
  const { AnulacionRechazada } = await import("@/lib/turnos/anulacion");
  await assert.rejects(anular(s, v1.turno, v1.collectionId), (e: unknown) => e instanceof AnulacionRechazada && e.motivo === "voucher-en-liquidacion");
  assert.equal((await duenio.voucher.findFirstOrThrow({ where: { numero: v1.numero } })).estado, "USADO");

  // La misma semana otra vez: no.
  await rechaza(generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" }), /ya tiene su liquidación/);

  // La administración paga 14.000 y no reconoce V2.
  const c = await conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: "2026-11-02", medio: "TRANSFERENCIA", referencia: "TRF 1", rechazados: [v2.numero.toLowerCase()], actor: "user:test" });
  assert.deepEqual([c.total, c.aceptado, c.pagado, c.diferencia, c.pagados, c.impagos], [18000, 14000, 14000, 0, 1, [v2.numero]]);
  const r1 = await duenio.voucher.findFirstOrThrow({ where: { numero: v1.numero } });
  const r2 = await duenio.voucher.findFirstOrThrow({ where: { numero: v2.numero } });
  assert.deepEqual([r1.resultadoLiquidacion, r1.montoLiquidado?.toNumber(), r1.liquidacionRef, Boolean(r1.liquidadoEn)], ["PAGADO", 14000, "TRF 1", true]);
  assert.deepEqual([r2.resultadoLiquidacion, r2.liquidadoEn], ["IMPAGO", null]);
  assert.equal((await saldo(A)) - saldoAntes, 400_000, "queda el voucher impago");
  const cuenta1 = await (await liq()).leerCuentaDeLaAdministracion(A);
  assert.deepEqual(cuenta1.impagos, { cantidad: 1, total: 4000 });
  assert.equal(cuenta1.sinLiquidar.cantidad, 0);

  // Doble conciliación en serie: no.
  await rechaza(
    conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" }),
    /ya se concilió/,
  );
  assert.equal(await duenio.voucherPagoAdministracion.count({ where: { tenantId: A, liquidacionId: g.liquidacionId } }), 1);
  // Una conciliada no se descarta.
  await rechaza((await liq()).descartarLiquidacion(A, { liquidacionId: g.liquidacionId, actor: "user:test" }), /conciliada no se descarta/);

  // La administración paga después el impago: pago a cuenta, idempotente por la clave.
  const clave = "11111111-2222-3333-4444-555555555555";
  // La liquidación va al banco (orden del 09/11): el pago a cuenta nuevo no entra al cajón.
  await rechaza(registrarPagoACuenta(A, { clave: "11111111-2222-3333-4444-cajon0000000", monto: 4000, fecha: "2026-11-03", medio: "EFECTIVO", actor: "user:test" }), /va al banco/);
  const p1 = await registrarPagoACuenta(A, { clave, monto: 4000, fecha: "2026-11-03", medio: "TRANSFERENCIA", actor: "user:test" });
  const p2 = await registrarPagoACuenta(A, { clave, monto: 4000, fecha: "2026-11-03", medio: "TRANSFERENCIA", actor: "user:test" });
  assert.deepEqual([p1.duplicado, p2.duplicado, p2.pagoId], [false, true, p1.pagoId]);
  assert.equal((await saldo(A)) - saldoAntes, 0);
  // Regla del dueño (08/11): cada pago entra a la caja UNA vez, en su medio (MP = la cuenta bancaria).
  const ingresos = await duenio.cashMovement.findMany({
    where: { tenantId: A, createdBy: { startsWith: "cuenta-corriente:voucher-pago:" } },
    select: { type: true, method: true, amount: true, createdBy: true },
  });
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: A } }), libroAntes + 2, "sólo los dos pagos entran al libro");
  assert.deepEqual(
    ingresos.map((m) => [m.type, m.method, m.amount, m.createdBy]).sort(),
    [
      ["INGRESO", "MP", 14000, `cuenta-corriente:voucher-pago:${(await duenio.voucherPagoAdministracion.findFirstOrThrow({ where: { liquidacionId: g.liquidacionId } })).id}`],
      ["INGRESO", "MP", 4000, `cuenta-corriente:voucher-pago:${p1.pagoId}`],
    ].sort(),
  );
});

test("doble conciliación a la vez: una sola pasa y hay un solo pago", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  await voucherCobrado(s, "Carla");
  const { generarLiquidacionSemanal, conciliarLiquidacionSemanal } = await liq();
  const sem = await semanaNueva();
  const g = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  const una = () => conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" });
  const res = await Promise.allSettled([una(), una(), una()]);
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(res.map((r) => (r.status === "rejected" ? String(r.reason) : "ok"))));
  for (const r of res) if (r.status === "rejected") assert.match(String(r.reason), /ya se concilió/);
  assert.equal(await duenio.voucherPagoAdministracion.count({ where: { tenantId: A, liquidacionId: g.liquidacionId } }), 1);
  const l = await duenio.voucherLiquidacion.findUniqueOrThrow({ where: { id: g.liquidacionId } });
  assert.deepEqual([l.estado, l.pagado?.toNumber(), l.diferencia?.toNumber()], ["CONCILIADA", 14000, 0]);
});

test("la misma semana generada a la vez: una sola liquidación; dos semanas a la vez: el voucher queda en una sola", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const v = await voucherCobrado(s, "Dora");
  const { generarLiquidacionSemanal } = await liq();
  const sem = await semanaNueva();
  const misma = await Promise.allSettled([1, 2, 3].map(() => generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" })));
  assert.equal(misma.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await duenio.voucherLiquidacion.count({ where: { tenantId: A, hasta: sem.hasta } }), 1);

  const w = await voucherCobrado(s, "Eva");
  const [s1, s2] = [await semanaNueva(), await semanaNueva()];
  const dos = await Promise.allSettled([
    generarLiquidacionSemanal(A, { hasta: s1.hasta, hoy: s1.hoy, actor: "user:test" }),
    generarLiquidacionSemanal(A, { hasta: s2.hasta, hoy: s2.hoy, actor: "user:test" }),
  ]);
  const ok = dos.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 1, "la segunda no encuentra vouchers (o choca) y no deja nada");
  const vw = await duenio.voucher.findFirstOrThrow({ where: { numero: w.numero } });
  assert.ok(vw.liquidacionSemanalId);
  // Las liquidaciones fallidas no quedaron a medias.
  assert.equal(await duenio.voucherLiquidacion.count({ where: { tenantId: A, hasta: { in: [s1.hasta, s2.hasta] } } }), 1);
  // Cada liquidación cuadra con sus vouchers.
  for (const l of await duenio.voucherLiquidacion.findMany({ where: { tenantId: A } })) {
    const vs = await duenio.voucher.findMany({ where: { liquidacionSemanalId: l.id } });
    assert.equal(l.cantidad, vs.length);
    assert.equal(Math.round(l.total.toNumber() * 100), vs.reduce((acc, x) => acc + Math.round((x.valorCubierto?.toNumber() ?? 0) * 100), 0));
  }
  assert.ok((await duenio.voucher.findFirstOrThrow({ where: { numero: v.numero } })).liquidacionSemanalId);
});

test("reintento en serie: generar la misma semana dos veces da un rechazo claro y no duplica nada", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const v = await voucherCobrado(s, "Flor");
  const { generarLiquidacionSemanal } = await liq();
  const sem = await semanaNueva();
  const auditAntes = await duenio.auditLog.count({ where: { tenantId: A, action: "voucher.liquidacion.generar" } });
  const g = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  // Un voucher nuevo entre los dos clics no se cuela en la liquidación ya generada ni abre otra de la misma semana.
  const w = await voucherCobrado(s, "Gala");
  for (let i = 0; i < 2; i++) {
    await assert.rejects(
      generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" }),
      (e: unknown) => /ya tiene su liquidación/.test(String((e as Error).message)),
    );
  }
  assert.equal(await duenio.voucherLiquidacion.count({ where: { tenantId: A, hasta: sem.hasta } }), 1);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: A, action: "voucher.liquidacion.generar" } }), auditAntes + 1);
  const l = await duenio.voucherLiquidacion.findUniqueOrThrow({ where: { id: g.liquidacionId } });
  assert.deepEqual([l.estado, l.cantidad, l.total.toNumber()], ["ABIERTA", g.cantidad, g.total]);
  assert.equal((await duenio.voucher.findFirstOrThrow({ where: { numero: v.numero } })).liquidacionSemanalId, g.liquidacionId);
  assert.equal((await duenio.voucher.findFirstOrThrow({ where: { numero: w.numero } })).liquidacionSemanalId, null);
});

test("anular el cobro mientras se genera la liquidación: o se anula o se liquida, nunca las dos", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const { generarLiquidacionSemanal } = await liq();
  for (let i = 0; i < 4; i++) {
    await sinPendientes(s);
    const v = await voucherCobrado(s, `Flor ${i}`);
    const sem = await semanaNueva();
    const [an, ge] = await Promise.allSettled([anular(s, v.turno, v.collectionId), generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" })]);
    const fila = await duenio.voucher.findFirstOrThrow({ where: { numero: v.numero } });
    const anulado = an.status === "fulfilled" && an.value.applied;
    const liquidado = ge.status === "fulfilled";
    assert.ok(anulado !== liquidado, `anulado=${anulado} liquidado=${liquidado} (${an.status === "rejected" ? String(an.reason) : ""} ${ge.status === "rejected" ? String(ge.reason) : ""})`);
    if (anulado) assert.deepEqual([fila.estado, fila.liquidacionSemanalId], ["DISPONIBLE", null]);
    else assert.deepEqual([fila.estado, Boolean(fila.liquidacionSemanalId)], ["USADO", true]);
  }
});

test("descartar una liquidación abierta libera sus vouchers para la próxima", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const v = await voucherCobrado(s, "Gala");
  const { generarLiquidacionSemanal, descartarLiquidacion } = await liq();
  const sem = await semanaNueva();
  const g = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.deepEqual(await descartarLiquidacion(A, { liquidacionId: g.liquidacionId, actor: "user:test" }), { liberados: 1 });
  assert.equal(await duenio.voucherLiquidacion.count({ where: { id: g.liquidacionId } }), 0);
  assert.equal((await duenio.voucher.findFirstOrThrow({ where: { numero: v.numero } })).liquidacionSemanalId, null);
  // La misma semana se puede volver a generar, y el voucher entra.
  const otra = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.equal(otra.cantidad, 1);
});

test("pagó de menos sin decir cuál: la diferencia queda anotada y el saldo la muestra", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const A = s.base.a.id;
  const antes = await saldo(A);
  await voucherCobrado(s, "Hilda");
  const { generarLiquidacionSemanal, conciliarLiquidacionSemanal, leerLiquidacion } = await liq();
  const sem = await semanaNueva();
  const g = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  // Sin confirmar la diferencia: rechazo diciendo cuánto falta, y nada cambia.
  await rechaza(
    conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 13999.99, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" }),
    /faltan \$ 0,01/,
  );
  assert.equal((await leerLiquidacion(A, g.liquidacionId))?.estado, "ABIERTA");
  const c = await conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 13999.99, fecha: "2026-11-02", medio: "TRANSFERENCIA", aceptarDiferencia: true, actor: "user:test" });
  assert.equal(c.diferencia, -0.01);
  assert.equal((await saldo(A)) - antes, 1);
  assert.equal((await leerLiquidacion(A, g.liquidacionId))?.diferencia, -0.01);
  // Un rechazado que no está en la liquidación: rechazo (en otra liquidación abierta).
  await voucherCobrado(s, "Irma");
  const sem2 = await semanaNueva();
  const g2 = await generarLiquidacionSemanal(A, { hasta: sem2.hasta, hoy: sem2.hoy, actor: "user:test" });
  await rechaza(
    conciliarLiquidacionSemanal(A, { liquidacionId: g2.liquidacionId, pagado: 0, fecha: "2026-11-02", medio: "OTRO", rechazados: ["NO-EXISTE"], actor: "user:test" }),
    /NO-EXISTE/,
  );
  // Fecha futura: rechazo.
  await rechaza(
    conciliarLiquidacionSemanal(A, { liquidacionId: g2.liquidacionId, pagado: 0, fecha: "2999-01-01", medio: "OTRO", actor: "user:test" }),
    /futura/,
  );
});

test("otro negocio: no ve, no concilia ni descarta la liquidación de A", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const A = s.base.a.id;
  const B = s.base.b.id;
  await voucherCobrado(s, "Juana");
  const { generarLiquidacionSemanal, conciliarLiquidacionSemanal, descartarLiquidacion, leerLiquidacion, leerCuentaDeLaAdministracion } = await liq();
  const sem = await semanaNueva();
  const g = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.equal(await leerLiquidacion(B, g.liquidacionId), null);
  await rechaza(conciliarLiquidacionSemanal(B, { liquidacionId: g.liquidacionId, pagado: 1, fecha: "2026-11-02", medio: "OTRO", actor: "user:test" }), /ya no existe/);
  await rechaza(descartarLiquidacion(B, { liquidacionId: g.liquidacionId, actor: "user:test" }), /ya no existe/);
  const cuentaB = await leerCuentaDeLaAdministracion(B);
  assert.equal(cuentaB.liquidaciones.length, 0);
  assert.equal(cuentaB.resumen.saldoCentavos, 0);
  // Y B no genera con los vouchers de A.
  await rechaza(generarLiquidacionSemanal(B, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" }), /No hay vouchers/);
});

test("turno con la comisión ya pagada: no se cobra con voucher y nada se escribe", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const c = await s.a.cliente("Kika");
  const turno = await s.a.turno(c);
  const numero = await s.a.voucher(c);
  const ap = await duenio.appointment.findUniqueOrThrow({ where: { id: turno }, select: { professionalId: true } });
  const payout = await duenio.commissionPayout.create({
    data: { tenantId: A, professionalId: ap.professionalId, amount: 1000, appointmentCount: 1, periodStart: new Date(), periodEnd: new Date(), settledBy: "user:test" },
  });
  await duenio.appointment.update({ where: { id: turno }, data: { commissionPayoutId: payout.id } });
  const { cobrarConVoucher, VoucherRechazado } = await import("./voucher-repo");
  await assert.rejects(cobrarConVoucher(A, { numero, appointmentId: turno, actor: "user:test" }), (e: unknown) => e instanceof VoucherRechazado && e.motivo === "comision-pagada");
  assert.equal((await duenio.voucher.findFirstOrThrow({ where: { numero } })).estado, "DISPONIBLE");
  assert.equal(await duenio.collection.count({ where: { appointmentId: turno } }), 0);
});

test("las Server Actions: apagadas rechazan sin escribir; prendidas generan y concilian (dueña)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const v = await voucherCobrado(s, "Lola");
  const { generarLiquidacion, conciliarLiquidacion, pagoACuenta } = await import("./liquidacion-actions");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const { ultimaSemanaCerrada } = await import("./liquidacion-core");
  const correr = async <T,>(fn: () => Promise<T>) => {
    const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.duenia }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: T }).valor;
  };
  // Usado HOY: la acción liquida la última semana cerrada, que no lo incluye; se lo corre a esa semana.
  const sem = ultimaSemanaCerrada(todayInBusinessTz());
  const { businessWallTimeToUtc } = await import("@/lib/datetime");
  await duenio.voucher.updateMany({ where: { numero: v.numero }, data: { usadoEn: businessWallTimeToUtc(sem.hasta, "15:00") } });

  const fd = new FormData();
  fd.set("hasta", sem.hasta);
  const apagada = await correr(() => generarLiquidacion(fd));
  assert.match(!apagada.ok ? apagada.error : "", /no están prendidos/);
  const fp = new FormData();
  fp.set("monto", "100");
  fp.set("medio", "TRANSFERENCIA");
  fp.set("fecha", todayInBusinessTz());
  fp.set("clave", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  const apagadaPago = await correr(() => pagoACuenta(fp));
  assert.equal(apagadaPago.ok, false);
  assert.equal(await duenio.voucherLiquidacion.count({ where: { tenantId: A, hasta: sem.hasta } }), 0);
  assert.equal(await duenio.voucherPagoAdministracion.count({ where: { tenantId: A, clave: "cuenta:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } }), 0);

  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { VOUCHERS } = await import("@/cambios/interruptores");
  await duenio.auditLog.create({ data: filaDeInterruptor({ tenantId: A, interruptor: VOUCHERS, accion: "encender", operador: "test" }) });

  const gen = await correr(() => generarLiquidacion(fd));
  assert.ok(gen.ok, JSON.stringify(gen));
  if (!gen.ok) return;
  assert.equal(gen.valor.cantidad, 1);
  const fc = new FormData();
  fc.set("liquidacionId", gen.valor.liquidacionId);
  fc.set("pagado", "$ 14.000");
  fc.set("fecha", todayInBusinessTz());
  fc.set("medio", "TRANSFERENCIA");
  const conc = await correr(() => conciliarLiquidacion(fc));
  assert.ok(conc.ok && conc.valor.diferencia === 0, JSON.stringify(conc));
  const otra = await correr(() => conciliarLiquidacion(fc));
  assert.match(!otra.ok ? otra.error : "", /ya se concilió/);
});

test("cobrar con voucher desde el turno: «4.000» son cuatro mil pesos, no cuatro (regla de importes de la casa)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const c = await s.a.cliente("Mora");
  const turno = await s.a.turno(c);
  const numero = await s.a.voucher(c);
  // El interruptor quedó prendido en el test anterior; si este corre solo, se prende acá.
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { VOUCHERS } = await import("@/cambios/interruptores");
  await duenio.auditLog.create({ data: filaDeInterruptor({ tenantId: s.base.a.id, interruptor: VOUCHERS, accion: "encender", operador: "test" }) });
  const { aplicarVoucherAlTurno } = await import("./voucher-actions");
  const f = new FormData();
  f.set("appointmentId", turno);
  f.set("numero", numero);
  f.set("monto", "4.000");
  const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => aplicarVoucherAlTurno(f));
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  const v = (r as { valor: Awaited<ReturnType<typeof aplicarVoucherAlTurno>> }).valor;
  assert.ok(v.ok, JSON.stringify(v));
  if (v.ok) assert.deepEqual([v.valor.valorCubierto, v.valor.saldoDespues], [4000, 10000]);
});

// ── Impagos: vuelven en la próxima liquidación o se dan de baja (hallazgo de la certificación) ──

async function impagoConciliado(s: Sembrado, nombre: string) {
  const A = s.base.a.id;
  const v = await voucherCobrado(s, nombre);
  const { generarLiquidacionSemanal, conciliarLiquidacionSemanal } = await liq();
  const sem = await semanaNueva();
  const g = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  await conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 0, fecha: "2026-11-02", medio: "TRANSFERENCIA", rechazados: [v.numero], actor: "user:test" });
  return { ...v, liquidacionId: g.liquidacionId };
}

test("un impago vuelve en la próxima liquidación: se cobra, el contador baja y el reporte viejo lo sigue mostrando", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const v = await impagoConciliado(s, "Ines");
  const { generarLiquidacionSemanal, conciliarLiquidacionSemanal, leerCuentaDeLaAdministracion, leerLiquidacion, descartarLiquidacion } = await liq();
  assert.equal((await leerCuentaDeLaAdministracion(A)).impagos.cantidad, 1);
  const saldoAntes = await saldo(A);

  // Descartar la nueva devuelve el impago a su liquidación de origen, como IMPAGO.
  const sem = await semanaNueva();
  const g1 = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.equal(g1.cantidad, 1);
  assert.equal(g1.total, 14000);
  await descartarLiquidacion(A, { liquidacionId: g1.liquidacionId, actor: "user:test" });
  const vuelto = await duenio.voucher.findUniqueOrThrow({ where: { id: v.voucherId } });
  assert.equal(vuelto.liquidacionSemanalId, v.liquidacionId);
  assert.equal(vuelto.resultadoLiquidacion, "IMPAGO");

  const g = await generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.equal(g.cantidad, 1);
  const tomado = await duenio.voucher.findUniqueOrThrow({ where: { id: v.voucherId } });
  assert.equal(tomado.liquidacionSemanalId, g.liquidacionId);
  assert.equal(tomado.resultadoLiquidacion, null);
  assert.equal((await leerCuentaDeLaAdministracion(A)).impagos.cantidad, 0, "el contador de impagos baja");
  // El reporte de la vieja lo sigue listando como IMPAGO; el de la nueva, pendiente.
  const vieja = await leerLiquidacion(A, v.liquidacionId);
  assert.deepEqual(vieja?.renglones.map((r) => [r.numero, r.resultado]), [[v.numero, "IMPAGO"]]);
  assert.deepEqual((await leerLiquidacion(A, g.liquidacionId))?.renglones.map((r) => [r.numero, r.resultado]), [[v.numero, null]]);
  // Una liquidación que no lo incluye no lo re-toma dos veces.
  const sem3 = await semanaNueva();
  await rechaza(generarLiquidacionSemanal(A, { hasta: sem3.hasta, hoy: sem3.hoy, actor: "user:test" }), /nada que liquidar/);

  await conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" });
  const pagado = await duenio.voucher.findUniqueOrThrow({ where: { id: v.voucherId } });
  assert.equal(pagado.resultadoLiquidacion, "PAGADO");
  assert.equal(await saldo(A), saldoAntes - 1_400_000, "el débito es uno solo; el pago lo cancela");
});

test("baja de un impago: motivo + AuditLog, idempotente, no se re-liquida y el saldo se compensa", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const v = await impagoConciliado(s, "Juana");
  const { darDeBajaImpago, generarLiquidacionSemanal, leerCuentaDeLaAdministracion } = await liq();
  const saldoAntes = await saldo(A);
  const bajasAntes = (await leerCuentaDeLaAdministracion(A)).bajas;
  await rechaza(darDeBajaImpago(A, { numero: v.numero, motivo: "  ", actor: "user:test" }), /por qué/);
  await rechaza(darDeBajaImpago(s.base.b.id, { numero: v.numero, motivo: "La administración lo desconoce", actor: "user:test" }), /No hay un voucher/);
  const r = await darDeBajaImpago(A, { numero: v.numero, motivo: "La administración lo desconoce", actor: "user:test" });
  assert.equal(r.duplicado, false);
  assert.equal((await darDeBajaImpago(A, { numero: v.numero, motivo: "otra vez lo mismo", actor: "user:test" })).duplicado, true);
  const audit = await duenio.auditLog.findMany({ where: { tenantId: A, action: "voucher.liquidacion.baja-impago", entityId: v.voucherId } });
  assert.equal(audit.length, 1);
  assert.equal((audit[0].changes as { motivo: string }).motivo, "La administración lo desconoce");
  const cuenta = await leerCuentaDeLaAdministracion(A);
  assert.equal(cuenta.impagos.cantidad, 0);
  assert.deepEqual(cuenta.bajas, { cantidad: bajasAntes.cantidad + 1, total: bajasAntes.total + 14000 });
  assert.equal(await saldo(A), saldoAntes - 1_400_000);
  const sem = await semanaNueva();
  await rechaza(generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" }), /nada que liquidar/);
  // Un voucher pagado (no impago) no se da de baja.
  const p = await voucherCobrado(s, "Kiara");
  await rechaza(darDeBajaImpago(A, { numero: p.numero, motivo: "Se equivocaron", actor: "user:test" }), /Sólo se da de baja/);
  await duenio.voucher.updateMany({ where: { id: p.voucherId }, data: { liquidadoEn: new Date() } });
});

test("baja y re-liquidación del mismo impago a la vez: gana una sola y el estado es coherente", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const { darDeBajaImpago, generarLiquidacionSemanal } = await liq();
  for (let i = 0; i < 3; i++) {
    const v = await impagoConciliado(s, `Lara${i}`);
    const sem = await semanaNueva();
    const rs = await Promise.allSettled([
      generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" }),
      darDeBajaImpago(A, { numero: v.numero, motivo: "La administración lo desconoce", actor: "user:test" }),
      darDeBajaImpago(A, { numero: v.numero, motivo: "La administración lo desconoce", actor: "user:test" }),
    ]);
    const x = await duenio.voucher.findUniqueOrThrow({ where: { id: v.voucherId } });
    const bajas = await duenio.auditLog.count({ where: { tenantId: A, action: "voucher.liquidacion.baja-impago", entityId: v.voucherId } });
    if (rs[0].status === "fulfilled") {
      // La liquidación lo tomó: no hay baja.
      assert.equal(x.liquidacionSemanalId, rs[0].value.liquidacionId);
      assert.equal(x.resultadoLiquidacion, null);
      assert.equal(x.liquidadoEn, null);
      assert.equal(bajas, 0);
      await duenio.voucher.updateMany({ where: { id: v.voucherId }, data: { liquidadoEn: new Date() } });
    } else {
      assert.equal(x.liquidacionSemanalId, v.liquidacionId);
      assert.equal(x.resultadoLiquidacion, "IMPAGO");
      assert.ok(x.liquidadoEn);
      assert.equal(bajas, 1, "una sola baja aunque se pida dos veces a la vez");
      assert.equal(await duenio.voucherLiquidacion.count({ where: { tenantId: A, hasta: sem.hasta } }), 0);
    }
  }
});

test("dos liquidaciones a la vez con el mismo impago pendiente: queda en una sola", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const v = await impagoConciliado(s, "Mora");
  const { generarLiquidacionSemanal } = await liq();
  const [s1, s2] = [await semanaNueva(), await semanaNueva()];
  const rs = await Promise.allSettled([
    generarLiquidacionSemanal(A, { hasta: s1.hasta, hoy: s1.hoy, actor: "user:test" }),
    generarLiquidacionSemanal(A, { hasta: s2.hasta, hoy: s2.hoy, actor: "user:test" }),
  ]);
  const ok = rs.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 1, JSON.stringify(rs.map((r) => (r.status === "rejected" ? String(r.reason) : "ok"))));
  const x = await duenio.voucher.findUniqueOrThrow({ where: { id: v.voucherId } });
  assert.equal(x.liquidacionSemanalId, (ok[0] as PromiseFulfilledResult<{ liquidacionId: string }>).value.liquidacionId);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: A, action: "voucher.liquidacion.reliquidar-impagos", entityId: v.liquidacionId } }), 1);
});

test("la baja como Server Action: sólo la dueña (la recepción no da de baja), con motivo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { VOUCHERS } = await import("@/cambios/interruptores");
  await duenio.auditLog.create({ data: filaDeInterruptor({ tenantId: A, interruptor: VOUCHERS, accion: "encender", operador: "test" }) });
  const v = await impagoConciliado(s, "Nora");
  const { bajaDeImpago } = await import("./liquidacion-actions");
  const { SOLO_DUENIO_CONCILIA } = await import("./liquidacion-core");
  const correr = async (usuario: typeof s.base.a.duenia, fd: FormData) => {
    const r = await ejecutarAccion({ negocio: s.base.a, usuario }, () => bajaDeImpago(fd));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: Awaited<ReturnType<typeof bajaDeImpago>> }).valor;
  };
  const fd = new FormData();
  fd.set("numero", v.numero);
  fd.set("motivo", "La administración lo desconoce");
  // Orden del dueño (09/11/2026): la recepcionista, aunque tenga `cash:manage`, no da de baja.
  const r0 = await correr(s.base.a.recepcion, fd);
  assert.deepEqual(r0, { ok: false, error: SOLO_DUENIO_CONCILIA });
  assert.equal((await duenio.voucher.findUniqueOrThrow({ where: { id: v.voucherId } })).liquidadoEn, null);
  const sinMotivo = new FormData();
  sinMotivo.set("numero", v.numero);
  const r1 = await correr(s.base.a.duenia, sinMotivo);
  assert.match(!r1.ok ? r1.error : "", /por qué/);
  const r2 = await correr(s.base.a.duenia, fd);
  assert.ok(r2.ok && !r2.valor.duplicado, JSON.stringify(r2));
  const r3 = await correr(s.base.a.duenia, fd);
  assert.ok(r3.ok && r3.valor.duplicado, JSON.stringify(r3));
  const audit = await duenio.auditLog.findMany({ where: { tenantId: A, action: "voucher.liquidacion.baja-impago", entityId: v.voucherId }, select: { actor: true } });
  assert.deepEqual(audit, [{ actor: `user:${s.base.a.duenia.id}` }]);
});

test("conciliar, pago a cuenta, acreditar, baja y descartar: recepción y profesional rechazados sin escribir; generar sí", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const d = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { VOUCHERS } = await import("@/cambios/interruptores");
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId: A, interruptor: VOUCHERS, accion: "encender", operador: "test" }) });
  const acciones = await import("./liquidacion-actions");
  const { SOLO_DUENIO_CONCILIA } = await import("./liquidacion-core");
  const L = await liq();
  const hoy = await hoyDelNegocio();
  // Una liquidación ABIERTA, un impago y un pago por transferencia pendiente de acreditar.
  const g = await liquidacionConciliable(s, "Quela");
  const impago = await impagoConciliado(s, "Perla");
  const pago = await L.registrarPagoACuenta(A, { clave: claveC5("permc"), monto: 321, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const profesional = await d.user.create({
    data: { tenantId: A, name: "Profesional C", email: `profesional-conc-${Date.now()}@negocio-a.erp.test`, passwordHash: "x", role: "PROFESSIONAL" },
  });
  // Al profesional se le prende `cash:manage` y se intenta prenderle la fina: la puerta fina igual lo frena.
  await d.userPermissionOverride.create({ data: { tenantId: A, userId: profesional.id, capability: "cash:manage", allowed: true } });
  await d.userPermissionOverride.create({ data: { tenantId: A, userId: profesional.id, capability: "vouchers:conciliar", allowed: true } });
  await d.userPermissionOverride.create({ data: { tenantId: A, userId: s.base.a.recepcion.id, capability: "vouchers:conciliar", allowed: true } });
  const foto = async () => ({
    pagos: await d.voucherPagoAdministracion.count({ where: { tenantId: A } }),
    libro: await d.cashMovement.count({ where: { tenantId: A } }),
    audit: await d.auditLog.count({ where: { tenantId: A } }),
    liq: await d.voucherLiquidacion.findUniqueOrThrow({ where: { id: g.liquidacionId }, select: { estado: true } }),
    impago: await d.voucher.findUniqueOrThrow({ where: { id: impago.voucherId }, select: { liquidadoEn: true } }),
    saldo: await saldo(A),
  });
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const intentos: [string, () => Promise<unknown>][] = [
    ["conciliar", () => acciones.conciliarLiquidacion(form({ liquidacionId: g.liquidacionId, pagado: "14000", fecha: hoy, medio: "TRANSFERENCIA" }))],
    ["pago a cuenta", () => acciones.pagoACuenta(form({ monto: "500", fecha: hoy, medio: "TRANSFERENCIA", clave: "perm-0000-1111-2222-333333333333" }))],
    ["acreditar", () => acciones.confirmarAcreditacion(form({ pagoId: pago.pagoId }))],
    ["baja", () => acciones.bajaDeImpago(form({ numero: impago.numero, motivo: "La administración lo desconoce" }))],
    ["descartar", () => acciones.descartarLiquidacion(form({ liquidacionId: g.liquidacionId }))],
  ];
  const antes = await foto();
  for (const [rol, usuario] of [["RECEPTION", s.base.a.recepcion], ["PROFESSIONAL", profesional]] as const) {
    for (const [nombre, fn] of intentos) {
      const r: { tipo: string; valor?: unknown } = await ejecutarAccion({ negocio: s.base.a, usuario }, fn);
      assert.deepEqual(r.tipo === "respuesta" ? r.valor : r, { ok: false, error: SOLO_DUENIO_CONCILIA }, `${rol} · ${nombre}`);
    }
  }
  assert.deepEqual(await foto(), antes, "nadie sin permiso escribió nada");
  assert.equal((await L.leerLiquidacion(A, g.liquidacionId))?.pago, null);
  // Generar la liquidación sigue con `cash:manage`: la recepción pasa la puerta (el resultado de dominio es otro tema).
  const { ultimaSemanaCerrada } = await import("./liquidacion-core");
  const gen = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => acciones.generarLiquidacion(form({ hasta: ultimaSemanaCerrada(hoy).hasta })));
  assert.equal(gen.tipo, "respuesta", JSON.stringify(gen));
  assert.notDeepEqual((gen as { valor: unknown }).valor, { ok: false, error: SOLO_DUENIO_CONCILIA });
  await d.userPermissionOverride.deleteMany({ where: { tenantId: A, capability: { in: ["vouchers:conciliar", "cash:manage"] } } });
  await d.user.delete({ where: { id: profesional.id } });
});

// ── Pago a cuenta imputado a impagos: ningún voucher se cobra dos veces (cert 2, ATQ1/ATQ1b) ──

test("ATQ1 · un impago saldado con un pago a cuenta no vuelve a liquidarse (sin doble cobro)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const saldo0 = await saldo(A);
  const v = await impagoConciliado(s, "Atq1");
  assert.equal(await saldo(A), saldo0 + 1_400_000);
  const { registrarPagoACuenta, generarLiquidacionSemanal } = await liq();
  const p = await registrarPagoACuenta(A, { clave: "atq1-0000-cuenta", monto: 14000, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" });
  assert.deepEqual([p.imputados, p.sinImputar], [[{ numero: v.numero, monto: 14000, saldado: true }], 0]);
  assert.equal(await saldo(A), saldo0, "pagado a cuenta: saldo cuadra");
  const x = await duenio.voucher.findUniqueOrThrow({ where: { id: v.voucherId } });
  assert.deepEqual([x.resultadoLiquidacion, x.montoLiquidado?.toNumber(), Boolean(x.liquidadoEn), x.liquidacionRef?.startsWith("Pago a cuenta")], ["PAGADO", 14000, true, true]);
  const sem = await semanaNueva();
  await rechaza(generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" }), /nada que liquidar/);
  assert.equal(await saldo(A), saldo0);
});

test("ATQ1b · un impago ya saldado a cuenta no se da de baja (no hay segundo crédito)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const A = s.base.a.id;
  const saldo0 = await saldo(A);
  const v = await impagoConciliado(s, "Atq1b");
  const { registrarPagoACuenta, darDeBajaImpago, leerCuentaDeLaAdministracion } = await liq();
  await registrarPagoACuenta(A, { clave: "atq1b-000-cuenta", monto: 14000, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" });
  await rechaza(darDeBajaImpago(A, { numero: v.numero, motivo: "Ya lo pagaron a cuenta", actor: "user:test" }), /ya se saldó con un pago a cuenta/);
  assert.equal(await saldo(A), saldo0);
  const cuenta = await leerCuentaDeLaAdministracion(A);
  assert.equal(cuenta.movimientos.filter((m) => m.ref === `b:${v.voucherId}`).length, 0);
});

test("pago a cuenta en parte: la baja compensa sólo lo no imputado; la re-liquidación reclama sólo lo que falta", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const L = await liq();
  // Baja después de un pago parcial.
  const saldo0 = await saldo(A);
  const v = await impagoConciliado(s, "Parcial1");
  await L.registrarPagoACuenta(A, { clave: "parcial-1-cuenta", monto: 6000, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" });
  assert.equal(await saldo(A), saldo0 + 800_000);
  assert.equal((await L.leerCuentaDeLaAdministracion(A)).impagos.total, 8000);
  await L.darDeBajaImpago(A, { numero: v.numero, motivo: "La administración desconoce el resto", actor: "user:test" });
  assert.equal(await saldo(A), saldo0, "la baja compensa 8.000, no 14.000");
  const { listarVouchersDe } = await import("./voucher-repo");
  const { csvDelReporte } = await import("./voucher-core");
  const [fila] = await listarVouchersDe(A, { numero: v.numero });
  assert.match(csvDelReporte([fila]).split("\r\n")[1], /;Dado de baja: La administración desconoce el resto;6000,00;Baja del /);
  // Re-liquidación de un impago saldado en parte: el reporte y el total piden 9.000.
  await sinPendientes(s);
  const saldo1 = await saldo(A);
  const w = await impagoConciliado(s, "Parcial2");
  await L.registrarPagoACuenta(A, { clave: "parcial-2-cuenta", monto: 5000, fecha: "2026-11-02", medio: "TRANSFERENCIA", numeros: [w.numero], actor: "user:test" });
  const sem = await semanaNueva();
  const g = await L.generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.deepEqual([g.cantidad, g.total], [1, 9000]);
  const det = await L.leerLiquidacion(A, g.liquidacionId);
  assert.deepEqual(det?.renglones.map((r) => [r.numero, r.valor]), [[w.numero, 9000]]);
  await rechaza(
    L.conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" }),
    /sobran \$ 5000,00/,
  );
  await L.conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 9000, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" });
  assert.equal(await saldo(A), saldo1);
  const x = await duenio.voucher.findUniqueOrThrow({ where: { id: w.voucherId } });
  // `montoLiquidado` = lo cobrado en esa liquidación (los 5.000 a cuenta ya son crédito por su pago).
  assert.deepEqual([x.resultadoLiquidacion, x.montoLiquidado?.toNumber()], ["PAGADO", 9000]);
  // Un número que no es un impago pendiente: el pago entero se rechaza y no queda nada a medias.
  await rechaza(
    L.registrarPagoACuenta(A, { clave: "parcial-3-cuenta", monto: 100, fecha: "2026-11-02", medio: "TRANSFERENCIA", numeros: [w.numero], actor: "user:test" }),
    /no están impagos/,
  );
  assert.equal(await duenio.voucherPagoAdministracion.count({ where: { tenantId: A, clave: "cuenta:parcial-3-cuenta" } }), 0);
});

test("pago a cuenta FIFO con el impago en una liquidación ABIERTA: se imputa y la liquidación reclama valor − imputado", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  await sinPendientes(s);
  const A = s.base.a.id;
  const L = await liq();
  const duenio = await prismaComoDuenio(s.base);
  const F = { fecha: "2026-11-02", medio: "TRANSFERENCIA" as const, actor: "user:test" };
  const saldo0 = await saldo(A);
  const u0 = await voucherCobrado(s, "Abierta1");
  const w = await voucherCobrado(s, "Abierta2");
  const sem0 = await semanaNueva();
  const g0 = await L.generarLiquidacionSemanal(A, { hasta: sem0.hasta, hoy: sem0.hoy, actor: "user:test" });
  await L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g0.liquidacionId, pagado: 0, rechazados: [u0.numero, w.numero] });
  const u = { ...u0, liquidacionId: g0.liquidacionId };
  const sem = await semanaNueva();
  const g = await L.generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.deepEqual([g.cantidad, g.total], [2, 28000]);
  // 14.000 saldan entero al primero (sale de la liquidación) y 3.000,50 van a cuenta del segundo.
  const r = await L.registrarPagoACuenta(A, { clave: "abierta-fifo-1", monto: 17000.5, fecha: F.fecha, medio: "TRANSFERENCIA", actor: "user:test" });
  assert.deepEqual([r.imputados.map((i) => [i.numero, i.monto, i.saldado]), r.sinImputar], [[[u.numero, 14000, true], [w.numero, 3000.5, false]], 0]);
  const det = await L.leerLiquidacion(A, g.liquidacionId);
  assert.deepEqual([det?.cantidad, det?.total, det?.renglones.map((x) => [x.numero, x.valor])], [1, 10999.5, [[w.numero, 10999.5]]]);
  const xu = await duenio.voucher.findUniqueOrThrow({ where: { id: u.voucherId } });
  assert.deepEqual([xu.resultadoLiquidacion, xu.liquidacionSemanalId, xu.montoLiquidado?.toNumber()], ["PAGADO", u.liquidacionId, 14000]);
  assert.equal(await saldo(A), saldo0 + 1_099_950);
  // Por número sigue sin imputar a un voucher de una liquidación abierta.
  await rechaza(L.registrarPagoACuenta(A, { clave: "abierta-fifo-2", monto: 1, fecha: F.fecha, medio: "TRANSFERENCIA", numeros: [w.numero], actor: "user:test" }), /liquidación abierta/);
  // La conciliación pide lo que falta y graba lo cobrado en ella.
  await rechaza(L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g.liquidacionId, pagado: 14000 }), /sobran/);
  await L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g.liquidacionId, pagado: 10999.5 });
  assert.equal(await saldo(A), saldo0);
  const xw = await duenio.voucher.findUniqueOrThrow({ where: { id: w.voucherId } });
  assert.deepEqual([xw.resultadoLiquidacion, xw.montoLiquidado?.toNumber()], ["PAGADO", 10999.5]);

  // Descartar la abierta tras una imputación parcial: el impago vuelve a su liquidación con lo imputado.
  await sinPendientes(s);
  const saldo1 = await saldo(A);
  const z = await impagoConciliado(s, "Abierta3");
  const sem2 = await semanaNueva();
  const g2 = await L.generarLiquidacionSemanal(A, { hasta: sem2.hasta, hoy: sem2.hoy, actor: "user:test" });
  await L.registrarPagoACuenta(A, { clave: "abierta-fifo-3", monto: 4000, fecha: F.fecha, medio: "TRANSFERENCIA", actor: "user:test" });
  await L.descartarLiquidacion(A, { liquidacionId: g2.liquidacionId, actor: "user:test" });
  const xz = await duenio.voucher.findUniqueOrThrow({ where: { id: z.voucherId } });
  assert.deepEqual([xz.resultadoLiquidacion, xz.liquidacionSemanalId, xz.montoLiquidado?.toNumber()], ["IMPAGO", z.liquidacionId, 4000]);
  const sem3 = await semanaNueva();
  const g3 = await L.generarLiquidacionSemanal(A, { hasta: sem3.hasta, hoy: sem3.hoy, actor: "user:test" });
  assert.equal(g3.total, 10000);
  await L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g3.liquidacionId, pagado: 10000 });
  assert.equal(await saldo(A), saldo1);
});

test("invariante: para cualquier secuencia, saldo = usados − pagos − bajas (no imputado) y ningún voucher se cobra dos veces", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const L = await liq();
  const F = { fecha: "2026-11-02", medio: "TRANSFERENCIA" as const, actor: "user:test" };
  let k = 0;
  type Ctx = { usados: { numero: string; voucherId: string }[]; pagos: number; liquidar: () => Promise<{ liquidacionId: string; total: number; cantidad: number }> };
  const pasos: Record<string, (c: Ctx) => Promise<void>> = {
    // Rechaza el primero y paga justo lo aceptado; un pago a cuenta FIFO lo salda; re-liquidar: nada.
    "liquidar → rechazo → a cuenta → re-liquidar": async (c) => {
      const g = await c.liquidar();
      await L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g.liquidacionId, pagado: g.total - 14000, rechazados: [c.usados[0].numero] });
      c.pagos += g.total - 14000;
      await L.registrarPagoACuenta(A, { ...F, clave: `inv-${k++}-cuenta`, monto: 14000 });
      c.pagos += 14000;
      await rechaza(c.liquidar(), /nada que liquidar/);
    },
    // Rechaza todos; a cuenta parcial por número; re-liquidar, descartar, re-liquidar y pagar lo reclamado.
    "rechazo total → a cuenta parcial → re-liquidar → descartar → re-liquidar → pagar": async (c) => {
      const g = await c.liquidar();
      await L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g.liquidacionId, pagado: 0, rechazados: c.usados.map((u) => u.numero) });
      await L.registrarPagoACuenta(A, { ...F, clave: `inv-${k++}-cuenta`, monto: 5000, numeros: [c.usados[1].numero] });
      c.pagos += 5000;
      const g2 = await c.liquidar();
      assert.equal(g2.total, g.total - 5000);
      await L.descartarLiquidacion(A, { liquidacionId: g2.liquidacionId, actor: "user:test" });
      const g3 = await c.liquidar();
      assert.equal(g3.total, g.total - 5000);
      await L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g3.liquidacionId, pagado: g3.total });
      c.pagos += g3.total;
    },
    // Diferencia que se salda con un pago a cuenta (no hay impagos: queda sin imputar).
    "conciliar con diferencia → a cuenta": async (c) => {
      const g = await c.liquidar();
      await L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g.liquidacionId, pagado: g.total - 8000, aceptarDiferencia: true });
      c.pagos += g.total - 8000;
      const p = await L.registrarPagoACuenta(A, { ...F, clave: `inv-${k++}-cuenta`, monto: 8000 });
      assert.deepEqual([p.imputados.length, p.sinImputar], [0, 8000]);
      c.pagos += 8000;
    },
    // Rechazo de dos; re-liquidar y rechazar uno otra vez; a cuenta en parte; baja de lo que queda.
    "rechazo → re-liquidar → rechazo → a cuenta parcial → baja": async (c) => {
      const g = await c.liquidar();
      await L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g.liquidacionId, pagado: 14000, rechazados: [c.usados[0].numero, c.usados[1].numero] });
      c.pagos += 14000;
      const g2 = await c.liquidar();
      assert.equal(g2.cantidad, 2);
      await L.conciliarLiquidacionSemanal(A, { ...F, liquidacionId: g2.liquidacionId, pagado: 14000, rechazados: [c.usados[0].numero] });
      c.pagos += 14000;
      const p = await L.registrarPagoACuenta(A, { ...F, clave: `inv-${k++}-cuenta`, monto: 4000 });
      assert.deepEqual(p.imputados, [{ numero: c.usados[0].numero, monto: 4000, saldado: false }]);
      c.pagos += 4000;
      await L.darDeBajaImpago(A, { numero: c.usados[0].numero, motivo: "No reconocen el resto", actor: "user:test" });
      await rechaza(c.liquidar(), /nada que liquidar/);
    },
  };
  for (const [nombre, correr] of Object.entries(pasos)) {
    await sinPendientes(s);
    const saldo0 = await saldo(A);
    const usados: Ctx["usados"] = [];
    for (let i = 0; i < 3; i++) usados.push(await voucherCobrado(s, `Inv${k}-${i}`));
    const c: Ctx = {
      usados,
      pagos: 0,
      liquidar: async () => {
        const sem = await semanaNueva();
        return L.generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
      },
    };
    await correr(c);
    const vs = await duenio.voucher.findMany({
      where: { id: { in: usados.map((u) => u.voucherId) } },
      select: { valorCubierto: true, montoLiquidado: true, liquidacionRef: true, liquidadoEn: true, resultadoLiquidacion: true },
    });
    const cent = (d: { toNumber(): number } | null) => Math.round((d?.toNumber() ?? 0) * 100);
    const usadosC = vs.reduce((a, v) => a + cent(v.valorCubierto), 0);
    const bajasC = vs.filter((v) => v.liquidacionRef?.startsWith("Baja: ")).reduce((a, v) => a + cent(v.valorCubierto) - cent(v.montoLiquidado), 0);
    assert.equal((await saldo(A)) - saldo0, usadosC - Math.round(c.pagos * 100) - bajasC, nombre);
    // La administración pagó exactamente lo que se le reclamó: si algo se reclamara dos veces, sobraría.
    assert.equal((await saldo(A)) - saldo0, 0, `${nombre}: saldo final`);
    // Ningún voucher se cobra dos veces: lo cobrado de cada uno nunca pasa su valor.
    for (const v of vs) assert.ok(cent(v.montoLiquidado) <= cent(v.valorCubierto), `${nombre}: cobrado de más`);
    // Todo saldado (pagado o dado de baja): no queda nada que reclamar.
    assert.ok(vs.every((v) => v.liquidadoEn != null), `${nombre}: quedó algo pendiente`);
  }
});

// ── El pago entra a la caja y se concilia al acreditarse en Mercado Pago (regla del dueño, 08/11) ──

const MARCA_PAGO = "cuenta-corriente:voucher-pago:";

/**
 * Un pago HISTÓRICO al cajón (antes del 09/11/2026 se podía; ahora un pago nuevo va al banco): se
 * registra por Mercado Pago y se lo deja como quedaba en la base entonces (medio e ingreso en efectivo).
 */
async function pagoHistoricoAlCajon(s: Sembrado, tenantId: string, a: { clave: string; monto: number; fecha: string; medio: "EFECTIVO" | "OTRO" }) {
  const { registrarPagoACuenta } = await liq();
  const p = await registrarPagoACuenta(tenantId, { clave: a.clave, monto: a.monto, fecha: a.fecha, medio: "OTRO", otroA: "MP", actor: "user:test" });
  const d = await prismaComoDuenio(s.base);
  await d.voucherPagoAdministracion.update({ where: { id: p.pagoId }, data: { medio: a.medio } });
  const r = await d.cashMovement.updateMany({ where: { tenantId, createdBy: `${MARCA_PAGO}${p.pagoId}` }, data: { method: "EFECTIVO" } });
  assert.equal(r.count, 1);
  return p;
}

/** Un movimiento acreditado de MP en el extracto (pipeline de mercadopago-auto.ts). */
async function movimientoMp(s: Sembrado, tenantId: string, monto: number, fecha: string, descripcion = "Transferencia recibida", extra: Record<string, unknown> = {}) {
  const duenio = await prismaComoDuenio(s.base);
  const imp = await duenio.importacionBancaria.create({
    data: { tenantId, nombreArchivo: `mp-${n++}`, origen: "mercadopago", archivo: Buffer.from(""), mapeoJson: {} },
  });
  return (
    await duenio.movimientoImportado.create({
      data: {
        tenantId,
        importacionId: imp.id,
        hash: `mp:${n++}`,
        fecha: fecha.replace(/-/g, ""),
        monto,
        descripcion,
        clasificacion: "transferencia_propia",
        estadoPropuesta: "no_facturable",
        ...extra,
      },
    })
  ).id;
}

async function liquidacionConciliable(s: Sembrado, nombre: string) {
  await sinPendientes(s);
  await voucherCobrado(s, nombre);
  const { generarLiquidacionSemanal } = await liq();
  const sem = await semanaNueva();
  return generarLiquidacionSemanal(s.base.a.id, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
}

test("doble registro del pago (en serie y a la vez): un solo pago y un solo ingreso de caja", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const { registrarPagoACuenta, conciliarLiquidacionSemanal } = await liq();
  const clave = "dobl-0000-1111-2222-333333333333";
  const pagar = () => registrarPagoACuenta(A, { clave, monto: 2500, fecha: "2026-11-03", medio: "TRANSFERENCIA", actor: "user:test" });
  const rs = await Promise.all([pagar(), pagar(), pagar()]);
  assert.equal(new Set(rs.map((r) => r.pagoId)).size, 1);
  assert.equal(rs.filter((r) => !r.duplicado).length, 1);
  assert.equal((await pagar()).duplicado, true);
  const pagoId = rs[0].pagoId;
  const ingresos = await duenio.cashMovement.findMany({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${pagoId}` } });
  assert.deepEqual(ingresos.map((m) => [m.type, m.method, m.amount]), [["INGRESO", "MP", 2500]]);

  // La conciliación de la misma liquidación tres veces a la vez: un pago, un ingreso.
  const g = await liquidacionConciliable(s, "Dora");
  const una = () => conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 15000, fecha: "2026-11-02", medio: "TRANSFERENCIA", aceptarDiferencia: true, actor: "user:test" });
  const cs = await Promise.allSettled([una(), una(), una()]);
  assert.equal(cs.filter((r) => r.status === "fulfilled").length, 1);
  const pago = await duenio.voucherPagoAdministracion.findFirstOrThrow({ where: { liquidacionId: g.liquidacionId } });
  const delPago = await duenio.cashMovement.findMany({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${pago.id}` } });
  // Todo lo pagado entra a la caja (14.000 aceptados + 1.000 de sobrante, que queda a favor de la administración).
  assert.deepEqual(delPago.map((m) => [m.type, m.method, m.amount]), [["INGRESO", "MP", 15000]]);
});

test("con la caja de hoy cerrada el pago no se registra y no queda nada a medias", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const B = s.base.b.id;
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const { CIERRE_DIARIO_ACTION, CIERRE_DIARIO_ENTITY } = await import("@/lib/caja/frontera-cierre");
  const cierre = await duenio.auditLog.create({
    data: { tenantId: B, actor: "user:test", action: CIERRE_DIARIO_ACTION, entity: CIERRE_DIARIO_ENTITY, entityId: todayInBusinessTz(), channel: "admin", changes: {} },
  });
  const pagosAntes = await duenio.voucherPagoAdministracion.count({ where: { tenantId: B } });
  const libroAntes = await duenio.cashMovement.count({ where: { tenantId: B } });
  try {
    const { registrarPagoACuenta } = await liq();
    await rechaza(
      registrarPagoACuenta(B, { clave: "cerr-0000-1111-2222-333333333333", monto: 1000, fecha: todayInBusinessTz(), medio: "TRANSFERENCIA", actor: "user:test" }),
      /ya está cerrada/,
    );
    assert.equal(await duenio.voucherPagoAdministracion.count({ where: { tenantId: B } }), pagosAntes);
    assert.equal(await duenio.cashMovement.count({ where: { tenantId: B } }), libroAntes);
  } finally {
    await duenio.auditLog.delete({ where: { id: cierre.id } });
  }
});

test("acreditación: pendiente → se engancha al movimiento de MP → idempotente; efectivo no aplica; otro negocio no la ve", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const B = s.base.b.id;
  const { conciliarLiquidacionSemanal, confirmarAcreditacionMp, leerLiquidacion, leerCuentaDeLaAdministracion, registrarPagoACuenta } = await liq();
  const g = await liquidacionConciliable(s, "Eli");
  await conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: "2026-11-02", medio: "TRANSFERENCIA", referencia: "TRF-7731", actor: "user:test" });
  const antes = await leerLiquidacion(A, g.liquidacionId);
  assert.equal(antes?.pago?.acreditacion.estado, "pendiente");
  const pagoId = antes!.pago!.id;
  assert.ok((await leerCuentaDeLaAdministracion(A)).pendientesDeAcreditacion.some((p) => p.id === pagoId));

  // El extracto de MP trae dos de 14.000 en la ventana; la referencia desempata. Uno de B no cuenta.
  await movimientoMp(s, A, 14000, "2026-11-03", "Transferencia de Adm. La Alameda");
  const elBueno = await movimientoMp(s, A, 14000, "2026-11-04", "Transf. TRF-7731 Adm. La Alameda");
  await movimientoMp(s, B, 14000, "2026-11-03", "TRF-7731");
  const conCandidato = await leerLiquidacion(A, g.liquidacionId);
  assert.deepEqual(conCandidato?.pago?.acreditacion.estado === "pendiente" && conCandidato.pago.acreditacion.candidato?.id, elBueno);

  // Otro negocio no confirma el pago de A.
  await rechaza(confirmarAcreditacionMp(B, { pagoId, actor: "user:test" }), /no existe/);

  const c1 = await confirmarAcreditacionMp(A, { pagoId, actor: "user:test" });
  assert.deepEqual([c1.duplicado, c1.via, c1.movimientoId], [false, "mp", elBueno]);
  const c2 = await confirmarAcreditacionMp(A, { pagoId, actor: "user:test" });
  assert.deepEqual([c2.duplicado, c2.movimientoId], [true, elBueno]);
  const despues = await leerLiquidacion(A, g.liquidacionId);
  assert.equal(despues?.pago?.acreditacion.estado, "acreditado");
  assert.ok(!(await leerCuentaDeLaAdministracion(A)).pendientesDeAcreditacion.some((p) => p.id === pagoId));
  // La acreditación no mueve plata: el libro sigue con UN ingreso del pago.
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${pagoId}` } }), 1);

  // Sin movimiento en MP: se confirma a mano. En efectivo: no hay nada que acreditar.
  const sinMp = await registrarPagoACuenta(A, { clave: "mano-0000-1111-2222-333333333333", monto: 777, fecha: "2026-11-05", medio: "TRANSFERENCIA", actor: "user:test" });
  const manual = await confirmarAcreditacionMp(A, { pagoId: sinMp.pagoId, actor: "user:test" });
  assert.deepEqual([manual.via, manual.movimientoId], ["manual", null]);
  const efectivo = await pagoHistoricoAlCajon(s, A, { clave: "efec-0000-1111-2222-333333333333", monto: 500, fecha: "2026-11-05", medio: "EFECTIVO" });
  await rechaza(confirmarAcreditacionMp(A, { pagoId: efectivo.pagoId, actor: "user:test" }), /efectivo/);
  // Un pago sin su ingreso de caja no se acredita (invariante: no se concilia plata que la caja no registró).
  await duenio.cashMovement.deleteMany({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${sinMp.pagoId}` } });
  const huerfano = await registrarPagoACuenta(A, { clave: "huer-0000-1111-2222-333333333333", monto: 778, fecha: "2026-11-05", medio: "OTRO", otroA: "MP", actor: "user:test" });
  await duenio.cashMovement.deleteMany({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${huerfano.pagoId}` } });
  await rechaza(confirmarAcreditacionMp(A, { pagoId: huerfano.pagoId, actor: "user:test" }), /no tiene su ingreso en la caja/);
});

test("concurrencia: el pago contra la confirmación de su acreditación, dos confirmaciones y dos pagos por el mismo movimiento de MP", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const { conciliarLiquidacionSemanal, confirmarAcreditacionMp, registrarPagoACuenta } = await liq();
  const { VoucherRechazado } = await import("./voucher-repo");

  // 1) Pago vs confirmación: quien confirma apenas ve el pago ya ve su ingreso (nacen juntos o no nacen).
  const g = await liquidacionConciliable(s, "Fio");
  let confirmada: Awaited<ReturnType<typeof confirmarAcreditacionMp>> | null = null;
  const errores: string[] = [];
  const confirmador = (async () => {
    for (let i = 0; i < 400 && !confirmada; i++) {
      const p = await duenio.voucherPagoAdministracion.findFirst({ where: { liquidacionId: g.liquidacionId }, select: { id: true } });
      if (!p) {
        await new Promise((r) => setTimeout(r, 5));
        continue;
      }
      try {
        confirmada = await confirmarAcreditacionMp(A, { pagoId: p.id, actor: "user:test" });
      } catch (e) {
        errores.push(String(e));
        if (!(e instanceof VoucherRechazado && e.motivo === "cambio-recien")) break;
      }
    }
  })();
  await Promise.all([
    conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: "2026-11-02", medio: "TRANSFERENCIA", actor: "user:test" }),
    confirmador,
  ]);
  assert.deepEqual(errores.filter((e) => !/cambió|modificó/.test(e)), []);
  assert.ok(confirmada, "la confirmación llegó a pasar");
  const pago = await duenio.voucherPagoAdministracion.findFirstOrThrow({ where: { liquidacionId: g.liquidacionId } });
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${pago.id}` } }), 1);

  // 2) Tres confirmaciones a la vez del mismo pago: un solo rastro.
  const otro = await registrarPagoACuenta(A, { clave: "conc-0000-1111-2222-333333333333", monto: 3210, fecha: "2026-11-06", medio: "TRANSFERENCIA", actor: "user:test" });
  const tres = await Promise.allSettled([1, 2, 3].map(() => confirmarAcreditacionMp(A, { pagoId: otro.pagoId, actor: "user:test" })));
  const ok = tres.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof confirmarAcreditacionMp>>> => r.status === "fulfilled");
  assert.equal(ok.filter((r) => !r.value.duplicado).length, 1);
  for (const r of tres) if (r.status === "rejected") assert.match(String(r.reason), /modificó/);
  const { ACCION_ACREDITADO_MP } = await import("./acreditacion-core");
  assert.equal(await duenio.auditLog.count({ where: { tenantId: A, action: ACCION_ACREDITADO_MP, entityId: otro.pagoId } }), 1);

  // 3) Dos pagos del mismo monto y UN movimiento de MP: queda enganchado a uno solo.
  const p1 = await registrarPagoACuenta(A, { clave: "mism-0000-1111-2222-33333333333a", monto: 4321, fecha: "2026-11-06", medio: "TRANSFERENCIA", actor: "user:test" });
  const p2 = await registrarPagoACuenta(A, { clave: "mism-0000-1111-2222-33333333333b", monto: 4321, fecha: "2026-11-06", medio: "TRANSFERENCIA", actor: "user:test" });
  const unico = await movimientoMp(s, A, 4321, "2026-11-07");
  const dos = await Promise.allSettled([p1, p2].map((p) => confirmarAcreditacionMp(A, { pagoId: p.pagoId, actor: "user:test" })));
  const hechos = dos.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof confirmarAcreditacionMp>>>).value);
  assert.ok(hechos.length >= 1);
  assert.equal(hechos.filter((h) => h.movimientoId === unico).length, 1, "el movimiento de MP no se engancha a dos pagos");
});

test("cierre del día: el pago de la administración está en su medio (Mercado Pago o Efectivo) y el renglón lo señala", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const B = s.base.b.id;
  const { registrarPagoACuenta } = await liq();
  const { todayInBusinessTz, dateStrInBusinessTz } = await import("@/lib/datetime");
  const { buildCierreDiario } = await import("@/lib/caja/cierre-diario");
  const { clasificarOrigen } = await import("@/lib/caja/libro-caja");
  const { pagosDeLaAdministracion } = await import("@/app/admin/(dashboard)/caja/cierre/vouchers-del-dia");
  const hoy = todayInBusinessTz();
  await registrarPagoACuenta(B, { clave: "cier-0000-1111-2222-33333333333a", monto: 14000, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  // Un pago histórico al cajón (antes del 09/11): el cierre lo sigue leyendo en Efectivo.
  await pagoHistoricoAlCajon(s, B, { clave: "cier-0000-1111-2222-33333333333b", monto: 2000, fecha: hoy, medio: "EFECTIVO" });
  const filas = await duenio.cashMovement.findMany({ where: { tenantId: B } });
  const movements = filas
    .filter((r) => dateStrInBusinessTz(r.occurredAt) === hoy)
    .map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt,
      type: r.type,
      method: r.method,
      amount: r.amount,
      detail: r.reason ?? "",
      referencia: clasificarOrigen({ type: r.type, createdBy: r.createdBy }).referencia,
    }));
  const c = buildCierreDiario({ day: hoy, previous: [], movements, declared: { EFECTIVO: null, MP: null, TARJETA: null } });
  assert.equal(c.porMedio.MP.ingresos, 14000);
  assert.equal(c.porMedio.EFECTIVO.ingresos, 2000);
  const r = pagosDeLaAdministracion(movements);
  assert.deepEqual(r?.porMedio.sort((a, b) => a.medio.localeCompare(b.medio)), [
    { medio: "EFECTIVO", monto: 2000, cantidad: 1 },
    { medio: "MP", monto: 14000, cantidad: 1 },
  ]);
  assert.ok(movements.every((m) => /^Vouchers: pago a cuenta de la administración/.test(m.detail)));
});

// ── Cert 5: qué movimiento de MP se engancha y a dónde va cada medio ──────────

const hoyDelNegocio = async () => (await import("@/lib/datetime")).todayInBusinessTz();
let claveN = 0;
const claveC5 = (p: string) => `${p}-c5-${String(claveN++).padStart(4, "0")}-1111-2222-3333`;

/**
 * Invariantes de caja y acreditación del negocio A: cada pago tiene a lo sumo un ingreso, por su monto
 * y en la columna de su destino (cheque: ninguno hasta el depósito); un pago se acredita una vez; un
 * movimiento de MP se engancha a un solo pago y queda fuera de la facturación (no_facturable + marca).
 */
async function invariantesDeAcreditacion(s: Sembrado): Promise<string[]> {
  const d = await prismaComoDuenio(s.base);
  const A = s.base.a.id;
  const { ACCION_ACREDITADO_MP, MARCA_ENGANCHE } = await import("./acreditacion-core");
  const out: string[] = [];
  const pagos = await d.voucherPagoAdministracion.findMany({ where: { tenantId: A } });
  const ingresos = await d.cashMovement.findMany({ where: { tenantId: A, createdBy: { startsWith: MARCA_PAGO } } });
  const acr = await d.auditLog.findMany({ where: { tenantId: A, action: ACCION_ACREDITADO_MP } });
  const { ACCION_CHEQUE_RECHAZADO, marcaDelRechazoEnCaja } = await import("./acreditacion-core");
  const rechazos = await d.auditLog.findMany({ where: { tenantId: A, action: ACCION_CHEQUE_RECHAZADO } });
  const acreditados = new Set(acr.map((a) => a.entityId));
  if (acreditados.size !== acr.length) out.push("un pago acreditado dos veces");
  for (const p of pagos) {
    const ms = ingresos.filter((m) => m.createdBy === `${MARCA_PAGO}${p.id}`);
    if (ms.length > 1) out.push(`pago ${p.id} con ${ms.length} ingresos`);
    const m = ms[0];
    if (m && (m.type !== "INGRESO" || Number(m.amount) !== p.monto.toNumber())) out.push(`pago ${p.id}: ingreso ${m.type} ${m.amount}`);
    // (Sin ingreso: un test anterior lo borró a propósito para probar el rechazo; acá se mira el que hay.)
    if (p.medio === "EFECTIVO" && m && m.method !== "EFECTIVO") out.push(`pago ${p.id} en efectivo fuera del cajón`);
    if (p.medio === "TRANSFERENCIA" && m && m.method !== "MP") out.push(`pago ${p.id} por transferencia fuera de MP`);
    if (p.medio === "CHEQUE" && !acreditados.has(p.id) && m) out.push(`cheque ${p.id} sin depositar ya en la caja`);
    if (p.medio === "CHEQUE" && acreditados.has(p.id) && m?.method !== "MP") out.push(`cheque ${p.id} depositado sin ingreso en MP`);
    // Cheque rechazado: un solo rastro; depositado → un EGRESO por MP por su monto (la caja neta da 0); sin depositar → nada en la caja.
    const rech = rechazos.filter((r) => r.entityId === p.id);
    if (rech.length > 1) out.push(`cheque ${p.id} rechazado ${rech.length} veces`);
    if (rech.length > 0 && p.medio !== "CHEQUE") out.push(`pago ${p.id} (${p.medio}) marcado como cheque rechazado`);
    const contras = await d.cashMovement.findMany({ where: { tenantId: A, createdBy: marcaDelRechazoEnCaja(p.id) } });
    if (contras.length > 1) out.push(`cheque ${p.id} con ${contras.length} contramovimientos`);
    if (rech.length === 0 && contras.length > 0) out.push(`cheque ${p.id} con contramovimiento sin rechazo`);
    if (rech.length === 1) {
      if (m && (contras.length !== 1 || contras[0].type !== "EGRESO" || contras[0].method !== "MP" || Number(contras[0].amount) !== p.monto.toNumber())) {
        out.push(`cheque ${p.id} depositado y rechazado sin su contramovimiento`);
      }
      if (!m && contras.length > 0) out.push(`cheque ${p.id} sin depositar con contramovimiento`);
      if (!m && acreditados.has(p.id)) out.push(`cheque ${p.id} acreditado sin ingreso`);
    }
  }
  const porMov = new Map<string, number>();
  for (const a of acr) {
    const mov = (a.changes as { movimientoId?: string | null } | null)?.movimientoId;
    if (mov) porMov.set(mov, (porMov.get(mov) ?? 0) + 1);
  }
  for (const [mov, c] of porMov) {
    if (c > 1) out.push(`movimiento ${mov} enganchado a ${c} pagos`);
    const m = await d.movimientoImportado.findFirst({ where: { id: mov } });
    if (m?.estadoPropuesta !== "no_facturable" || !String(m.motivoRevision ?? "").includes(MARCA_ENGANCHE)) out.push(`movimiento ${mov} enganchado sigue en ${m?.estadoPropuesta}`);
    if (m?.invoiceId) out.push(`movimiento ${mov} enganchado tiene factura`);
  }
  return out;
}

test("C5-6 · la copia DESCARTADA de una re-importación no acredita un segundo pago", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const d = await prismaComoDuenio(s.base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await liq();
  const hoy = await hoyDelNegocio();
  const p1 = await registrarPagoACuenta(A, { clave: claveC5("c56a"), monto: 2468.02, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const p2 = await registrarPagoACuenta(A, { clave: claveC5("c56b"), monto: 2468.02, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const real = await movimientoMp(s, A, 2468.02, hoy);
  const copia = await movimientoMp(s, A, 2468.02, hoy, "Transferencia recibida", { estadoPropuesta: "descartado", motivoRevision: "duplicado de una corrida anterior" });
  const r1 = await confirmarAcreditacionMp(A, { pagoId: p1.pagoId, movimientoId: real, actor: "user:test" });
  assert.equal(r1.movimientoId, real);
  // Elegir la copia a mano tampoco pasa.
  await rechaza(confirmarAcreditacionMp(A, { pagoId: p2.pagoId, movimientoId: copia, actor: "user:test" }), /no corresponde/);
  const r2 = await confirmarAcreditacionMp(A, { pagoId: p2.pagoId, actor: "user:test" });
  assert.deepEqual([r2.via, r2.movimientoId], ["manual", null], "sin otra plata en MP, el segundo pago queda a confirmar a mano, no con la copia");
  assert.equal((await d.movimientoImportado.findFirstOrThrow({ where: { id: copia } })).estadoPropuesta, "descartado");
  assert.deepEqual(await invariantesDeAcreditacion(s), []);
});

test("C5-1 · nunca se engancha un movimiento facturado; uno «auto» o «revision» sale de la facturación automática", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const d = await prismaComoDuenio(s.base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await liq();
  const hoy = await hoyDelNegocio();
  const p1 = await registrarPagoACuenta(A, { clave: claveC5("c51a"), monto: 7777.77, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  const vendido = await movimientoMp(s, A, 7777.77, hoy, "Venta", { clasificacion: "venta", estadoPropuesta: "emitida", invoiceId: "inv-falsa" });
  const conFactura = await movimientoMp(s, A, 7777.77, hoy, "Venta", { clasificacion: "venta", estadoPropuesta: "auto", invoiceId: "inv-falsa-2" });
  await rechaza(confirmarAcreditacionMp(A, { pagoId: p1.pagoId, movimientoId: vendido, actor: "user:test" }), /no corresponde/);
  await rechaza(confirmarAcreditacionMp(A, { pagoId: p1.pagoId, movimientoId: conFactura, actor: "user:test" }), /no corresponde/);
  const r1 = await confirmarAcreditacionMp(A, { pagoId: p1.pagoId, actor: "user:test" });
  assert.deepEqual([r1.via, r1.movimientoId], ["manual", null]);
  const v = await d.movimientoImportado.findFirstOrThrow({ where: { id: vendido } });
  assert.deepEqual([v.estadoPropuesta, v.invoiceId], ["emitida", "inv-falsa"], "el facturado no se toca");

  for (const estado of ["auto", "revision"] as const) {
    const monto = estado === "auto" ? 5555.55 : 5555.56;
    const p = await registrarPagoACuenta(A, { clave: claveC5(`c51${estado}`), monto, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
    const mov = await movimientoMp(s, A, monto, hoy, "Transferencia", { clasificacion: "venta", estadoPropuesta: estado });
    const r = await confirmarAcreditacionMp(A, { pagoId: p.pagoId, actor: "user:test" });
    assert.equal(r.movimientoId, mov);
    const m = await d.movimientoImportado.findFirstOrThrow({ where: { id: mov } });
    assert.equal(m.estadoPropuesta, "no_facturable", `«${estado}» enganchado tiene que salir de la facturación automática`);
    assert.match(m.motivoRevision ?? "", new RegExp(p.pagoId));
    // La facturación automática (claim auto→emitida) ya no lo toma.
    const claim = await d.movimientoImportado.updateMany({ where: { id: mov, tenantId: A, estadoPropuesta: "auto" }, data: { estadoPropuesta: "emitida" } });
    assert.equal(claim.count, 0);
  }
  assert.deepEqual(await invariantesDeAcreditacion(s), []);
});

test("C5 concurrencia · dos acreditaciones eligen el MISMO movimiento a la vez; y contra la facturación automática", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const d = await prismaComoDuenio(s.base);
  const { registrarPagoACuenta, confirmarAcreditacionMp } = await liq();
  const hoy = await hoyDelNegocio();
  for (let i = 0; i < 4; i++) {
    const monto = 3131 + i / 100;
    const p1 = await registrarPagoACuenta(A, { clave: claveC5("cc1"), monto, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
    const p2 = await registrarPagoACuenta(A, { clave: claveC5("cc2"), monto, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
    const mov = await movimientoMp(s, A, monto, hoy, "Transferencia", { clasificacion: "venta", estadoPropuesta: "auto" });
    const rs = await Promise.allSettled([p1, p2].map((p) => confirmarAcreditacionMp(A, { pagoId: p.pagoId, movimientoId: mov, actor: "user:test" })));
    const ok = rs.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1, `vuelta ${i}: una sola acreditación toma el movimiento`);
    for (const r of rs) if (r.status === "rejected") assert.match(String(r.reason), /cambió|modificó|no corresponde/);
  }
  // Contra el claim de la facturación automática (auto→emitida): gana uno, nunca los dos.
  for (let i = 0; i < 4; i++) {
    const monto = 4141 + i / 100;
    const p = await registrarPagoACuenta(A, { clave: claveC5("cf"), monto, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
    const mov = await movimientoMp(s, A, monto, hoy, "Transferencia", { clasificacion: "venta", estadoPropuesta: "auto" });
    const [conf, claim] = await Promise.allSettled([
      confirmarAcreditacionMp(A, { pagoId: p.pagoId, movimientoId: mov, actor: "user:test" }),
      d.movimientoImportado.updateMany({ where: { id: mov, tenantId: A, estadoPropuesta: "auto" }, data: { estadoPropuesta: "emitida" } }),
    ]);
    const facturado = claim.status === "fulfilled" && claim.value.count === 1;
    const enganchado = conf.status === "fulfilled" && conf.value.movimientoId === mov;
    assert.ok(!(facturado && enganchado), `vuelta ${i}: facturado Y enganchado`);
    assert.ok(facturado || enganchado, `vuelta ${i}: ninguno ganó`);
  }
  assert.deepEqual(await invariantesDeAcreditacion(s), []);
});

test("cheque: valores a depositar (fuera de la caja) hasta confirmar el depósito; ahí entra a MP una sola vez", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const d = await prismaComoDuenio(s.base);
  const { registrarPagoACuenta, confirmarAcreditacionMp, leerCuentaDeLaAdministracion, chequesADepositar } = await liq();
  const hoy = await hoyDelNegocio();
  const saldoAntes = await saldo(A);
  const ch = await registrarPagoACuenta(A, { clave: claveC5("cheq"), monto: 9090.9, fecha: hoy, medio: "CHEQUE", referencia: "Ch 0042", actor: "user:test" });
  assert.equal(await d.cashMovement.count({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${ch.pagoId}` } }), 0, "el cheque no entra a ninguna columna");
  assert.equal(saldoAntes - (await saldo(A)), 909090, "el pago sí baja la deuda de la administración (centavos)");
  const pend = (await leerCuentaDeLaAdministracion(A)).pendientesDeAcreditacion.find((p) => p.id === ch.pagoId);
  assert.equal(pend?.acreditacion.estado === "pendiente" && pend.acreditacion.destino, "A_DEPOSITAR");
  const antes = await chequesADepositar(A);
  assert.ok(antes && antes.cantidad >= 1 && antes.monto >= 9090.9);
  // El depósito: tres confirmaciones a la vez → un solo ingreso en MP, un solo rastro.
  const mov = await movimientoMp(s, A, 9090.9, hoy, "Depósito de cheque 0042");
  const saldoPrevio = await saldo(A);
  const rs = await Promise.allSettled([1, 2, 3].map(() => confirmarAcreditacionMp(A, { pagoId: ch.pagoId, actor: "user:test" })));
  assert.ok(rs.some((r) => r.status === "fulfilled" && !r.value.duplicado && r.value.movimientoId === mov));
  const ingresos = await d.cashMovement.findMany({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${ch.pagoId}` } });
  assert.deepEqual(ingresos.map((m) => [m.type, m.method, Number(m.amount)]), [["INGRESO", "MP", 9090.9]]);
  assert.match(ingresos[0].reason ?? "", /cheque depositado/);
  assert.equal(await saldo(A), saldoPrevio, "el depósito no vuelve a tocar la cuenta de la administración");
  assert.equal((await confirmarAcreditacionMp(A, { pagoId: ch.pagoId, actor: "user:test" })).duplicado, true);
  const despues = await chequesADepositar(A);
  assert.equal((despues?.cantidad ?? 0), antes.cantidad - 1);
  assert.deepEqual(await invariantesDeAcreditacion(s), []);
});

test("otro: obliga a elegir columna; al cajón se rechaza (va al banco); lo histórico al cajón se lee igual", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const d = await prismaComoDuenio(s.base);
  const { registrarPagoACuenta, confirmarAcreditacionMp, leerCuentaDeLaAdministracion, conciliarLiquidacionSemanal } = await liq();
  const hoy = await hoyDelNegocio();
  const pagosAntes = await d.voucherPagoAdministracion.count({ where: { tenantId: A } });
  const libroAntes = await d.cashMovement.count({ where: { tenantId: A } });
  await rechaza(registrarPagoACuenta(A, { clave: claveC5("otro"), monto: 600, fecha: hoy, medio: "OTRO", actor: "user:test" }), /elegí si la plata entró/);
  const g = await liquidacionConciliable(s, "Olga");
  await rechaza(
    conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: hoy, medio: "OTRO", actor: "user:test" }),
    /elegí si la plata entró/,
  );
  assert.equal(await d.voucherPagoAdministracion.count({ where: { tenantId: A } }), pagosAntes);
  assert.equal(await d.cashMovement.count({ where: { tenantId: A } }), libroAntes);

  // «Otro» al cajón: un pago nuevo ya no entra al cajón (orden del 09/11), ni a cuenta ni al conciliar.
  await rechaza(registrarPagoACuenta(A, { clave: claveC5("otroE"), monto: 601, fecha: hoy, medio: "OTRO", otroA: "EFECTIVO", actor: "user:test" }), /va al banco/);
  await rechaza(
    conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: hoy, medio: "OTRO", otroA: "EFECTIVO", actor: "user:test" }),
    /va al banco/,
  );
  await rechaza(conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: hoy, medio: "EFECTIVO", actor: "user:test" }), /va al banco/);
  assert.equal(await d.voucherPagoAdministracion.count({ where: { tenantId: A } }), pagosAntes);
  assert.equal(await d.cashMovement.count({ where: { tenantId: A } }), libroAntes);
  assert.equal((await d.voucherLiquidacion.findUniqueOrThrow({ where: { id: g.liquidacionId } })).estado, "ABIERTA", "el rechazo no dejó la liquidación a medias");
  // Lo histórico (un «otro» que entró al cajón antes del 09/11) se sigue leyendo igual.
  const alCajon = await pagoHistoricoAlCajon(s, A, { clave: claveC5("otroH"), monto: 601, fecha: hoy, medio: "OTRO" });
  const aMp = await registrarPagoACuenta(A, { clave: claveC5("otroM"), monto: 602, fecha: hoy, medio: "OTRO", otroA: "MP", actor: "user:test" });
  const metodo = async (pagoId: string) => (await d.cashMovement.findFirstOrThrow({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${pagoId}` } })).method;
  assert.equal(await metodo(alCajon.pagoId), "EFECTIVO");
  assert.equal(await metodo(aMp.pagoId), "MP");
  const pendientes = (await leerCuentaDeLaAdministracion(A)).pendientesDeAcreditacion.map((p) => p.id);
  assert.ok(!pendientes.includes(alCajon.pagoId) && pendientes.includes(aMp.pagoId));
  await rechaza(confirmarAcreditacionMp(A, { pagoId: alCajon.pagoId, actor: "user:test" }), /efectivo/);
  assert.equal((await confirmarAcreditacionMp(A, { pagoId: aMp.pagoId, actor: "user:test" })).via, "manual");
  // La conciliación con «otro» a Mercado Pago entra a MP.
  await conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: hoy, medio: "OTRO", otroA: "MP", actor: "user:test" });
  const pago = await d.voucherPagoAdministracion.findFirstOrThrow({ where: { liquidacionId: g.liquidacionId } });
  assert.equal(await metodo(pago.id), "MP");
  assert.deepEqual(await invariantesDeAcreditacion(s), []);
});

// ── Cert 6: cheque rechazado y cheques a depositar al cierre de un día ──────

test("cheque rechazado ANTES de depositar: vuelve a deuda, la caja no se toca, sale de valores a depositar y ya no se deposita", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const d = await prismaComoDuenio(s.base);
  const L = await liq();
  const hoy = await hoyDelNegocio();
  const saldoAntes = await saldo(A);
  const aDepositarAntes = (await L.chequesADepositar(A))?.cantidad ?? 0;
  const ch = await L.registrarPagoACuenta(A, { clave: claveC5("rch1"), monto: 3210.55, fecha: hoy, medio: "CHEQUE", referencia: "Ch 0101", actor: "user:test" });
  assert.equal(saldoAntes - (await saldo(A)), 321055);
  assert.equal((await L.chequesADepositar(A))?.cantidad, aDepositarAntes + 1);
  await rechaza(L.rechazarChequeDeLaAdministracion(A, { pagoId: ch.pagoId, motivo: "  no ", actor: "user:test" }), /al menos 5 letras/);
  await rechaza(L.rechazarChequeDeLaAdministracion(s.base.b.id, { pagoId: ch.pagoId, motivo: "Sin fondos", actor: "user:test" }), /no existe/);
  const tr = await L.registrarPagoACuenta(A, { clave: claveC5("rch1t"), monto: 10, fecha: hoy, medio: "TRANSFERENCIA", actor: "user:test" });
  await rechaza(L.rechazarChequeDeLaAdministracion(A, { pagoId: tr.pagoId, motivo: "Sin fondos", actor: "user:test" }), /Sólo un pago con cheque/);
  const libroAntes = await d.cashMovement.count({ where: { tenantId: A } });
  const r = await L.rechazarChequeDeLaAdministracion(A, { pagoId: ch.pagoId, motivo: "Sin   fondos", actor: "user:test" });
  assert.deepEqual([r.duplicado, r.depositado, r.contramovimientoId], [false, false, null]);
  assert.equal(await d.cashMovement.count({ where: { tenantId: A } }), libroAntes, "sin depositar: la caja no se toca");
  assert.equal(await saldo(A), saldoAntes - 1000, "vuelve a deuda (sólo queda la transferencia de $10)");
  assert.equal((await L.chequesADepositar(A))?.cantidad ?? 0, aDepositarAntes, "sale de valores a depositar");
  const cuenta = await L.leerCuentaDeLaAdministracion(A);
  assert.ok(!cuenta.pendientesDeAcreditacion.some((p) => p.id === ch.pagoId));
  const debito = cuenta.movimientos.find((m) => m.ref === `r:${ch.pagoId}`);
  assert.equal(debito?.tipo, "DEBITO");
  assert.equal(debito?.centavos, 321055);
  assert.match(debito?.concepto ?? "", /Cheque rechazado · Ch 0101 · Sin fondos/);
  const audit = await d.auditLog.findMany({ where: { tenantId: A, action: "voucher.pago.cheque-rechazado", entityId: ch.pagoId } });
  assert.equal(audit.length, 1);
  assert.equal((audit[0].changes as { motivo?: string }).motivo, "Sin fondos");
  assert.equal((await L.rechazarChequeDeLaAdministracion(A, { pagoId: ch.pagoId, motivo: "otra vez", actor: "user:test" })).duplicado, true);
  await movimientoMp(s, A, 3210.55, hoy, "Depósito de cheque 0101");
  await rechaza(L.confirmarAcreditacionMp(A, { pagoId: ch.pagoId, actor: "user:test" }), /rechazado/);
  assert.equal(await d.cashMovement.count({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${ch.pagoId}` } }), 0);
  assert.deepEqual(await invariantesDeAcreditacion(s), []);
});

test("cheque rechazado DESPUÉS de depositar (×3 a la vez): un contramovimiento EGRESO por MP, la caja neta da 0 y el saldo vuelve", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const d = await prismaComoDuenio(s.base);
  const L = await liq();
  const hoy = await hoyDelNegocio();
  const saldoAntes = await saldo(A);
  const ch = await L.registrarPagoACuenta(A, { clave: claveC5("rch2"), monto: 7777.77, fecha: hoy, medio: "CHEQUE", referencia: "Ch 0202", actor: "user:test" });
  await L.confirmarAcreditacionMp(A, { pagoId: ch.pagoId, actor: "user:test" });
  const depositados = (await L.leerCuentaDeLaAdministracion(A)).chequesDepositados;
  const fila = depositados.find((p) => p.id === ch.pagoId);
  assert.ok(fila && fila.acreditacion.estado === "acreditado" && fila.acreditacion.cheque, "el depositado se ofrece para marcarlo rechazado");
  const rs = await Promise.allSettled([1, 2, 3].map(() => L.rechazarChequeDeLaAdministracion(A, { pagoId: ch.pagoId, motivo: "Firma no coincide", actor: "user:test" })));
  const oks = rs.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof L.rechazarChequeDeLaAdministracion>>> => r.status === "fulfilled");
  assert.equal(oks.filter((r) => !r.value.duplicado).length, 1);
  assert.ok(oks.every((r) => r.value.depositado));
  const contras = await d.cashMovement.findMany({ where: { tenantId: A, createdBy: `cuenta-corriente:voucher-pago-rechazo:${ch.pagoId}` } });
  assert.deepEqual(contras.map((m) => [m.type, m.method, Number(m.amount)]), [["EGRESO", "MP", 7777.77]]);
  assert.match(contras[0].reason ?? "", /cheque de la administración rechazado · Ch 0202 · Firma no coincide/);
  const ingresos = await d.cashMovement.findMany({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${ch.pagoId}` } });
  assert.equal(ingresos.length, 1, "el ingreso del depósito queda (con su rastro); lo neutraliza el contramovimiento");
  assert.equal(await saldo(A), saldoAntes, "el pago volvió a deuda");
  const cuenta = await L.leerCuentaDeLaAdministracion(A);
  assert.ok(!cuenta.chequesDepositados.some((p) => p.id === ch.pagoId));
  assert.deepEqual(await invariantesDeAcreditacion(s), []);
});

test("cheque rechazado contra su depósito a la vez (8 vueltas): o se deposita y se revierte, o no se deposita; nunca a medias", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const d = await prismaComoDuenio(s.base);
  const L = await liq();
  const hoy = await hoyDelNegocio();
  for (let i = 0; i < 8; i++) {
    const saldoAntes = await saldo(A);
    const ch = await L.registrarPagoACuenta(A, { clave: claveC5(`rch3${i}`), monto: 1000 + i + 0.25, fecha: hoy, medio: "CHEQUE", actor: "user:test" });
    const depositar = (): Promise<unknown> => L.confirmarAcreditacionMp(A, { pagoId: ch.pagoId, actor: "user:test" });
    const rechazar = (): Promise<unknown> => L.rechazarChequeDeLaAdministracion(A, { pagoId: ch.pagoId, motivo: "Sin fondos", actor: "user:test" });
    // Se alterna quién sale primero.
    const [dep, rech] = i % 2 ? await Promise.allSettled([depositar(), rechazar()]) : (await Promise.allSettled([rechazar(), depositar()])).reverse();
    assert.equal(rech.status, "fulfilled", `vuelta ${i}: el rechazo siempre entra (${rech.status === "rejected" ? String((rech.reason as Error).message) : ""})`);
    if (dep.status === "rejected") assert.match(String((dep.reason as Error).message), /rechazado/, `vuelta ${i}`);
    const ingresos = await d.cashMovement.findMany({ where: { tenantId: A, createdBy: `${MARCA_PAGO}${ch.pagoId}` } });
    const contras = await d.cashMovement.findMany({ where: { tenantId: A, createdBy: `cuenta-corriente:voucher-pago-rechazo:${ch.pagoId}` } });
    assert.equal(ingresos.length, dep.status === "fulfilled" ? 1 : 0, `vuelta ${i}: ingresos`);
    assert.equal(contras.length, ingresos.length, `vuelta ${i}: cada depósito con su contramovimiento`);
    const neto = ingresos.reduce((a, m) => a + Math.round(m.amount * 100), 0) - contras.reduce((a, m) => a + Math.round(m.amount * 100), 0);
    assert.equal(neto, 0, `vuelta ${i}: la caja neta da 0`);
    assert.equal(await saldo(A), saldoAntes, `vuelta ${i}: el saldo vuelve`);
  }
  assert.deepEqual(await invariantesDeAcreditacion(s), []);
});

test("cheques a depositar al cierre de un día pasado: no cuenta los recibidos después y sí los depositados después", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const L = await liq();
  const { sumarDias } = await import("./liquidacion-core");
  const hoy = await hoyDelNegocio();
  const ayer = sumarDias(hoy, -1);
  const deAyer = async () => (await L.chequesADepositar(A, ayer))?.cantidad ?? 0;
  const deHoy = async () => (await L.chequesADepositar(A, hoy))?.cantidad ?? 0;
  const [ayer0, hoy0] = [await deAyer(), await deHoy()];
  await L.registrarPagoACuenta(A, { clave: claveC5("rch4a"), monto: 500.5, fecha: hoy, medio: "CHEQUE", actor: "user:test" });
  assert.equal(await deAyer(), ayer0, "el cierre de ayer no muestra el cheque recibido hoy");
  assert.equal(await deHoy(), hoy0 + 1);
  const viejo = await L.registrarPagoACuenta(A, { clave: claveC5("rch4b"), monto: 600.6, fecha: ayer, medio: "CHEQUE", actor: "user:test" });
  assert.equal(await deAyer(), ayer0 + 1);
  const montoAyer = (await L.chequesADepositar(A, ayer))?.monto ?? 0;
  await L.confirmarAcreditacionMp(A, { pagoId: viejo.pagoId, actor: "user:test" });
  assert.equal(await deAyer(), ayer0 + 1, "depositado hoy: al cierre de ayer seguía a depositar");
  assert.equal((await L.chequesADepositar(A, ayer))?.monto, montoAyer);
  assert.equal(await deHoy(), hoy0 + 1, "hoy ya no está a depositar");
  assert.equal(await L.chequesADepositar(A, "no-es-un-dia").then((r) => r?.cantidad ?? 0), hoy0 + 1, "un día inválido cae en hoy");
});

// ── Cert 7: un pago a cuenta FIFO con cheque que rebota revierte su imputación ─────────────────

/** Dos impagos conciliados (de $ 14.000) y un cheque a cuenta FIFO por uno y medio: el 1.º queda saldado, el 2.º a medias. */
async function chequeFifoSobreDosImpagos(s: Sembrado, nombre: string) {
  await sinPendientes(s);
  const i1 = await voucherCobrado(s, `${nombre} 1`);
  const i2 = await voucherCobrado(s, `${nombre} 2`);
  const L = await liq();
  const sem0 = await semanaNueva();
  const g0 = await L.generarLiquidacionSemanal(s.base.a.id, { hasta: sem0.hasta, hoy: sem0.hoy, actor: "user:test" });
  await L.conciliarLiquidacionSemanal(s.base.a.id, { liquidacionId: g0.liquidacionId, pagado: 0, fecha: "2026-11-02", medio: "TRANSFERENCIA", rechazados: [i1.numero, i2.numero], actor: "user:test" });
  const s0 = await saldo(s.base.a.id);
  const p = await L.registrarPagoACuenta(s.base.a.id, { clave: claveC5("fifo"), monto: 21000, fecha: await hoyDelNegocio(), medio: "CHEQUE", referencia: "CH-FIFO", actor: "user:test" });
  assert.deepEqual(p.imputados.map((x) => [x.monto, x.saldado]), [[14000, true], [7000, false]]);
  return { i1, i2, s0, pagoId: p.pagoId };
}

async function estadoDe(s: Sembrado, numero: string) {
  const d = await prismaComoDuenio(s.base);
  const v = await d.voucher.findFirst({ where: { tenantId: s.base.a.id, numero }, include: { liquidacionSemanal: { select: { estado: true } } } });
  return { resultado: v!.resultadoLiquidacion, liquidado: v!.liquidadoEn != null, imputado: v!.montoLiquidado ? Number(v!.montoLiquidado) : 0, liq: v!.liquidacionSemanal?.estado ?? null, liqId: v!.liquidacionSemanalId };
}

test("cert 7 · cheque FIFO rechazado: los vouchers vuelven a impago y la próxima liquidación los reclama UNA vez; saldo cuadra", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const L = await liq();
  const { i1, i2, s0, pagoId } = await chequeFifoSobreDosImpagos(s, "Cert7 FIFO");
  assert.equal((await estadoDe(s, i1.numero)).resultado, "PAGADO");
  const r = await L.rechazarChequeDeLaAdministracion(A, { pagoId, motivo: "Rebotó sin fondos", actor: "user:test" });
  assert.deepEqual(r.revertidos.map((x) => [x.numero, x.monto, x.reabierto]), [[i1.numero, 14000, true], [i2.numero, 7000, false]]);
  for (const numero of [i1.numero, i2.numero]) {
    assert.deepEqual(await estadoDe(s, numero).then((e) => [e.resultado, e.liquidado, e.imputado, e.liq]), ["IMPAGO", false, 0, "CONCILIADA"]);
  }
  assert.equal(await saldo(A), s0, "el saldo vuelve al de antes del cheque");
  // El segundo rechazo es duplicado: no revierte de nuevo.
  const r2 = await L.rechazarChequeDeLaAdministracion(A, { pagoId, motivo: "Rebotó sin fondos", actor: "user:test" });
  assert.equal(r2.duplicado, true);
  assert.deepEqual(r2.revertidos, []);
  assert.equal((await estadoDe(s, i2.numero)).imputado, 0);
  // Re-liquidación: reclama los dos enteros, una sola vez.
  const sem = await semanaNueva();
  const g = await L.generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.deepEqual([g.cantidad, g.total], [2, 28000]);
  const det = await L.leerLiquidacion(A, g.liquidacionId);
  assert.deepEqual(det!.renglones.map((x) => x.valor), [14000, 14000]);
  await L.conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 28000, fecha: await hoyDelNegocio(), medio: "TRANSFERENCIA", actor: "user:test" });
  assert.equal(await saldo(A), s0 - 2_800_000, "saldo = antes − lo cobrado en la re-liquidación");
  // Nada más que reclamar: la semana siguiente no tiene vouchers.
  const sem2 = await semanaNueva();
  await rechaza(L.generarLiquidacionSemanal(A, { hasta: sem2.hasta, hoy: sem2.hoy, actor: "user:test" }), /nada que liquidar/);
});

test("cert 7 · cheque rechazado con el impago re-tomado por una liquidación ABIERTA: la liquidación reclama lo revertido", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const L = await liq();
  const { i1, i2, s0, pagoId } = await chequeFifoSobreDosImpagos(s, "Cert7 abierta");
  const sem = await semanaNueva();
  const g = await L.generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
  assert.deepEqual([g.cantidad, g.total], [1, 7000], "sólo el 2.º, por lo que falta");
  await L.rechazarChequeDeLaAdministracion(A, { pagoId, motivo: "Rebotó sin fondos", actor: "user:test" });
  const det = await L.leerLiquidacion(A, g.liquidacionId);
  assert.equal(det!.total, 14000);
  assert.deepEqual(det!.renglones.filter((x) => x.numero === i2.numero).map((x) => x.valor), [14000]);
  assert.deepEqual(await estadoDe(s, i1.numero).then((e) => [e.resultado, e.liquidado, e.liq]), ["IMPAGO", false, "CONCILIADA"]);
  assert.equal(await saldo(A), s0);
  // Se concilia la abierta (el 2.º) y la próxima reclama el 1.º: cada uno una vez.
  await L.conciliarLiquidacionSemanal(A, { liquidacionId: g.liquidacionId, pagado: 14000, fecha: await hoyDelNegocio(), medio: "TRANSFERENCIA", actor: "user:test" });
  const sem2 = await semanaNueva();
  const g2 = await L.generarLiquidacionSemanal(A, { hasta: sem2.hasta, hoy: sem2.hoy, actor: "user:test" });
  assert.deepEqual([g2.cantidad, g2.total], [1, 14000]);
  await L.conciliarLiquidacionSemanal(A, { liquidacionId: g2.liquidacionId, pagado: 14000, fecha: await hoyDelNegocio(), medio: "TRANSFERENCIA", actor: "user:test" });
  assert.equal(await saldo(A), s0 - 2_800_000);
});

test("cert 7 · rechazo del cheque ‖ nueva liquidación (5 vueltas): cada voucher se reclama una sola vez y por su valor", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const L = await liq();
  const fallas: string[] = [];
  const crudos: string[] = [];
  const ordenes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const { i1, i2, s0, pagoId } = await chequeFifoSobreDosImpagos(s, `Cert7 par ${i}`);
    const sem = await semanaNueva();
    const rechazar = () => L.rechazarChequeDeLaAdministracion(A, { pagoId, motivo: "Rebotó sin fondos", actor: "user:test" });
    const generar = () => L.generarLiquidacionSemanal(A, { hasta: sem.hasta, hoy: sem.hoy, actor: "user:test" });
    const [rr, rg] = await Promise.allSettled([
      new Promise((res) => setTimeout(res, (i % 2) * 25)).then(rechazar),
      new Promise((res) => setTimeout(res, ((i + 1) % 2) * 25)).then(generar),
    ]);
    for (const x of [rr, rg]) {
      if (x.status === "rejected" && (x.reason as Error)?.constructor?.name !== "VoucherRechazado") crudos.push(String((x.reason as Error)?.message).slice(0, 120));
    }
    // Lo que no pasó por conflicto se reintenta en serie: al final, rechazado y con su liquidación.
    if (rr.status === "rejected") await rechazar();
    const liqId = rg.status === "fulfilled" ? rg.value.liquidacionId : (await generar()).liquidacionId;
    // Cada voucher: o está en la abierta (que reclama su valor entero) o es impago pendiente (lo reclama la próxima).
    const det = await L.leerLiquidacion(A, liqId);
    let reclamado = 0;
    for (const numero of [i1.numero, i2.numero]) {
      const e = await estadoDe(s, numero);
      const enAbierta = e.liqId === liqId;
      const pendiente = e.resultado === "IMPAGO" && !e.liquidado && e.liq === "CONCILIADA";
      if (enAbierta === pendiente) fallas.push(`${i} ${numero}: abierta=${enAbierta} pendiente=${pendiente}`);
      if (e.imputado !== 0) fallas.push(`${i} ${numero}: imputado ${e.imputado}`);
      reclamado += enAbierta ? det!.renglones.find((x) => x.numero === numero)!.valor : 14000 - e.imputado;
    }
    if (reclamado !== 28000) fallas.push(`${i} reclamado ${reclamado}`);
    ordenes.push(det!.renglones.filter((x) => x.resultado === null).length === 2 ? "rechazo-primero" : "liquidacion-primero");
    if (Math.round(det!.total * 100) !== Math.round(det!.renglones.filter((x) => x.resultado === null).reduce((a, x) => a + x.valor, 0) * 100)) {
      fallas.push(`${i} total ${det!.total} ≠ renglones`);
    }
    if ((await saldo(A)) !== s0) fallas.push(`${i} saldo`);
    await L.descartarLiquidacion(A, { liquidacionId: liqId, actor: "user:test" });
  }
  console.log(`cert7 rechazo ‖ liquidación: ${JSON.stringify(ordenes)}`);
  assert.deepEqual(crudos, []);
  assert.deepEqual(fallas, []);
});

// ── Orden del dueño (08/11/2026): marcar un cheque rechazado «solamente lo puede hacer el dueño y el
// administrador». La Server Action real, rol por rol: nadie más escribe, ni con `cash:manage` ni con
// un override que intente prenderle el permiso por la base.

test("rechazarCheque (Server Action): recepción y profesional reciben un rechazo sin escribir; la dueña sí puede", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const A = s.base.a.id;
  const d = await prismaComoDuenio(s.base);
  const L = await liq();
  const { rechazarCheque } = await import("./liquidacion-actions");
  const { SOLO_DUENIO_RECHAZA_CHEQUE } = await import("./liquidacion-core");
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { VOUCHERS } = await import("@/cambios/interruptores");
  // Prendido, así la negación sale por el permiso y no por el interruptor.
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId: A, interruptor: VOUCHERS, accion: "encender", operador: "test" }) });
  const hoy = await hoyDelNegocio();
  const ch = await L.registrarPagoACuenta(A, { clave: claveC5("perm"), monto: 4321, fecha: hoy, medio: "CHEQUE", referencia: "Ch 0909", actor: "user:test" });
  const saldoAntes = await saldo(A);
  const fd = () => {
    const f = new FormData();
    f.set("pagoId", ch.pagoId);
    f.set("motivo", "Sin fondos");
    return f;
  };
  const rechazos = async () => d.auditLog.count({ where: { tenantId: A, action: "voucher.pago.cheque-rechazado", entityId: ch.pagoId } });

  // Profesional: sin `cash:manage` ni llega (la puerta gruesa lo manda a su home); con `cash:manage`
  // prendido por la matriz, la puerta fina lo rechaza.
  const profesional = await d.user.create({
    data: { tenantId: A, name: "Profesional A", email: `profesional-perm-${Date.now()}@negocio-a.erp.test`, passwordHash: "x", role: "PROFESSIONAL" },
  });
  const sinCaja = await ejecutarAccion({ negocio: s.base.a, usuario: profesional }, () => rechazarCheque(fd()));
  assert.equal(sinCaja.tipo, "redireccion", JSON.stringify(sinCaja));
  await d.userPermissionOverride.create({ data: { tenantId: A, userId: profesional.id, capability: "cash:manage", allowed: true } });
  await d.userPermissionOverride.create({ data: { tenantId: A, userId: profesional.id, capability: "vouchers:rechazar-cheque", allowed: true } });
  const conCaja = await ejecutarAccion({ negocio: s.base.a, usuario: profesional }, () => rechazarCheque(fd()));
  assert.deepEqual(conCaja.tipo === "respuesta" ? conCaja.valor : conCaja, { ok: false, error: SOLO_DUENIO_RECHAZA_CHEQUE });

  // Recepción: trae `cash:manage` por rol; un override que intente prenderle el permiso no cuenta.
  await d.userPermissionOverride.create({ data: { tenantId: A, userId: s.base.a.recepcion.id, capability: "vouchers:rechazar-cheque", allowed: true } });
  const recepcion = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => rechazarCheque(fd()));
  assert.deepEqual(recepcion.tipo === "respuesta" ? recepcion.valor : recepcion, { ok: false, error: SOLO_DUENIO_RECHAZA_CHEQUE });
  await d.userPermissionOverride.deleteMany({ where: { tenantId: A, capability: "vouchers:rechazar-cheque" } });

  assert.equal(await rechazos(), 0, "nadie sin permiso escribió el rechazo");
  assert.equal(await saldo(A), saldoAntes, "la deuda no se movió");

  // La dueña (OWNER, que absorbe al administrador): pasa y revierte la imputación.
  const duenia = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.duenia }, () => rechazarCheque(fd()));
  assert.equal(duenia.tipo, "respuesta", JSON.stringify(duenia));
  const v = (duenia as { valor: Awaited<ReturnType<typeof rechazarCheque>> }).valor;
  assert.ok(v.ok, JSON.stringify(v));
  assert.equal(await rechazos(), 1);
  assert.equal(saldoAntes - (await saldo(A)), -432100, "el pago vuelve a deuda");
  await d.user.delete({ where: { id: profesional.id } });
});
