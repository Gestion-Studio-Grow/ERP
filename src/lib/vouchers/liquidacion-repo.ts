// ============================================================================
// VOUCHERS · LIQUIDACIÓN DEL LUNES y CUENTA DE LA ADMINISTRACIÓN — persistencia (tenant-scoped).
// ============================================================================
//
// La regla vive en liquidacion-core.ts. Acá, las transacciones:
//
//   GENERAR la liquidación de la semana que terminó el domingo `hasta` (Serializable):
//     1. crea la fila `VoucherLiquidacion` (única por negocio y `hasta`: la misma semana no se
//        liquida dos veces; el choque de la clave única es el árbitro de dos pedidos a la vez);
//     2. TOMA los vouchers USADOS con su cobro, sin liquidar, usados antes del lunes siguiente con
//        `updateMany where {liquidacionSemanalId: null, …}` y exige que el conteo coincida (un
//        voucher nunca entra en dos liquidaciones, ni aunque se generen dos semanas a la vez). Los
//        rezagados de semanas anteriores entran en la próxima: ninguno queda afuera para siempre.
//     3. RE-TOMA los IMPAGOS de liquidaciones ya conciliadas (la deuda de la administración sigue
//        viva): pasan a la nueva con `resultadoLiquidacion: null`, con el mismo `updateMany` + conteo.
//        La liquidación vieja guarda el rastro en su AuditLog (`…reliquidar-impagos`) y su detalle
//        los sigue mostrando como IMPAGO.
//   CONCILIAR (Serializable): pasa la liquidación de ABIERTA a CONCILIADA con
//     `updateMany where {estado:'ABIERTA'}` y `count === 1` (la segunda conciliación no pasa),
//     anota el pago como crédito de la cuenta (clave `liq:<id>`, única) y marca cada voucher
//     PAGADO (con `liquidadoEn`, `montoLiquidado`, `liquidacionRef`) o IMPAGO.
//   DESCARTAR una ABIERTA (mal generada): libera sus vouchers y la borra. Una conciliada no. Los
//     impagos que había re-tomado vuelven a su liquidación de origen como IMPAGO.
//   PAGO A CUENTA (idempotente por la clave del formulario): crédito de la cuenta por su monto
//     entero, que se IMPUTA a impagos concretos (los números que diga el formulario o, si no dice,
//     FIFO por fecha de uso). Lo imputado se acumula en `montoLiquidado` del impago; cuando lo cubre
//     entero, el voucher pasa a PAGADO con `liquidadoEn` y `liquidacionRef: "Pago a cuenta …"` y ya
//     no se re-liquida. Una re-liquidación reclama sólo lo que falta (valor − imputado). Lo que sobra
//     del pago queda a favor de la administración, sin imputar.
//   BAJA de un IMPAGO (la administración lo desconoce para siempre; cash:manage, con motivo y
//     AuditLog): queda IMPAGO con `liquidadoEn` (fecha de la baja), `montoLiquidado` = lo imputado
//     hasta ahí y `liquidacionRef: "Baja: <motivo>"`; ya no se re-liquida y en la cuenta suma un
//     crédito por lo NO imputado (valor − imputado): lo pagado a cuenta no se compensa dos veces.
//   Sin columnas nuevas: «impago pendiente» = IMPAGO con `liquidadoEn` nulo.
//
// Invariante de la cuenta: saldo = Σ vouchers usados − Σ pagos (liquidaciones y a cuenta) − Σ bajas
// (lo no imputado de cada una); cada voucher se reclama, entre todas sus liquidaciones y pagos a
// cuenta, como mucho por su valor.
//
// Un voucher tomado por una liquidación no se puede anular desde el turno (turnos/anulacion.ts
// exige `liquidacionSemanalId: null`; la base lo refuerza con un CHECK). Nada de esto toca el libro
// de caja ni el cajón: el voucher es plata a cobrar a la administración del country.
// Todo lleva `tenantId` explícito además de RLS (MT-1).

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { esConflictoDeEscritura } from "@/lib/conflicto-de-escritura";
import { businessWallTimeToUtc, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { textoAlCentavo } from "@/lib/dinero/redondeo";
import { VoucherRechazado } from "./voucher-repo";
import { PREFIJO_BAJA_IMPAGO } from "./voucher-core";
import { decidirAsiento } from "@/lib/settlement/asiento-libro";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import {
  ACCION_ACREDITADO_MP,
  candidatosDeAcreditacion,
  detalleDelIngreso,
  eleccionDeAcreditacion,
  esperaAcreditacion,
  leerAcreditacion,
  marcaDelPagoEnCaja,
  medioDeCajaDelPago,
  ventanaDeAcreditacion,
  type EstadoAcreditacion,
  type MovimientoMp,
} from "./acreditacion-core";
import {
  cuentaCorriente,
  esDiaReal,
  planDeImputacion,
  MENSAJES_CONCILIACION,
  MENSAJES_SEMANA,
  pesosDeCentavos,
  planDeConciliacion,
  sumarDias,
  estadoDeBaja,
  fechaArgentina,
  sumaCentavos,
  validarSemana,
  type MedioPagoAdministracion,
  type MovimientoConSaldo,
  type MovimientoDeCuenta,
  type RenglonDelReporte,
  type ResumenDeCuenta,
  type Semana,
} from "./liquidacion-core";

const SERIALIZABLE = Prisma.TransactionIsolationLevel.Serializable;

const YA_LIQUIDADA = "Esa semana ya tiene su liquidación: abrila desde la lista en vez de generarla de nuevo.";
const CAMBIO_RECIEN = "Los vouchers cambiaron recién (otra liquidación o una anulación). Recargá y probá de nuevo.";
const LIQUIDACION_CAMBIO_RECIEN = "Alguien modificó la liquidación recién; recargá y reintentá.";

/**
 * Con contención alta `tenantTransaction` agota los reintentos y deja salir el conflicto de
 * Serializable (P2034 / 40001 / 40P01) crudo. No es un error de negocio: se traduce a
 * `cambio-recien` para que la pantalla muestre un mensaje claro y no un 500 (cert 4, C4-3).
 */
function sinConflictoCrudo(e: unknown): never {
  if (esConflictoDeEscritura(e)) throw new VoucherRechazado("cambio-recien", LIQUIDACION_CAMBIO_RECIEN);
  throw e;
}
const NO_EXISTE = "Esa liquidación ya no existe. Recargá la pantalla.";
const YA_CONCILIADA = "Esa liquidación ya se concilió: no se concilia dos veces. Si falta plata, anotá un pago a cuenta.";

/** Rastro en el AuditLog de la liquidación vieja cuando sus impagos pasan a otra. */
const ACCION_RELIQUIDAR = "voucher.liquidacion.reliquidar-impagos";
/** Rastro en el AuditLog de una liquidación ABIERTA cuando un pago a cuenta salda parte de sus impagos. */
const ACCION_DESCUENTO_A_CUENTA = "voucher.liquidacion.descuento-a-cuenta";
/** Prefijo de `liquidacionRef` de un impago dado de baja. */
const PREFIJO_BAJA = PREFIJO_BAJA_IMPAGO;
/** Prefijo de `liquidacionRef` de un impago saldado con un pago a cuenta. */
const PREFIJO_A_CUENTA = "Pago a cuenta";

const centavosDeDecimal = (d: Prisma.Decimal | null | undefined): number => (d ? sumaCentavos([d.toNumber()]) : 0);
/**
 * Lo que la administración todavía debe de un voucher: su valor menos lo ya imputado por pagos a
 * cuenta. Sólo un impago pendiente (`liquidadoEn` nulo) tiene imputado; uno nuevo tiene
 * `montoLiquidado` nulo.
 */
const pendienteDe = (v: { valorCubierto: Prisma.Decimal | null; montoLiquidado: Prisma.Decimal | null }): number =>
  Math.max(0, centavosDeDecimal(v.valorCubierto) - centavosDeDecimal(v.montoLiquidado));

/** Impago que todavía es deuda viva de la administración (no se dio de baja): vuelve a liquidarse. */
const impagoPendiente = (tenantId: string): Prisma.VoucherWhereInput => ({
  tenantId,
  estado: "USADO",
  resultadoLiquidacion: "IMPAGO",
  liquidacionSemanalId: { not: null },
  liquidadoEn: null,
});

// ── Generar ─────────────────────────────────────────────────────────────────

export type GenerarLiquidacionArgs = { hasta: string; actor: string; hoy?: string };
export type LiquidacionGenerada = { liquidacionId: string; semana: Semana; cantidad: number; total: number };

export async function generarLiquidacionSemanal(tenantId: string, args: GenerarLiquidacionArgs): Promise<LiquidacionGenerada> {
  const hoy = args.hoy ?? todayInBusinessTz();
  const v = validarSemana(args.hasta, hoy);
  if (!v.ok) throw new VoucherRechazado("dato-invalido", MENSAJES_SEMANA[v.motivo]);
  const { semana } = v;
  // Todo lo usado ANTES del lunes siguiente (00:00 del negocio), incluidos los rezagados.
  const corte = businessWallTimeToUtc(sumarDias(semana.hasta, 1), "00:00");
  try {
    return await tenantTransaction(
      async (tx) => {
        const liq = await tx.voucherLiquidacion.create({
          data: { tenantId, desde: semana.desde, hasta: semana.hasta, creadoPor: args.actor },
          select: { id: true },
        });
        const elegibles: Prisma.VoucherWhereInput = {
          tenantId,
          estado: "USADO",
          collectionId: { not: null },
          liquidacionSemanalId: null,
          liquidadoEn: null,
          usadoEn: { lt: corte },
        };
        const nuevos = await tx.voucher.findMany({ where: elegibles, select: { id: true, valorCubierto: true, montoLiquidado: true } });
        // Los rechazados en liquidaciones ya conciliadas: la administración los sigue debiendo.
        const impagos = await tx.voucher.findMany({
          where: { ...impagoPendiente(tenantId), usadoEn: { lt: corte }, liquidacionSemanal: { estado: "CONCILIADA" } },
          select: { id: true, numero: true, valorCubierto: true, montoLiquidado: true, liquidacionSemanalId: true },
        });
        const vouchers = [...nuevos, ...impagos];
        if (vouchers.length === 0) {
          throw new VoucherRechazado(
            "dato-invalido",
            "No hay vouchers usados sin liquidar hasta ese domingo: no hay nada que liquidar. Si la administración pagó por adelantado, anotalo como pago a cuenta.",
          );
        }
        if (nuevos.length) {
          const tomados = await tx.voucher.updateMany({
            where: { ...elegibles, id: { in: nuevos.map((x) => x.id) } },
            data: { liquidacionSemanalId: liq.id },
          });
          if (tomados.count !== nuevos.length) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
        }
        // Re-toma por liquidación de origen (cada una deja su rastro para su detalle y el descarte).
        const porOrigen = new Map<string, typeof impagos>();
        for (const v of impagos) {
          const k = v.liquidacionSemanalId as string;
          porOrigen.set(k, [...(porOrigen.get(k) ?? []), v]);
        }
        for (const [origen, vs] of porOrigen) {
          const r = await tx.voucher.updateMany({
            where: { ...impagoPendiente(tenantId), liquidacionSemanalId: origen, id: { in: vs.map((x) => x.id) } },
            data: { liquidacionSemanalId: liq.id, resultadoLiquidacion: null },
          });
          if (r.count !== vs.length) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
          await tx.auditLog.create({
            data: {
              tenantId,
              actor: args.actor,
              action: ACCION_RELIQUIDAR,
              entity: "VoucherLiquidacion",
              entityId: origen,
              channel: "admin",
              changes: { hacia: liq.id, vouchers: vs.map((x) => x.id), numeros: vs.map((x) => x.numero) },
            },
          });
        }
        // Cada voucher se reclama por lo que falta: un impago saldado en parte a cuenta, por el resto.
        const totalCentavos = vouchers.reduce((acc, x) => acc + pendienteDe(x), 0);
        const total = pesosDeCentavos(totalCentavos);
        // Lo ya imputado a cuenta de cada re-liquidado: el reporte de esta liquidación lo descuenta.
        const descuentos = Object.fromEntries(
          impagos.filter((x) => centavosDeDecimal(x.montoLiquidado) > 0).map((x) => [x.id, centavosDeDecimal(x.montoLiquidado)]),
        );
        await tx.voucherLiquidacion.updateMany({ where: { id: liq.id, tenantId }, data: { cantidad: vouchers.length, total } });
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: args.actor,
            action: "voucher.liquidacion.generar",
            entity: "VoucherLiquidacion",
            entityId: liq.id,
            channel: "admin",
            changes: { desde: semana.desde, hasta: semana.hasta, cantidad: vouchers.length, total, reliquidados: impagos.map((x) => x.numero), descuentos },
          },
        });
        return { liquidacionId: liq.id, semana, cantidad: vouchers.length, total };
      },
      { tenantId, isolationLevel: SERIALIZABLE, timeoutMs: 20_000 },
    );
  } catch (e) {
    if (isUniqueViolation(e, "hasta")) throw new VoucherRechazado("dato-invalido", YA_LIQUIDADA);
    // Otra liquidación tomó el mismo voucher en paralelo (Serializable lo frena como conflicto).
    if (isUniqueViolation(e)) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
    sinConflictoCrudo(e);
  }
}

// ── Descartar una liquidación ABIERTA ───────────────────────────────────────

function idsDelRastro(changes: Prisma.JsonValue | null): string[] {
  const c = changes as { vouchers?: unknown } | null;
  return Array.isArray(c?.vouchers) ? c.vouchers.filter((x): x is string => typeof x === "string") : [];
}

export async function descartarLiquidacion(tenantId: string, args: { liquidacionId: string; actor: string }): Promise<{ liberados: number }> {
  return tenantTransaction(
    async (tx) => {
      // Toma la fila (bloqueo) sólo si sigue ABIERTA: una conciliación en paralelo espera y después no la encuentra.
      const tomada = await tx.voucherLiquidacion.updateMany({
        where: { id: args.liquidacionId, tenantId, estado: "ABIERTA" },
        data: { nota: "descartando" },
      });
      if (tomada.count !== 1) {
        const existe = await tx.voucherLiquidacion.findFirst({ where: { id: args.liquidacionId, tenantId }, select: { estado: true } });
        throw new VoucherRechazado("dato-invalido", existe ? "Una liquidación conciliada no se descarta." : NO_EXISTE);
      }
      // Los impagos que esta liquidación había re-tomado vuelven a la suya, como IMPAGO.
      const retomas = await tx.auditLog.findMany({
        where: { tenantId, action: ACCION_RELIQUIDAR, entity: "VoucherLiquidacion", changes: { path: ["hacia"], equals: args.liquidacionId } },
        select: { entityId: true, changes: true },
      });
      for (const r of retomas) {
        const ids = idsDelRastro(r.changes);
        if (!r.entityId || ids.length === 0) continue;
        await tx.voucher.updateMany({
          where: { tenantId, liquidacionSemanalId: args.liquidacionId, id: { in: ids } },
          data: { liquidacionSemanalId: r.entityId, resultadoLiquidacion: "IMPAGO" },
        });
      }
      const { count: liberados } = await tx.voucher.updateMany({
        where: { tenantId, liquidacionSemanalId: args.liquidacionId },
        data: { liquidacionSemanalId: null, resultadoLiquidacion: null },
      });
      await tx.voucherLiquidacion.deleteMany({ where: { id: args.liquidacionId, tenantId, estado: "ABIERTA" } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: args.actor,
          action: "voucher.liquidacion.descartar",
          entity: "VoucherLiquidacion",
          entityId: args.liquidacionId,
          channel: "admin",
          changes: { liberados, devueltosASuLiquidacion: retomas.flatMap((r) => idsDelRastro(r.changes)).length },
        },
      });
      return { liberados };
    },
    { tenantId, isolationLevel: SERIALIZABLE },
  ).catch(sinConflictoCrudo);
}

// ── El pago de la administración en el libro de caja ────────────────────────

/**
 * El INGRESO de caja de un pago de la administración, dentro de la transacción (Serializable) que
 * crea el pago: todo o nada. Mismo patrón que el cobro de un fiado (`aplicarConAsientoInTx`,
 * settlement/collection-repo.ts): `decidirAsiento` traduce el medio (Mercado Pago = la cuenta
 * bancaria del negocio → `MP`; efectivo → `EFECTIVO`) y rechaza si la caja de hoy ya está cerrada;
 * la fila lleva la marca `cuenta-corriente:voucher-pago:<pagoId>` y se engancha al turno abierto.
 * Idempotencia: el pago tiene su clave única (`liq:<id>` o `cuenta:<clave>`) y el ingreso nace en la
 * misma transacción, así que hay a lo sumo uno por pago; la búsqueda por la marca es el cinturón.
 */
async function ingresoDelPagoEnCaja(
  tx: Prisma.TransactionClient,
  tenantId: string,
  p: { pagoId: string; monto: number; medio: MedioPagoAdministracion; detalle: string },
): Promise<string> {
  const ahora = new Date();
  const d = decidirAsiento({
    origen: "RECEIVABLE",
    medio: medioDeCajaDelPago(p.medio),
    monto: p.monto,
    detalle: p.detalle,
    hoy: dateStrInBusinessTz(ahora),
    cerradoHasta: await lastClosedDayTx(tx, tenantId),
  });
  if (!d.ok) throw new VoucherRechazado("dato-invalido", d.error);
  const marca = marcaDelPagoEnCaja(p.pagoId);
  const ya = await tx.cashMovement.findFirst({ where: { tenantId, createdBy: marca }, select: { id: true } });
  if (ya) return ya.id;
  const turno = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
  const mov = await tx.cashMovement.create({
    data: {
      tenantId,
      sessionId: turno?.id ?? null,
      type: d.asiento.type,
      method: d.asiento.method,
      amount: p.monto,
      reason: d.asiento.reason,
      occurredAt: ahora,
      createdBy: marca,
    },
    select: { id: true },
  });
  return mov.id;
}

// ── Conciliar contra el pago de la administración ───────────────────────────

export type ConciliarArgs = {
  liquidacionId: string;
  /** Lo que transfirió la administración (≥ 0). */
  pagado: number;
  /** YYYY-MM-DD del pago. */
  fecha: string;
  medio: MedioPagoAdministracion;
  referencia?: string | null;
  /** Números que la administración NO pagó. */
  rechazados?: readonly string[];
  /**
   * Si el pago no cuadra con lo aceptado, hay que confirmarlo a sabiendas: un monto mal tipeado no
   * puede conciliar en silencio. Sin esto, una diferencia ≠ 0 se rechaza diciendo cuánto es.
   */
  aceptarDiferencia?: boolean;
  actor: string;
};

export type ResultadoConciliacionSemanal = {
  liquidacionId: string;
  total: number;
  aceptado: number;
  pagado: number;
  /** pagado − aceptado. */
  diferencia: number;
  pagados: number;
  impagos: string[];
};

export async function conciliarLiquidacionSemanal(tenantId: string, args: ConciliarArgs): Promise<ResultadoConciliacionSemanal> {
  if (!esDiaReal(args.fecha)) throw new VoucherRechazado("dato-invalido", "La fecha del pago no es válida.");
  if (args.fecha > todayInBusinessTz()) throw new VoucherRechazado("dato-invalido", "La fecha del pago no puede ser futura.");
  const referencia = args.referencia?.trim() || null;
  try {
    return await tenantTransaction(
      async (tx) => {
        const liq = await tx.voucherLiquidacion.findFirst({
          where: { id: args.liquidacionId, tenantId },
          select: { id: true, estado: true, desde: true, hasta: true },
        });
        if (!liq) throw new VoucherRechazado("dato-invalido", NO_EXISTE);
        if (liq.estado !== "ABIERTA") throw new VoucherRechazado("dato-invalido", YA_CONCILIADA);
        const vouchers = await tx.voucher.findMany({
          where: { tenantId, liquidacionSemanalId: liq.id },
          select: { id: true, numero: true, valorCubierto: true, montoLiquidado: true },
        });
        const p = planDeConciliacion({
          // Lo que se reclama de cada uno: lo que falta (un impago saldado en parte a cuenta, el resto).
          vouchers: vouchers.map((x) => ({ id: x.id, numero: x.numero, valorCubierto: pesosDeCentavos(pendienteDe(x)) })),
          pagado: args.pagado,
          rechazados: args.rechazados ?? [],
        });
        if (!p.ok) {
          throw new VoucherRechazado(
            "dato-invalido",
            p.detalle?.length ? `${MENSAJES_CONCILIACION[p.motivo]}: ${p.detalle.join(", ")}.` : MENSAJES_CONCILIACION[p.motivo],
          );
        }
        const { plan } = p;
        const pagado = pesosDeCentavos(plan.pagadoCentavos);
        const diferencia = pesosDeCentavos(plan.diferenciaCentavos);
        if (plan.diferenciaCentavos !== 0 && !args.aceptarDiferencia) {
          throw new VoucherRechazado(
            "dato-invalido",
            `El pago no cuadra con lo aceptado: ${plan.diferenciaCentavos > 0 ? "sobran" : "faltan"} $ ${textoAlCentavo(Math.abs(diferencia)).replace(".", ",")}. Revisá el monto, marcá los vouchers que la administración no pagó, o confirmá que la diferencia queda anotada.`,
          );
        }
        // El árbitro de la doble conciliación: sólo UNA transacción pasa de ABIERTA a CONCILIADA.
        const ahora = new Date();
        const pasada = await tx.voucherLiquidacion.updateMany({
          where: { id: liq.id, tenantId, estado: "ABIERTA" },
          data: {
            estado: "CONCILIADA",
            pagado,
            diferencia,
            pagoFecha: args.fecha,
            pagoMedio: args.medio,
            pagoReferencia: referencia,
            conciliadoPor: args.actor,
            conciliadoEn: ahora,
            nota: null,
          },
        });
        if (pasada.count !== 1) throw new VoucherRechazado("dato-invalido", YA_CONCILIADA);

        const liquidadoEn = businessWallTimeToUtc(args.fecha, "12:00");
        const ref = referencia ?? `Liquidación ${liq.id}`;
        for (const v of plan.pagados) {
          const r = await tx.voucher.updateMany({
            where: { id: v.id, tenantId, liquidacionSemanalId: liq.id, estado: "USADO" },
            // `montoLiquidado` = lo cobrado en ESTA liquidación (lo que se le reclamó: el valor menos lo
            // imputado antes a cuenta, que ya figura como crédito por su pago). El CSV no muestra de más.
            data: { resultadoLiquidacion: "PAGADO", liquidadoEn, montoLiquidado: v.valorCubierto, liquidacionRef: ref },
          });
          if (r.count !== 1) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
        }
        if (plan.impagos.length) {
          const r = await tx.voucher.updateMany({
            where: { tenantId, liquidacionSemanalId: liq.id, id: { in: plan.impagos.map((v) => v.id) } },
            data: { resultadoLiquidacion: "IMPAGO" },
          });
          if (r.count !== plan.impagos.length) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
        }
        if (plan.pagadoCentavos > 0) {
          const pago = await tx.voucherPagoAdministracion.create({
            data: {
              tenantId,
              clave: `liq:${liq.id}`,
              fecha: args.fecha,
              monto: pagado,
              medio: args.medio,
              referencia,
              liquidacionId: liq.id,
              creadoPor: args.actor,
            },
            select: { id: true },
          });
          // El pago entra a la caja (todo lo pagado, sobrante incluido: es plata que entró).
          await ingresoDelPagoEnCaja(tx, tenantId, {
            pagoId: pago.id,
            monto: pagado,
            medio: args.medio,
            detalle: detalleDelIngreso({ liquidacion: liq, referencia, medio: args.medio }),
          });
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: args.actor,
            action: "voucher.liquidacion.conciliar",
            entity: "VoucherLiquidacion",
            entityId: liq.id,
            channel: "admin",
            changes: {
              pagado,
              diferencia,
              fecha: args.fecha,
              medio: args.medio,
              referencia,
              impagos: plan.impagos.map((v) => v.numero),
            },
          },
        });
        return {
          liquidacionId: liq.id,
          total: pesosDeCentavos(plan.totalCentavos),
          aceptado: pesosDeCentavos(plan.aceptadoCentavos),
          pagado,
          diferencia,
          pagados: plan.pagados.length,
          impagos: plan.impagos.map((v) => v.numero),
        };
      },
      { tenantId, isolationLevel: SERIALIZABLE, timeoutMs: 20_000 },
    );
  } catch (e) {
    // La clave `liq:<id>` (o `liquidacionId` único) chocó: otra conciliación ganó.
    if (isUniqueViolation(e)) throw new VoucherRechazado("dato-invalido", YA_CONCILIADA);
    sinConflictoCrudo(e);
  }
}

// ── Baja de un impago (la administración lo desconoce para siempre) ─────────

export type BajaDeImpagoArgs = { numero: string; motivo: string; actor: string };

/**
 * Da de baja un voucher IMPAGO que todavía no volvió a liquidarse. Idempotente: la segunda baja del
 * mismo voucher contesta `duplicado` sin escribir. El árbitro contra una liquidación que lo re-toma
 * a la vez es el `updateMany` condicionado (`liquidadoEn: null`, misma liquidación) + Serializable.
 */
export async function darDeBajaImpago(tenantId: string, args: BajaDeImpagoArgs): Promise<{ voucherId: string; numero: string; duplicado: boolean }> {
  const numero = args.numero.trim();
  const motivo = args.motivo.trim().replace(/\s+/g, " ");
  if (!numero) throw new VoucherRechazado("dato-invalido", "Falta el número del voucher.");
  if (motivo.length < 5) throw new VoucherRechazado("dato-invalido", "Escribí por qué se da de baja (al menos 5 letras): queda en el registro.");
  if (motivo.length > 200) throw new VoucherRechazado("dato-invalido", "El motivo es muy largo (hasta 200 letras).");
  return tenantTransaction(
    async (tx) => {
      const v = await tx.voucher.findFirst({
        where: { tenantId, numero },
        select: {
          id: true,
          numero: true,
          valorCubierto: true,
          montoLiquidado: true,
          resultadoLiquidacion: true,
          liquidadoEn: true,
          liquidacionRef: true,
          liquidacionSemanalId: true,
        },
      });
      if (!v) throw new VoucherRechazado("dato-invalido", "No hay un voucher con ese número.");
      if (v.resultadoLiquidacion === "PAGADO" && v.liquidacionRef?.startsWith(PREFIJO_A_CUENTA)) {
        throw new VoucherRechazado("dato-invalido", "Ese voucher ya se saldó con un pago a cuenta: no hay nada que dar de baja.");
      }
      if (v.resultadoLiquidacion === "IMPAGO" && v.liquidadoEn && v.liquidacionRef?.startsWith(PREFIJO_BAJA)) {
        return { voucherId: v.id, numero: v.numero, duplicado: true };
      }
      if (v.resultadoLiquidacion !== "IMPAGO" || v.liquidadoEn || !v.liquidacionSemanalId) {
        throw new VoucherRechazado(
          "dato-invalido",
          "Sólo se da de baja un voucher que la administración rechazó al conciliar y que todavía no volvió a liquidarse.",
        );
      }
      const r = await tx.voucher.updateMany({
        // `montoLiquidado` queda con lo imputado a cuenta: la baja compensa sólo lo que falta.
        where: { ...impagoPendiente(tenantId), id: v.id, liquidacionSemanalId: v.liquidacionSemanalId, montoLiquidado: v.montoLiquidado },
        data: { liquidadoEn: new Date(), liquidacionRef: `${PREFIJO_BAJA}${motivo}` },
      });
      if (r.count !== 1) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: args.actor,
          action: "voucher.liquidacion.baja-impago",
          entity: "Voucher",
          entityId: v.id,
          channel: "admin",
          changes: {
            numero: v.numero,
            motivo,
            liquidacionId: v.liquidacionSemanalId,
            valor: v.valorCubierto ? v.valorCubierto.toNumber() : 0,
            imputadoACuenta: pesosDeCentavos(centavosDeDecimal(v.montoLiquidado)),
            compensa: pesosDeCentavos(pendienteDe(v)),
          },
        },
      });
      return { voucherId: v.id, numero: v.numero, duplicado: false };
    },
    { tenantId, isolationLevel: SERIALIZABLE },
  ).catch(sinConflictoCrudo);
}

// ── Pago a cuenta (pre-pago o saldo de una diferencia) ──────────────────────

/**
 * Impagos que una liquidación ABIERTA re-tomó (sin baja ni saldo), con la liquidación de la que
 * vinieron (el rastro de la re-toma). Uno nuevo de la semana no es impago: no entra.
 */
async function impagosEnLiquidacionAbierta(tx: Prisma.TransactionClient, tenantId: string) {
  const abiertas = await tx.voucherLiquidacion.findMany({ where: { tenantId, estado: "ABIERTA" }, select: { id: true } });
  const out: {
    id: string;
    numero: string;
    valorCubierto: Prisma.Decimal | null;
    montoLiquidado: Prisma.Decimal | null;
    usadoEn: Date | null;
    abierta: { liquidacionId: string; origen: string };
  }[] = [];
  for (const l of abiertas) {
    const retomas = await tx.auditLog.findMany({
      where: { tenantId, action: ACCION_RELIQUIDAR, entity: "VoucherLiquidacion", changes: { path: ["hacia"], equals: l.id } },
      select: { entityId: true, changes: true },
    });
    const origen = new Map<string, string>();
    for (const r of retomas) if (r.entityId) for (const id of idsDelRastro(r.changes)) origen.set(id, r.entityId);
    if (origen.size === 0) continue;
    const vs = await tx.voucher.findMany({
      where: { tenantId, estado: "USADO", liquidadoEn: null, liquidacionSemanalId: l.id, id: { in: [...origen.keys()] } },
      select: { id: true, numero: true, valorCubierto: true, montoLiquidado: true, usadoEn: true },
    });
    for (const v of vs) out.push({ ...v, abierta: { liquidacionId: l.id, origen: origen.get(v.id) as string } });
  }
  return out;
}


export type PagoACuentaArgs = {
  /** Idempotencia: la del formulario (un uuid por apertura). */
  clave: string;
  monto: number;
  fecha: string;
  medio: MedioPagoAdministracion;
  referencia?: string | null;
  nota?: string | null;
  /**
   * Los impagos que salda este pago, en orden. Vacío o ausente: FIFO por fecha de uso entre los
   * impagos pendientes. Lo que sobra queda a favor de la administración, sin imputar.
   */
  numeros?: readonly string[];
  actor: string;
};

export type PagoACuentaRegistrado = {
  pagoId: string;
  duplicado: boolean;
  /** Vouchers a los que se imputó (vacío si es duplicado). */
  imputados: { numero: string; monto: number; saldado: boolean }[];
  /** Lo que quedó sin imputar, a favor de la administración. */
  sinImputar: number;
};

export async function registrarPagoACuenta(tenantId: string, args: PagoACuentaArgs): Promise<PagoACuentaRegistrado> {
  const clave = args.clave.trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(clave)) throw new VoucherRechazado("dato-invalido", "Falta la clave del formulario. Recargá la pantalla.");
  if (!esDiaReal(args.fecha)) throw new VoucherRechazado("dato-invalido", "La fecha del pago no es válida.");
  if (args.fecha > todayInBusinessTz()) throw new VoucherRechazado("dato-invalido", "La fecha del pago no puede ser futura.");
  const p = planDeConciliacion({ vouchers: [], pagado: args.monto, rechazados: [] });
  if (!p.ok || p.plan.pagadoCentavos <= 0) throw new VoucherRechazado("dato-invalido", "El monto del pago tiene que ser mayor a cero.");
  const monto = pesosDeCentavos(p.plan.pagadoCentavos);
  const claveDb = `cuenta:${clave}`;
  try {
    return await tenantTransaction(
      async (tx) => {
        const ya = await tx.voucherPagoAdministracion.findFirst({ where: { tenantId, clave: claveDb }, select: { id: true } });
        if (ya) return { pagoId: ya.id, duplicado: true, imputados: [], sinImputar: 0 };
        const pago = await tx.voucherPagoAdministracion.create({
          data: {
            tenantId,
            clave: claveDb,
            fecha: args.fecha,
            monto,
            medio: args.medio,
            referencia: args.referencia?.trim() || null,
            nota: args.nota?.trim() || null,
            creadoPor: args.actor,
          },
          select: { id: true },
        });
        // El pago entra a la caja entero (lo que sobra queda a favor de la administración, sin imputar).
        await ingresoDelPagoEnCaja(tx, tenantId, {
          pagoId: pago.id,
          monto,
          medio: args.medio,
          detalle: detalleDelIngreso({ referencia: args.referencia ?? null, medio: args.medio }),
        });
        // Imputación: los impagos pendientes (rechazados en una liquidación conciliada, sin baja).
        const conciliados = await tx.voucher.findMany({
          where: { ...impagoPendiente(tenantId), liquidacionSemanal: { estado: "CONCILIADA" } },
          select: { id: true, numero: true, valorCubierto: true, montoLiquidado: true, usadoEn: true },
        });
        // FIFO: también los impagos que una liquidación ABIERTA re-tomó. Esa liquidación descuenta lo
        // imputado (reclama valor − imputado); si lo salda entero, sale de ella. Por número no: se
        // imputa sólo a impagos que no estén en una liquidación abierta.
        const porNumero = (args.numeros ?? []).some((x) => x.replace(/\s+/g, "").length > 0);
        const enAbierta = porNumero ? [] : await impagosEnLiquidacionAbierta(tx, tenantId);
        const pendientes: ((typeof conciliados)[number] & { abierta?: { liquidacionId: string; origen: string } })[] = [
          ...conciliados,
          ...enAbierta,
        ].sort((a, b) => (a.usadoEn?.getTime() ?? Infinity) - (b.usadoEn?.getTime() ?? Infinity) || a.numero.localeCompare(b.numero));
        const plan = planDeImputacion({
          pendientes: pendientes.map((v) => ({
            id: v.id,
            numero: v.numero,
            valorCentavos: centavosDeDecimal(v.valorCubierto),
            imputadoCentavos: centavosDeDecimal(v.montoLiquidado),
          })),
          montoCentavos: p.plan.pagadoCentavos,
          numeros: args.numeros,
        });
        if (!plan.ok) {
          throw new VoucherRechazado(
            "dato-invalido",
            `Estos vouchers no están impagos (o ya se dieron de baja o están en una liquidación abierta): ${plan.ajenos.join(", ")}.`,
          );
        }
        const porId = new Map(pendientes.map((v) => [v.id, v]));
        const liquidadoEn = businessWallTimeToUtc(args.fecha, "12:00");
        const ref = `${PREFIJO_A_CUENTA}${args.referencia?.trim() ? ` · ${args.referencia.trim()}` : ""} (${pago.id})`;
        const descontado = new Map<string, { centavos: number; descuentos: Record<string, number>; saldados: string[]; numeros: string[] }>();
        for (const imp of plan.imputaciones) {
          const v = porId.get(imp.id)!;
          const imputado = pesosDeCentavos(centavosDeDecimal(v.montoLiquidado) + imp.centavos);
          const saldado = { resultadoLiquidacion: "PAGADO", liquidadoEn, montoLiquidado: imputado, liquidacionRef: ref } as const;
          // Condicionado a lo que se leyó (sigue pendiente, mismo imputado): otro pago, una baja o una
          // re-liquidación a la vez lo cambian y este pago se rechaza entero (Serializable además).
          const r = v.abierta
            ? await tx.voucher.updateMany({
                where: { tenantId, id: v.id, estado: "USADO", liquidadoEn: null, liquidacionSemanalId: v.abierta.liquidacionId, montoLiquidado: v.montoLiquidado },
                // Saldado entero: vuelve a la liquidación que lo rechazó, como cualquier impago saldado a cuenta.
                data: imp.completo ? { ...saldado, liquidacionSemanalId: v.abierta.origen } : { montoLiquidado: imputado },
              })
            : await tx.voucher.updateMany({
                where: { ...impagoPendiente(tenantId), id: v.id, montoLiquidado: v.montoLiquidado },
                data: imp.completo ? saldado : { montoLiquidado: imputado },
              });
          if (r.count !== 1) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
          if (v.abierta) {
            const d = descontado.get(v.abierta.liquidacionId) ?? { centavos: 0, descuentos: {}, saldados: [], numeros: [] };
            d.centavos += imp.centavos;
            d.descuentos[v.id] = imp.centavos;
            d.numeros.push(v.numero);
            if (imp.completo) d.saldados.push(v.id);
            descontado.set(v.abierta.liquidacionId, d);
          }
        }
        // La liquidación abierta reclama lo que falta. El `updateMany` condicionado a ABIERTA es el
        // árbitro contra una conciliación o un descarte a la vez (los dos toman esa misma fila).
        for (const [liquidacionId, d] of descontado) {
          const r = await tx.voucherLiquidacion.updateMany({
            where: { id: liquidacionId, tenantId, estado: "ABIERTA" },
            data: { total: { decrement: pesosDeCentavos(d.centavos) }, cantidad: { decrement: d.saldados.length } },
          });
          if (r.count !== 1) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
          await tx.auditLog.create({
            data: {
              tenantId,
              actor: args.actor,
              action: ACCION_DESCUENTO_A_CUENTA,
              entity: "VoucherLiquidacion",
              entityId: liquidacionId,
              channel: "admin",
              changes: { pago: pago.id, descontado: pesosDeCentavos(d.centavos), descuentos: d.descuentos, saldados: d.saldados, numeros: d.numeros },
            },
          });
        }
        const imputados = plan.imputaciones.map((i) => ({ numero: i.numero, monto: pesosDeCentavos(i.centavos), saldado: i.completo }));
        const sinImputar = pesosDeCentavos(plan.restoCentavos);
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: args.actor,
            action: "voucher.cuenta.pago",
            entity: "VoucherPagoAdministracion",
            entityId: pago.id,
            channel: "admin",
            changes: { monto, fecha: args.fecha, medio: args.medio, imputados, sinImputar },
          },
        });
        return { pagoId: pago.id, duplicado: false, imputados, sinImputar };
      },
      { tenantId, isolationLevel: SERIALIZABLE },
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      const ya = await tenantTransaction((tx) => tx.voucherPagoAdministracion.findFirst({ where: { tenantId, clave: claveDb }, select: { id: true } }), {
        tenantId,
      });
      if (ya) return { pagoId: ya.id, duplicado: true, imputados: [], sinImputar: 0 };
    }
    sinConflictoCrudo(e);
  }
}

// ── Acreditación en Mercado Pago ────────────────────────────────────────────

/** Los movimientos de MP enganchados a algún pago (para no engancharlos dos veces) y la acreditación de cada pago. */
async function acreditacionesDelNegocio(tx: Prisma.TransactionClient, tenantId: string) {
  const filas = await tx.auditLog.findMany({
    where: { tenantId, action: ACCION_ACREDITADO_MP, entity: "VoucherPagoAdministracion" },
    select: { entityId: true, changes: true, createdAt: true },
  });
  const porPago = new Map<string, { via: "mp" | "manual"; movimientoId: string | null; dia: string }>();
  const usados = new Map<string, string>(); // movimientoId → pagoId
  for (const f of filas) {
    if (!f.entityId) continue;
    const a = leerAcreditacion(f.changes);
    porPago.set(f.entityId, { via: a.via, movimientoId: a.movimientoId, dia: dateStrInBusinessTz(f.createdAt) });
    if (a.movimientoId) usados.set(a.movimientoId, f.entityId);
  }
  return { porPago, usados };
}

/** Los movimientos acreditados de Mercado Pago (pipeline del extracto) por ese monto y en la ventana del pago. */
async function movimientosMpDelPago(tx: Prisma.TransactionClient, tenantId: string, pago: { fecha: string; monto: Prisma.Decimal }): Promise<MovimientoMp[]> {
  const v = ventanaDeAcreditacion(pago.fecha);
  if (!v) return [];
  const filas = await tx.movimientoImportado.findMany({
    where: { tenantId, monto: pago.monto, fecha: { gte: v.desde, lte: v.hasta }, importacion: { origen: "mercadopago" } },
    select: { id: true, fecha: true, monto: true, descripcion: true, referencia: true, contraparte: true },
    take: 50,
  });
  return filas.map((m) => ({
    id: m.id,
    fecha: m.fecha,
    montoCentavos: centavosDeDecimal(m.monto),
    descripcion: m.descripcion,
    referencia: m.referencia,
    contraparte: m.contraparte,
  }));
}

export type ConfirmarAcreditacionArgs = {
  pagoId: string;
  /** El movimiento de MP que eligió la persona (opcional: sin él, se engancha el único posible). */
  movimientoId?: string | null;
  actor: string;
};

export type AcreditacionConfirmada = {
  pagoId: string;
  duplicado: boolean;
  via: "mp" | "manual";
  movimientoId: string | null;
};

/**
 * Confirma que la plata de un pago de la administración entró en Mercado Pago: la conciliación del
 * pago pasa de «pendiente de acreditación» a «acreditado». Engancha el movimiento de MP del extracto
 * por monto + fecha + referencia; si no hay uno solo, queda confirmado a mano por quien lo vio.
 *
 * Invariantes: el pago existe, no es en efectivo y TIENE su ingreso de caja por el mismo monto en la
 * columna Mercado Pago (no se acredita plata que la caja no registró). Idempotente: confirmar dos
 * veces contesta `duplicado`. Serializable: dos confirmaciones a la vez (o dos pagos que pelean por
 * el mismo movimiento de MP) no dejan dos rastros ni un movimiento enganchado a dos pagos.
 */
export async function confirmarAcreditacionMp(tenantId: string, args: ConfirmarAcreditacionArgs): Promise<AcreditacionConfirmada> {
  const pagoId = args.pagoId.trim();
  if (!pagoId) throw new VoucherRechazado("dato-invalido", "Falta identificar el pago.");
  return tenantTransaction(
    async (tx) => {
      const pago = await tx.voucherPagoAdministracion.findFirst({
        where: { id: pagoId, tenantId },
        select: { id: true, fecha: true, monto: true, medio: true, referencia: true, liquidacionId: true },
      });
      if (!pago) throw new VoucherRechazado("dato-invalido", "Ese pago no existe. Recargá la pantalla.");
      if (!esperaAcreditacion(pago.medio)) {
        throw new VoucherRechazado("dato-invalido", "Ese pago fue en efectivo: entró al cajón y no hay acreditación que confirmar.");
      }
      const { porPago, usados } = await acreditacionesDelNegocio(tx, tenantId);
      const ya = porPago.get(pago.id);
      if (ya) return { pagoId: pago.id, duplicado: true, via: ya.via, movimientoId: ya.movimientoId };
      const ingreso = await tx.cashMovement.findFirst({
        where: { tenantId, createdBy: marcaDelPagoEnCaja(pago.id) },
        select: { id: true, amount: true, method: true, type: true },
      });
      const montoCentavos = centavosDeDecimal(pago.monto);
      if (!ingreso || ingreso.type !== "INGRESO" || ingreso.method !== "MP" || sumaCentavos([ingreso.amount]) !== montoCentavos) {
        throw new VoucherRechazado(
          "dato-invalido",
          "Ese pago no tiene su ingreso en la caja por Mercado Pago, así que no se puede acreditar. Avisá: hay que revisarlo antes de conciliar.",
        );
      }
      const candidatos = candidatosDeAcreditacion(
        { fecha: pago.fecha, montoCentavos, referencia: pago.referencia },
        await movimientosMpDelPago(tx, tenantId, pago),
        new Set(usados.keys()),
      );
      const e = eleccionDeAcreditacion(candidatos, args.movimientoId);
      if (!e.ok) throw new VoucherRechazado("dato-invalido", e.error);
      const movimientoId = e.via === "mp" ? e.movimientoId : null;
      await tx.auditLog.create({
        data: {
          tenantId,
          actor: args.actor,
          action: ACCION_ACREDITADO_MP,
          entity: "VoucherPagoAdministracion",
          entityId: pago.id,
          channel: "admin",
          changes: {
            pagoId: pago.id,
            via: e.via,
            movimientoId,
            motivo: e.via === "manual" ? e.motivo : null,
            monto: pesosDeCentavos(montoCentavos),
            fecha: pago.fecha,
            liquidacionId: pago.liquidacionId,
            cashMovementId: ingreso.id,
          },
        },
      });
      return { pagoId: pago.id, duplicado: false, via: e.via, movimientoId };
    },
    { tenantId, isolationLevel: SERIALIZABLE },
  ).catch(sinConflictoCrudo);
}

/** Estado de acreditación de cada pago (para las pantallas). Los pendientes traen su candidato de MP, si hay uno. */
async function estadosDeAcreditacion(
  tx: Prisma.TransactionClient,
  tenantId: string,
  pagos: readonly { id: string; fecha: string; monto: Prisma.Decimal; medio: string; referencia: string | null }[],
): Promise<Map<string, EstadoAcreditacion>> {
  const out = new Map<string, EstadoAcreditacion>();
  if (pagos.length === 0) return out;
  const { porPago, usados } = await acreditacionesDelNegocio(tx, tenantId);
  for (const p of pagos) {
    if (!esperaAcreditacion(p.medio)) {
      out.set(p.id, { estado: "no-aplica" });
      continue;
    }
    const a = porPago.get(p.id);
    if (a) {
      out.set(p.id, { estado: "acreditado", ...a });
      continue;
    }
    const candidatos = candidatosDeAcreditacion(
      { fecha: p.fecha, montoCentavos: centavosDeDecimal(p.monto), referencia: p.referencia },
      await movimientosMpDelPago(tx, tenantId, p),
      new Set(usados.keys()),
    );
    out.set(p.id, { estado: "pendiente", candidatos: candidatos.length, candidato: candidatos.length === 1 ? candidatos[0] : null });
  }
  return out;
}

// ── Lecturas ────────────────────────────────────────────────────────────────

export type FilaLiquidacion = {
  id: string;
  desde: string;
  hasta: string;
  estado: "ABIERTA" | "CONCILIADA";
  cantidad: number;
  total: number;
  pagado: number | null;
  diferencia: number | null;
  pagoFecha: string | null;
};

export type CuentaDeLaAdministracion = {
  resumen: ResumenDeCuenta;
  /** Los últimos movimientos, el más nuevo primero, con el saldo que dejó cada uno. */
  movimientos: MovimientoConSaldo[];
  liquidaciones: FilaLiquidacion[];
  /** Vouchers usados que todavía no entraron en ninguna liquidación. */
  sinLiquidar: { cantidad: number; total: number };
  /** Vouchers que la administración rechazó al conciliar y siguen debiendo: entran en la próxima liquidación. */
  impagos: { cantidad: number; total: number };
  /** Impagos dados de baja (la administración los desconoce): su crédito compensa el débito. */
  bajas: { cantidad: number; total: number };
  /** Pagos que entraron a la caja por Mercado Pago y esperan que se confirme la acreditación (el más viejo primero). */
  pendientesDeAcreditacion: PagoConAcreditacion[];
};

export type PagoConAcreditacion = {
  id: string;
  fecha: string;
  monto: number;
  medio: string;
  referencia: string | null;
  liquidacionId: string | null;
  concepto: string;
  acreditacion: EstadoAcreditacion;
};

const TOPE_MOVIMIENTOS = 200;

function aFila(l: {
  id: string;
  desde: string;
  hasta: string;
  estado: string;
  cantidad: number;
  total: Prisma.Decimal;
  pagado: Prisma.Decimal | null;
  diferencia: Prisma.Decimal | null;
  pagoFecha: string | null;
}): FilaLiquidacion {
  return {
    id: l.id,
    desde: l.desde,
    hasta: l.hasta,
    estado: l.estado === "CONCILIADA" ? "CONCILIADA" : "ABIERTA",
    cantidad: l.cantidad,
    total: l.total.toNumber(),
    pagado: l.pagado ? l.pagado.toNumber() : null,
    diferencia: l.diferencia ? l.diferencia.toNumber() : null,
    pagoFecha: l.pagoFecha,
  };
}

export async function leerCuentaDeLaAdministracion(tenantId: string): Promise<CuentaDeLaAdministracion> {
  return tenantTransaction(
    async (tx) => {
      const [usados, pagos, liquidaciones] = await Promise.all([
        tx.voucher.findMany({
          // Débito = voucher USADO con su cobro vivo (o ya tomado por una liquidación): el mismo
          // universo que la liquidación puede tomar, para que saldo y liquidaciones cuadren.
          // Los que marcó la importación vieja de OpenKey (`liquidadoEn` sin liquidación semanal) ya
          // se cobraron por fuera de esta cuenta: no son débito.
          where: {
            tenantId,
            estado: "USADO",
            OR: [{ liquidacionSemanalId: { not: null } }, { collectionId: { not: null }, liquidadoEn: null }],
          },
          select: {
            id: true,
            numero: true,
            valorCubierto: true,
            usadoEn: true,
            liquidacionSemanalId: true,
            resultadoLiquidacion: true,
            liquidadoEn: true,
            liquidacionRef: true,
            montoLiquidado: true,
            client: { select: { name: true } },
          },
        }),
        tx.voucherPagoAdministracion.findMany({
          where: { tenantId },
          select: { id: true, fecha: true, monto: true, medio: true, referencia: true, liquidacionId: true },
        }),
        tx.voucherLiquidacion.findMany({ where: { tenantId }, orderBy: { hasta: "desc" }, take: 60 }),
      ]);
      const liqPorId = new Map(liquidaciones.map((l) => [l.id, l]));
      const esBaja = (v: (typeof usados)[number]) =>
        v.resultadoLiquidacion === "IMPAGO" && v.liquidadoEn != null && (v.liquidacionRef?.startsWith(PREFIJO_BAJA) ?? false);
      const bajas = usados.filter(esBaja);
      const movs: MovimientoDeCuenta[] = [
        ...usados.map((v) => ({
          fecha: v.usadoEn ? dateStrInBusinessTz(v.usadoEn) : "0000-00-00",
          tipo: "DEBITO" as const,
          concepto: `Voucher ${v.numero} · ${v.client.name}`,
          centavos: sumaCentavos([v.valorCubierto ? v.valorCubierto.toNumber() : 0]),
          ref: `v:${v.id}`,
        })),
        ...bajas.map((v) => ({
          fecha: dateStrInBusinessTz(v.liquidadoEn as Date),
          tipo: "CREDITO" as const,
          concepto: `Baja del voucher ${v.numero} · ${(v.liquidacionRef ?? "").slice(PREFIJO_BAJA.length)}`,
          // Sólo lo no imputado: lo que se pagó a cuenta de este voucher ya es crédito por el pago.
          centavos: pendienteDe(v),
          ref: `b:${v.id}`,
        })),
        ...pagos.map((p) => {
          const l = p.liquidacionId ? liqPorId.get(p.liquidacionId) : null;
          return {
            fecha: p.fecha,
            tipo: "CREDITO" as const,
            concepto: l ? `Pago de la liquidación del ${fechaArgentina(l.desde)} al ${fechaArgentina(l.hasta)}` : `Pago a cuenta${p.referencia ? ` · ${p.referencia}` : ""}`,
            centavos: sumaCentavos([p.monto.toNumber()]),
            ref: `p:${p.id}`,
          };
        }),
      ];
      const { movimientos, resumen } = cuentaCorriente(movs);
      const estados = await estadosDeAcreditacion(tx, tenantId, pagos);
      const conceptoDe = new Map(movs.filter((m) => m.ref.startsWith("p:")).map((m) => [m.ref.slice(2), m.concepto]));
      const pendientesDeAcreditacion: PagoConAcreditacion[] = pagos
        .filter((p) => estados.get(p.id)?.estado === "pendiente")
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
        .map((p) => ({
          id: p.id,
          fecha: p.fecha,
          monto: p.monto.toNumber(),
          medio: p.medio,
          referencia: p.referencia,
          liquidacionId: p.liquidacionId,
          concepto: conceptoDe.get(p.id) ?? "Pago de la administración",
          acreditacion: estados.get(p.id) as EstadoAcreditacion,
        }));
      const sinLiq = usados.filter((v) => !v.liquidacionSemanalId);
      const imp = usados.filter((v) => v.resultadoLiquidacion === "IMPAGO" && v.liquidadoEn == null);
      const total = (xs: typeof usados) => pesosDeCentavos(sumaCentavos(xs.map((v) => (v.valorCubierto ? v.valorCubierto.toNumber() : 0))));
      const debe = (xs: typeof usados) => pesosDeCentavos(xs.reduce((acc, v) => acc + pendienteDe(v), 0));
      return {
        resumen,
        movimientos: movimientos.slice(-TOPE_MOVIMIENTOS).reverse(),
        liquidaciones: liquidaciones.map(aFila),
        sinLiquidar: { cantidad: sinLiq.length, total: total(sinLiq) },
        impagos: { cantidad: imp.length, total: debe(imp) },
        bajas: { cantidad: bajas.length, total: debe(bajas) },
        pendientesDeAcreditacion,
      };
    },
    { tenantId },
  );
}

export type DetalleDeLiquidacion = FilaLiquidacion & {
  negocio: string;
  pagoMedio: string | null;
  pagoReferencia: string | null;
  conciliadoEn: string | null;
  /** El pago de esta liquidación (si pagó algo) y si ya se acreditó en Mercado Pago. */
  pago: { id: string; monto: number; medio: string; acreditacion: EstadoAcreditacion } | null;
  /** `baja`: «pendiente» = impago que se puede dar de baja; «dada» = ya dado de baja (`estadoDeBaja`). */
  renglones: (RenglonDelReporte & { id: string; baja: "pendiente" | "dada" | null })[];
};

export async function leerLiquidacion(tenantId: string, liquidacionId: string): Promise<DetalleDeLiquidacion | null> {
  return tenantTransaction(
    async (tx) => {
      const l = await tx.voucherLiquidacion.findFirst({ where: { id: liquidacionId, tenantId } });
      if (!l) return null;
      const negocio = await tx.tenant.findFirst({ where: { id: tenantId }, select: { name: true } });
      const pagoDeLaLiq = await tx.voucherPagoAdministracion.findFirst({
        where: { tenantId, liquidacionId: l.id },
        select: { id: true, fecha: true, monto: true, medio: true, referencia: true },
      });
      const acreditacion = pagoDeLaLiq ? (await estadosDeAcreditacion(tx, tenantId, [pagoDeLaLiq])).get(pagoDeLaLiq.id) : undefined;
      // Los impagos de esta liquidación que después pasaron a otra siguen en su reporte, como IMPAGO.
      const rastro = await tx.auditLog.findMany({
        where: { tenantId, action: ACCION_RELIQUIDAR, entity: "VoucherLiquidacion", entityId: l.id },
        select: { changes: true },
      });
      const idsIdos = [...new Set(rastro.flatMap((r) => idsDelRastro(r.changes)))];
      // Lo que ya estaba imputado a cuenta de cada re-liquidado cuando se generó: no se le reclamó.
      const generada = await tx.auditLog.findFirst({
        where: { tenantId, action: "voucher.liquidacion.generar", entity: "VoucherLiquidacion", entityId: l.id },
        select: { changes: true },
      });
      const descuentos = ((generada?.changes as { descuentos?: Record<string, unknown> } | null)?.descuentos ?? {}) as Record<string, unknown>;
      // Y lo que un pago a cuenta imputó mientras estaba ABIERTA: tampoco se le reclamó.
      const aCuenta = await tx.auditLog.findMany({
        where: { tenantId, action: ACCION_DESCUENTO_A_CUENTA, entity: "VoucherLiquidacion", entityId: l.id },
        select: { changes: true },
      });
      const masDescuentos = aCuenta.map((r) => ((r.changes as { descuentos?: Record<string, unknown> } | null)?.descuentos ?? {}) as Record<string, unknown>);
      const centavosEn = (d: Record<string, unknown>, id: string): number => (typeof d[id] === "number" ? (d[id] as number) : 0);
      const descuentoDe = (id: string): number => [descuentos, ...masDescuentos].reduce((acc, d) => acc + centavosEn(d, id), 0);
      const vouchers = await tx.voucher.findMany({
        where: { tenantId, OR: [{ liquidacionSemanalId: l.id }, ...(idsIdos.length ? [{ id: { in: idsIdos } }] : [])] },
        orderBy: [{ usadoEn: "asc" }, { numero: "asc" }],
        select: {
          id: true,
          numero: true,
          valorCubierto: true,
          usadoEn: true,
          resultadoLiquidacion: true,
          liquidacionSemanalId: true,
          estado: true,
          liquidadoEn: true,
          liquidacionRef: true,
          client: { select: { name: true } },
          appointment: { select: { service: { select: { name: true } } } },
        },
      });
      return {
        ...aFila(l),
        negocio: negocio?.name ?? "",
        pagoMedio: l.pagoMedio,
        pagoReferencia: l.pagoReferencia,
        conciliadoEn: l.conciliadoEn ? dateStrInBusinessTz(l.conciliadoEn) : null,
        pago:
          pagoDeLaLiq && acreditacion
            ? { id: pagoDeLaLiq.id, monto: pagoDeLaLiq.monto.toNumber(), medio: pagoDeLaLiq.medio, acreditacion }
            : null,
        renglones: vouchers.map((v) => ({
          id: v.id,
          numero: v.numero,
          vecino: v.client.name,
          fecha: v.usadoEn ? dateStrInBusinessTz(v.usadoEn) : null,
          servicio: v.appointment?.service.name ?? null,
          valor: pesosDeCentavos(Math.max(0, centavosDeDecimal(v.valorCubierto) - descuentoDe(v.id))),
          resultado:
            v.liquidacionSemanalId !== l.id
              ? "IMPAGO"
              : v.resultadoLiquidacion === "PAGADO" || v.resultadoLiquidacion === "IMPAGO"
                ? v.resultadoLiquidacion
                : null,
          baja: l.estado === "CONCILIADA" ? estadoDeBaja(v) : null,
        })),
      };
    },
    { tenantId },
  );
}
