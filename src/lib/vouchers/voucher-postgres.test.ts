/**
 * Cobro con voucher (CH · La Alameda), EJECUTADO contra Postgres con RLS (base efímera local: la
 * migración 20261105120000_vouchers la aplica `migrate deploy`; prisma/pending-gate2/CH_voucher_enum.sql
 * se aplica acá, SÓLO en esta base, después del primer test):
 *
 *   · sin `PaymentMethod.VOUCHER` en la base → rechazo claro, nada escrito;
 *   · el cobro con voucher es un `Collection` VOUCHER por el saldo; NO mueve el efectivo ni el libro,
 *     y el cierre del día lo muestra aparte («Voucher», a cobrar a OpenKey);
 *   · doble uso concurrente del mismo voucher → uno solo gana; dos vouchers al mismo turno → uno;
 *   · voucher de otro cliente, anulado, con baja en OpenKey, turno cancelado → rechazo;
 *   · otro negocio: ni su voucher ni su turno se ven;
 *   · monto menor que el saldo: el resto queda a cobrar;
 *   · anular el cobro (anulación de siempre) devuelve el voucher; con baja en OpenKey no se anula;
 *   · la foto y la liquidación de OpenKey concilian y dejan su VoucherConciliacion;
 *   · la Server Action: apagada rechaza, prendida cobra;
 *   · la caja de HOY cerrada → rechazo (DB-5). Va al final: congela el día.
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
  turno: (clientId: string, o?: { dias?: number; status?: "CONFIRMED" | "CANCELLED" | "COMPLETED" }) => Promise<string>;
  voucher: (clientId: string, o?: { estado?: string; estadoOpenKey?: string | null }) => Promise<string>;
};
type Sembrado = { base: BaseEfimera; a: Negocio; b: Negocio };
let sembrado: Sembrado | null = null;
let conEnum = false;
let n = 0;

async function preparar(t: import("node:test").TestContext, o: { enum?: boolean } = { enum: true }): Promise<Sembrado | null> {
  if (!sembrado) {
    const base = await laBase(t);
    if (!base) return null;
    apuntarLaAppA(base);
    prepararAccionesDeServidor();
    Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
    const duenio = await prismaComoDuenio(base);
    const negocio = async (tenantId: string): Promise<Negocio> => {
      const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
      const servicio = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 30, price: 14000 } });
      const prof = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: servicio.id }] } } });
      const lote = await duenio.voucherLote.create({ data: { tenantId, numero: `L-${tenantId.slice(-4)}`, cantidad: 0 } });
      return {
        cliente: async (nombre) => (await duenio.client.create({ data: { tenantId, name: nombre, phone: `11400090${String(n++).padStart(2, "0")}` } })).id,
        turno: async (clientId, op = {}) => {
          const startsAt = new Date(Date.now() + (op.dias ?? 2) * DIA + n++ * 3_600_000);
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
                status: op.status ?? "CONFIRMED",
                priceAtBooking: 14000,
              },
            })
          ).id;
        },
        voucher: async (clientId, op = {}) => {
          const numero = `V-${String(n++).padStart(4, "0")}`;
          await duenio.voucher.create({
            data: {
              tenantId,
              numero,
              loteId: lote.id,
              clientId,
              estado: op.estado ?? "DISPONIBLE",
              estadoOpenKey: op.estadoOpenKey === undefined ? "DISPONIBLE" : op.estadoOpenKey,
            },
          });
          return numero;
        },
      };
    };
    sembrado = { base, a: await negocio(base.a.id), b: await negocio(base.b.id) };
  }
  if (o.enum && !conEnum) {
    // CH_voucher_enum.sql, sólo en esta base efímera: cada ADD VALUE en su paso (autocommit).
    const duenio = await prismaComoDuenio(sembrado.base);
    const sql = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/CH_voucher_enum.sql"), "utf8");
    const pasos = sql.split("\n").filter((l) => /^ALTER TYPE/.test(l.trim()));
    assert.equal(pasos.length, 1);
    for (const paso of pasos) await duenio.$executeRawUnsafe(paso);
    const { olvidarSchemaProbe } = await import("@/lib/schema-probe");
    olvidarSchemaProbe();
    conEnum = true;
  }
  return sembrado;
}

const repo = () => import("./voucher-repo");

async function cobrar(s: Sembrado, numero: string, appointmentId: string, o: { tenantId?: string; monto?: number } = {}) {
  const { cobrarConVoucher } = await repo();
  return cobrarConVoucher(o.tenantId ?? s.base.a.id, { numero, appointmentId, actor: "user:test", monto: o.monto });
}

async function estado(s: Sembrado, numero: string) {
  const duenio = await prismaComoDuenio(s.base);
  const v = await duenio.voucher.findFirstOrThrow({
    where: { numero },
    select: { estado: true, appointmentId: true, collectionId: true, valorCubierto: true },
  });
  return { estado: v.estado, turno: v.appointmentId, cobro: v.collectionId, valor: v.valorCubierto?.toNumber() ?? null };
}

async function cobrosVoucher(s: Sembrado, appointmentId: string) {
  const duenio = await prismaComoDuenio(s.base);
  return (await duenio.collection.findMany({ where: { appointmentId, method: "VOUCHER" }, select: { amount: true } })).map((c) => c.amount.toNumber());
}

async function rechaza(p: Promise<unknown>, motivo: string) {
  const { VoucherRechazado } = await repo();
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof VoucherRechazado, `esperaba VoucherRechazado(${motivo}), vino ${String(e)}`);
    assert.equal(e.motivo, motivo);
    return true;
  });
}

test("sin PaymentMethod.VOUCHER en la base: rechazo claro y nada escrito", async (t) => {
  const s = await preparar(t, { enum: false });
  if (!s) return;
  const ana = await s.a.cliente("Ana");
  const turno = await s.a.turno(ana);
  const numero = await s.a.voucher(ana);
  await rechaza(cobrar(s, numero, turno), "enum-ausente");
  assert.equal((await estado(s, numero)).estado, "DISPONIBLE");
  const duenio = await prismaComoDuenio(s.base);
  assert.equal(await duenio.collection.count({ where: { appointmentId: turno } }), 0);
});

test("el cobro con voucher es un Collection VOUCHER por el saldo: no mueve el efectivo ni el libro, el cierre lo muestra aparte", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const bea = await s.a.cliente("Bea");
  const turno = await s.a.turno(bea);
  const numero = await s.a.voucher(bea);
  await duenio.collection.create({
    data: { tenantId: s.base.a.id, originType: "APPOINTMENT", originId: turno, appointmentId: turno, amount: 5000, method: "EFECTIVO", collectedBy: "user:test" },
  });
  const { getCierreDiarioData } = await import("@/lib/cierre-diario-actions");
  const cierre = async () => {
    const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.duenia }, () => getCierreDiarioData(null, { esperadoALaVista: true }));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    if (r.tipo !== "respuesta") throw new Error("sin respuesta");
    return r.valor;
  };
  const antes = await cierre();
  const libroAntes = await duenio.cashMovement.count({ where: { tenantId: s.base.a.id } });

  const r = await cobrar(s, ` ${numero.toLowerCase()} `, turno);
  assert.deepEqual([r.valorCubierto, r.saldoDespues, r.sinVerificar], [9000, 0, false]);
  assert.deepEqual(r.caja, { recorded: false, reason: "unsupported-method" }, "VOUCHER no se traduce a un medio del libro");
  assert.deepEqual(await estado(s, numero), { estado: "USADO", turno, cobro: r.collectionId, valor: 9000 });
  const fila = await duenio.collection.findUniqueOrThrow({ where: { id: r.collectionId }, select: { method: true, amount: true, idempotencyKey: true } });
  assert.deepEqual([fila.method, fila.amount.toNumber(), fila.idempotencyKey], ["VOUCHER", 9000, `voucher:${r.voucherId}`]);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: s.base.a.id } }), libroAntes, "el libro de caja no tiene movimientos nuevos");
  const turnoDespues = await duenio.appointment.findUniqueOrThrow({ where: { id: turno }, select: { priceAtBooking: true, discountAmount: true } });
  assert.deepEqual(turnoDespues, { priceAtBooking: 14000, discountAmount: 0 }, "el precio del turno no se toca");

  const despues = await cierre();
  assert.deepEqual(despues.vouchersACobrar, { cantidad: 1, monto: 9000 });
  assert.equal(despues.preview.porColumna.EFECTIVO.expected, antes.preview.porColumna.EFECTIVO.expected, "el efectivo esperado no cambia");
  assert.equal(despues.preview.total.expected, antes.preview.total.expected, "el esperado total no cambia");

  // Saldo en cero: un segundo voucher al mismo turno se rechaza.
  await rechaza(cobrar(s, await s.a.voucher(bea), turno), "turno-con-voucher");
});

test("doble uso concurrente del mismo voucher: uno solo gana", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const cami = await s.a.cliente("Cami");
  const [t1, t2] = [await s.a.turno(cami), await s.a.turno(cami)];
  const numero = await s.a.voucher(cami);
  const rs = await Promise.allSettled([cobrar(s, numero, t1), cobrar(s, numero, t2)]);
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(rs.map((r) => (r.status === "rejected" ? String(r.reason) : "ok"))));
  const cobros = [...(await cobrosVoucher(s, t1)), ...(await cobrosVoucher(s, t2))];
  assert.deepEqual(cobros, [14000], "un solo cobro con voucher");
});

test("dos vouchers al mismo turno a la vez: uno solo cobra", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const dani = await s.a.cliente("Dani");
  const turno = await s.a.turno(dani);
  const [v1, v2] = [await s.a.voucher(dani), await s.a.voucher(dani)];
  const rs = await Promise.allSettled([cobrar(s, v1, turno), cobrar(s, v2, turno)]);
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(await cobrosVoucher(s, turno), [14000], "no se cobró dos veces");
  const estados = [(await estado(s, v1)).estado, (await estado(s, v2)).estado].sort();
  assert.deepEqual(estados, ["DISPONIBLE", "USADO"]);
});

test("otro cliente, anulado, con baja en OpenKey o turno cancelado: rechazo y nada cambia", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const [eva, flor] = [await s.a.cliente("Eva"), await s.a.cliente("Flor")];
  const turno = await s.a.turno(eva);
  await rechaza(cobrar(s, await s.a.voucher(flor), turno), "otro-cliente");
  await rechaza(cobrar(s, await s.a.voucher(eva, { estado: "ANULADO" }), turno), "anulado");
  await rechaza(cobrar(s, await s.a.voucher(eva, { estadoOpenKey: "BAJA" }), turno), "baja-openkey");
  await rechaza(cobrar(s, "NO-EXISTE", turno), "no-existe");
  const cancelado = await s.a.turno(eva, { status: "CANCELLED" });
  await rechaza(cobrar(s, await s.a.voucher(eva), cancelado), "turno-cerrado");
  assert.deepEqual(await cobrosVoucher(s, turno), []);
  // Sin foto de OpenKey: se permite, «sin verificar».
  assert.equal((await cobrar(s, await s.a.voucher(eva, { estadoOpenKey: null }), turno)).sinVerificar, true);
});

test("otro negocio: ni su voucher ni su turno existen para A", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const deA = await s.a.cliente("Gabi");
  const deB = await s.b.cliente("Gabi B");
  const turnoA = await s.a.turno(deA);
  const turnoB = await s.b.turno(deB);
  const voucherB = await s.b.voucher(deB);
  await rechaza(cobrar(s, voucherB, turnoA), "no-existe");
  await rechaza(cobrar(s, await s.a.voucher(deA), turnoB), "turno-no-existe");
  assert.equal((await estado(s, voucherB)).estado, "DISPONIBLE");
  assert.deepEqual(await cobrosVoucher(s, turnoB), []);
});

test("monto menor que el saldo: el resto queda a cobrar con los medios de siempre", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const hilda = await s.a.cliente("Hilda");
  const turno = await s.a.turno(hilda);
  const r = await cobrar(s, await s.a.voucher(hilda), turno, { monto: 10000 });
  assert.deepEqual([r.valorCubierto, r.saldoDespues], [10000, 4000]);
  await rechaza(cobrar(s, await s.a.voucher(hilda), await s.a.turno(hilda), { monto: 20000 }), "excede-saldo");
});

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

test("anular el cobro con voucher (anulación de siempre) devuelve el voucher; con baja en OpenKey no se anula", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const ines = await s.a.cliente("Inés");
  const turno = await s.a.turno(ines);
  const numero = await s.a.voucher(ines);
  const libroAntes = await duenio.cashMovement.count({ where: { tenantId: s.base.a.id } });
  const r = await cobrar(s, numero, turno);
  const a = await anular(s, turno, r.collectionId);
  assert.ok(a.applied);
  assert.ok(a.applied && a.libro.asentada === false, "sin asiento que revertir");
  assert.deepEqual(await estado(s, numero), { estado: "DISPONIBLE", turno: null, cobro: null, valor: null });
  assert.deepEqual((await cobrosVoucher(s, turno)).sort((x, y) => x - y), [-14000, 14000]);
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: s.base.a.id } }), libroAntes, "ni el cobro ni su anulación tocan el libro");

  // Se vuelve a usar: la clave no choca con la del cobro anulado.
  const otra = await cobrar(s, numero, turno);
  const clave = await duenio.collection.findUniqueOrThrow({ where: { id: otra.collectionId }, select: { idempotencyKey: true } });
  assert.equal(clave.idempotencyKey, `voucher:${otra.voucherId}:2`);

  await duenio.voucher.updateMany({ where: { numero, tenantId: s.base.a.id }, data: { bajaOpenKeyEn: new Date(), estadoOpenKey: "BAJA" } });
  const { AnulacionRechazada } = await import("@/lib/turnos/anulacion");
  await assert.rejects(anular(s, turno, otra.collectionId), (e: unknown) => e instanceof AnulacionRechazada && e.motivo === "voucher-con-baja");
  assert.equal((await estado(s, numero)).estado, "USADO");
});

test("la foto de OpenKey y su liquidación concilian y dejan su VoucherConciliacion", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const juli = await s.a.cliente("Juli");
  await duenio.client.update({ where: { id: juli }, data: { docNro: "27111222" } });
  const usado = await s.a.voucher(juli, { estadoOpenKey: null });
  const libre = await s.a.voucher(juli, { estadoOpenKey: null });
  const aAnular = await s.a.voucher(juli, { estadoOpenKey: null });
  await cobrar(s, usado, await s.a.turno(juli));
  const { leerCsvOpenKey, leerCsvLiquidacion } = await import("./voucher-core");
  const { importarFotoOpenKey, importarLiquidacionOpenKey } = await repo();
  const foto = leerCsvOpenKey(`numero;lote;estado;documento\n${usado};L;disponible;\n${libre};L;usado;\n${aAnular};L;anulado;\nNUEVO-1;LX;disponible;27111222\nFANTASMA;LX;disponible;99\n`);
  const r = await importarFotoOpenKey(s.base.a.id, { filas: foto.filas, origen: "MANUAL", actor: "u" });
  assert.deepEqual(r.creados, ["NUEVO-1"]);
  assert.deepEqual(r.anuladosPorOpenKey, [aAnular]);
  assert.deepEqual(r.conciliacion.faltaBaja, [usado]);
  assert.deepEqual(r.conciliacion.usadoEnOpenKeySinCobro, [libre]);
  assert.deepEqual(r.conciliacion.desconocidosEnOpenKey, ["FANTASMA"]);
  assert.equal((await duenio.voucherConciliacion.findUniqueOrThrow({ where: { id: r.conciliacionId }, select: { tenantId: true } })).tenantId, s.base.a.id);
  await rechaza(cobrar(s, libre, await s.a.turno(juli)), "baja-openkey");

  const liq = leerCsvLiquidacion(`numero;monto;fecha;referencia\n${usado};13000;05/11/2026;LIQ-1\n${libre};14000;05/11/2026;LIQ-1\n`);
  const l = await importarLiquidacionOpenKey(s.base.a.id, { filas: liq.filas, origen: "MANUAL", actor: "u" });
  assert.equal(l.marcados, 2);
  assert.deepEqual(l.conciliacion.montoDistinto, [{ numero: usado, cobrado: 14000, liquidado: 13000 }]);
  assert.deepEqual(l.conciliacion.liquidadoSinCobro, [libre]);
  const v = await duenio.voucher.findFirstOrThrow({ where: { numero: usado }, select: { montoLiquidado: true, liquidacionRef: true, liquidadoEn: true } });
  assert.deepEqual([v.montoLiquidado?.toNumber(), v.liquidacionRef, Boolean(v.liquidadoEn)], [13000, "LIQ-1", true]);
});

test("la Server Action: apagada rechaza sin escribir; prendida cobra con la recepción", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const kari = await s.a.cliente("Kari");
  const turno = await s.a.turno(kari);
  const numero = await s.a.voucher(kari);
  const { aplicarVoucherAlTurno } = await import("./voucher-actions");
  const como = async () => {
    const f = new FormData();
    f.set("appointmentId", turno);
    f.set("numero", numero);
    const r = await ejecutarAccion({ negocio: s.base.a, usuario: s.base.a.recepcion }, () => aplicarVoucherAlTurno(f));
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return r.tipo === "respuesta" ? r.valor : null;
  };
  const apagada = await como();
  assert.match(apagada && !apagada.ok ? apagada.error : "", /no están prendidos/);
  assert.equal((await estado(s, numero)).estado, "DISPONIBLE");

  const duenio = await prismaComoDuenio(s.base);
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { VOUCHERS } = await import("@/cambios/interruptores");
  await duenio.auditLog.create({ data: filaDeInterruptor({ tenantId: s.base.a.id, interruptor: VOUCHERS, accion: "encender", operador: "test" }) });
  const prendida = await como();
  assert.equal(prendida?.ok, true, JSON.stringify(prendida));
  assert.deepEqual(await cobrosVoucher(s, turno), [14000]);
});

// Va al final: cierra la caja de HOY del negocio A (congela el día).
test("con la caja de hoy cerrada, el cobro con voucher se rechaza y no escribe nada (DB-5)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const duenio = await prismaComoDuenio(s.base);
  const lu = await s.a.cliente("Lu");
  const turno = await s.a.turno(lu);
  const numero = await s.a.voucher(lu);
  const { todayInBusinessTz } = await import("@/lib/datetime");
  await duenio.auditLog.create({
    data: { tenantId: s.base.a.id, actor: "user:test", action: "caja.cierre-diario", entity: "CierreDiario", entityId: todayInBusinessTz(), changes: {} },
  });
  const { CobroTurnoRechazado } = await import("@/lib/turnos/cobro-turno-repo");
  await assert.rejects(cobrar(s, numero, turno), (e: unknown) => e instanceof CobroTurnoRechazado && e.motivo === "dia-cerrado");
  assert.deepEqual(await estado(s, numero), { estado: "DISPONIBLE", turno: null, cobro: null, valor: null });
  assert.deepEqual(await cobrosVoucher(s, turno), []);
});
