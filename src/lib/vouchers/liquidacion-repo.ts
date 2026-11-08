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
import { businessWallTimeToUtc, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { textoAlCentavo } from "@/lib/dinero/redondeo";
import { VoucherRechazado } from "./voucher-repo";
import { PREFIJO_BAJA_IMPAGO } from "./voucher-core";
import {
  cuentaCorriente,
  esDiaReal,
  planDeImputacion,
  MENSAJES_CONCILIACION,
  MENSAJES_SEMANA,
  pesosDeCentavos,
  planDeConciliacion,
  sumarDias,
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
const NO_EXISTE = "Esa liquidación ya no existe. Recargá la pantalla.";
const YA_CONCILIADA = "Esa liquidación ya se concilió: no se concilia dos veces. Si falta plata, anotá un pago a cuenta.";

/** Rastro en el AuditLog de la liquidación vieja cuando sus impagos pasan a otra. */
const ACCION_RELIQUIDAR = "voucher.liquidacion.reliquidar-impagos";
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
    throw e;
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
  );
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
        const liq = await tx.voucherLiquidacion.findFirst({ where: { id: args.liquidacionId, tenantId }, select: { id: true, estado: true } });
        if (!liq) throw new VoucherRechazado("dato-invalido", NO_EXISTE);
        if (liq.estado !== "ABIERTA") throw new VoucherRechazado("dato-invalido", YA_CONCILIADA);
        const vouchers = await tx.voucher.findMany({
          where: { tenantId, liquidacionSemanalId: liq.id },
          select: { id: true, numero: true, valorCubierto: true, montoLiquidado: true },
        });
        const valorEntero = new Map(vouchers.map((x) => [x.id, x.valorCubierto ? x.valorCubierto.toNumber() : 0]));
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
            // `montoLiquidado` = lo cobrado del voucher en total (lo imputado a cuenta + esta liquidación).
            data: { resultadoLiquidacion: "PAGADO", liquidadoEn, montoLiquidado: valorEntero.get(v.id) ?? v.valorCubierto, liquidacionRef: ref },
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
          await tx.voucherPagoAdministracion.create({
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
    throw e;
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
  );
}

// ── Pago a cuenta (pre-pago o saldo de una diferencia) ──────────────────────

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
        // Imputación: los impagos pendientes (rechazados en una liquidación conciliada, sin baja).
        const pendientes = await tx.voucher.findMany({
          where: { ...impagoPendiente(tenantId), liquidacionSemanal: { estado: "CONCILIADA" } },
          orderBy: [{ usadoEn: "asc" }, { numero: "asc" }],
          select: { id: true, numero: true, valorCubierto: true, montoLiquidado: true },
        });
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
        for (const imp of plan.imputaciones) {
          const v = porId.get(imp.id)!;
          const imputado = pesosDeCentavos(centavosDeDecimal(v.montoLiquidado) + imp.centavos);
          // Condicionado a lo que se leyó (sigue pendiente, mismo imputado): otro pago, una baja o una
          // re-liquidación a la vez lo cambian y este pago se rechaza entero (Serializable además).
          const r = await tx.voucher.updateMany({
            where: { ...impagoPendiente(tenantId), id: v.id, montoLiquidado: v.montoLiquidado },
            data: imp.completo
              ? { resultadoLiquidacion: "PAGADO", liquidadoEn, montoLiquidado: imputado, liquidacionRef: ref }
              : { montoLiquidado: imputado },
          });
          if (r.count !== 1) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
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
    throw e;
  }
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
            concepto: l ? `Pago de la liquidación del ${l.desde} al ${l.hasta}` : `Pago a cuenta${p.referencia ? ` · ${p.referencia}` : ""}`,
            centavos: sumaCentavos([p.monto.toNumber()]),
            ref: `p:${p.id}`,
          };
        }),
      ];
      const { movimientos, resumen } = cuentaCorriente(movs);
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
  renglones: (RenglonDelReporte & { id: string })[];
};

export async function leerLiquidacion(tenantId: string, liquidacionId: string): Promise<DetalleDeLiquidacion | null> {
  return tenantTransaction(
    async (tx) => {
      const l = await tx.voucherLiquidacion.findFirst({ where: { id: liquidacionId, tenantId } });
      if (!l) return null;
      const negocio = await tx.tenant.findFirst({ where: { id: tenantId }, select: { name: true } });
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
      const descuentoDe = (id: string): number => (typeof descuentos[id] === "number" ? (descuentos[id] as number) : 0);
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
        })),
      };
    },
    { tenantId },
  );
}
