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
  const p1 = await registrarPagoACuenta(A, { clave, monto: 4000, fecha: "2026-11-03", medio: "EFECTIVO", actor: "user:test" });
  const p2 = await registrarPagoACuenta(A, { clave, monto: 4000, fecha: "2026-11-03", medio: "EFECTIVO", actor: "user:test" });
  assert.deepEqual([p1.duplicado, p2.duplicado, p2.pagoId], [false, true, p1.pagoId]);
  assert.equal((await saldo(A)) - saldoAntes, 0);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: A } }), libroAntes, "nada de esto toca el libro de caja");
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
  fp.set("medio", "EFECTIVO");
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

test("la baja como Server Action: con el permiso de conciliar (cash:manage, también la recepcionista), con motivo", async (t) => {
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
  const correr = async (usuario: typeof s.base.a.duenia, fd: FormData) => {
    const r = await ejecutarAccion({ negocio: s.base.a, usuario }, () => bajaDeImpago(fd));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: Awaited<ReturnType<typeof bajaDeImpago>> }).valor;
  };
  const sinMotivo = new FormData();
  sinMotivo.set("numero", v.numero);
  const r0 = await correr(s.base.a.recepcion, sinMotivo);
  assert.match(!r0.ok ? r0.error : "", /por qué/);
  assert.equal((await duenio.voucher.findUniqueOrThrow({ where: { id: v.voucherId } })).liquidadoEn, null);
  const fd = new FormData();
  fd.set("numero", v.numero);
  fd.set("motivo", "La administración lo desconoce");
  const r1 = await correr(s.base.a.recepcion, fd);
  assert.ok(r1.ok && !r1.valor.duplicado, JSON.stringify(r1));
  const r2 = await correr(s.base.a.duenia, fd);
  assert.ok(r2.ok && r2.valor.duplicado, JSON.stringify(r2));
  const audit = await duenio.auditLog.findMany({ where: { tenantId: A, action: "voucher.liquidacion.baja-impago", entityId: v.voucherId }, select: { actor: true } });
  assert.deepEqual(audit, [{ actor: `user:${s.base.a.recepcion.id}` }]);
});
