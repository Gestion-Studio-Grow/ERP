// ============================================================================
// VOUCHERS — persistencia (tenant-scoped, transaccional). La regla vive en voucher-core.ts.
// ============================================================================
//
// COBRAR un turno con voucher (orden del dueño 05/11/2026, docs/tenants/ch/VOUCHERS-OPENKEY.md): en
// UNA transacción Serializable,
//   1. el voucher pasa de DISPONIBLE a USADO con `updateMany where {id, tenantId, estado:'DISPONIBLE',
//      clientId del turno}` y `count === 1` — el árbitro del doble uso;
//   2. se escribe el cobro por el camino de siempre (`aplicarCobroTurnoInTx`): `Collection` method
//      VOUCHER, clave `voucher:<voucherId>`, `Payment` agregado, guarda de saldo y FRONTERA DEL
//      CIERRE (lección DB-5: `cerradoHasta` obligatorio). El libro de caja NO lo asienta:
//      `cashMethodFromPaymentMethod("VOUCHER")` = null → «unsupported-method»;
//   3. `Voucher.collectionId` (único) apunta a ese cobro.
// ANULAR el cobro va por la anulación de siempre (turnos/anulacion.ts): el voucher vuelve a
// DISPONIBLE en la misma tx, sólo si OpenKey no lo dio de baja.
//
// Se escribe VOUCHER sólo si la base y el cliente conocen el valor (`sePuedeEscribirValorEnum`,
// prisma/pending-gate2/CH_voucher_enum.sql); el interruptor «vouchers» lo mira la acción.
// Todo lleva `tenantId` explícito además de RLS (MT-1): ningún `findFirst` sin predicado de negocio.

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { businessWallTimeToUtc, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { nextDayKey, type DayKey } from "@/lib/caja/cierre-diario";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { cobroTurnoDetail, settleAppointmentPaymentGuarded, type RecordCobroTurnoResult } from "@/lib/caja/cobro-turno";
import { estadoCobroTurno, MEDIO_VOUCHER } from "@/lib/turnos/cobros";
import { aplicarCobroTurnoInTx, cobrosDelTurnoInTx } from "@/lib/turnos/cobro-turno-repo";
import { fechaArgentina } from "./liquidacion-core";
import {
  claveDelCobroConVoucher,
  conciliar,
  conciliarLiquidacion,
  leerFecha,
  MENSAJES_VOUCHER,
  normalizarNumero,
  validarAplicacion,
  type EstadoVoucher,
  type FilaLiquidacion,
  type FilaOpenKey,
  type FilaReporteVoucher,
  type MotivoVoucherRechazado,
  type ResultadoConciliacion,
  type ResultadoLiquidacion,
} from "./voucher-core";

export type VoucherTx = Prisma.TransactionClient;
const SERIALIZABLE = Prisma.TransactionIsolationLevel.Serializable;

/** Un rechazo con su motivo: el mensaje se muestra tal cual (es un `RechazoDeDominio`). */
export class VoucherRechazado extends RechazoDeDominio {
  readonly motivo: MotivoVoucherRechazado | "turno-no-existe" | "dato-invalido" | "cambio-recien";
  constructor(motivo: VoucherRechazado["motivo"], mensaje?: string) {
    super(mensaje ?? (motivo in MENSAJES_VOUCHER ? MENSAJES_VOUCHER[motivo as MotivoVoucherRechazado] : "No se pudo."));
    this.name = "VoucherRechazado";
    this.motivo = motivo;
  }
}

const TURNO_NO_EXISTE = "Ese turno ya no existe. Recargá la agenda.";
const CAMBIO_RECIEN = "El voucher o el turno cambiaron recién. Recargá y probá de nuevo.";

/** ¿La base Y el cliente conocen `PaymentMethod.VOUCHER`? (CH_voucher_enum.sql, probe con caché). */
export async function voucherEnElEnum(): Promise<boolean> {
  const { sePuedeEscribirValorEnum } = await import("@/lib/schema-probe");
  return sePuedeEscribirValorEnum("PaymentMethod", MEDIO_VOUCHER);
}

// ── Cobrar con voucher ──────────────────────────────────────────────────────

export type CobrarConVoucherArgs = {
  numero: string;
  appointmentId: string;
  actor: string; // "user:<id>"
  /** Menor que el saldo, si el voucher no cubre todo; sin esto, el saldo entero. */
  monto?: number | null;
  /**
   * Guarda de autorización sobre ESTE turno, repetida ADENTRO de la transacción con el profesional
   * leído en la tx (la action pasa `soloLoSuyo`, como cobro-actions.ts). Tira para rechazar.
   */
  autorizarTurno?: (professionalIdDelTurno: string) => void;
};

export type CobrarConVoucherInTxArgs = CobrarConVoucherArgs & {
  /** Último día CERRADO de la caja (`lastClosedDayTx`), o null. Obligatorio (DB-5). */
  cerradoHasta: DayKey | null;
  /** true = columnas del puente migradas (clave de idempotencia persistente). */
  withSchema: boolean;
};

export type CobrarConVoucherResult = {
  voucherId: string;
  numero: string;
  collectionId: string;
  valorCubierto: number;
  /** La foto de OpenKey todavía no vio este voucher. */
  sinVerificar: boolean;
  /** Lo que falta cobrar del turno después del voucher (se cobra con los medios de siempre). */
  saldoDespues: number;
  /** Lo que hizo el libro de caja: con VOUCHER, nunca asienta (`unsupported-method`). */
  caja: RecordCobroTurnoResult | null;
};

export async function cobrarConVoucherInTx(
  tx: VoucherTx,
  tenantId: string,
  args: CobrarConVoucherInTxArgs,
): Promise<CobrarConVoucherResult> {
  const numero = normalizarNumero(args.numero);
  if (!numero) throw new VoucherRechazado("dato-invalido", "Falta el número del voucher.");
  const voucher = await tx.voucher.findFirst({
    where: { tenantId, numero },
    select: { id: true, numero: true, estado: true, clientId: true, estadoOpenKey: true },
  });
  if (!voucher) throw new VoucherRechazado("no-existe");
  const turno = await tx.appointment.findFirst({
    where: { id: args.appointmentId, tenantId },
    select: {
      id: true,
      clientId: true,
      professionalId: true,
      status: true,
      priceAtBooking: true,
      commissionPayoutId: true,
      service: { select: { price: true, name: true } },
      client: { select: { name: true } },
    },
  });
  if (!turno) throw new VoucherRechazado("turno-no-existe", TURNO_NO_EXISTE);
  // Invariante dura: el turno es de quien cobra, leído en ESTA tx (no basta el chequeo previo de la action).
  args.autorizarTurno?.(turno.professionalId);
  const precio = turno.priceAtBooking ?? turno.service.price;

  // La comisión ya pagada se calculó sobre lo cobrado SIN voucher: un voucher ahora (p. ej. tras
  // anular el cobro en efectivo) dejaría a la profesional cobrando de más sobre plata que CH no
  // recibe en el cajón. Se rechaza; el saldo se cobra con otro medio.
  if (turno.commissionPayoutId) throw new VoucherRechazado("comision-pagada");

  const yaTiene = await tx.voucher.findFirst({ where: { tenantId, appointmentId: turno.id }, select: { id: true } });
  if (yaTiene) throw new VoucherRechazado("turno-con-voucher");

  const [cobros, pago] = await Promise.all([
    cobrosDelTurnoInTx(tx, tenantId, turno.id),
    tx.payment.findFirst({ where: { tenantId, appointmentId: turno.id }, select: { status: true, amount: true } }),
  ]);
  const { saldo } = estadoCobroTurno({ precio, cobros, pagoLegado: pago });
  const v = validarAplicacion({ voucher, turno, saldo, monto: args.monto });
  if (!v.ok) throw new VoucherRechazado(v.motivo, v.mensaje);

  // 1 · El árbitro del doble uso: sólo UNA transacción pasa este voucher de DISPONIBLE a USADO.
  let count: number;
  try {
    ({ count } = await tx.voucher.updateMany({
      where: {
        id: voucher.id,
        tenantId,
        estado: "DISPONIBLE",
        clientId: turno.clientId,
        OR: [{ estadoOpenKey: null }, { estadoOpenKey: { not: "BAJA" } }],
      },
      data: { estado: "USADO", appointmentId: turno.id, valorCubierto: v.valorCubierto, usadoEn: new Date(), usadoPor: args.actor },
    }));
  } catch (e) {
    if (isUniqueViolation(e, "appointmentId")) throw new VoucherRechazado("turno-con-voucher");
    throw e;
  }
  if (count !== 1) throw new VoucherRechazado("ya-usado");

  // 2 · El cobro, por el camino de siempre. La clave sale de los cobros previos de ESTE voucher (un
  // voucher re-usado después de anular su cobro firma `voucher:<id>:2`, no choca con la anulada).
  const usosPrevios = args.withSchema
    ? await tx.collection.count({ where: { tenantId, idempotencyKey: { startsWith: `voucher:${voucher.id}` } } })
    : 0;
  const cobro = await aplicarCobroTurnoInTx(tx, tenantId, {
    appointmentId: turno.id,
    status: turno.status,
    precio,
    monto: v.valorCubierto,
    method: MEDIO_VOUCHER,
    note: `Voucher ${numero}`,
    actor: args.actor,
    detail: cobroTurnoDetail({ serviceName: turno.service.name, clientName: turno.client.name }),
    idempotencyKey: claveDelCobroConVoucher(voucher.id, usosPrevios),
    withSchema: args.withSchema,
    cerradoHasta: args.cerradoHasta,
    camino: "cobro",
  });
  if (!cobro.applied) throw new VoucherRechazado("ya-usado");

  // 3 · El voucher apunta a su cobro.
  const atado = await tx.voucher.updateMany({
    where: { id: voucher.id, tenantId, estado: "USADO", appointmentId: turno.id, collectionId: null },
    data: { collectionId: cobro.collectionId },
  });
  if (atado.count !== 1) throw new VoucherRechazado("cambio-recien", CAMBIO_RECIEN);

  await tx.auditLog.create({
    data: {
      tenantId,
      actor: args.actor,
      action: "voucher.cobrar",
      entity: "Voucher",
      entityId: voucher.id,
      channel: "admin",
      changes: { numero, appointmentId: turno.id, collectionId: cobro.collectionId, valorCubierto: v.valorCubierto, sinVerificar: v.sinVerificar },
    },
  });

  return {
    voucherId: voucher.id,
    numero,
    collectionId: cobro.collectionId,
    valorCubierto: v.valorCubierto,
    sinVerificar: v.sinVerificar,
    saldoDespues: cobro.estado.saldo,
    caja: cobro.caja,
  };
}

/**
 * Cobra con voucher en su propia transacción Serializable, leyendo la frontera del cierre adentro.
 * Sin `PaymentMethod.VOUCHER` en la base o en el cliente: rechazo claro, nada se escribe. Tolera las
 * columnas del puente sin migrar (degrada sin clave persistente, como todo cobro de turno).
 */
export async function cobrarConVoucher(tenantId: string, args: CobrarConVoucherArgs): Promise<CobrarConVoucherResult> {
  if (!(await voucherEnElEnum())) throw new VoucherRechazado("enum-ausente");
  const run = (withSchema: boolean) =>
    tenantTransaction(
      async (tx) => cobrarConVoucherInTx(tx, tenantId, { ...args, withSchema, cerradoHasta: await lastClosedDayTx(tx, tenantId) }),
      { tenantId, isolationLevel: SERIALIZABLE },
    );
  const settled = await settleAppointmentPaymentGuarded({ runWithBridge: () => run(true), runWithoutBridge: () => run(false) });
  // «race»: chocó una clave única del cobro (`idempotencyKey` / `Voucher.collectionId`): otro envío
  // ya cobró con este voucher.
  if (settled.outcome === "race") throw new VoucherRechazado("ya-usado");
  return settled.value;
}

// ── Alta de un lote ─────────────────────────────────────────────────────────

export type CrearLoteArgs = {
  numeroLote: string;
  fecha?: Date;
  asignaciones: readonly { numero: string; clientId: string }[];
};

export async function crearLote(tenantId: string, args: CrearLoteArgs): Promise<{ loteId: string; creados: number }> {
  const numeroLote = normalizarNumero(args.numeroLote);
  if (!numeroLote) throw new VoucherRechazado("dato-invalido", "Falta el número del lote.");
  const asign = args.asignaciones.map((a) => ({ numero: normalizarNumero(a.numero), clientId: a.clientId }));
  if (asign.length === 0) throw new VoucherRechazado("dato-invalido", "Cargá al menos un número de voucher.");
  if (asign.some((a) => !a.numero || !a.clientId)) throw new VoucherRechazado("dato-invalido", "Hay un voucher sin número o sin cliente.");
  const numeros = asign.map((a) => a.numero);
  const repetidos = numeros.filter((n, i) => numeros.indexOf(n) !== i);
  if (repetidos.length) throw new VoucherRechazado("dato-invalido", `Números repetidos en la carga: ${[...new Set(repetidos)].join(", ")}.`);

  try {
    return await tenantTransaction(
      async (tx) => {
        const clientIds = [...new Set(asign.map((a) => a.clientId))];
        const clientes = await tx.client.count({ where: { tenantId, id: { in: clientIds } } });
        if (clientes !== clientIds.length) throw new VoucherRechazado("dato-invalido", "Hay un cliente que no es de este negocio.");
        const existentes = await tx.voucher.findMany({ where: { tenantId, numero: { in: numeros } }, select: { numero: true } });
        if (existentes.length) {
          throw new VoucherRechazado("dato-invalido", `Estos vouchers ya existen: ${existentes.map((e) => e.numero).sort().join(", ")}.`);
        }
        const lote = await tx.voucherLote.upsert({
          where: { tenantId_numero: { tenantId, numero: numeroLote } },
          create: { tenantId, numero: numeroLote, fecha: args.fecha ?? new Date(), cantidad: asign.length },
          update: { cantidad: { increment: asign.length } },
          select: { id: true },
        });
        const { count } = await tx.voucher.createMany({
          data: asign.map((a) => ({ tenantId, numero: a.numero, loteId: lote.id, clientId: a.clientId })),
        });
        return { loteId: lote.id, creados: count };
      },
      { tenantId, isolationLevel: SERIALIZABLE },
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw new VoucherRechazado("dato-invalido", "Alguno de esos vouchers se cargó recién. Recargá y revisá.");
    throw e;
  }
}

// ── Foto de OpenKey (importación manual hoy; la RPA después) ────────────────

export type ImportarFotoArgs = {
  filas: readonly FilaOpenKey[];
  origen: "MANUAL" | "RPA";
  actor: string;
  /** Errores del lector del CSV, para que queden en el resumen de la corrida. */
  erroresDeLectura?: readonly { linea: number; motivo: string }[];
  /**
   * Cuándo sacó OpenKey esta foto (la RPA la sabe; la carga manual usa «ahora»). Una foto más
   * vieja que la vigente (`fotoOpenKeyEn`) no pisa el estado de OpenKey de ese voucher.
   */
  fechaFoto?: Date;
};

export type ResultadoImportacion = {
  conciliacionId: string;
  filas: number;
  actualizados: number;
  creados: string[];
  anuladosPorOpenKey: string[];
  conciliacion: ResultadoConciliacion;
};

export async function importarFotoOpenKey(tenantId: string, args: ImportarFotoArgs): Promise<ResultadoImportacion> {
  const ahora = new Date();
  // Una fecha futura no vale: dejaría esa foto «vigente» para siempre.
  const fechaFoto = args.fechaFoto && args.fechaFoto.getTime() < ahora.getTime() ? args.fechaFoto : ahora;
  const vigente: Prisma.VoucherWhereInput = { OR: [{ fotoOpenKeyEn: null }, { fotoOpenKeyEn: { lte: fechaFoto } }] };
  const filas = args.filas.map((f) => ({ ...f, numero: normalizarNumero(f.numero) }));
  const numeros = filas.map((f) => f.numero);
  return tenantTransaction(
    async (tx) => {
      const conocidos = new Set(
        (await tx.voucher.findMany({ where: { tenantId, numero: { in: numeros } }, select: { numero: true } })).map((v) => v.numero),
      );

      // Desconocidos con documento de UN cliente del negocio: se dan de alta (upsert por número).
      const nuevos = filas.filter((f) => !conocidos.has(f.numero) && f.documento);
      const creados: string[] = [];
      if (nuevos.length) {
        const docs = [...new Set(nuevos.map((f) => f.documento as string))];
        const clientes = await tx.client.findMany({ where: { tenantId, docNro: { in: docs } }, select: { id: true, docNro: true } });
        const porDoc = new Map<string, string | null>();
        for (const c of clientes) porDoc.set(c.docNro as string, porDoc.has(c.docNro as string) ? null : c.id); // doc repetido → ambiguo
        const altas = nuevos.flatMap((f) => {
          const clientId = porDoc.get(f.documento as string);
          return clientId ? [{ ...f, clientId, loteNumero: f.lote ?? "SIN-LOTE" }] : [];
        });
        const porLote = new Map<string, typeof altas>();
        for (const a of altas) porLote.set(a.loteNumero, [...(porLote.get(a.loteNumero) ?? []), a]);
        for (const [loteNumero, grupo] of porLote) {
          const lote = await tx.voucherLote.upsert({
            where: { tenantId_numero: { tenantId, numero: loteNumero } },
            create: { tenantId, numero: loteNumero, fecha: ahora, cantidad: 0 },
            update: {},
            select: { id: true },
          });
          const { count } = await tx.voucher.createMany({
            data: grupo.map((a) => ({ tenantId, numero: a.numero, loteId: lote.id, clientId: a.clientId })),
            skipDuplicates: true,
          });
          await tx.voucherLote.updateMany({ where: { id: lote.id, tenantId }, data: { cantidad: { increment: count } } });
          creados.push(...grupo.map((a) => a.numero));
        }
      }

      // La foto manda sobre el estado de OpenKey: DISPONIBLE, o BAJA (usado o anulado allá).
      const disp = filas.filter((f) => f.estado === "DISPONIBLE").map((f) => f.numero);
      const baja = filas.filter((f) => f.estado !== "DISPONIBLE").map((f) => f.numero);
      const anul = filas.filter((f) => f.estado === "ANULADO").map((f) => f.numero);
      // Sólo sobre los vouchers cuya foto vigente no es más nueva que ésta (`vigente`).
      let actualizados = 0;
      if (disp.length) {
        // DISPONIBLE limpia la baja sólo si el voucher no está USADO acá: la baja de un USADO es lo
        // que frena su anulación, y una foto (vieja o no) no la borra.
        actualizados += (
          await tx.voucher.updateMany({
            where: { tenantId, numero: { in: disp }, estado: { not: "USADO" }, AND: [vigente] },
            data: { estadoOpenKey: "DISPONIBLE", fotoOpenKeyEn: fechaFoto, bajaOpenKeyEn: null },
          })
        ).count;
        actualizados += (
          await tx.voucher.updateMany({
            where: { tenantId, numero: { in: disp }, estado: "USADO", AND: [vigente] },
            data: { estadoOpenKey: "DISPONIBLE", fotoOpenKeyEn: fechaFoto },
          })
        ).count;
      }
      if (baja.length) {
        // La marca de baja primero (antes de mover `fotoOpenKeyEn`, que decide quién es vigente).
        await tx.voucher.updateMany({ where: { tenantId, numero: { in: baja }, bajaOpenKeyEn: null, AND: [vigente] }, data: { bajaOpenKeyEn: fechaFoto } });
        actualizados += (
          await tx.voucher.updateMany({
            where: { tenantId, numero: { in: baja }, AND: [vigente] },
            data: { estadoOpenKey: "BAJA", fotoOpenKeyEn: fechaFoto },
          })
        ).count;
      }
      // Anulado en OpenKey y todavía disponible acá: se anula (no se puede usar). Si ya está USADO
      // no se toca: sale como alerta en la conciliación. Una foto vieja tampoco anula.
      const anuladosPorOpenKey = anul.length
        ? (
            await tx.voucher.findMany({
              where: { tenantId, numero: { in: anul }, estado: "DISPONIBLE", AND: [vigente] },
              select: { numero: true },
            })
          ).map((v) => v.numero)
        : [];
      if (anuladosPorOpenKey.length) {
        await tx.voucher.updateMany({
          where: { tenantId, numero: { in: anuladosPorOpenKey }, estado: "DISPONIBLE" },
          data: { estado: "ANULADO", anuladoMotivo: `Anulado por la administración del country (planilla del ${fechaArgentina(dateStrInBusinessTz(ahora))})` },
        });
      }

      const erp = await tx.voucher.findMany({
        where: {
          tenantId,
          OR: [{ numero: { in: numeros } }, { estado: "USADO", appointment: { status: { in: ["CANCELLED", "NO_SHOW"] } } }],
        },
        select: { numero: true, estado: true, appointment: { select: { status: true } } },
      });
      const conciliacion = conciliar(
        erp.map((v) => ({ numero: v.numero, estado: v.estado, estadoTurno: v.appointment?.status ?? null })),
        filas,
      );
      const resumen = {
        tipo: "DISPONIBILIDAD",
        filas: filas.length,
        actualizados,
        creados,
        anuladosPorOpenKey,
        erroresDeLectura: args.erroresDeLectura ?? [],
        ...conciliacion,
      };
      const fila = await tx.voucherConciliacion.create({
        data: { tenantId, fecha: ahora, origen: args.origen, resumen: resumen as Prisma.InputJsonValue, creadoPor: args.actor },
        select: { id: true },
      });
      return { conciliacionId: fila.id, filas: filas.length, actualizados, creados, anuladosPorOpenKey, conciliacion };
    },
    // Una foto trae cientos de filas en UNA transacción (todo-o-nada): tope de 20 s, no los 5 s.
    { tenantId, isolationLevel: SERIALIZABLE, timeoutMs: 20_000 },
  );
}

// ── Liquidación de OpenKey (lo que paga por cada voucher) ───────────────────

export type ImportarLiquidacionArgs = {
  filas: readonly FilaLiquidacion[];
  origen: "MANUAL" | "RPA";
  actor: string;
  erroresDeLectura?: readonly { linea: number; motivo: string }[];
};

export type ResultadoImportacionLiquidacion = {
  conciliacionId: string;
  filas: number;
  marcados: number;
  conciliacion: ResultadoLiquidacion;
};

/**
 * Importa la liquidación de OpenKey: marca `liquidadoEn`/`montoLiquidado`/`liquidacionRef` en cada
 * voucher USADO del negocio que nombra (la última liquidación manda; DISPONIBLE o ANULADO no se marcan) y concilia contra los cobros con
 * voucher. La conciliación se calcula con el estado de ANTES de marcar (quién ya estaba liquidado).
 */
export async function importarLiquidacionOpenKey(tenantId: string, args: ImportarLiquidacionArgs): Promise<ResultadoImportacionLiquidacion> {
  const ahora = new Date();
  // Fecha imposible (la RPA no pasa por el lector del CSV): esa fila se rechaza con su renglón y
  // el resto se importa, en vez de tumbar la corrida entera.
  const erroresDeLectura = [...(args.erroresDeLectura ?? [])];
  const filas = args.filas.flatMap((f, i) => {
    if (f.fecha && leerFecha(f.fecha) !== f.fecha) {
      erroresDeLectura.push({ linea: i + 1, motivo: `Fecha imposible «${f.fecha}» para el voucher ${f.numero}: esa fila no se importó.` });
      return [];
    }
    return [{ ...f, numero: normalizarNumero(f.numero) }];
  });
  const numeros = filas.map((f) => f.numero);
  return tenantTransaction(
    async (tx) => {
      const erp = await tx.voucher.findMany({
        where: { tenantId, OR: [{ numero: { in: numeros } }, { estado: "USADO", liquidadoEn: null }] },
        select: { id: true, numero: true, estado: true, valorCubierto: true, usadoEn: true, liquidadoEn: true },
      });
      const conciliacion = conciliarLiquidacion(
        erp.map((v) => ({
          numero: v.numero,
          estado: v.estado,
          valorCubierto: v.valorCubierto ? v.valorCubierto.toNumber() : null,
          usadoEn: v.usadoEn ? dateStrInBusinessTz(v.usadoEn) : null,
          liquidado: v.liquidadoEn != null,
        })),
        filas,
        todayInBusinessTz(),
      );
      const porNumero = new Map(erp.map((v) => [v.numero, v.id]));
      let marcados = 0;
      for (const f of filas) {
        const id = porNumero.get(f.numero);
        if (!id) continue;
        const liquidadoEn = f.fecha ? businessWallTimeToUtc(f.fecha, "12:00") : ahora;
        // Sólo un voucher USADO (con su cobro) queda liquidado. Uno DISPONIBLE o ANULADO que OpenKey
        // dice haber pagado es una discrepancia (`liquidadoSinCobro` de la conciliación), no una marca:
        // marcarlo lo dejaría «liquidado» sin cobro y trabaría su uso o su anulación futura.
        marcados += (
          await tx.voucher.updateMany({
            // Uno tomado por la liquidación del lunes (liquidacion-repo.ts) lo concilia esa, no este CSV.
            where: { id, tenantId, estado: "USADO", liquidacionSemanalId: null },
            data: { liquidadoEn, montoLiquidado: f.monto, liquidacionRef: f.referencia },
          })
        ).count;
      }
      const resumen = { tipo: "LIQUIDACION", filas: filas.length, marcados, erroresDeLectura, ...conciliacion };
      const fila = await tx.voucherConciliacion.create({
        data: { tenantId, fecha: ahora, origen: args.origen, resumen: resumen as Prisma.InputJsonValue, creadoPor: args.actor },
        select: { id: true },
      });
      return { conciliacionId: fila.id, filas: filas.length, marcados, conciliacion };
    },
    // Una liquidación trae cientos de filas en UNA transacción (todo-o-nada): tope de 20 s.
    { tenantId, isolationLevel: SERIALIZABLE, timeoutMs: 20_000 },
  );
}

// ── Listado (pantalla y CSV) ────────────────────────────────────────────────

export type FiltrosVouchers = {
  /** Fecha de USO desde/hasta, YYYY-MM-DD en la zona del negocio (inclusive). */
  desde?: string | null;
  hasta?: string | null;
  loteId?: string | null;
  clientId?: string | null;
  estado?: EstadoVoucher | null;
  numero?: string | null;
};

export type FilaVoucher = FilaReporteVoucher & {
  id: string;
  loteId: string;
  clientId: string;
  appointmentId: string | null;
  /** El cobro VOUCHER del turno: con esto la pantalla abre la anulación de siempre. */
  collectionId: string | null;
  estadoTurno: string | null;
};

const TOPE_LISTADO = 2000;

export async function listarVouchersDe(tenantId: string, f: FiltrosVouchers = {}): Promise<FilaVoucher[]> {
  const usadoEn: Prisma.DateTimeNullableFilter = {};
  if (f.desde) usadoEn.gte = businessWallTimeToUtc(f.desde, "00:00");
  if (f.hasta) usadoEn.lt = businessWallTimeToUtc(nextDayKey(f.hasta), "00:00");
  const numero = f.numero ? normalizarNumero(f.numero) : "";
  const rows = await tenantTransaction(
    (tx) =>
      tx.voucher.findMany({
        where: {
          tenantId,
          ...(f.loteId ? { loteId: f.loteId } : {}),
          ...(f.clientId ? { clientId: f.clientId } : {}),
          ...(f.estado ? { estado: f.estado } : {}),
          ...(numero ? { numero: { contains: numero } } : {}),
          ...(f.desde || f.hasta ? { usadoEn } : {}),
        },
        orderBy: [{ usadoEn: { sort: "desc", nulls: "last" } }, { numero: "asc" }],
        take: TOPE_LISTADO,
        select: {
          id: true,
          numero: true,
          loteId: true,
          clientId: true,
          appointmentId: true,
          collectionId: true,
          estado: true,
          valorCubierto: true,
          liquidadoEn: true,
          montoLiquidado: true,
          liquidacionRef: true,
          usadoEn: true,
          estadoOpenKey: true,
          bajaOpenKeyEn: true,
          lote: { select: { numero: true } },
          client: { select: { name: true } },
          appointment: { select: { startsAt: true, status: true } },
        },
      }),
    { tenantId },
  );
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    loteId: r.loteId,
    lote: r.lote.numero,
    clientId: r.clientId,
    cliente: r.client.name,
    appointmentId: r.appointmentId,
    collectionId: r.collectionId,
    turno: r.appointment ? dateStrInBusinessTz(r.appointment.startsAt) : null,
    estadoTurno: r.appointment?.status ?? null,
    usadoEn: r.usadoEn ? dateStrInBusinessTz(r.usadoEn) : null,
    valorCubierto: r.valorCubierto ? r.valorCubierto.toNumber() : null,
    estado: r.estado,
    estadoOpenKey: r.estadoOpenKey,
    bajaOpenKeyEn: r.bajaOpenKeyEn ? dateStrInBusinessTz(r.bajaOpenKeyEn) : null,
    liquidadoEn: r.liquidadoEn ? dateStrInBusinessTz(r.liquidadoEn) : null,
    montoLiquidado: r.montoLiquidado ? r.montoLiquidado.toNumber() : null,
    liquidacionRef: r.liquidacionRef,
  }));
}
