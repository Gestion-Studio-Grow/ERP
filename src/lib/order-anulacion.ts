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
import { validarMotivo, mensajeMotivoInvalido } from "@/lib/turnos/anulacion";
import { facturaDeLaVenta, mensajeFacturaViva, type FacturaDeLaVenta } from "@/lib/factura-viva";
import { formatearCantidad, hayLineaPorPeso } from "@/lib/pos-peso";
import { dateStrInBusinessTz, fmtTime, horarioDeNegocioDelFormulario } from "@/lib/datetime";
import { BUSINESS_TIMEZONE } from "@/lib/business-config";
import { fmtMoneyARS } from "@/components/ui/format";
import {
  cuponADevolver,
  descuentoDelAjuste,
  envioDeLasLineas,
  leerCuponDelPedido,
  whereCuponDelPedido,
  whereDevolucionDeCupon,
  type CuponDelPedido,
} from "@/lib/venta-reglas";
import type { AlcanceDeAnulacion } from "@/lib/capabilities";
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
 * Motivo que queda escrito cuando el DUEÑO anula y deja el motivo en blanco (a él no se le
 * exige; a recepción sí, ver `reglasDeAnulacion`).
 *
 * NO es un motivo vacío a propósito: el motivo es lo único que explica, seis meses después,
 * por qué falta esa plata. Este texto dice la verdad —que nadie escribió una razón— en vez
 * de dejar el campo en blanco y aparentar que sí.
 */
export const MOTIVO_ANULACION_SIN_TEXTO = "Anulada desde la bandeja de pedidos (sin motivo escrito)";

/**
 * QUIÉN PUEDE ANULAR QUÉ, antes de tocar la base. Pura.
 *
 * Lo que decide acá es lo que no depende de la venta: si el rol anula, y si el motivo que
 * escribió alcanza. Lo que sí depende de la venta —de qué día es su plata— lo decide
 * `anularVentaInTx` con el `soloDelDia` que esta función devuelve, porque el día contable
 * sale del asiento de la caja y ése se lee dentro de la transacción.
 *
 *   · sin alcance (el rol no tiene `orders:void`) → rechazo.
 *   · motivo obligatorio y vacío o de 3 letras    → rechazo: queda en la auditoría y es lo
 *                                                    único que explica después la plata.
 *   · motivo opcional (el dueño) y vacío           → pasa con MOTIVO_ANULACION_SIN_TEXTO.
 *   · motivo escrito pero de menos de 4 letras     → rechazo para todos: "asd" no explica.
 */
export function reglasDeAnulacion(input: {
  alcance: AlcanceDeAnulacion | null;
  motivo: string | null | undefined;
  hoy: DayKey;
}): { ok: true; motivo: string; soloDelDia: DayKey | null } | { ok: false; error: string } {
  if (!input.alcance) {
    return { ok: false, error: "Tu usuario no puede anular ventas. Pedile al dueño del negocio que la anule." };
  }
  const v = validarMotivo(input.motivo);
  let motivo: string;
  if (v.ok) motivo = v.motivo;
  else if (v.error === "vacio" && !input.alcance.motivoObligatorio) motivo = MOTIVO_ANULACION_SIN_TEXTO;
  else return { ok: false, error: mensajeMotivoInvalido(v.error) };
  return { ok: true, motivo, soloDelDia: input.alcance.soloHoy ? input.hoy : null };
}

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
  | "facturada" // ENG-023: tiene factura autorizada y todavía no hay nota de crédito que la cancele
  | "factura-en-camino" // ENG-023: su factura espera la respuesta de ARCA; el CAE puede llegar después
  | "dia-cerrado" // el día del asiento ya está cerrado: la corrección va con fecha de hoy
  | "solo-hoy"; // quien anula sólo puede con lo cobrado hoy, y esta plata es de otro día

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
  /**
   * La plata de esta venta entró otro día y quien anula sólo puede con lo de hoy
   * (`AlcanceDeAnulacion.soloHoy`). Opcional: sin el dato, no hay límite de día.
   */
  fueraDelDia?: boolean;
  /**
   * ENG-023: la factura de la venta (`facturaDeLaVenta`, factura-viva.ts). Obligatorio: una
   * anulación que no la mira deja la factura vigente ante ARCA.
   */
  factura: FacturaDeLaVenta;
}): PlanAnulacionVenta {
  if (!input.existe) return { ok: false, motivo: "no-existe" };
  // El "ya anulada" se evalúa ANTES del día cerrado: ante un doble clic la respuesta correcta
  // es "ya está", no "no se puede" — nadie tiene que asustarse por apretar dos veces.
  if (input.yaAnulada) return { ok: false, motivo: "ya-anulada" };
  // La factura va antes que el día cerrado y que el límite de rol: sin nota de crédito no la
  // anula nadie, y mandar a la persona al dueño o a otro día sería mandarla a otro rechazo.
  if (input.factura === "autorizada") return { ok: false, motivo: "facturada" };
  if (input.factura === "en-camino") return { ok: false, motivo: "factura-en-camino" };
  // El día cerrado va antes que el límite de rol: si el día ya se firmó, tampoco lo anula el
  // dueño, y mandar a la persona a pedírselo sería mandarla a otro rechazo.
  if (input.diaCerrado) return { ok: false, motivo: "dia-cerrado" };
  if (input.fueraDelDia) return { ok: false, motivo: "solo-hoy" };
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
    case "facturada":
      return mensajeFacturaViva("autorizada", "venta");
    case "factura-en-camino":
      return mensajeFacturaViva("en-camino", "venta");
    case "dia-cerrado":
      return (
        `Esa venta es del ${ctx?.dia ?? "un día"} y ese día de caja ya está cerrado: un día contado y ` +
        `firmado no se toca. Registrá la devolución como EGRESO en el libro de caja con la fecha de hoy ` +
        `y el motivo, y corregí el stock desde Ajustes.`
      );
    case "solo-hoy":
      return (
        `Esa venta se cobró el ${ctx?.dia ?? "otro día"} y con tu usuario sólo se anulan las ventas ` +
        `cobradas hoy. Pedile al dueño del negocio que la anule.`
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
  /**
   * Si viene, sólo se anula una venta cuya plata entró ESE día (el de hoy, para recepción:
   * lo devuelve `reglasDeAnulacion`). null/ausente = sin límite de día (el dueño).
   *
   * Mira el día del ASIENTO, no el del pedido: un pedido tomado ayer y cobrado hoy es plata
   * de hoy. Y un pedido sin cobrar no tiene plata que mover —sólo vuelve el stock—, así que
   * el límite no lo frena: si no, el pedido online de ayer que el cliente canceló quedaría
   * trabado en la bandeja hasta que aparezca el dueño.
   */
  soloDelDia?: string | null;
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
      /** Código del cupón cuyo uso volvió a quedar disponible, o null si la venta no tenía. */
      cuponDevuelto: string | null;
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
  const leerAsiento = () =>
    tx.cashMovement.findFirst({
      where: { tenantId, orderId: args.orderId, type: "VENTA" },
      select: { id: true, occurredAt: true, sessionId: true, method: true, amount: true },
    });
  type Asiento = Awaited<ReturnType<typeof leerAsiento>>;

  // ENG-023: la factura de la venta, por su enlace (`Invoice.orderId`) y dentro del negocio.
  const leerFactura = async () =>
    facturaDeLaVenta(
      await tx.invoice.findMany({ where: { tenantId, orderId: args.orderId }, select: { status: true } }),
    );

  // La decisión, en función del asiento y de la factura: se toma una vez antes del
  // compare-and-set y otra vez después (ver 1b).
  const decidir = (a: Asiento, factura: FacturaDeLaVenta) => {
    const diaContable = order ? args.diaDe(a?.occurredAt ?? order.createdAt) : null;
    const plan = planAnulacionVenta({
      existe: Boolean(order),
      yaAnulada: order?.status === "CANCELLED",
      // Sin asiento en el libro (venta no cobrada) no hay plata que mover de día: sólo vuelve
      // el stock, y el stock no tiene cierre. Frenar ahí sería inventar un candado que no
      // protege nada y dejar al pedido sin salida. Lo mismo vale para el límite de "sólo hoy".
      diaCerrado: Boolean(
        a && diaContable && args.diaCerradoHasta && args.esDiaCerrado(diaContable, args.diaCerradoHasta),
      ),
      fueraDelDia: Boolean(a && diaContable && args.soloDelDia && diaContable !== args.soloDelDia),
      factura,
    });
    return { plan, dia: diaContable ? formatDayLabel(diaContable) : null };
  };

  let asiento: Asiento = order ? await leerAsiento() : null;
  const antes = decidir(asiento, order ? await leerFactura() : "sin-factura-viva");
  if (!antes.plan.ok) {
    if (antes.plan.motivo === "ya-anulada") return { applied: false, reason: "duplicate" };
    throw new AnulacionVentaRechazada(antes.plan.motivo, { dia: antes.dia });
  }

  // (1) COMPARE-AND-SET sobre el estado: el árbitro del doble clic para la pata de stock.
  const cas = await tx.order.updateMany({
    where: { tenantId, id: args.orderId, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });
  if (cas.count === 0) return { applied: false, reason: "duplicate" };

  // (1b) Si no había asiento, se vuelve a buscar AHORA, con la fila del pedido ya bloqueada
  // por el compare-and-set. Un «Cobrar» apretado al mismo tiempo en otra pestaña pudo haber
  // escrito su VENTA entre la primera lectura y el bloqueo: sin esta relectura el pedido
  // quedaba anulado sin contrapartida y su plata seguía contando en la caja. Un cobro que
  // llegue después ya no entra: encuentra el pedido anulado y vuelve atrás (setOrderPaidCore).
  // Si la plata recién aparecida no se puede anular (otro día, día cerrado), se lanza y el
  // compare-and-set vuelve atrás con toda la transacción.
  //
  // La factura se relee SIEMPRE, por lo mismo (ENG-023): una facturación que confirmó entre la
  // primera lectura y el bloqueo ya es visible acá, y la anulación vuelve atrás entera. (Para
  // que la facturación que llega DESPUÉS del bloqueo espere y vea el pedido anulado, del lado de
  // la factura hace falta tomar la fila del pedido: anotado en el BACKLOG, ENG-023.)
  if (!asiento) asiento = await leerAsiento();
  const despues = decidir(asiento, await leerFactura());
  if (!despues.plan.ok) throw new AnulacionVentaRechazada(despues.plan.motivo, { dia: despues.dia });

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

  // (4) El uso del cupón vuelve. Va DESPUÉS del compare-and-set a propósito: sólo la anulación
  // que ganó la fila llega acá, así que anular dos veces no devuelve dos usos.
  const cuponDevuelto = await devolverCuponDelPedidoEnTx(tx, tenantId, args.orderId, order!.createdAt);

  return { applied: true, code: order!.code, montoRevertido, stockDevuelto, reversaId, cuponDevuelto };
}

/**
 * Devuelve el uso del cupón con el que se tomó el pedido, DENTRO de la transacción de la
 * anulación: si la anulación se deshace, el uso no vuelve. El cupón sale de la fila que
 * escribió el alta (`registrarCuponDelPedidoEnTx`, order-core.ts), no del descuento: un
 * descuento a mano no es un cupón. Sin esa fila (venta sin cupón) no toca nada.
 *
 * Idempotencia: la da el compare-and-set del estado en `anularVentaInTx` (el que llama). Acá
 * no hay un segundo candado porque no hace falta uno: el estado CANCELLED es terminal
 * (`siguienteEstado` no lo mueve) y ningún otro camino llega a esta función.
 *
 * `pedidoCreadoEl`: para las filas viejas sin `cuponId`, que un cupón recreado DESPUÉS del
 * pedido con el mismo código no reciba un uso que nunca se gastó en él (`whereDevolucionDeCupon`).
 */
export async function devolverCuponDelPedidoEnTx(
  tx: AnulacionVentaTx,
  tenantId: string,
  orderId: string,
  pedidoCreadoEl: Date,
): Promise<string | null> {
  const fila = await tx.auditLog.findFirst({ where: whereCuponDelPedido(tenantId, orderId), select: { changes: true } });
  const c = cuponADevolver(fila?.changes);
  if (!c) return null;
  const r = await tx.coupon.updateMany({
    where: whereDevolucionDeCupon(tenantId, c, pedidoCreadoEl),
    data: { usedCount: { decrement: 1 } },
  });
  // Si la dueña borró el cupón (o lo puso en cero a mano), no hay uso que devolver: la
  // anulación sigue igual, y el resultado dice que no volvió nada.
  return r.count > 0 ? c.codigo : null;
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

/** Detalle del movimiento de stock que deja escrito el reajuste de peso. Con coma: "0,74". */
export function detalleStockAjustadoPorEdicion(code: number, nombre: string, delta: number): string {
  const que = delta > 0 ? "salen" : "vuelven";
  return `Peso real del pedido #${code} · ${nombre}: ${que} ${formatearCantidad(Math.abs(delta))}`;
}

/** Una línea del pedido tal como está guardada (el snapshot de la venta). */
export type LineaGuardada = {
  productId: string | null;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/** El producto como lo lee el reajuste: con su precio de hoy y si hoy se puede vender. */
export type ProductoDelAjuste = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  trackStock: boolean;
  /** Activo, no borrado. Un producto que dejó de venderse no se SUMA, pero el que ya estaba se pesa. */
  vendible: boolean;
};

export type LineaDelAjuste = {
  productId: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  trackStock: boolean;
};

/**
 * Las líneas nuevas de un pedido que se pesa y ajusta. PURA.
 *
 * EL PRECIO ES EL DEL PEDIDO, NO EL DE HOY. Antes el reajuste rearmaba las líneas con el
 * precio del catálogo del momento de pesar: si la dueña aumentaba el vacío entre el pedido
 * del jueves y el envasado del sábado, el cliente pagaba el aumento sobre un precio que ya le
 * habían dicho. Lo que cambia al pesar es el PESO; el precio por kilo queda el que se
 * congeló al tomar el pedido (ADR-009 §4). Sólo un producto que NO estaba en el pedido entra
 * con el precio de hoy, y sólo si hoy se vende.
 *
 * Y LAS LÍNEAS CON PRECIO A MANO SE CONSERVAN tal cual: no tienen producto, así que el
 * formulario no las manda, y reescribir el pedido sin ellas cobraría de menos en silencio.
 */
export function lineasDelAjuste(
  existentes: readonly LineaGuardada[],
  productos: readonly ProductoDelAjuste[],
  pedidas: readonly { productId: string; qty: number }[],
): { lineas: LineaDelAjuste[]; aMano: LineaGuardada[] } {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const lineas: LineaDelAjuste[] = [];
  for (const w of pedidas) {
    if (!w.productId || !(w.qty > 0) || !Number.isFinite(w.qty)) continue;
    const p = porId.get(w.productId);
    if (!p) continue;
    const antes = existentes.find((e) => e.productId === w.productId);
    let unitPrice: number;
    let name: string;
    let saleUnit: "UNIT" | "WEIGHT";
    if (antes) {
      unitPrice = antes.unitPrice;
      name = antes.name;
      saleUnit = antes.saleUnit;
    } else {
      const hoy = p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price;
      if (!p.vendible || hoy == null || !(hoy > 0)) continue;
      unitPrice = hoy;
      name = p.name;
      saleUnit = p.saleUnit;
    }
    const quantity = round3(w.qty);
    lineas.push({
      productId: p.id,
      name,
      saleUnit,
      quantity,
      unitPrice,
      lineTotal: round2(quantity * unitPrice),
      trackStock: p.trackStock,
    });
  }
  return { lineas, aMano: existentes.filter((e) => e.productId == null) };
}

/**
 * Subtotal y total de un pedido reajustado. PURA.
 *
 * El descuento a mano conserva su PORCENTAJE, no sus pesos (`descuentoDelAjuste`, en
 * src/lib/venta-reglas.ts, que es la misma cuenta que muestra la pantalla antes de guardar).
 * Conservar los pesos dejaba que una pesada a la baja subiera el % hasta el 100 % y pasara
 * el tope de recepción. El de un CUPÓN (`antes.cupon`, la regla que escribió el alta) se
 * vuelve a calcular con la regla del cupón: el de monto fijo sigue siendo fijo.
 */
export function totalesDelAjuste(
  lineas: readonly { lineTotal: number }[],
  aMano: readonly { lineTotal: number; productId?: string | null; name?: string | null }[],
  antes: { descuento: number; subtotal: number; cupon?: CuponDelPedido | null },
): { subtotal: number; descuento: number; total: number } {
  const subtotal = round2([...lineas, ...aMano].reduce((s, l) => s + l.lineTotal, 0));
  // El envío de la tienda (una línea sin producto que el ajuste no toca) no es base del
  // descuento: el cupón se calculó sobre lo que se compra (`envioDeLasLineas`, venta-reglas.ts).
  const { descuento } = descuentoDelAjuste({
    descuentoAntes: antes.descuento,
    subtotalAntes: antes.subtotal,
    subtotalNuevo: subtotal,
    envio: envioDeLasLineas(aMano),
    cupon: antes.cupon ?? null,
  });
  return { subtotal, descuento, total: round2(subtotal - descuento) };
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

export type AjustarPedidoArgs = {
  orderId: string;
  /** Lo que mandó el formulario: producto y cantidad, ya leída con coma (`parseItems`). */
  pedidas: readonly { productId: string; qty: number }[];
  /** "user:<id>": firma los movimientos de stock del reajuste. */
  actor: string;
  /**
   * ¿Un aumento de peso de un producto con esta unidad puede dejar el stock en negativo? Lo
   * decide el LLAMADOR con `permiteVenderSinStock` (contexto EDICION_PESO_REAL), igual que
   * `insertOrder` recibe la lista ya decidida: acá se ejecuta, no se infiere la excepción.
   */
  permiteNegativo: (saleUnit: string) => boolean;
};

export type AjustarPedidoResult = {
  code: number;
  /** Total antes del reajuste. */
  antes: number;
  descuentoAntes: number;
  subtotal: number;
  descuento: number;
  total: number;
  /** ¿Quedó alguna línea por peso? Sin ninguna, el mensaje no habla de "peso real". */
  conPeso: boolean;
};

/**
 * Reescribe un pedido no cobrado con el peso real, dentro de la tx del llamador: líneas,
 * totales y stock son todo-o-nada. Lo usa `updateOrderItems`; vive acá (y no en la action)
 * para que un test lo corra entero con una base falsa y mire QUÉ se escribe.
 *
 * `registrarStock` se inyecta sólo para los tests: por defecto es el ledger real.
 */
export async function ajustarPedidoInTx(
  tx: AnulacionVentaTx,
  tenantId: string,
  args: AjustarPedidoArgs,
  registrarStock: typeof recordMovement = recordMovement,
): Promise<AjustarPedidoResult> {
  const id = args.orderId;
  const order = await tx.order.findFirst({
    where: { tenantId, id },
    select: {
      id: true,
      code: true,
      status: true,
      paid: true,
      subtotal: true,
      total: true,
      discount: true,
      items: {
        select: {
          productId: true,
          name: true,
          saleUnit: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          product: { select: { trackStock: true } },
        },
      },
    },
  });

  // La invariante dura: si el pedido ya tiene plata asentada, no se edita. Se chequea
  // contra el LIBRO, no contra el flag `paid` (ver `planEdicionDeLineas`).
  const asiento = order
    ? await tx.cashMovement.findFirst({ where: { tenantId, orderId: id }, select: { id: true } })
    : null;

  // Sin el filtro de activo: un corte que ya estaba en el pedido se pesa aunque hoy se
  // haya dejado de vender. Lo que NO estaba en el pedido sólo entra si hoy se vende
  // (`vendible`, lo decide `lineasDelAjuste`).
  const products = order
    ? await tx.product.findMany({
        where: { id: { in: args.pedidas.map((l) => l.productId) }, tenantId },
        select: {
          id: true,
          name: true,
          saleUnit: true,
          price: true,
          pricePerKg: true,
          trackStock: true,
          active: true,
          deletedAt: true,
        },
      })
    : [];
  // El precio es el del PEDIDO (el snapshot), no el del catálogo de hoy; y las líneas con
  // precio a mano se conservan. El porqué, en `lineasDelAjuste`.
  const { lineas: lines, aMano } = lineasDelAjuste(
    order?.items ?? [],
    products.map((p) => ({ ...p, vendible: p.active && p.deletedAt == null })),
    args.pedidas,
  );

  const plan = planEdicionDeLineas({
    existe: Boolean(order),
    paid: Boolean(order?.paid),
    status: String(order?.status ?? ""),
    tieneAsientoDeCaja: Boolean(asiento),
    lineasValidas: lines.length + aMano.length,
  });
  if (!plan.ok || !order) throw new Error(mensajeEdicionRechazada(plan.ok ? "no-existe" : plan.motivo));

  // ¿El descuento vino de un cupón? Su regla (% o fijo) la escribió el alta en su misma
  // transacción (`registrarCuponDelPedidoEnTx`). Sólo se busca si hay descuento: el pedido
  // sin descuento no suma una lectura. Sin fila, el descuento es a mano y conserva su %.
  const filaCupon =
    order.discount > 0
      ? await tx.auditLog.findFirst({
          where: whereCuponDelPedido(tenantId, id),
          orderBy: { createdAt: "desc" },
          select: { changes: true },
        })
      : null;
  const cupon = leerCuponDelPedido(filaCupon?.changes);

  // Stock por DELTA. Va ANTES de reescribir las líneas: si un aumento de peso no tiene
  // stock, el ledger lanza, la tx se aborta entera y el pedido queda como estaba.
  //
  // Salvo (MAG-4) cuando el aumento es de un producto POR PESO: el paquete ya se pesó y
  // está en la mano, y que pese más de lo que el sistema cree es justamente el caso que
  // esta edición viene a corregir. Ahí la VENTA sale aunque el stock quede en negativo.
  // La unidad sale de `lines`, que se armó con el Product leído en ESTA tx, no del
  // formulario. Las devoluciones (delta < 0, AJUSTE positivo) no pasan por la guarda.
  for (const d of deltasDeStock(
    order.items.map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      trackStock: Boolean(it.product?.trackStock),
    })),
    lines.map((l) => ({ productId: l.productId, quantity: l.quantity, trackStock: l.trackStock })),
  )) {
    // El nombre sale de la línea nueva o, si el producto se SACÓ del pedido, del
    // snapshot de la vieja: un movimiento de stock que dice "producto" no se investiga.
    const nombre =
      lines.find((l) => l.productId === d.productId)?.name ??
      order.items.find((it) => it.productId === d.productId)?.name ??
      "producto";
    await registrarStock(tx, {
      tenantId,
      productId: d.productId,
      // Más peso del estimado → sale como VENTA (con la guarda anti-oversell). Menos
      // peso → vuelve como AJUSTE positivo, el mismo tipo que usa la anulación mientras
      // el enum de stock no tenga un valor propio para la devolución.
      type: d.delta > 0 ? "VENTA" : "AJUSTE",
      qty: d.delta > 0 ? d.delta : round3(-d.delta),
      orderId: id,
      createdBy: `${EDICION_ACTOR_PREFIX}${args.actor}`,
      reason: detalleStockAjustadoPorEdicion(order.code, nombre, d.delta),
      label: nombre,
      allowNegative:
        d.delta > 0 && args.permiteNegativo(lines.find((l) => l.productId === d.productId)?.saleUnit ?? ""),
    });
  }

  await tx.orderItem.deleteMany({ where: { tenantId, orderId: id } });
  await tx.orderItem.createMany({
    data: [
      ...lines.map((l) => ({
        tenantId,
        orderId: id,
        productId: l.productId,
        name: l.name,
        saleUnit: l.saleUnit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
      ...aMano.map((l) => ({
        tenantId,
        orderId: id,
        productId: null,
        name: l.name,
        saleUnit: l.saleUnit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
    ],
  });

  // El descuento a mano conserva el % con el que se cargó la venta; el cupón, su regla
  // (`totalesDelAjuste`).
  const t = totalesDelAjuste(lines, aMano, { descuento: order.discount, subtotal: order.subtotal, cupon });
  await tx.order.updateMany({
    where: { tenantId, id },
    data: { subtotal: t.subtotal, discount: t.descuento, total: t.total },
  });

  return {
    code: order.code,
    antes: round2(order.total),
    descuentoAntes: round2(order.discount),
    subtotal: t.subtotal,
    descuento: t.descuento,
    total: t.total,
    // El mismo criterio que el botón (`textosDelAjuste`): sólo cuentan las líneas con producto.
    conPeso: hayLineaPorPeso([...lines, ...aMano]),
  };
}

// ============================================================================
// LA BANDEJA DE PEDIDOS — qué sigue abierto y qué hace falta para entregar.
// ============================================================================
//
// DOS AGUJEROS DE PLATA QUE TENÍA LA BANDEJA (pedidos/page.tsx):
//
//  · Se traían los últimos 100 pedidos y RECIÉN DESPUÉS se separaban en abiertos y cerrados.
//    En una carnicería cada ticket de mostrador es un pedido (nace entregado): con 100 tickets
//    en el día, el pedido online de ayer —el que sí hay que preparar— quedaba fuera de la
//    consulta y desaparecía de la pantalla sin que nadie lo tocara. Ahora son dos consultas:
//    los abiertos, todos; los cerrados, los últimos.
//  · «Entregar» no pedía el cobro. El pedido pasaba a entregado sin cobrar, caía a "Cerrados
//    recientes" —que no tiene botones— y esa plata no llegaba nunca a la caja. Ahora entregar
//    exige elegir con qué pagó o tildar "Queda a cobrar", y lo entregado sin cobrar SIGUE en
//    la bandeja, con su botón de cobrar, hasta que se cobre o se anule.
//
// Los `where` viven acá, y no escritos adentro del loader, para que el número del Inicio
// ("2 entregados sin cobrar") salga de la MISMA condición que la lista de la pantalla.

/** Estados en los que todavía hay algo que hacer con el pedido: prepararlo o entregarlo. */
export const ESTADOS_EN_CURSO = ["PENDING", "CONFIRMED", "PREPARING", "READY"] as const;

/** La mercadería salió y la plata no entró. */
export function whereEntregadosSinCobrar(tenantId: string): Prisma.OrderWhereInput {
  return { tenantId, status: "DELIVERED", paid: false };
}

/** Lo que la bandeja muestra con botones: en curso + entregados sin cobrar. Sin tope. */
export function wherePedidosAbiertos(tenantId: string): Prisma.OrderWhereInput {
  return {
    tenantId,
    OR: [{ status: { in: [...ESTADOS_EN_CURSO] } }, { status: "DELIVERED", paid: false }],
  };
}

/** Todo lo demás: anulados y entregados ya cobrados. Es historial; la bandeja lista los últimos. */
export function wherePedidosCerrados(tenantId: string): Prisma.OrderWhereInput {
  return { tenantId, OR: [{ status: "CANCELLED" }, { status: "DELIVERED", paid: true }] };
}

export type MotivoEntregaRechazada =
  | "no-existe"
  | "anulado"
  | "ya-entregado" // idempotencia: el segundo toque contesta "ya está", no un error
  | "no-esta-listo"
  | "falta-cobro" // ni medio ni "queda a cobrar": es el agujero que esto cierra
  | "cobro-y-a-cobrar"; // las dos cosas a la vez: no se adivina cuál quiso

export type PlanDeEntrega =
  | { ok: true; cobrar: boolean; quedaACobrar: boolean }
  | { ok: false; motivo: MotivoEntregaRechazada };

/**
 * ¿Se puede entregar ESTE pedido, y hay que cobrarlo en el mismo paso? Pura.
 *
 * Ya cobrado → se entrega sin preguntar nada: el camino feliz del mostrador no suma un paso.
 * Sin cobrar → o se elige el medio (se cobra y se entrega), o se tilda "Queda a cobrar" a
 * mano. Lo que no se puede es que la mercadería salga sin que ninguna de las dos cosas quede
 * dicha: eso era plata que no aparecía en ningún lado.
 */
export function planDeEntrega(input: {
  existe: boolean;
  status: string;
  paid: boolean;
  medioElegido: boolean;
  quedaACobrar: boolean;
}): PlanDeEntrega {
  if (!input.existe) return { ok: false, motivo: "no-existe" };
  if (input.status === "CANCELLED") return { ok: false, motivo: "anulado" };
  if (input.status === "DELIVERED") return { ok: false, motivo: "ya-entregado" };
  if (input.status !== "READY") return { ok: false, motivo: "no-esta-listo" };
  // El medio que haya llegado no se usa: el cobro ya tiene el suyo y no se reescribe.
  if (input.paid) return { ok: true, cobrar: false, quedaACobrar: false };
  if (input.medioElegido && input.quedaACobrar) return { ok: false, motivo: "cobro-y-a-cobrar" };
  if (input.medioElegido) return { ok: true, cobrar: true, quedaACobrar: false };
  if (input.quedaACobrar) return { ok: true, cobrar: false, quedaACobrar: true };
  return { ok: false, motivo: "falta-cobro" };
}

export function mensajeEntregaRechazada(motivo: MotivoEntregaRechazada, code?: number | null): string {
  const pedido = code != null ? `El pedido #${code}` : "El pedido";
  switch (motivo) {
    case "no-existe":
      return "Ese pedido ya no existe.";
    case "anulado":
      return `${pedido} está anulado: no se entrega.`;
    case "ya-entregado":
      return `${pedido} ya estaba entregado.`;
    case "no-esta-listo":
      return `${pedido} todavía no está listo: marcalo listo antes de entregarlo.`;
    case "falta-cobro":
      return "Elegí cómo pagó para cobrarlo al entregar, o tildá «Queda a cobrar» si se lo lleva sin pagar.";
    case "cobro-y-a-cobrar":
      return "Elegiste cómo pagó y también tildaste «Queda a cobrar»: dejá sólo una de las dos.";
  }
}

export type PedidoParaEntregar = { code: number; status: string; paid: boolean };
export type ResultadoDeCobro = { ok: true; mensaje?: string } | { ok: false; error: string };
export type ResultadoDeEntrega =
  | { ok: true; mensaje: string; entregado: boolean; quedaACobrar: boolean }
  | { ok: false; error: string };

/**
 * Entregar un pedido, con las operaciones de base INYECTADAS (el mismo molde que
 * `insertOrderGuarded`): así la secuencia se prueba entera sin base, incluido el doble toque.
 *
 *  1. Se lee el pedido y se decide con `planDeEntrega`.
 *  2. Si hay que cobrar, se cobra por el MISMO camino que el botón «Cobrar» (`cobrar`): la
 *     misma frontera del día cerrado, el mismo "sólo se cobra lo que no estaba cobrado" y el
 *     mismo asiento en la caja. Si el cobro se rechaza, NO se entrega.
 *  3. Se marca entregado con un compare-and-set sobre READY (`marcarEntregado` devuelve si
 *     ESTA llamada lo movió). El segundo toque ya lo encuentra entregado y contesta "ya está".
 *
 * Cobro y entrega no van en la misma transacción, y está bien: si el paso 3 no llega a correr,
 * el pedido queda cobrado y listo, que es un estado verdadero —la plata está en la caja— y el
 * próximo «Entregar» lo entrega de un toque. Lo que nunca puede pasar es lo inverso
 * (entregado sin cobrar y sin haberlo dicho), y eso lo corta el paso 1.
 */
export async function entregarPedidoGuarded(params: {
  /** Medio crudo del formulario; "" si no se eligió. Lo valida `cobrar`, no esta función. */
  medio: string;
  quedaACobrar: boolean;
  leer: () => Promise<PedidoParaEntregar | null>;
  cobrar: (medio: string) => Promise<ResultadoDeCobro>;
  marcarEntregado: () => Promise<boolean>;
}): Promise<ResultadoDeEntrega> {
  const medio = params.medio.trim();
  const antes = await params.leer();
  const plan = planDeEntrega({
    existe: Boolean(antes),
    status: antes?.status ?? "",
    paid: Boolean(antes?.paid),
    medioElegido: medio !== "",
    quedaACobrar: params.quedaACobrar,
  });
  if (!plan.ok) {
    if (plan.motivo === "ya-entregado") {
      return { ok: true, entregado: false, quedaACobrar: false, mensaje: mensajeEntregaRechazada(plan.motivo, antes?.code) };
    }
    return { ok: false, error: mensajeEntregaRechazada(plan.motivo, antes?.code) };
  }
  const code = antes!.code;

  let cobro = "";
  if (plan.cobrar) {
    const r = await params.cobrar(medio);
    if (!r.ok) return r;
    cobro = r.mensaje ?? `Pedido #${code} cobrado.`;
  }

  if (await params.marcarEntregado()) {
    const mensaje = plan.quedaACobrar
      ? `Pedido #${code} entregado sin cobrar: sigue en la bandeja como «Entregado · a cobrar» hasta que se cobre.`
      : cobro
        ? `${cobro} Quedó entregado.`
        : `Pedido #${code} entregado.`;
    return { ok: true, entregado: true, quedaACobrar: plan.quedaACobrar, mensaje };
  }

  // No lo movió esta llamada: otra pestaña (u otro toque) lo cambió entre la lectura y ahora.
  const ahora = await params.leer();
  if (ahora?.status === "DELIVERED") {
    const ya = mensajeEntregaRechazada("ya-entregado", code);
    return { ok: true, entregado: false, quedaACobrar: false, mensaje: cobro ? `${cobro} ${ya}` : ya };
  }
  return {
    ok: false,
    error:
      `El pedido #${code} cambió mientras lo entregabas: revisá la bandeja.` +
      (cobro ? " El cobro sí quedó registrado en la caja." : ""),
  };
}

// ============================================================================
// LA BANDEJA: el paso siguiente, el horario y el aviso por WhatsApp.
// ============================================================================

/** Estados a los que se AVANZA con el botón de la tarjeta (entregar tiene su propia acción). */
export type PasoDeBandeja = "CONFIRMED" | "PREPARING" | "READY";

/**
 * El estado siguiente de un pedido, o `null` si ese paso no es un avance simple. PURA.
 *
 * EN COMERCIO, NUEVO PASA DIRECTO A PREPARANDO. "Confirmar" era un toque que en una
 * carnicería no confirma nada: el pedido de la tienda ya está hecho y lo que sigue es
 * armarlo. En un negocio de servicios (CH) se queda el paso de siempre.
 *
 * Listo → Entregado NO está acá: entregar pide el cobro o un «queda a cobrar» dicho a mano
 * (`entregarPedidoGuarded`). Los terminales no avanzan.
 */
export function siguienteEstado(status: string, opts: { comercio: boolean }): PasoDeBandeja | null {
  switch (status) {
    case "PENDING":
      return opts.comercio ? "PREPARING" : "CONFIRMED";
    case "CONFIRMED":
      return "PREPARING";
    case "PREPARING":
      return "READY";
    default:
      return null;
  }
}

// Por qué no avanzó, dicho según lo que pasó. Antes los dos casos decían "cambió de estado en
// otra pantalla", también cuando el pedido no estaba: la persona recargaba y buscaba un pedido
// que se había movido, y no había ninguno.
/** El id no es de un pedido de este negocio (borrado, de otro negocio o un id viejo). */
export const PEDIDO_NO_ENCONTRADO =
  "No encontramos ese pedido en este negocio. Recargá la bandeja; si sigue apareciendo, avisá a GSG.";
/** Otra pestaña (u otra persona) ya lo movió: la bandeja se redibuja con el estado real. */
export const PEDIDO_YA_CAMBIO_DE_ESTADO =
  "El pedido ya había cambiado de estado en otra pantalla: la bandeja se actualizó.";

export type ResultadoDeAvance =
  | { ok: true; from: string; to: PasoDeBandeja }
  | { ok: false; motivo: "no-existe" | "ya-cambio"; error: string };

/**
 * El cuerpo de «Confirmar / Preparar / Marcar listo» (`advanceOrderStatus`), con la base
 * inyectada para probarlo sin servidor. `leer` busca el pedido por id Y negocio; `escribir` es
 * el compare-and-set (sólo mueve si sigue en `from`) y dice si escribió.
 */
export async function avanzarPedidoGuarded<S extends string>(params: {
  comercio: boolean;
  leer: () => Promise<{ status: S } | null>;
  escribir: (from: S, to: PasoDeBandeja) => Promise<boolean>;
}): Promise<ResultadoDeAvance> {
  const actual = await params.leer();
  if (!actual) return { ok: false, motivo: "no-existe", error: PEDIDO_NO_ENCONTRADO };
  // null = terminal (entregado, anulado) o Listo, que se entrega con `entregarPedido`: el botón
  // que se tocó era de un estado anterior, así que el pedido cambió en otra pantalla.
  const to = siguienteEstado(actual.status, { comercio: params.comercio });
  if (!to) return { ok: false, motivo: "ya-cambio", error: PEDIDO_YA_CAMBIO_DE_ESTADO };
  if (!(await params.escribir(actual.status, to))) {
    return { ok: false, motivo: "ya-cambio", error: PEDIDO_YA_CAMBIO_DE_ESTADO };
  }
  return { ok: true, from: actual.status, to };
}

/** El verbo del botón que avanza. */
export function verboDelPaso(status: string, opts: { comercio: boolean }): string | null {
  switch (siguienteEstado(status, opts)) {
    case "CONFIRMED":
      return "Confirmar";
    case "PREPARING":
      return status === "PENDING" ? "Preparar" : "Pasar a preparación";
    case "READY":
      return "Marcar listo";
    default:
      return null;
  }
}

/**
 * El horario pedido, del `<input type="datetime-local">` ("2026-09-26T10:00"), leído en la
 * zona del NEGOCIO. Antes era `new Date(raw)`: el navegador manda la hora sin zona y el
 * servidor (UTC en Vercel) la tomaba como suya, así que "sábado 10:00" quedaba guardado como
 * las 7 de la mañana. Lo ilegible es `null`: el horario es una preferencia, no frena el pedido.
 */
export function horarioDelFormulario(raw: string | null | undefined): Date | null {
  // Una fecha que no existe ("2026-13-40", "2026-02-30") no se corre a otra: es null. Sin esa
  // guarda, el formateo de la zona horaria tira con una fecha inválida y se lleva la venta. La
  // lectura vive en datetime.ts para que la pantalla de Vender lea el horario igual que el alta.
  return horarioDeNegocioDelFormulario(raw);
}

const DIA_CORTO = new Intl.DateTimeFormat("es-AR", {
  timeZone: BUSINESS_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/**
 * "Retira hoy 10:00", "Envío mañana 18:30", "Retira sáb 26/09 10:00", en la zona del negocio.
 * `esHoy` marca la tarjeta: es lo que hay que tener listo antes. PURA (recibe el hoy).
 * `retiro` es cómo se dice el retiro en el rubro ("Encuentro hoy 18:30" en una perfumería).
 */
export function etiquetaDeHorario(
  horario: Date | string,
  fulfillment: string,
  hoy: DayKey,
  retiro = "Retira",
): { texto: string; esHoy: boolean } {
  const d = new Date(horario);
  const dia = dateStrInBusinessTz(d);
  const verbo = fulfillment === "DELIVERY" ? "Envío" : retiro;
  const cuando = dia === hoy ? "hoy" : dia === nextDayKey(hoy) ? "mañana" : diaCorto(d);
  return { texto: `${verbo} ${cuando} ${fmtTime(d)}`, esHoy: dia === hoy };
}

/** "sáb 26/09", armado por partes: el separador que pone cada ICU ("26-09", "26/09") varía. */
function diaCorto(d: Date): string {
  const p = Object.fromEntries(DIA_CORTO.formatToParts(d).map((x) => [x.type, x.value]));
  return `${String(p.weekday ?? "").replace(".", "")} ${p.day}/${p.month}`;
}

/**
 * El mensaje de "tu pedido está listo" para mandar por WhatsApp, 1 a 1 y armado. PURA.
 * Sin dirección ni horario del local cargados, no se inventan: la frase se omite.
 */
export function avisoPedidoListo(p: {
  cliente: string;
  code: number;
  total: number;
  pagado: boolean;
  fulfillment: string;
  direccionEnvio: string | null;
  negocio: string;
  direccionLocal: string | null;
  horarioLocal: string | null;
  /** Cómo sigue "ya está …" en un retiro, según el rubro. Por defecto, "listo para retirar". */
  listoPara?: string;
}): string {
  const nombre = p.cliente.trim().split(/\s+/)[0];
  const saludo = nombre && nombre !== "Mostrador" ? `Hola ${nombre}` : "Hola";
  const listo =
    p.fulfillment === "DELIVERY"
      ? `tu pedido #${p.code} de ${p.negocio} ya está listo y sale${p.direccionEnvio ? ` para ${p.direccionEnvio}` : ""}.`
      : `tu pedido #${p.code} de ${p.negocio} ya está ${p.listoPara ?? "listo para retirar"}.`;
  const plata = p.pagado ? "Ya está pago." : `Total a pagar: ${fmtMoneyARS(p.total)}.`;
  const local =
    p.fulfillment !== "DELIVERY" && p.direccionLocal
      ? ` Te esperamos en ${p.direccionLocal}${p.horarioLocal ? ` (${p.horarioLocal})` : ""}.`
      : "";
  return `${saludo}, ${listo} ${plata}${local} ¡Gracias!`;
}

// ============================================================================
// VENTAS DEL DÍA — las ventas cobradas y las anulaciones, con quién anuló.
// ============================================================================
//
// Los `where` viven acá por lo mismo que los de la bandeja: el número del Inicio ("42 ventas
// cobradas hoy", "2 anulaciones hoy, por Juan") sale de la MISMA condición que la lista de
// la pantalla /admin/ventas.

function rangoDeCreacion(desde: Date, hasta?: Date | null): Prisma.DateTimeFilter {
  return hasta ? { gte: desde, lt: hasta } : { gte: desde };
}

/**
 * Las ventas COBRADAS y vigentes de un día: `paid`, no anuladas, creadas en el día del
 * negocio. Sin `hasta`, desde `desde` en adelante (hoy). El Inicio de mostrador de antes
 * sumaba todo pedido no anulado, cobrado o no: un pedido online sin pagar contaba como venta.
 *
 * DECISIÓN DEL DUEÑO, PENDIENTE (anotada en la integración de la ola 2): se cuenta por el día
 * en que se TOMÓ la venta (`createdAt`), como pide el brief, no por el día en que entró la
 * plata. Un pedido de ayer cobrado hoy no suma hoy y no coincide con Caja del día. Cambiarlo
 * (sin migrar: un OR sobre el `CashMovement` VENTA del día) mueve también el "% de la venta"
 * del número de Mermas (logistica.server.ts) y las expectativas de loaders.test.ts, y pide
 * medir el plan en Neon antes. No se cambia sin el OK del dueño.
 */
export function whereVentasCobradas(tenantId: string, desde: Date, hasta?: Date | null): Prisma.OrderWhereInput {
  return { tenantId, paid: true, status: { not: "CANCELLED" }, createdAt: rangoDeCreacion(desde, hasta) };
}

/**
 * Las ventas cobradas DE VERDAD de un día: las de `whereVentasCobradas` con un medio de cobro.
 * Deja afuera la venta a cuenta (`esVentaACuenta`, venta-reglas.ts: `paid` sin medio), que es
 * venta pero no plata que entró. Es el `where` del número de Vender del Inicio y de la cuenta
 * "Ventas cobradas" de Ventas del día (que lista igual las ventas a cuenta, marcadas).
 */
export function whereVentasCobradasConMedio(tenantId: string, desde: Date, hasta?: Date | null): Prisma.OrderWhereInput {
  return { ...whereVentasCobradas(tenantId, desde, hasta), paymentMethod: { not: null } };
}

/** Las ventas cobradas de ese día que después se anularon: siguen en la lista, marcadas. */
export function whereVentasAnuladas(tenantId: string, desde: Date, hasta?: Date | null): Prisma.OrderWhereInput {
  return { tenantId, paid: true, status: "CANCELLED", createdAt: rangoDeCreacion(desde, hasta) };
}

/**
 * Las anulaciones HECHAS en el día (no las ventas de ese día): la fila de auditoría que deja
 * `anularVentaCore` con `status: "CANCELLED"`. Es la que dice quién anuló, por qué y cuánta
 * plata volvió; el pedido sólo dice que está anulado. Una venta del martes anulada hoy por la
 * dueña cuenta HOY: es el control que tiene que ver.
 */
export function whereAnulacionesDelDia(tenantId: string, desde: Date, hasta?: Date | null): Prisma.AuditLogWhereInput {
  return {
    tenantId,
    entity: "Order",
    action: "update",
    changes: { path: ["status"], equals: "CANCELLED" },
    createdAt: rangoDeCreacion(desde, hasta),
  };
}

export type Anulacion = {
  orderId: string | null;
  code: number | null;
  monto: number;
  motivo: string;
  /** Quién anuló, en palabras: su nombre, o su rol en las filas viejas que no lo guardaban. */
  quien: string;
};

function comoObjeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Una fila de auditoría de anulación, leída. PURA y tolerante: un campo raro no la tira.
 * Quién: el nombre guardado en la fila (`por`); si es una fila vieja sin él, el nombre del
 * usuario del `actor` cuando la pantalla lo tiene a mano (`nombres`); si no, el rol.
 */
export function leerAnulacion(
  fila: { entityId?: string | null; actor: string; changes: unknown },
  nombres?: ReadonlyMap<string, string>,
): Anulacion {
  const c = comoObjeto(fila.changes);
  const monto = typeof c.montoRevertido === "number" && Number.isFinite(c.montoRevertido) ? c.montoRevertido : 0;
  const delActor = fila.actor.startsWith("user:") ? nombres?.get(fila.actor.slice(5)) : undefined;
  const por = typeof c.por === "string" && c.por.trim() ? c.por.trim() : (delActor ?? null);
  const rol = c.rol === "OWNER" ? "la dueña o el dueño" : c.rol === "RECEPTION" ? "recepción" : "alguien del equipo";
  return {
    orderId: fila.entityId ?? null,
    code: typeof c.code === "number" ? c.code : null,
    monto: round2(monto),
    motivo: typeof c.motivo === "string" ? c.motivo : "",
    quien: por ?? rol,
  };
}

/** "por Juan", "por Juan y Ana", "por Juan, Ana y 2 más". PURA. */
export function porQuien(nombres: readonly string[]): string {
  const unicos = [...new Set(nombres.filter(Boolean))];
  if (unicos.length === 0) return "";
  if (unicos.length === 1) return `por ${unicos[0]}`;
  if (unicos.length === 2) return `por ${unicos[0]} y ${unicos[1]}`;
  return `por ${unicos[0]}, ${unicos[1]} y ${unicos.length - 2} más`;
}

/** Cuántas anulaciones, cuánta plata volvió y quiénes anularon. PURA. */
export function resumirAnulaciones(
  filas: readonly { entityId?: string | null; actor: string; changes: unknown }[],
): { cantidad: number; monto: number; quienes: string[] } {
  const leidas = filas.map((f) => leerAnulacion(f));
  return {
    cantidad: leidas.length,
    monto: round2(leidas.reduce((s, a) => s + a.monto, 0)),
    quienes: [...new Set(leidas.map((a) => a.quien))],
  };
}
