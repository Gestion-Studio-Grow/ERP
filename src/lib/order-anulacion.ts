// ============================================================================
// ANULAR UNA VENTA DEL MOSTRADOR — la corrección que el POS no tenía.
// ============================================================================
//
// QUÉ PASABA ANTES. `cancelOrder` hacía UN `update` de estado y nada más. Una venta
// cobrada y después cancelada dejaba las tres huellas intactas: el `CashMovement` VENTA
// seguía en el libro y en el arqueo, el kilaje seguía descontado del stock, y el pedido
// figuraba "Cancelado". O sea: el sistema decía que la venta no existía y al mismo tiempo
// contaba su plata y su mercadería. La salida de la persona era inventar un EGRESO a mano en
// el libro con un motivo escrito de memoria, y un ajuste de stock aparte — dos asientos de
// fantasía por cada pesada mal hecha.
//
// Y PESAR MAL ES EL CASO DIARIO de una carnicería: el paquete decía 1,240 y eran 1,310.
//
// EL CRITERIO ES EL MISMO QUE YA USA LA ANULACIÓN DE COBROS DE TURNO
// (`src/lib/turnos/anulacion.ts`), a propósito — un solo criterio de reversa en el sistema:
//
//   1. NO se borra ni se muta el asiento original. Se asienta la CONTRAPARTIDA. Lo que pasó
//      queda, y lo que lo revierte también.
//   2. La contrapartida va con el `occurredAt` ORIGINAL, no con el de hoy: así el día del
//      cobro vuelve a cerrar en cero, en vez de quedar con un ingreso de más ese día y un
//      egreso de más hoy. Un arqueo ya firmado no se puede "arreglar" moviendo plata de día.
//   3. Si el día del asiento original YA ESTÁ CERRADO, no se toca nada: se rechaza con un
//      mensaje que dice qué hacer. Un día contado y firmado es inmutable — esa es toda la
//      garantía del cierre diario.
//   4. La contrapartida lleva marca en `createdBy` para que el libro no la deje borrar.
//
// DOS DIFERENCIAS CON LA REVERSA DE TURNOS, y las dos son del schema de HOY:
//
//   · La contrapartida va como EGRESO, no como un segundo VENTA: `@@unique(tenantId,
//     orderId, type)` está APLICADO y sólo admite UN VENTA por pedido. Ese mismo índice es,
//     de yapa, el árbitro de la carrera del doble clic sobre "Anular".
//   · Hay una pata que el turno no tiene: el STOCK. Los kilos vuelven a la heladera.
//     Vuelven como AJUSTE con delta positivo porque el enum `StockMovementType` de hoy no
//     tiene `DEVOLUCION_CLIENTE` y agregarle un valor a un enum de Postgres es una
//     migración. El `reason` y el `orderId` dicen de dónde salió; si algún día entra la
//     migración, este archivo es el único que cambia.

import { round2 } from "@/lib/round";
import { recordMovement, round3 } from "@/lib/stock/ledger";
import {
  cashMethodFromPaymentMethod,
  formatDayLabel,
  nextDayKey,
  type DayKey,
} from "@/lib/caja/cierre-diario";
import type { Prisma } from "@/generated/prisma/client";

export type AnulacionVentaTx = Prisma.TransactionClient;

// ── 1. NÚCLEO PURO ──────────────────────────────────────────────────────────

/**
 * Actor con el que se firma la contrapartida en el libro.
 *
 * Existe por la misma razón que `ANULACION_TURNO_ACTOR_PREFIX`: la reversa se asienta como
 * EGRESO (es lo que el libro sabe restar) y un EGRESO sin marca se ve igual que uno tipeado
 * a mano. Borrarlo le devolvería al libro plata que el sistema ya decidió que NO entró.
 *
 * ⚠️ Hoy `deleteLibroEntry` (libro-caja-actions.ts:466) ya frena CUALQUIER movimiento con
 * `orderId` con "Ese movimiento viene de un pedido cobrado. Corregí el pedido, no el libro."
 * — y esta contrapartida lleva `orderId`, así que está cubierta sin tocar ese archivo. La
 * marca igual se escribe: es el rastro que dice QUIÉN la generó, y el día que alguien
 * relaje la guarda del `orderId` la marca sigue estando.
 */
export const ANULACION_VENTA_ACTOR_PREFIX = "anulacion-venta:";

/** ¿Esta fila del libro la escribió la anulación de una venta? Para no dejar borrarla. */
export function esEgresoDeAnulacionDeVenta(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(ANULACION_VENTA_ACTOR_PREFIX);
}

/**
 * Motivo por defecto cuando se anula desde el botón de la bandeja, que no pide texto.
 *
 * NO es un motivo vacío a propósito: el motivo es lo único que explica, seis meses después,
 * por qué falta esa plata. Este texto dice la verdad —que nadie escribió una razón— en vez
 * de dejar el campo en blanco y aparentar que sí.
 */
export const MOTIVO_ANULACION_SIN_TEXTO = "Anulada desde la bandeja de pedidos (sin motivo escrito)";

// ── FRONTERA DEL DÍA CERRADO, del lado del ALTA ─────────────────────────────
//
// La misma regla que gobierna la reversa gobierna el alta, y viven juntas para que nadie
// arregle una y se olvide de la otra: no se escribe plata sobre un día ya arqueado.

/**
 * ¿Esta venta va a escribir una fila en el libro de caja?
 *
 * Sólo la venta COBRADA con un medio que el libro sabe traducir. Un pedido tomado sin cobrar
 * no toca la caja —se cobra después, con `cobrarPedido`, que sí mira su propia frontera— así
 * que frenarlo por un día cerrado sería impedir anotar el pedido de mañana sin proteger nada.
 * Espeja exactamente a `cashSaleEligibility` (caja/cash-sale.ts), que es quien decide de
 * verdad si se asienta.
 */
export function laVentaEscribeEnCaja(input: {
  paid: boolean;
  paymentMethod: string | null;
}): boolean {
  if (!input.paid) return false;
  return input.paymentMethod ? cashMethodFromPaymentMethod(input.paymentMethod) != null : false;
}

/**
 * LA DECISIÓN COMPLETA de la frontera del alta, en una función pura: ¿esta venta se puede
 * escribir hoy? Existe para que la regla se pueda probar entera sin base de datos y para que
 * `createOrder` no tenga lógica propia que se pueda desincronizar de la del libro.
 */
export function fronteraDeVenta(input: {
  paid: boolean;
  paymentMethod: string | null;
  hoy: DayKey;
  cerradoHasta: DayKey | null;
  esDiaCerrado: (dia: DayKey, cerradoHasta: DayKey) => boolean;
  /** Desde dónde se intenta escribir: cambia la SALIDA que ofrece el mensaje, no la regla. */
  contexto?: ContextoDeCobro;
}): { bloquea: false } | { bloquea: true; error: string } {
  if (!laVentaEscribeEnCaja(input)) return { bloquea: false };
  if (!input.cerradoHasta) return { bloquea: false };
  if (!input.esDiaCerrado(input.hoy, input.cerradoHasta)) return { bloquea: false };
  return {
    bloquea: true,
    error: mensajeVentaEnDiaCerrado(input.hoy, input.cerradoHasta, input.contexto ?? "alta"),
  };
}

/**
 * El mensaje del mostrador cuando el día ya se cerró. Distinto del `frozenDayMessage` del
 * libro a propósito: el libro manda a "cargarlo con otra fecha", que en una venta no se puede
 * (la venta pasó hoy). Acá la única salida real que existe HOY, en la misma pantalla que la
 * persona está mirando y a un clic de distancia, es dejar la venta registrada SIN cobrar y
 * marcarla cobrada cuando la caja vuelva a abrir. El mensaje dice eso, con la fecha exacta.
 */
export type ContextoDeCobro =
  | "alta" // el POS, cobrando una venta nueva
  | "cobro"; // la bandeja, cobrando un pedido que ya estaba tomado

export function mensajeVentaEnDiaCerrado(
  hoy: DayKey,
  cerradoHasta: DayKey,
  contexto: ContextoDeCobro = "alta",
): string {
  const abierto = nextDayKey(cerradoHasta);
  const salida =
    contexto === "alta"
      ? `Destildá «Cobrado» para dejar la venta registrada y marcala cobrada el ${formatDayLabel(abierto)}, ` +
        `cuando la caja vuelva a estar abierta.`
      : `Dejá el pedido sin cobrar y marcalo cobrado el ${formatDayLabel(abierto)}, cuando la caja vuelva ` +
        `a estar abierta: la mercadería se entrega igual.`;
  return (
    `El día de caja ya está cerrado (último cierre: ${formatDayLabel(cerradoHasta)}), así que una venta ` +
    `cobrada del ${formatDayLabel(hoy)} no puede entrar al libro sin descuadrar el arqueo que ya se firmó. ` +
    salida
  );
}

export type MotivoAnulacionVentaRechazada =
  | "no-existe" // el pedido no es de este tenant o ya no está
  | "ya-anulada" // idempotencia: ya se anuló (doble clic, reintento)
  | "dia-cerrado"; // el día del asiento ya está cerrado: la corrección va con fecha de hoy

export type PlanAnulacionVenta =
  | { ok: true }
  | { ok: false; motivo: MotivoAnulacionVentaRechazada };

/**
 * ¿Se puede anular ESTA venta? Pura.
 *
 * `diaCerrado` lo resuelve la frontera del libro (`frontera-cierre.ts`) sobre el día del
 * ASIENTO ORIGINAL, no sobre hoy: una venta del martes se revierte en el martes.
 *
 * DELIVERED **no** es un motivo de rechazo, y esto es deliberado: desde que la venta de
 * mostrador cobrada y retirada nace DELIVERED (para que no tape la bandeja), rechazar el
 * estado terminal dejaría sin corrección justo al caso que se corrige todos los días.
 */
export function planAnulacionVenta(input: {
  existe: boolean;
  yaAnulada: boolean;
  diaCerrado: boolean;
}): PlanAnulacionVenta {
  if (!input.existe) return { ok: false, motivo: "no-existe" };
  // El "ya anulada" se evalúa ANTES del día cerrado: ante un doble clic la respuesta correcta
  // es "ya está", no "no se puede" — nadie tiene que asustarse por apretar dos veces.
  if (input.yaAnulada) return { ok: false, motivo: "ya-anulada" };
  if (input.diaCerrado) return { ok: false, motivo: "dia-cerrado" };
  return { ok: true };
}

export function mensajeAnulacionVentaRechazada(
  motivo: MotivoAnulacionVentaRechazada,
  ctx?: { dia?: string | null },
): string {
  switch (motivo) {
    case "no-existe":
      return "Ese pedido ya no existe.";
    case "ya-anulada":
      return "Esa venta ya estaba anulada.";
    case "dia-cerrado":
      return (
        `Esa venta es del ${ctx?.dia ?? "un día"} y ese día de caja ya está cerrado: un día contado y ` +
        `firmado no se toca. Registrá la devolución como EGRESO en el libro de caja con la fecha de hoy ` +
        `y el motivo, y corregí el stock desde Ajustes.`
      );
  }
}

/** Detalle de la contrapartida: se lee al lado del original y lo nombra. */
export function detalleReversaVenta(code: number, motivo: string): string {
  return `Anulación de venta #${code} — ${motivo}`;
}

/** Detalle del movimiento de stock que devuelve la mercadería a la heladera. */
export function detalleStockDevuelto(code: number, nombre: string): string {
  return `Devolución por anulación de venta #${code} · ${nombre}`;
}

// ── 2. PERSISTENCIA tx-scoped ───────────────────────────────────────────────

export type AnularVentaArgs = {
  orderId: string;
  motivo: string;
  actor: string; // "user:<id>"
  /** false = la mercadería NO volvió (se entregó igual). El stock no se repone. */
  devuelveStock: boolean;
  /** Último día CERRADO del tenant (frontera-cierre.ts), o null si nunca se cerró. */
  diaCerradoHasta: string | null;
  /** Predicado de congelamiento inyectado (`isFrozenDay`): este módulo no sabe de fechas. */
  esDiaCerrado: (dia: string, cerradoHasta: string) => boolean;
  /** Día contable (AAAA-MM-DD) de una fecha, en la zona del negocio. */
  diaDe: (d: Date) => string;
};

export type AnularVentaResult =
  | {
      applied: true;
      code: number;
      /** Plata devuelta al libro (0 si la venta no estaba cobrada: no había asiento). */
      montoRevertido: number;
      /** Kilos/unidades que volvieron al stock, por producto. */
      stockDevuelto: { productId: string; name: string; qty: number }[];
      reversaId: string | null;
    }
  | { applied: false; reason: "duplicate" };

export class AnulacionVentaRechazada extends Error {
  readonly motivo: MotivoAnulacionVentaRechazada;
  constructor(motivo: MotivoAnulacionVentaRechazada, ctx?: { dia?: string | null }) {
    super(mensajeAnulacionVentaRechazada(motivo, ctx));
    this.name = "AnulacionVentaRechazada";
    this.motivo = motivo;
  }
}

/**
 * Revierte UNA venta, dentro de la tx del llamador: estado, contrapartida de caja y
 * devolución de stock son todo-o-nada. Si el stock no se puede reponer, la plata tampoco se
 * devuelve — no queda media anulación.
 *
 * IDEMPOTENCIA, dos capas:
 *   (1) el cambio de estado es un COMPARE-AND-SET (`updateMany` con `status: { not:
 *       "CANCELLED" }`): el primero que gana la fila hace el trabajo; el segundo ve 0 filas
 *       afectadas y se va sin tocar nada. Es lo que impide que dos clics devuelvan el stock
 *       DOS veces — el stock no tiene ningún índice único que lo arbitre.
 *   (2) `@@unique(tenantId, orderId, type)` sobre el EGRESO, como árbitro a nivel DB de la
 *       carrera real (dos tx que pasan el paso 1 en paralelo no pueden asentar dos egresos).
 */
export async function anularVentaInTx(
  tx: AnulacionVentaTx,
  tenantId: string,
  args: AnularVentaArgs,
): Promise<AnularVentaResult> {
  const order = await tx.order.findFirst({
    where: { tenantId, id: args.orderId },
    select: {
      id: true,
      code: true,
      status: true,
      createdAt: true,
      items: {
        select: {
          productId: true,
          name: true,
          quantity: true,
          product: { select: { trackStock: true } },
        },
      },
    },
  });

  // El asiento original se busca ANTES de decidir: su `occurredAt` —no el `createdAt` del
  // pedido— es la FECHA CONTABLE que define si el día está cerrado.
  const asiento = order
    ? await tx.cashMovement.findFirst({
        where: { tenantId, orderId: args.orderId, type: "VENTA" },
        select: { id: true, occurredAt: true, sessionId: true, method: true, amount: true },
      })
    : null;

  const diaContable = order ? args.diaDe(asiento?.occurredAt ?? order.createdAt) : null;
  const plan = planAnulacionVenta({
    existe: Boolean(order),
    yaAnulada: order?.status === "CANCELLED",
    // Sin asiento en el libro (venta no cobrada) no hay plata que mover de día: sólo vuelve
    // el stock, y el stock no tiene cierre. Frenar ahí sería inventar un candado que no
    // protege nada y dejar al pedido sin salida.
    diaCerrado: Boolean(
      asiento && diaContable && args.diaCerradoHasta && args.esDiaCerrado(diaContable, args.diaCerradoHasta),
    ),
  });
  if (!plan.ok) {
    if (plan.motivo === "ya-anulada") return { applied: false, reason: "duplicate" };
    throw new AnulacionVentaRechazada(plan.motivo, {
      dia: diaContable ? formatDayLabel(diaContable) : null,
    });
  }

  // (1) COMPARE-AND-SET sobre el estado: el árbitro del doble clic para la pata de stock.
  const cas = await tx.order.updateMany({
    where: { tenantId, id: args.orderId, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });
  if (cas.count === 0) return { applied: false, reason: "duplicate" };

  // (2) La contrapartida en el libro, con la FECHA DEL ASIENTO ORIGINAL y su mismo turno de
  // caja: el día del cobro vuelve a cerrar en cero. `paid` NO se toca — que se haya cobrado
  // es un hecho histórico, y el par VENTA + EGRESO ya cuenta la historia completa.
  let reversaId: string | null = null;
  let montoRevertido = 0;
  if (asiento) {
    const mov = await tx.cashMovement.create({
      data: {
        tenantId,
        sessionId: asiento.sessionId,
        type: "EGRESO",
        method: asiento.method,
        amount: round2(asiento.amount), // siempre > 0: el signo lo pone el tipo (`movementSign`)
        reason: detalleReversaVenta(order!.code, args.motivo),
        occurredAt: asiento.occurredAt,
        orderId: args.orderId,
        createdBy: `${ANULACION_VENTA_ACTOR_PREFIX}${args.actor}`,
      },
      select: { id: true },
    });
    reversaId = mov.id;
    montoRevertido = round2(asiento.amount);
  }

  // (3) Los kilos vuelven. Sólo de los productos con control de stock, igual que la venta.
  const stockDevuelto: { productId: string; name: string; qty: number }[] = [];
  if (args.devuelveStock) {
    for (const it of order!.items) {
      if (!it.productId || !it.product?.trackStock) continue;
      const qty = round3(it.quantity);
      if (!(qty > 0)) continue;
      await recordMovement(tx, {
        tenantId,
        productId: it.productId,
        type: "AJUSTE", // delta FIRMADO: positivo = entra (ver el encabezado de este archivo)
        qty,
        orderId: args.orderId,
        createdBy: `${ANULACION_VENTA_ACTOR_PREFIX}${args.actor}`,
        reason: detalleStockDevuelto(order!.code, it.name),
        label: it.name,
      });
      stockDevuelto.push({ productId: it.productId, name: it.name, qty });
    }
  }

  return { applied: true, code: order!.code, montoRevertido, stockDevuelto, reversaId };
}

// ============================================================================
// EDITAR LAS LÍNEAS DE UN PEDIDO — el peso real de cada pieza envasada.
// ============================================================================
//
// LA PROMESA QUE HABÍA QUE CUMPLIR. La vidriera le dice al cliente, por escrito, que "el
// total puede ajustarse al peso real de cada pieza envasada" (`src/blueprints/retail/
// rubros.ts:75`) y NO existía ninguna acción que editara una línea. El pedido entraba con el
// peso estimado y ese peso estimado era el definitivo: o se cobraba de más, o se cobraba de
// menos, o alguien anotaba la diferencia en un papel.
//
// LA REGLA, Y POR QUÉ ES ESTA Y NO LA OTRA. Se edita **sólo mientras el pedido NO está
// cobrado**. La alternativa que se descartó era "recalcular el total y re-imputar la caja":
// re-imputar reescribe un asiento que puede caer en un día ya congelado —y entonces hay que
// elegir entre romper el cierre o dejar el libro mintiendo— y además choca de frente contra
// el `@@unique(tenantId, orderId, type)` que garantiza UN solo VENTA por pedido.
//
// Sin caja escrita no hay nada que reescribir: cero riesgo y cero migración. Y es exactamente
// el flujo de MAGRA — el pedido online nace PENDING y sin cobrar, se pesa al envasar, se
// cobra después. **Si ya se cobró, no se edita: se anula y se rehace** (más arriba en este
// mismo archivo).

/** Actor de los movimientos de stock que genera un reajuste de peso. Rastro, no permiso. */
export const EDICION_ACTOR_PREFIX = "edicion-pedido:";

export type MotivoEdicionRechazada =
  | "no-existe"
  | "ya-cobrada"
  | "tiene-caja"
  | "terminal"
  | "sin-lineas";

export type PlanEdicion = { ok: true } | { ok: false; motivo: MotivoEdicionRechazada };

/**
 * ¿Se pueden editar las líneas de ESTE pedido? Pura.
 *
 * `tieneAsientoDeCaja` no es redundante con `paid`: son dos fuentes distintas y la que manda
 * es la del LIBRO. Un pedido puede tener `paid` en false y aun así tener su asiento (una
 * imputación vieja, un arreglo a mano en la base). Editarlo movería la mercadería y el total
 * sin tocar la plata ya asentada: el libro diría un importe y el pedido otro. La invariante
 * se chequea, no se comenta.
 */
export function planEdicionDeLineas(input: {
  existe: boolean;
  paid: boolean;
  status: string;
  tieneAsientoDeCaja: boolean;
  lineasValidas: number;
}): PlanEdicion {
  if (!input.existe) return { ok: false, motivo: "no-existe" };
  if (input.status === "CANCELLED" || input.status === "DELIVERED") {
    return { ok: false, motivo: "terminal" };
  }
  if (input.paid) return { ok: false, motivo: "ya-cobrada" };
  if (input.tieneAsientoDeCaja) return { ok: false, motivo: "tiene-caja" };
  if (input.lineasValidas <= 0) return { ok: false, motivo: "sin-lineas" };
  return { ok: true };
}

export function mensajeEdicionRechazada(motivo: MotivoEdicionRechazada): string {
  switch (motivo) {
    case "no-existe":
      return "Ese pedido ya no existe.";
    case "terminal":
      return "Ese pedido ya está entregado o anulado: no se edita.";
    case "ya-cobrada":
    case "tiene-caja":
      return (
        "Ese pedido ya está cobrado y su plata está asentada en el libro, así que el peso no se " +
        "puede cambiar sin descuadrar la caja. Anulá la venta y volvé a cargarla con el peso real."
      );
    case "sin-lineas":
      return "Dejá al menos un producto con cantidad. Si el pedido no va, anulalo.";
  }
}

/** Detalle del movimiento de stock que deja escrito el reajuste de peso. */
export function detalleStockAjustadoPorEdicion(code: number, nombre: string, delta: number): string {
  const que = delta > 0 ? "salen" : "vuelven";
  return `Peso real del pedido #${code} · ${nombre}: ${que} ${Math.abs(delta)}`;
}

/**
 * El DELTA de stock por producto entre lo que el pedido tenía y lo que va a tener. Pura.
 *
 * Es lo que evita el camino ingenuo —devolver todo y volver a descontar todo—, que por cada
 * corrección de 70 gramos escribía dos movimientos por producto y, peor, pasaba por un
 * instante en el que el stock estaba inflado: si dos personas envasan al mismo tiempo, una
 * puede vender kilos que no existen en esa ventana. Con el delta, un pedido que pasa de 1,240
 * a 1,310 kg descuenta 0,070 y nada más.
 *
 * Sólo entran los productos con control de stock: los demás se venden sin bloqueo, igual que
 * en el alta (`stockDecrementLines` en order-core.ts).
 */
export function deltasDeStock(
  antes: readonly { productId: string | null; quantity: number; trackStock: boolean }[],
  despues: readonly { productId: string; quantity: number; trackStock: boolean }[],
): { productId: string; delta: number }[] {
  const acum = new Map<string, number>();
  for (const l of antes) {
    if (!l.productId || !l.trackStock) continue;
    acum.set(l.productId, round3((acum.get(l.productId) ?? 0) - l.quantity));
  }
  for (const l of despues) {
    if (!l.trackStock) continue;
    acum.set(l.productId, round3((acum.get(l.productId) ?? 0) + l.quantity));
  }
  return [...acum.entries()]
    .map(([productId, delta]) => ({ productId, delta: round3(delta) }))
    .filter((d) => d.delta !== 0);
}
