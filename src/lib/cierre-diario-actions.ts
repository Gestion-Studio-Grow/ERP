"use server";

// CIERRE DIARIO DE CAJA — la pantalla que ata el libro a la plata que se cuenta.
//
// El libro (libro-caja-actions.ts) dice cuánto DEBERÍA haber. Esto compara ese número
// contra lo que la persona CUENTA, medio por medio, y asienta la diferencia como una
// fila más del libro. Es la pieza que faltaba: la auditoría de la planilla de CH
// Estética encontró un faltante de $154.500 anotado al margen en marzo y nunca
// aplicado, con abril abriendo como si la plata estuviera. Después de cerrar un día
// acá, el día siguiente abre con lo CONTADO, no con lo que el libro creía.
//
// La ARITMÉTICA no vive acá: vive pura y testeada en src/lib/caja/cierre-diario.ts.
// Estas acciones sólo consultan, delegan el cálculo y persisten.
//
// Guardas: `orders:read` para mirar, `orders:manage` para cerrar — las mismas que la
// caja y el libro, porque es el mismo trabajo. Sin capability nueva (ver el encabezado
// de caja-actions.ts).
//
// SIN MIGRACIÓN, a propósito. El diseño (docs/producto/diseno-cierre-diario-caja.md §5)
// propone un modelo `CashDayClose`; eso sería una cuarta migración esperando
// autorización sobre las tres que ya esperan, y los seis números que congelaría son
// derivables de lo que igual queda escrito. Ver `frontera-cierre.ts`.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { emitirCajaCerrada } from "@/eventos/del-core";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentTenantId } from "@/lib/tenant";
import { canCurrentUser, requireCapability } from "@/lib/authz";
import { isPrismaError } from "@/lib/prisma-errors";
import { estadoCobroTurno, type CobroTurno } from "@/lib/turnos/cobros";
import { rangoDelDia, turnosSinCerrarDelDia } from "@/lib/turnos/turno-abierto";
import { getCurrentUser } from "@/lib/session";
import { isDemoSandbox, DEMO_WRITE_BLOCKED } from "@/lib/demo-sandbox";
import {
  businessWallTimeToUtc,
  todayInBusinessTz,
  dateStrInBusinessTz,
  fmtTime,
} from "@/lib/datetime";
import {
  buildCierreDiario,
  validateCierre,
  ajustesAsMovements,
  isDayKey,
  nextDayKey,
  compareDayKeys,
  formatDayLabel,
  columnasDelCierre,
  conteoDelTurnoParaElCierre,
  SUFIJOS_AJUSTE_TRANSFERENCIA,
  mensajeTurnoAbierto,
  pagadosDeMasDelPeriodo,
  puedeCerrarElDia,
  validarReabrirDia,
  CERRAR_DIA_SIN_PERMISO,
  MOTIVO_MINIMO_REABRIR_DIA,
  type CierreDiario,
  type CierreMovement,
  type ColumnaDelCierre,
  type DayKey,
  type DeclaredAmounts,
  type HechosDelCierre,
} from "@/lib/caja/cierre-diario";
import {
  lastClosedDay,
  lastClosedDayTx,
  CIERRE_DIARIO_ACTION,
  CIERRE_DIARIO_ENTITY,
} from "@/lib/caja/frontera-cierre";
import { cierreMarker, CIERRE_DIARIO_ACTOR_PREFIX } from "@/lib/caja/cierre-marca";
import { resumenCierre } from "@/lib/caja/cierre-resumen";
import { CASH_METHODS, libroOrigin, type LibroMovement } from "@/lib/caja/libro-caja";
import { movementSign, type CashMethod, type CashMovementType } from "@/lib/caja/cash-register";
import { leerImporte } from "@/lib/pos-peso";
import { round2 } from "@/lib/round";
import { tarjetaHabilitada } from "@/lib/caja-actions";
import { transferenciaEnElLibroTx } from "@/lib/caja/transferencia-en-el-libro";
import { arqueoCiegoDelNegocio } from "@/lib/caja/arqueo-ciego";
import { diaALaVista } from "@/lib/caja/arqueo-ciego-core";
import { bordesDelMes, etiquetaDelMes } from "@/lib/libros/fecha-fiscal";
import { mesesCongeladosQueReabririaElDia } from "@/lib/cierre-mes/lectura";

const CIERRE_PATH = "/admin/caja/cierre";
const LIBRO_PATH = "/admin/caja/libro";

// Fin del día `day` en hora de pared del negocio: el instante 00:00 del día siguiente.
// Los movimientos del período son `[inicio, fin)`. Hacerlo en UTC metería las últimas
// tres horas de cada día en el día siguiente (Argentina es UTC−3).
function endOfDayUtc(day: DayKey): Date {
  return businessWallTimeToUtc(nextDayKey(day), "00:00");
}

// Instante contable de los ajustes: el último minuto del día cerrado, para que en el
// libro queden como la ÚLTIMA fila de ese día y el saldo corrido cierre.
function ajusteInstant(day: DayKey): Date {
  return businessWallTimeToUtc(day, "23:59");
}

/** El comprobante de un día ya cerrado: qué se contó, quién y cuándo. */
export type CierreRegistrado = {
  day: DayKey;
  cerradoEl: Date;
  quien: string;
  /** El detalle por medio, ya en castellano (ver src/lib/caja/cierre-resumen.ts). */
  resumen: ReturnType<typeof resumenCierre>;
};

export type CierreDiarioData = {
  day: DayKey;
  today: DayKey;
  lastClosedDay: DayKey | null;
  since: DayKey | null;
  /** El cierre con TODO sin declarar: sirve para mostrar el esperado por medio. */
  preview: CierreDiario;
  /**
   * A ciegas (interruptor «arqueo-ciego», cert F7/F8): sin turno abierto, el efectivo del libro NO
   * viaja a la pantalla Caja. TODO lo que sale de `getCierreDiarioData` pasa por `diaALaVista`
   * (caja/arqueo-ciego-core.ts), que blanquea el resumen, los montos de los movimientos en efectivo
   * y los conteos; la pantalla escribe «se ve al abrir el turno» donde llega el blanco. Con
   * `esperadoALaVista` (la pantalla del cierre) siempre es false.
   */
  efectivoACiegas: boolean;
  /** Las filas del período, para que la persona vea qué está cerrando. */
  movements: {
    id: string;
    day: DayKey;
    type: CashMovementType;
    method: CashMethod;
    /** `null` = a ciegas (`efectivoACiegas`), un movimiento en EFECTIVO: la fila se ve, el monto no. */
    amount: number | null;
    detail: string;
    origin: "manual" | "pos" | "turno";
  }[];
  yaCerrado: boolean;
  enElFuturo: boolean;
  /**
   * Si este día está cerrado: el comprobante de SU cierre, o null si quedó ABSORBIDO por
   * un cierre posterior (cerrar el 07 arquea desde el último cierre, así que el 05 y el 06
   * quedan adentro y no tienen cierre propio).
   *
   * El QA encontró que sin esto la pantalla de un día cerrado quedaba diciendo "0
   * movimientos" y ofreciendo "se puede cerrar igual", contradiciendo su propio cartel.
   */
  registro: CierreRegistrado | null;
  /**
   * Turnos del día que se cierra que siguen Reservados o Confirmados con la hora pasada: un
   * saldo que no entró o una ausencia sin marcar. Sólo AVISA, no traba el cierre (la caja
   * cuenta plata, no turnos). `null` = no se pidió (`conTurnosSinCerrar`) o quien mira no
   * gestiona la agenda y no se le muestra.
   */
  turnosSinCerrar: TurnoSinCerrar[] | null;
  /** Las columnas que cuenta la hoja (N2 · M1-C2): EFECTIVO · MP · TRANSFERENCIA · (TARJETA). */
  columnas: ColumnaDelCierre[];
  /**
   * Los medios del cierre de SIEMPRE (CierreForm, diseño de siempre): los del libro, MP junto con la
   * transferencia hasta el paquete. Transferencia sólo si el libro la tiene (cert. M1 v6, F1: la
   * clásica no separa por el medio de origen y lo contado ahí se descartaba).
   */
  mediosDelLibro: ColumnaDelCierre[];
  /** ¿Quien mira puede cerrar el día? (M1-C8: dueña/dueño o encargado; recepción, no). */
  puedeCerrar: boolean;
  /** Un turno de caja abierto: con él no se cierra el día (M1-C5). */
  turnoAbierto: { quien: string; hora: string } | null;
  /** Lo contado al cerrar el último turno del período (M1-C4): se reusa si sigue valiendo. */
  conteoDelTurno: { contado: number; quien: string; cerradoEl: Date; vigente: boolean } | null;
  /** Lo que suele explicar una diferencia (M1-C6). `null` en un día cerrado o en la demo. */
  hechos: HechosDelCierre | null;
  /** Reabrir el día (M1-C7): sólo para la dueña o el dueño en un día cerrado. `null` = no se ofrece. */
  reabrir: { puede: true } | { puede: false; porque: string } | null;
};

export type TurnoSinCerrar = {
  id: string;
  startsAt: Date;
  status: string;
  clienta: string;
  servicio: string;
  profesional: string;
  /**
   * Lo que falta cobrar (precio − Σ cobros). `null` = NO DISPONIBLE: la tabla de cobros
   * (`Collection`) no está migrada en esta base. Se dice así y no "$0", que sería afirmar que
   * no se debe nada justo cuando no se puede saber.
   */
  saldo: number | null;
};

const NADA_DECLARADO: DeclaredAmounts = { EFECTIVO: null, MP: null, TARJETA: null };

// Lo que el cierre lee de cada movimiento del período. El MEDIO DE ORIGEN (el `PaymentMethod` del
// cobro o del pedido) es lo que separa Mercado Pago de Transferencia (M1-C2); el total del pedido
// y el `createdAt` alimentan las causas probables (M1-C6).
const SELECT_DEL_PERIODO = {
  id: true, occurredAt: true, createdAt: true, type: true, method: true,
  amount: true, reason: true, orderId: true, collectionId: true, createdBy: true,
  // El ORIGEN del cobro, no sólo su id: es lo que separa un cobro de fiado de un
  // cobro de turno en el resumen del cierre (ver CierreMovement).
  collection: { select: { originType: true, method: true, orderId: true } },
  order: { select: { paymentMethod: true, total: true } },
} as const;

type FilaDelPeriodo = {
  id: string;
  occurredAt: Date;
  createdAt: Date;
  type: string;
  method: string;
  amount: number;
  reason: string | null;
  orderId: string | null;
  collectionId: string | null;
  createdBy: string | null;
  collection: { originType: string; method: string; orderId: string | null } | null;
  order: { paymentMethod: string | null; total: number } | null;
};

function movimientoDelPeriodo(r: FilaDelPeriodo): CierreMovement {
  return {
    id: r.id,
    occurredAt: r.occurredAt,
    type: r.type as CashMovementType,
    method: r.method as CashMethod,
    amount: r.amount,
    detail: r.reason ?? "",
    collectionId: r.collectionId ?? null,
    collectionOrigin: r.collection?.originType ?? null,
    medioDeOrigen: r.collection?.method ?? r.order?.paymentMethod ?? null,
  };
}

function tarjetaSeMovioEn(c: CierreDiario): boolean {
  const t = c.porMedio.TARJETA;
  return t.opening !== 0 || t.ingresos !== 0 || t.egresos !== 0;
}

/**
 * F2: lo que hay en `MP` antes de `start` que es plata de transferencia, neto. Son los asientos de
 * antes del paquete cobrados por transferencia (mismo criterio que `medioDeOrigen`: el medio del
 * cobro si salió de uno, si no el del pedido) y los ajustes de la columna Transferencia, que sin
 * el paquete se asientan en `MP` (`esAjusteDeTransferencia`). Un groupBy por tipo: no crece con
 * el histórico más que el de la apertura.
 */
async function transferenciaGuardadaEnMp(db: Pick<Prisma.TransactionClient, "cashMovement">, tenantId: string, start: Date): Promise<number> {
  const grupos = await db.cashMovement.groupBy({
    by: ["type"],
    where: {
      tenantId,
      method: "MP",
      occurredAt: { lt: start },
      OR: [
        { collection: { is: { method: "TRANSFERENCIA" } } },
        { collectionId: null, order: { is: { paymentMethod: "TRANSFERENCIA" } } },
        {
          createdBy: { startsWith: CIERRE_DIARIO_ACTOR_PREFIX },
          OR: SUFIJOS_AJUSTE_TRANSFERENCIA.map((s) => ({ reason: { endsWith: s } })),
        },
      ],
    },
    _sum: { amount: true },
  });
  return round2(grupos.reduce((s, g) => s + movementSign(g.type as CashMovementType) * (g._sum.amount ?? 0), 0));
}

/** "user:<id>" → el nombre de esa persona en ESTE negocio; si no, lo que haya. */
async function nombreDeActor(db: Pick<Prisma.TransactionClient, "user">, tenantId: string, actor: string | null): Promise<string> {
  if (!actor) return "alguien";
  const id = actor.startsWith("user:") ? actor.slice("user:".length) : null;
  if (!id) return actor;
  const u = await db.user.findFirst({ where: { tenantId, id }, select: { name: true } });
  return u?.name ?? "alguien del equipo";
}

/**
 * Lee el ledger y arma el cierre del día pedido, sin declarar nada todavía.
 *
 * `conTurnosSinCerrar`: el bloque de turnos abiertos lo dibuja SÓLO la pantalla de cierre. La
 * misma función alimenta el resumen de /admin/caja, que no lo muestra; sin la opción, esa
 * pantalla pagaba la consulta de turnos (y la de cobros, si había abiertos) en cada carga
 * para tirarla.
 *
 * `esperadoALaVista`: la pantalla del cierre recibe el efectivo del libro aunque el negocio arquee a
 * ciegas (cerrar el día es el arqueo de quien puede cerrar; `cerrarDia` compara en el servidor). Sin
 * la opción —la pantalla Caja—, con el interruptor encendido y sin turno abierto, el efectivo se
 * blanquea (`efectivoACiegas`). Si el cierre también debe ocultarlo para recepción lo decide el dueño.
 */
export async function getCierreDiarioData(
  dayRaw?: string | null,
  opciones: { conTurnosSinCerrar?: boolean; esperadoALaVista?: boolean } = {},
): Promise<CierreDiarioData> {
  // EL BORDE (cert F8): una sola salida, y por ella pasa todo. Con `efectivoACiegas` la redacción
  // blanquea cada monto del libro de efectivo antes de que llegue a la pantalla; nada se tapa abajo.
  return diaALaVista(await leerCierreDiario(dayRaw, opciones));
}

async function leerCierreDiario(
  dayRaw: string | null | undefined,
  opciones: { conTurnosSinCerrar?: boolean; esperadoALaVista?: boolean },
): Promise<CierreDiarioData> {
  await requireCapability("orders:read");
  const today = todayInBusinessTz();
  const day = isDayKey(dayRaw) ? dayRaw : today;

  if (isDemoSandbox()) {
    return {
      day,
      today,
      lastClosedDay: null,
      since: null,
      preview: buildCierreDiario({ day, previous: [], movements: [], declared: NADA_DECLARADO }),
      efectivoACiegas: false,
      movements: [],
      yaCerrado: false,
      enElFuturo: compareDayKeys(day, today) > 0,
      registro: null,
      turnosSinCerrar: [],
      columnas: columnasDelCierre({ tarjetaHabilitada: false, tarjetaSeMovio: false }),
      mediosDelLibro: CASH_METHODS.filter((m) => m !== "TRANSFERENCIA"),
      puedeCerrar: false,
      turnoAbierto: null,
      conteoDelTurno: null,
      hechos: null,
      reabrir: null,
    };
  }

  const tenantId = await getCurrentTenantId();
  const quienMira = await getCurrentUser();
  const puedeCerrar = puedeCerrarElDia(quienMira?.role);
  // Del `day` que se CIERRA, no de hoy: el cierre acepta días anteriores. Se lee también con
  // el día ya cerrado —un turno que quedó abierto sigue siendo plata o una ausencia sin marcar.
  //
  // No depende de la frontera ni del período, así que se lee A LA VEZ que ellos: antes era una
  // tanda entera en serie, delante de todo (cada tanda es una ida y vuelta a la base por lo
  // menos). Mismas consultas, mismo resultado. Se espera siempre en el `Promise.all` de abajo;
  // el `catch` vacío sólo evita un rechazo "sin atender" si la frontera falla primero (en ese
  // caso el error que sube es el de la frontera, y éste ya no importa).
  const turnosSinCerrarP: Promise<TurnoSinCerrar[] | null> = opciones.conTurnosSinCerrar
    ? canCurrentUser("agenda:manage").then((gestiona) => (gestiona ? leerTurnosSinCerrar(tenantId, day) : null))
    : Promise.resolve(null);
  turnosSinCerrarP.catch(() => {});
  const cerradoHasta = await lastClosedDay(tenantId);
  const yaCerrado = cerradoHasta ? compareDayKeys(day, cerradoHasta) <= 0 : false;

  // Un día CERRADO no tiene "período": el período es lo que falta arquear desde el último
  // cierre, y este día ya está adentro. Calcularlo igual daba el rango invertido que vio el
  // QA ("Desde el 08/09 hasta el 07/09 — 0 movimientos") sobre el día recién cerrado.
  if (yaCerrado) {
    const [registro, turnosSinCerrar, reabrir] = await Promise.all([
      leerRegistro(tenantId, day),
      turnosSinCerrarP,
      quienMira?.role === "OWNER" ? puedeReabrir(tenantId, day, cerradoHasta) : Promise.resolve(null),
    ]);
    return {
      day,
      today,
      lastClosedDay: cerradoHasta,
      since: null,
      preview: buildCierreDiario({ day, previous: [], movements: [], declared: NADA_DECLARADO }),
      // Con el día cerrado no se abre turno (`rechazarSiElDiaEstaCerrado`): no hay apertura a ciegas
      // al lado de este comprobante, así que el conteo del cierre se muestra como siempre.
      efectivoACiegas: false,
      movements: [],
      yaCerrado: true,
      enElFuturo: compareDayKeys(day, today) > 0,
      registro,
      turnosSinCerrar,
      columnas: columnasDelCierre({ tarjetaHabilitada: false, tarjetaSeMovio: false }),
      mediosDelLibro: CASH_METHODS.filter((m) => m !== "TRANSFERENCIA"),
      puedeCerrar,
      turnoAbierto: null,
      conteoDelTurno: null,
      hechos: null,
      reabrir: registro ? reabrir : null,
    };
  }

  const since = cerradoHasta ? nextDayKey(cerradoHasta) : null;

  // Período: desde el día siguiente al último cierre (o desde el origen) hasta el final
  // del día que se está cerrando.
  const start = since ? businessWallTimeToUtc(since, "00:00") : new Date(0);
  const end = endOfDayUtc(day);

  const [rows, previousTotals, turnosSinCerrar, abierto, ultimoTurno, sinCobrar, repartoSinRendir, arqueaACiegas] = await Promise.all([
    prisma.cashMovement.findMany({
      where: { tenantId, occurredAt: { gte: start, lt: end } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: SELECT_DEL_PERIODO,
    }),
    // El saldo de apertura se DERIVA agregando lo anterior al período: un groupBy que no
    // crece con el histórico. Igual que el libro — no se copia a mano de un cierre al otro.
    prisma.cashMovement.groupBy({
      by: ["type", "method"],
      where: { tenantId, occurredAt: { lt: start } },
      _sum: { amount: true },
    }),
    turnosSinCerrarP,
    // M1-C5: con un turno abierto no se cierra el día (se avisa antes; `cerrarDia` lo vuelve a mirar).
    prisma.cashSession.findFirst({
      where: { tenantId, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      select: { openedBy: true, openedAt: true },
    }),
    // M1-C4: lo contado al cerrar el último turno del período.
    prisma.cashSession.findFirst({
      where: { tenantId, status: "CLOSED", closedAt: { gte: start, lt: end } },
      orderBy: { closedAt: "desc" },
      select: { closingCounted: true, closedAt: true, closedBy: true },
    }),
    // M1-C6: ventas del día sin cobrar y envíos sin rendir. Sólo la pantalla del cierre (la misma
    // opción que los turnos): el resumen de /admin/caja no las muestra y no las paga.
    opciones.conTurnosSinCerrar
      ? prisma.order.aggregate({
          where: { tenantId, createdAt: { gte: businessWallTimeToUtc(day, "00:00"), lt: end }, paid: false, status: { not: "CANCELLED" } },
          _count: { _all: true },
          _sum: { total: true },
        })
      : Promise.resolve(null),
    opciones.conTurnosSinCerrar ? leerRepartoSinRendir(tenantId) : Promise.resolve(null),
    // Cert F7: ¿el negocio arquea a ciegas? Sólo donde el efectivo se puede blanquear (la pantalla
    // Caja); la pantalla del cierre no paga la consulta. A la vez que el resto.
    opciones.esperadoALaVista ? Promise.resolve(false) : arqueoCiegoDelNegocio(tenantId),
  ]);

  const previous: LibroMovement[] = previousTotals.map((g, i) => ({
    id: `prev-${i}`,
    occurredAt: start,
    type: g.type as CashMovementType,
    method: g.method as CashMethod,
    amount: g._sum.amount ?? 0,
    detail: "",
  }));

  const movements: CierreMovement[] = rows.map(movimientoDelPeriodo);
  const { sePuedeEscribirValorEnum } = await import("@/lib/schema-probe");
  const transferenciaEnElLibro = await sePuedeEscribirValorEnum("CashMethod", "TRANSFERENCIA");
  const deSiempre = buildCierreDiario({ day, since, previous, movements, declared: NADA_DECLARADO, transferenciaEnElLibro });
  const columnas = columnasDelCierre({ tarjetaHabilitada: await tarjetaHabilitada(), tarjetaSeMovio: tarjetaSeMovioEn(deSiempre) });
  const guardada = await transferenciaGuardadaEnMp(prisma, tenantId, start);
  const preview = buildCierreDiario({ day, since, previous, movements, declared: NADA_DECLARADO, columnas, transferenciaEnElLibro, transferenciaGuardadaEnMp: guardada });
  // A CIEGAS (cert F7/F8): mismo criterio que `getCajaData` (sin turno abierto y el interruptor
  // encendido). Acá sólo se marca; lo blanquea `diaALaVista` a la salida de `getCierreDiarioData`.
  const efectivoACiegas = arqueaACiegas && !abierto;

  const hechos: HechosDelCierre | null = !sinCobrar || !repartoSinRendir ? null : {
    ventasSinCobrar: { cantidad: sinCobrar._count._all, monto: Number(sinCobrar._sum.total ?? 0) },
    repartoSinRendir,
    pagadosDeMas: pagadosDeMasDelPeriodo(
      rows.map((r) => ({
        orderId: r.orderId ?? r.collection?.orderId ?? null,
        total: r.order ? Number(r.order.total) : null,
        amount: r.amount,
        type: r.type,
      })),
    ),
    cuadernoConFechaVieja: rows.reduce(
      (acc, r) =>
        r.type === "VENTA" && compareDayKeys(dateStrInBusinessTz(r.occurredAt), dateStrInBusinessTz(r.createdAt)) < 0
          ? { cantidad: acc.cantidad + 1, monto: round2(acc.monto + r.amount) }
          : acc,
      { cantidad: 0, monto: 0 },
    ),
  };

  return {
    day,
    today,
    lastClosedDay: cerradoHasta,
    since,
    preview,
    efectivoACiegas,
    movements: rows.map((r) => ({
      id: r.id,
      day: dateStrInBusinessTz(r.occurredAt),
      type: r.type as CashMovementType,
      method: r.method as CashMethod,
      amount: r.amount,
      detail: r.reason ?? "",
      origin: libroOrigin({ type: r.type as CashMovementType, orderId: r.orderId, createdBy: r.createdBy }),
    })),
    yaCerrado: false,
    enElFuturo: compareDayKeys(day, today) > 0,
    registro: null,
    turnosSinCerrar,
    columnas,
    mediosDelLibro: deSiempre.columnas,
    puedeCerrar,
    turnoAbierto: abierto ? { quien: await nombreDeActor(prisma, tenantId, abierto.openedBy), hora: fmtTime(abierto.openedAt) } : null,
    conteoDelTurno: conteoDelTurnoParaElCierre({
      turno: ultimoTurno?.closedAt
        ? { contado: ultimoTurno.closingCounted, cerradoEl: ultimoTurno.closedAt, quien: await nombreDeActor(prisma, tenantId, ultimoTurno.closedBy) }
        : null,
      esperadoEfectivo: preview.porColumna.EFECTIVO.expected,
    }),
    hechos,
    reabrir: null,
  };
}

/**
 * Envíos que salieron con el cadete y todavía no se rindieron: la ÚLTIMA marca de reparto del
 * pedido es «salió» (pedidos/reparto/reparto-core.ts, acción "reparto"). El monto es lo que falta
 * cobrar de ésos: si el cadete lo cobra en efectivo, esa plata todavía no está en el cajón.
 * SÓLO LECTURA; no exportada (recibe `tenantId`).
 */
async function leerRepartoSinRendir(tenantId: string): Promise<{ cantidad: number; monto: number }> {
  const enCurso = await prisma.order.findMany({
    where: { tenantId, fulfillment: "DELIVERY", status: { notIn: ["DELIVERED", "CANCELLED"] } },
    select: { id: true, paid: true, total: true },
  });
  if (enCurso.length === 0) return { cantidad: 0, monto: 0 };
  const marcas = await prisma.auditLog.findMany({
    where: { tenantId, entity: "Order", action: "reparto", entityId: { in: enCurso.map((o) => o.id) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { entityId: true, changes: true },
  });
  const ultima = new Map<string, unknown>();
  for (const m of marcas) if (m.entityId) ultima.set(m.entityId, (m.changes as { tipo?: unknown } | null)?.tipo);
  let cantidad = 0;
  let monto = 0;
  for (const o of enCurso) {
    if (ultima.get(o.id) !== "salio") continue;
    cantidad += 1;
    if (!o.paid) monto = round2(monto + Number(o.total));
  }
  return { cantidad, monto };
}

/**
 * ¿Se ofrece «Reabrir el día» en este día cerrado? La MISMA regla que la acción
 * (`validarReabrirDia`), sin el motivo (todavía no se escribió). SÓLO LECTURA.
 */
async function puedeReabrir(
  tenantId: string,
  day: DayKey,
  cerradoHasta: DayKey | null,
): Promise<{ puede: true } | { puede: false; porque: string }> {
  const [cierreDelDia, congelados] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { tenantId, entity: CIERRE_DIARIO_ENTITY, action: CIERRE_DIARIO_ACTION, entityId: day },
      select: { id: true },
    }),
    mesesCongeladosQueReabririaElDia(prisma, tenantId, day),
  ]);
  const anteriorCongelado = congelados.find((m) => m !== day.slice(0, 7));
  const v = validarReabrirDia({
    day,
    role: "OWNER",
    motivo: "x".repeat(MOTIVO_MINIMO_REABRIR_DIA),
    ultimoCerrado: cerradoHasta,
    hayCierreDelDia: cierreDelDia !== null,
    mesCongelado: congelados.includes(day.slice(0, 7)),
    mesCongeladoQueCubre: anteriorCongelado ? etiquetaDelMes(anteriorCongelado) : null,
  });
  return v.ok ? { puede: true } : { puede: false, porque: v.error };
}

/**
 * Los turnos del día `day` que siguen abiertos con la hora pasada (la regla es
 * `turnosSinCerrarDelDia`, pura y probada), con su saldo. SÓLO LECTURA.
 *
 * No exportada: recibe `tenantId` por parámetro y este archivo es "use server" — exportarla
 * la publicaría como endpoint que lee turnos de cualquier tenant.
 */
async function leerTurnosSinCerrar(tenantId: string, day: DayKey): Promise<TurnoSinCerrar[]> {
  const { desde, hasta } = rangoDelDia(day);
  const filas = await prisma.appointment.findMany({
    where: { tenantId, startsAt: { gte: desde, lt: hasta }, status: { in: ["PENDING", "CONFIRMED"] } },
    select: {
      id: true,
      startsAt: true,
      status: true,
      priceAtBooking: true,
      client: { select: { name: true } },
      service: { select: { name: true, price: true } },
      professional: { select: { name: true } },
      payment: { select: { status: true, amount: true } },
    },
  });
  const abiertos = turnosSinCerrarDelDia(filas, day, new Date());
  if (abiertos.length === 0) return [];

  // Cobros de esos turnos. Si la tabla no existe en esta base (migración de cobros parciales
  // sin aplicar), el saldo queda NO DISPONIBLE en vez de calcularse contra una lista vacía.
  let cobros: Map<string, CobroTurno[]> | null = new Map();
  try {
    const rows = await prisma.collection.findMany({
      where: { tenantId, originType: "APPOINTMENT", originId: { in: abiertos.map((a) => a.id) } },
      select: { originId: true, amount: true, method: true },
    });
    for (const r of rows) {
      const arr = cobros.get(r.originId) ?? [];
      arr.push({ amount: r.amount.toNumber(), method: r.method });
      cobros.set(r.originId, arr);
    }
  } catch (e) {
    if (!isPrismaError(e, "P2021") && !isPrismaError(e, "P2022")) throw e;
    cobros = null;
  }

  return abiertos.map((a) => ({
    id: a.id,
    startsAt: a.startsAt,
    status: a.status,
    clienta: a.client.name,
    servicio: a.service.name,
    profesional: a.professional.name,
    saldo: cobros
      ? estadoCobroTurno({
          precio: a.priceAtBooking ?? a.service.price,
          cobros: cobros.get(a.id) ?? [],
          pagoLegado: a.payment,
        }).saldo
      : null,
  }));
}

/**
 * El comprobante del cierre de ESE día exacto. `null` si el día quedó absorbido por un
 * cierre posterior (no tuvo cierre propio) — la pantalla lo dice con esas palabras.
 */
async function leerRegistro(tenantId: string, day: DayKey): Promise<CierreRegistrado | null> {
  const fila = await prisma.auditLog.findFirst({
    // Sólo un cierre VIGENTE: el de un día reabierto queda con otra acción (M1-C7).
    where: { tenantId, entity: CIERRE_DIARIO_ENTITY, action: CIERRE_DIARIO_ACTION, entityId: day },
    orderBy: { createdAt: "desc" },
    select: { actor: true, createdAt: true, changes: true },
  });
  if (!fila) return null;
  const resumen = resumenCierre(fila.changes);
  if (!resumen) return null;

  // El actor viaja como "user:<id>"; se resuelve al nombre para que el comprobante diga
  // quién cerró y no un identificador.
  let quien = fila.actor;
  const id = fila.actor.startsWith("user:") ? fila.actor.slice("user:".length) : null;
  if (id) {
    const u = await prisma.user.findFirst({ where: { tenantId, id }, select: { name: true } });
    if (u?.name) quien = u.name;
  }
  return { day, cerradoEl: fila.createdAt, quien, resumen };
}

export type CierreActionState = { ok: true; message: string } | { ok: false; errors: string[] } | null;

function parseDeclared(formData: FormData, columnas: readonly ColumnaDelCierre[] = CASH_METHODS): DeclaredAmounts {
  const out: DeclaredAmounts = { ...NADA_DECLARADO };
  for (const k of columnas) {
    // Plata como se escribe acá ("12.500" = doce mil quinientos), no `Number` con la coma
    // cambiada por punto, que leía "12.500" como 12,5.
    const lectura = leerImporte(String(formData.get(`declarado_${k}`) ?? ""));
    if (lectura.estado === "vacio") continue; // vacío = no se concilia ese medio
    const n = lectura.estado === "ok" ? lectura.valor : NaN;
    // Un valor tipeado pero ilegible NO se trata como "no declarado": se manda NaN, que
    // `buildCierreDiario` deja en null y la validación reporta como faltante. Callar un
    // error de tipeo sería exactamente lo que hace la planilla.
    out[k] = Number.isFinite(n) ? n : NaN;
  }
  return out;
}

/**
 * Cierra un día: valida contra la base, escribe los ajustes de diferencia y deja el día
 * congelado. Una sola escritura, una sola transacción Serializable.
 *
 * La transacción vuelve a leer TODO y a validar: nunca confía en lo que calculó el
 * navegador. Si dos submits corren juntos (doble clic, botón trabado), el segundo
 * encuentra el día ya cerrado y lo rechaza con un mensaje claro — el peor caso es un
 * aviso, no un ajuste duplicado.
 */
export async function cerrarDia(formData: FormData): Promise<CierreActionState> {
  const quien = await requireCapability("orders:manage");
  if (isDemoSandbox()) return { ok: false, errors: [DEMO_WRITE_BLOCKED.error] };
  // M1-C8: cierra la dueña / el dueño (o el encargado, cuando exista el rol). Recepción, no.
  if (!puedeCerrarElDia(quien.role)) return { ok: false, errors: [CERRAR_DIA_SIN_PERMISO] };

  const dayRaw = String(formData.get("day") ?? "").trim();
  if (!isDayKey(dayRaw)) return { ok: false, errors: ["La fecha del cierre no es válida."] };
  const day: DayKey = dayRaw;
  const note = String(formData.get("note") ?? "").trim() || null;
  // La hoja nueva (ContarYCerrar) manda `columnas`: separa Transferencia de Mercado Pago. Qué
  // columnas son lo decide el servidor (`columnasDelNegocio`), no el formulario. Sin el campo
  // (el formulario de siempre), MP es «MP y transferencias», como antes.
  const separaColumnas = formData.get("columnas") !== null;
  const conTarjeta = separaColumnas ? await tarjetaHabilitada() : false;
  const today = todayInBusinessTz();

  const tenantId = await getCurrentTenantId();
  const user = await getCurrentUser();
  const actor = user ? `user:${user.id}` : "admin";

  try {
    const resultado = await tenantTransaction(
      async (tx) => {
        // El MISMO candado por negocio que abrir un turno (`openCashSession`) y reabrir el día
        // (`reabrirDiaAction`): cerrar, abrir y reabrir se ordenan uno detrás del otro.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-dia:${tenantId}`}))`;
        // La frontera COMPARTIDA, leída sobre `tx`: filtra por `action` y descarta un cierre
        // con día futuro. La copia local que había acá no hacía ninguna de las dos cosas.
        const cerradoHasta = await lastClosedDayTx(tx, tenantId);
        const since = cerradoHasta ? nextDayKey(cerradoHasta) : null;
        const start = since ? businessWallTimeToUtc(since, "00:00") : new Date(0);
        const end = endOfDayUtc(day);

        // M1-C5: con un turno de caja abierto no se cierra el día. Adentro de la transacción
        // Serializable y con el candado de arriba. La apertura toma el mismo candado y relee la
        // frontera adentro de SU transacción: si las dos corren a la vez, la apertura espera, y al
        // releer (o por el ciclo SSI frontera↔turno, con reintento) ve el día cerrado y no abre.
        const abierto = await tx.cashSession.findFirst({
          where: { tenantId, status: "OPEN" },
          orderBy: { openedAt: "desc" },
          select: { openedBy: true, openedAt: true },
        });
        if (abierto) {
          return { ok: false as const, errors: [mensajeTurnoAbierto({ quien: await nombreDeActor(tx, tenantId, abierto.openedBy), hora: fmtTime(abierto.openedAt) })] };
        }

        const [rows, previousTotals] = await Promise.all([
          tx.cashMovement.findMany({
            where: { tenantId, occurredAt: { gte: start, lt: end } },
            orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
            select: SELECT_DEL_PERIODO,
          }),
          tx.cashMovement.groupBy({
            by: ["type", "method"],
            where: { tenantId, occurredAt: { lt: start } },
            _sum: { amount: true },
          }),
        ]);

        const previous: LibroMovement[] = previousTotals.map((g, i) => ({
          id: `prev-${i}`,
          occurredAt: start,
          type: g.type as CashMovementType,
          method: g.method as CashMethod,
          amount: g._sum.amount ?? 0,
          detail: "",
        }));
        const movements = rows.map(movimientoDelPeriodo);
        // M1-C2: la diferencia de Transferencia se asienta en `TRANSFERENCIA` sólo si la base la tiene.
        const transferenciaEnElLibro = await transferenciaEnElLibroTx(tx);
        const columnas = separaColumnas
          ? columnasDelCierre({
              tarjetaHabilitada: conTarjeta,
              tarjetaSeMovio: tarjetaSeMovioEn(buildCierreDiario({ day, since, previous, movements, declared: NADA_DECLARADO, transferenciaEnElLibro })),
            })
          : undefined;
        const declared = parseDeclared(formData, columnas);
        const transferenciaGuardada = columnas ? await transferenciaGuardadaEnMp(tx, tenantId, start) : 0;
        const cierre = buildCierreDiario({ day, since, previous, movements, declared, columnas, transferenciaEnElLibro, transferenciaGuardadaEnMp: transferenciaGuardada });

        const v = validateCierre(cierre, { note, today, lastClosedDay: cerradoHasta });
        if (!v.ok) return { ok: false as const, errors: v.errors };

        const filas = ajustesAsMovements(cierre, ajusteInstant(day));
        if (filas.length > 0) {
          const created = await tx.cashMovement.createMany({
            data: filas.map((f) => ({
              tenantId,
              sessionId: null,
              type: f.type,
              method: f.method,
              amount: f.amount,
              reason: f.detail,
              occurredAt: f.occurredAt,
              createdBy: cierreMarker(day),
            })),
          });
          if (created.count !== filas.length) {
            throw new Error(`se esperaban ${filas.length} ajustes y se escribieron ${created.count}`);
          }
        }

        // La fila de auditoría ES la frontera de congelamiento (ver frontera-cierre.ts),
        // así que va en la MISMA transacción que los ajustes: o quedan las dos cosas o
        // no queda ninguna.
        const registro = await tx.auditLog.create({
          select: { id: true },
          data: {
            tenantId,
            actor,
            action: CIERRE_DIARIO_ACTION,
            entity: CIERRE_DIARIO_ENTITY,
            entityId: day,
            channel: "admin",
            changes: {
              day,
              since,
              estado: cierre.estado,
              note,
              // TRANSFERENCIA (M1-C2) sólo si el libro la movió o se contó: antes del paquete es
              // siempre 0 y no se concilia, y el comprobante no tiene por qué mostrarla.
              porMedio: Object.fromEntries(
                CASH_METHODS.filter((k) => k !== "TRANSFERENCIA" || cierre.porMedio[k].expected !== 0 || cierre.porMedio[k].declared !== null).map((k) => [
                  k,
                  {
                    esperado: cierre.porMedio[k].expected,
                    declarado: cierre.porMedio[k].declared,
                    diferencia: cierre.porMedio[k].diff,
                  },
                ]),
              ),
              // Por columna de la hoja: lo que la persona vio y tipeó. Con F2 no es `porMedio` (el
              // libro): Transferencia abre en 0 y, en la hoja nueva, MP abre sin lo de transferencia.
              // El comprobante se lee de acá (`arqueoDeLaFila`, cert. M1 v9 O1); `hoja` dice cuál.
              hoja: columnas ? "nueva" : "siempre",
              porColumna: Object.fromEntries(
                cierre.columnas.map((c) => [
                  c,
                  { esperado: cierre.porColumna[c].expected, declarado: cierre.porColumna[c].declared, diferencia: cierre.porColumna[c].diff },
                ]),
              ),
              movimientos: cierre.movementCount,
              ajustes: filas.length,
            },
          },
        });

        // N2/P2: `caja.cerrada@1` en la transacción del cierre (el id del registro es el del cierre).
        await emitirCajaCerrada(tx, { tenantId, cierreId: registro.id, dia: day, porMedio: cierre.porMedio });

        return { ok: true as const, estado: cierre.estado, ajustes: filas.length };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!resultado.ok) return resultado;

    revalidatePath(CIERRE_PATH);
    revalidatePath(LIBRO_PATH);

    const cola =
      resultado.ajustes === 0
        ? "No hubo diferencias."
        : `Se asentó ${resultado.ajustes === 1 ? "la diferencia" : `${resultado.ajustes} diferencias`} en el libro.`;
    return { ok: true, message: `Día ${formatDayLabel(day)} cerrado. ${cola}` };
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : "No se pudo cerrar el día.";
    return { ok: false, errors: [msg] };
  }
}
