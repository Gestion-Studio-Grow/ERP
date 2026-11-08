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
//   CONCILIAR (Serializable): pasa la liquidación de ABIERTA a CONCILIADA con
//     `updateMany where {estado:'ABIERTA'}` y `count === 1` (la segunda conciliación no pasa),
//     anota el pago como crédito de la cuenta (clave `liq:<id>`, única) y marca cada voucher
//     PAGADO (con `liquidadoEn`, `montoLiquidado`, `liquidacionRef`) o IMPAGO.
//   DESCARTAR una ABIERTA (mal generada): libera sus vouchers y la borra. Una conciliada no.
//   PAGO A CUENTA: crédito suelto (pre-pago, o lo que la administración pague después de una
//     diferencia), idempotente por la clave del formulario.
//
// Un voucher tomado por una liquidación no se puede anular desde el turno (turnos/anulacion.ts
// exige `liquidacionSemanalId: null`; la base lo refuerza con un CHECK). Nada de esto toca el libro
// de caja ni el cajón: el voucher es plata a cobrar a la administración del country.
// Todo lleva `tenantId` explícito además de RLS (MT-1).

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { businessWallTimeToUtc, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { VoucherRechazado } from "./voucher-repo";
import {
  cuentaCorriente,
  esDiaReal,
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
        const vouchers = await tx.voucher.findMany({ where: elegibles, select: { id: true, valorCubierto: true } });
        if (vouchers.length === 0) {
          throw new VoucherRechazado(
            "dato-invalido",
            "No hay vouchers usados sin liquidar hasta ese domingo: no hay nada que liquidar. Si la administración pagó por adelantado, anotalo como pago a cuenta.",
          );
        }
        const tomados = await tx.voucher.updateMany({
          where: { ...elegibles, id: { in: vouchers.map((x) => x.id) } },
          data: { liquidacionSemanalId: liq.id },
        });
        if (tomados.count !== vouchers.length) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);
        const totalCentavos = sumaCentavos(vouchers.map((x) => (x.valorCubierto ? x.valorCubierto.toNumber() : 0)));
        const total = pesosDeCentavos(totalCentavos);
        await tx.voucherLiquidacion.updateMany({ where: { id: liq.id, tenantId }, data: { cantidad: vouchers.length, total } });
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: args.actor,
            action: "voucher.liquidacion.generar",
            entity: "VoucherLiquidacion",
            entityId: liq.id,
            channel: "admin",
            changes: { desde: semana.desde, hasta: semana.hasta, cantidad: vouchers.length, total },
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
          changes: { liberados },
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
          select: { id: true, numero: true, valorCubierto: true },
        });
        const p = planDeConciliacion({
          vouchers: vouchers.map((x) => ({ id: x.id, numero: x.numero, valorCubierto: x.valorCubierto ? x.valorCubierto.toNumber() : 0 })),
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

// ── Pago a cuenta (pre-pago o saldo de una diferencia) ──────────────────────

export type PagoACuentaArgs = {
  /** Idempotencia: la del formulario (un uuid por apertura). */
  clave: string;
  monto: number;
  fecha: string;
  medio: MedioPagoAdministracion;
  referencia?: string | null;
  nota?: string | null;
  actor: string;
};

export async function registrarPagoACuenta(tenantId: string, args: PagoACuentaArgs): Promise<{ pagoId: string; duplicado: boolean }> {
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
        if (ya) return { pagoId: ya.id, duplicado: true };
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
        await tx.auditLog.create({
          data: {
            tenantId,
            actor: args.actor,
            action: "voucher.cuenta.pago",
            entity: "VoucherPagoAdministracion",
            entityId: pago.id,
            channel: "admin",
            changes: { monto, fecha: args.fecha, medio: args.medio },
          },
        });
        return { pagoId: pago.id, duplicado: false };
      },
      { tenantId, isolationLevel: SERIALIZABLE },
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      const ya = await tenantTransaction((tx) => tx.voucherPagoAdministracion.findFirst({ where: { tenantId, clave: claveDb }, select: { id: true } }), {
        tenantId,
      });
      if (ya) return { pagoId: ya.id, duplicado: true };
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
  /** Vouchers que la administración no pagó al conciliar (siguen en el saldo). */
  impagos: { cantidad: number; total: number };
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
          where: { tenantId, estado: "USADO" },
          select: { id: true, numero: true, valorCubierto: true, usadoEn: true, liquidacionSemanalId: true, resultadoLiquidacion: true, client: { select: { name: true } } },
        }),
        tx.voucherPagoAdministracion.findMany({
          where: { tenantId },
          select: { id: true, fecha: true, monto: true, medio: true, referencia: true, liquidacionId: true },
        }),
        tx.voucherLiquidacion.findMany({ where: { tenantId }, orderBy: { hasta: "desc" }, take: 60 }),
      ]);
      const liqPorId = new Map(liquidaciones.map((l) => [l.id, l]));
      const movs: MovimientoDeCuenta[] = [
        ...usados.map((v) => ({
          fecha: v.usadoEn ? dateStrInBusinessTz(v.usadoEn) : "0000-00-00",
          tipo: "DEBITO" as const,
          concepto: `Voucher ${v.numero} · ${v.client.name}`,
          centavos: sumaCentavos([v.valorCubierto ? v.valorCubierto.toNumber() : 0]),
          ref: `v:${v.id}`,
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
      const imp = usados.filter((v) => v.resultadoLiquidacion === "IMPAGO");
      const total = (xs: typeof usados) => pesosDeCentavos(sumaCentavos(xs.map((v) => (v.valorCubierto ? v.valorCubierto.toNumber() : 0))));
      return {
        resumen,
        movimientos: movimientos.slice(-TOPE_MOVIMIENTOS).reverse(),
        liquidaciones: liquidaciones.map(aFila),
        sinLiquidar: { cantidad: sinLiq.length, total: total(sinLiq) },
        impagos: { cantidad: imp.length, total: total(imp) },
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
      const vouchers = await tx.voucher.findMany({
        where: { tenantId, liquidacionSemanalId: l.id },
        orderBy: [{ usadoEn: "asc" }, { numero: "asc" }],
        select: {
          id: true,
          numero: true,
          valorCubierto: true,
          usadoEn: true,
          resultadoLiquidacion: true,
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
          valor: v.valorCubierto ? v.valorCubierto.toNumber() : 0,
          resultado: v.resultadoLiquidacion === "PAGADO" || v.resultadoLiquidacion === "IMPAGO" ? v.resultadoLiquidacion : null,
        })),
      };
    },
    { tenantId },
  );
}
