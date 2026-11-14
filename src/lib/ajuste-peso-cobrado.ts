// ============================================================================
// AJUSTE POR PESO REAL DE UN PEDIDO YA COBRADO (Magra, EVENTUALIDADES §2 caso 2).
// ============================================================================
//
// QUÉ PASABA. El pedido de la carnicería se cobra muchas veces ANTES de pesar: la clienta paga
// por Mercado Pago en la tienda, o en el mostrador al encargar. Después se envasa y pesa otra cosa.
// «Pesar y ajustar» sólo editaba lo NO cobrado (`planEdicionDeLineas`), y lo cobrado se anulaba y
// se rehacía: con un pago de Mercado Pago eso es inviable (habría que devolverle TODO y que pague
// de nuevo).
//
// QUÉ HACE AHORA, sin migración:
//   1. Se reescriben líneas, totales y stock con el MISMO reajuste de siempre (`ajustarPedidoInTx`,
//      stock por delta y firmado con EDICION_ACTOR_PREFIX). El asiento VENTA original NO se toca:
//      puede estar en un día ya cerrado y firmado.
//   2. Pesó MENOS → la diferencia se devuelve HOY: un EGRESO en el libro con `orderId`, por el medio
//      del cobro original. Si fue Mercado Pago, el detalle dice «devolver por Mercado Pago»: la
//      devolución en Mercado Pago se hace a mano (acá no se llama a su API).
//   3. Pesó MÁS → lo cobrado queda como un cobro del pedido (D9, `Order.collections`, sin asiento:
//      su plata ya está en la VENTA original) y el pedido vuelve a «sin cobrar» por la diferencia.
//      Todo cobro de un pedido sin cobrar cobra el SALDO (settlement/saldo-del-pedido.ts).
//   4. Igual al centavo → sólo cambian las líneas.
//
// UNA SOLA VEZ. `@@unique(tenantId, orderId, type)` admite un EGRESO por pedido y el cobro de lo ya
// pagado tiene clave única: un segundo ajuste con plata se rechaza («ya se ajustó una vez: anulá y
// rehacé»). La anulación posterior descuenta lo devuelto (caja/devolucion-por-peso.ts).
//
// DOBLE CLIC. La fila del pedido se toma FOR UPDATE antes de leer nada: dos clics se ordenan. El
// formulario manda una clave por apertura; el resultado queda en la auditoría (en la MISMA
// transacción) y el segundo clic con la misma clave recibe el mismo resultado sin escribir nada.

import { round2 } from "@/lib/round";
import { centavosDe, sumarAlCentavo } from "@/lib/dinero/redondeo";
import { formatearCantidad } from "@/lib/pos-peso";
import { fmtMoneyARS } from "@/components/ui/format";
import { facturaDeLaVenta, mensajeFacturaViva } from "@/lib/factura-viva";
import { formatDayLabel, isFrozenDay, nextDayKey, type DayKey } from "@/lib/caja/cierre-diario";
import { AJUSTE_PESO_ACTOR_PREFIX } from "@/lib/caja/devolucion-por-peso";
import { ajustarPedidoInTx, type AjustarPedidoArgs, type AjustarPedidoResult, type AnulacionVentaTx } from "@/lib/order-anulacion";
import { anotarNotaPorPesoInTx, facturaParaLaNota, importeDeLaNota, fraseDeLaNota, type NotaPorPeso } from "@/lib/facturacion/nota-credito-por-peso-core";

// ── 1. NÚCLEO PURO ──────────────────────────────────────────────────────────

/** La acción de auditoría del ajuste de un pedido cobrado: rastro, idempotencia y aviso. */
export const ACCION_AJUSTE_PESO_COBRADO = "ajuste_peso_cobrado";

/** Clave del cobro que deja escrito lo pagado antes de pesar: uno por pedido (árbitro en la base). */
export function claveCobradoAntesDePesar(orderId: string): string {
  return `${AJUSTE_PESO_ACTOR_PREFIX}${orderId}`;
}

export type DiferenciaDelAjuste =
  | { tipo: "igual" }
  | { tipo: "devolver"; monto: number }
  | { tipo: "cobrar"; monto: number };

/** Lo cobrado contra el total nuevo, en centavos enteros (nada de 0,1 + 0,2). PURA. */
export function diferenciaDelAjuste(cobrado: number, totalNuevo: number): DiferenciaDelAjuste {
  const d = centavosDe(totalNuevo) - centavosDe(cobrado);
  if (d === 0) return { tipo: "igual" };
  return d < 0 ? { tipo: "devolver", monto: -d / 100 } : { tipo: "cobrar", monto: d / 100 };
}

export type MotivoAjusteCobradoRechazado =
  | "no-existe"
  | "terminal"
  | "ya-ajustado"
  | "sin-asiento"
  | "facturada"
  | "facturada-peso-mas"
  | "factura-en-camino"
  | "factura-anulada"
  | "dia-cerrado";

/**
 * ¿Se puede ajustar por peso ESTE pedido cobrado? Pura. La devolución con el día cerrado se
 * decide después (depende del total nuevo): `mensajeAjusteCobradoRechazado("dia-cerrado")`.
 *
 *   · entregado o anulado          → no: ya se fue (o no existe la venta).
 *   · ya ajustado con plata        → no: el índice admite una devolución por pedido.
 *   · cobrado sin UNA venta en el libro (varios medios, a cuenta, voucher) → no: no hay un cobro
 *     único contra el cual devolver o sumar.
 *   · con factura viva             → no: cambiar el total pide nota de crédito (fuera de alcance).
 *   · con factura SIMULADA (CAE del simulador, negocio en modo prueba) → sí: si pesó menos, la
 *     devolución lleva su nota de crédito simulada (facturacion/nota-credito-por-peso.ts); si pesó
 *     más se rechaza después, con la diferencia a la vista («facturada-peso-mas»).
 */
export function planAjusteCobrado(input: {
  existe: boolean;
  status: string;
  tieneVenta: boolean;
  /** Ya hay una devolución por peso (EGRESO del pedido) o el cobro de lo pagado antes de pesar. */
  yaAjustado: boolean;
  /** Tiene otros cobros parciales (pago con varios medios). */
  otrosCobros: boolean;
  factura: "autorizada" | "en-camino" | "sin-factura-viva" | "simulada";
}): { ok: true } | { ok: false; motivo: MotivoAjusteCobradoRechazado } {
  if (!input.existe) return { ok: false, motivo: "no-existe" };
  if (input.status === "CANCELLED" || input.status === "DELIVERED") return { ok: false, motivo: "terminal" };
  if (input.yaAjustado) return { ok: false, motivo: "ya-ajustado" };
  if (!input.tieneVenta || input.otrosCobros) return { ok: false, motivo: "sin-asiento" };
  if (input.factura === "autorizada") return { ok: false, motivo: "facturada" };
  if (input.factura === "en-camino") return { ok: false, motivo: "factura-en-camino" };
  return { ok: true };
}

export function mensajeAjusteCobradoRechazado(motivo: MotivoAjusteCobradoRechazado, ctx?: { hoy?: DayKey; cerradoHasta?: DayKey | null }): string {
  switch (motivo) {
    case "no-existe":
      return "Ese pedido ya no existe.";
    case "terminal":
      return "Ese pedido ya está entregado o anulado: no se edita.";
    case "ya-ajustado":
      return "Este pedido ya se ajustó una vez por el peso real y la diferencia ya está en la caja. Si hay que cambiarlo de nuevo, anulá la venta y volvé a cargarla.";
    case "sin-asiento":
      return "Este pedido se cobró con varios medios o quedó a cuenta, así que el peso no se ajusta acá: anulá la venta y volvé a cargarla con el peso real.";
    case "facturada":
      return mensajeFacturaViva("autorizada", "venta");
    case "facturada-peso-mas":
      return (
        "Este pedido ya tiene factura y pesó más: una factura emitida no se agranda. Dejá el peso como " +
        "estaba y cobrá lo que falta como una venta aparte, con su propia factura."
      );
    case "factura-en-camino":
      return mensajeFacturaViva("en-camino", "venta");
    case "factura-anulada":
      return (
        "La factura de este pedido ya está anulada entera con notas de crédito: no queda nada que acreditar " +
        "por el peso. Revisalo en Facturación antes de devolver plata."
      );
    case "dia-cerrado": {
      const abre = ctx?.cerradoHasta ? formatDayLabel(nextDayKey(ctx.cerradoHasta)) : "mañana";
      return (
        "La caja de hoy ya está cerrada y pesó menos: la devolución no puede entrar a un día ya arqueado. " +
        `Ajustalo el ${abre}, cuando la caja vuelva a estar abierta.`
      );
    }
  }
}

export class AjusteCobradoRechazado extends Error {
  readonly motivo: MotivoAjusteCobradoRechazado;
  constructor(motivo: MotivoAjusteCobradoRechazado, ctx?: { hoy?: DayKey; cerradoHasta?: DayKey | null }) {
    super(mensajeAjusteCobradoRechazado(motivo, ctx));
    this.name = "AjusteCobradoRechazado";
    this.motivo = motivo;
  }
}

/** Detalle del EGRESO de la devolución. Si se cobró por Mercado Pago, dice que se devuelve a mano. */
export function detalleDevolucionPorPeso(code: number, porMercadoPago: boolean): string {
  return `Devolución por peso real del pedido #${code}${porMercadoPago ? " · devolver por Mercado Pago (a mano)" : ""}`;
}

/** Nota del cobro que deja escrito lo pagado antes de pesar (su plata ya está en la VENTA). */
export function notaCobradoAntesDePesar(code: number): string {
  return `Pedido #${code}: cobrado antes de pesar (ya está en el libro)`;
}

export type CambioDePeso = { nombre: string; unidad: "UNIT" | "WEIGHT"; antes: number; despues: number };

/** Las líneas cuyo peso o cantidad cambió (por producto). PURA. */
export function cambiosDePeso(
  antes: readonly { productId: string | null; name: string; saleUnit: string; quantity: number }[],
  despues: readonly { productId: string | null; name: string; saleUnit: string; quantity: number }[],
): CambioDePeso[] {
  const out: CambioDePeso[] = [];
  const ids = [...new Set([...antes, ...despues].map((l) => l.productId).filter((x): x is string => Boolean(x)))];
  for (const id of ids) {
    const a = antes.filter((l) => l.productId === id);
    const d = despues.filter((l) => l.productId === id);
    const qA = a.reduce((s, l) => s + l.quantity, 0);
    const qD = d.reduce((s, l) => s + l.quantity, 0);
    if (Math.round(qA * 1000) === Math.round(qD * 1000)) continue;
    const ref = d[0] ?? a[0];
    out.push({ nombre: ref.name, unidad: ref.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT", antes: qA, despues: qD });
  }
  return out;
}

const cantidad = (q: number, unidad: CambioDePeso["unidad"]) => `${formatearCantidad(q)} ${unidad === "WEIGHT" ? "kg" : "u."}`;

export type AjusteParaElAviso = {
  cambios: CambioDePeso[];
  diferencia: DiferenciaDelAjuste;
  /** Lo cobrado antes de pesar. */
  cobrado: number;
  porMercadoPago: boolean;
};

/**
 * La frase del aviso de «listo» que explica por qué cambió la plata: «Pesó 1,31 kg de Vacío en vez
 * de 1,24 kg; te devolvemos $ 1.400 por Mercado Pago.» PURA. Sin cambio de plata, `null`.
 */
export function explicacionDelAjuste(a: AjusteParaElAviso, p: { pagado: boolean; aCobrar?: number | null }): string | null {
  if (a.diferencia.tipo === "igual") return null;
  const pesos =
    a.cambios.length === 0 || a.cambios.length > 3
      ? "Lo pesado cambió el total"
      : "Pesó " + a.cambios.map((c) => `${cantidad(c.despues, c.unidad)} de ${c.nombre} en vez de ${cantidad(c.antes, c.unidad)}`).join(", ");
  if (a.diferencia.tipo === "devolver") {
    return `${pesos}; te devolvemos ${fmtMoneyARS(a.diferencia.monto)}${a.porMercadoPago ? " por Mercado Pago" : ""}. Ya está pago.`;
  }
  if (p.pagado) return `${pesos}. Ya está pago.`;
  const falta = p.aCobrar != null && p.aCobrar > 0 ? p.aCobrar : a.diferencia.monto;
  return `${pesos}; ya pagaste ${fmtMoneyARS(a.cobrado)} y falta ${fmtMoneyARS(falta)}.`;
}

/** Lee el ajuste guardado en la auditoría (`changes` de ACCION_AJUSTE_PESO_COBRADO). PURA. */
export function leerAjusteDeLaAuditoria(changes: unknown): AjusteParaElAviso | null {
  const c = (changes && typeof changes === "object" ? changes : {}) as Record<string, unknown>;
  const r = (c.resultado && typeof c.resultado === "object" ? c.resultado : null) as Record<string, unknown> | null;
  if (!r) return null;
  const dif = r.diferencia as DiferenciaDelAjuste | undefined;
  if (!dif || (dif.tipo !== "igual" && dif.tipo !== "devolver" && dif.tipo !== "cobrar")) return null;
  const cambios = Array.isArray(r.cambios) ? (r.cambios as CambioDePeso[]).filter((x) => x && typeof x.nombre === "string") : [];
  return { cambios, diferencia: dif, cobrado: Number(r.cobrado) || 0, porMercadoPago: r.porMercadoPago === true };
}

// ── 2. PERSISTENCIA tx-scoped ───────────────────────────────────────────────

export type AjustarPesoArgs = Omit<AjustarPedidoArgs, "admiteCobrado"> & {
  /** Clave del formulario (una por apertura): el doble clic recibe el mismo resultado. */
  clave: string | null;
  /** Último día CERRADO del tenant. OBLIGATORIO (DB-5): la devolución escribe en el libro de hoy. */
  cerradoHasta: DayKey | null;
  hoy: DayKey;
  ahora: Date;
  /**
   * El negocio factura en MODO PRUEBA (ARCA simulado, `modoEnPantalla` = stub). Sólo así una venta
   * con factura simulada se ajusta y su devolución lleva nota de crédito simulada. Sin pasarlo
   * (o false): una venta facturada se rechaza como siempre.
   */
  arcaSimulado?: boolean;
};

export type ResultadoAjustePeso = AjustarPedidoResult & {
  /** Lo cobrado antes de pesar; null si el pedido no estaba cobrado (el reajuste de siempre). */
  cobrado: number | null;
  diferencia: DiferenciaDelAjuste | null;
  porMercadoPago: boolean;
  cambios: CambioDePeso[];
  /** Mismo clic otra vez: no se escribió nada. */
  repetido: boolean;
  /** Sólo si pesó menos: la nota de crédito de la devolución (o que no hacía falta: sin factura). */
  notaDeCredito?: NotaPorPeso | null;
};

const CLAVE_VALIDA = /^[A-Za-z0-9_-]{8,80}$/;

/**
 * «Pesar y ajustar» de CUALQUIER pedido en curso, cobrado o no, en la tx del llamador. Sin cobrar
 * (ni asiento en el libro): el reajuste de siempre. Cobrado: además la plata (devolución hoy o saldo).
 */
export async function ajustarPesoInTx(tx: AnulacionVentaTx, tenantId: string, args: AjustarPesoArgs): Promise<ResultadoAjustePeso> {
  const id = args.orderId;
  // El candado: el segundo clic (o la otra pestaña) espera a que éste termine y lee lo que dejó.
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;

  const clave = args.clave && CLAVE_VALIDA.test(args.clave) ? args.clave : null;
  if (clave) {
    const previo = await tx.auditLog.findFirst({
      where: { tenantId, entity: "Order", entityId: id, action: ACCION_AJUSTE_PESO_COBRADO, changes: { path: ["clave"], equals: clave } },
      select: { changes: true },
    });
    const r = (previo?.changes as { resultado?: ResultadoAjustePeso } | null)?.resultado;
    if (r) return { ...r, repetido: true };
  }

  const order = await tx.order.findFirst({
    where: { tenantId, id },
    select: { id: true, code: true, status: true, paid: true, paymentMethod: true, items: { select: { productId: true, name: true, saleUnit: true, quantity: true } } },
  });
  const venta = order
    ? await tx.cashMovement.findFirst({ where: { tenantId, orderId: id, type: "VENTA" }, select: { amount: true, method: true } })
    : null;
  const base = { orderId: id, pedidas: args.pedidas, actor: args.actor, permiteNegativo: args.permiteNegativo, promociones: args.promociones };

  // Sin plata (ni `paid` ni asiento): el reajuste de siempre, con sus reglas y sus mensajes.
  if (!order || (!order.paid && !venta)) {
    const out = await ajustarPedidoInTx(tx, tenantId, base);
    return { ...out, cobrado: null, diferencia: null, porMercadoPago: false, cambios: [], repetido: false };
  }

  const [cobros, egreso, facturas] = await Promise.all([
    tx.collection.findMany({ where: { tenantId, originType: "ORDER", originId: id }, select: { idempotencyKey: true } }),
    tx.cashMovement.findFirst({ where: { tenantId, orderId: id, type: "EGRESO" }, select: { id: true } }),
    tx.invoice.findMany({ where: { tenantId, orderId: id }, select: { id: true, status: true, cae: true, comprobanteAsociadoId: true } }),
  ]);
  const claveCobrado = claveCobradoAntesDePesar(id);
  const laFactura = facturaParaLaNota(facturas, args.arcaSimulado === true);
  const plan = planAjusteCobrado({
    existe: true,
    status: order.status,
    tieneVenta: Boolean(venta) && order.paymentMethod != null,
    yaAjustado: Boolean(egreso) || cobros.some((c) => c.idempotencyKey === claveCobrado),
    otrosCobros: cobros.length > 0,
    factura: laFactura.estado === "simulada" ? "simulada" : facturaDeLaVenta(facturas),
  });
  if (!plan.ok) throw new AjusteCobradoRechazado(plan.motivo);

  const out = await ajustarPedidoInTx(tx, tenantId, { ...base, admiteCobrado: true });
  const cobrado = round2(Number(venta!.amount));
  const diferencia = diferenciaDelAjuste(cobrado, out.total);
  const porMercadoPago = order.paymentMethod === "MERCADOPAGO";
  const despues = await tx.orderItem.findMany({ where: { tenantId, orderId: id }, select: { productId: true, name: true, saleUnit: true, quantity: true } });
  const cambios = cambiosDePeso(order.items, despues);
  // Una factura emitida no se agranda: pesó más con factura → se rechaza y la tx vuelve atrás.
  if (laFactura.estado === "simulada" && diferencia.tipo === "cobrar") throw new AjusteCobradoRechazado("facturada-peso-mas");

  let notaDeCredito: NotaPorPeso | null = null;
  if (diferencia.tipo === "devolver") {
    // DB-5: la devolución escribe en el libro de HOY; con hoy cerrado se rechaza y la tx vuelve
    // atrás entera (líneas y stock también).
    if (args.cerradoHasta && isFrozenDay(args.hoy, args.cerradoHasta)) {
      throw new AjusteCobradoRechazado("dia-cerrado", { hoy: args.hoy, cerradoHasta: args.cerradoHasta });
    }
    // Factura ya anulada entera: la nota se rechazaría después, con la plata ya devuelta. Se frena
    // antes de tocar la caja (certificación, hallazgo 2).
    if (laFactura.estado === "simulada") {
      const [factura, notas] = await Promise.all([
        tx.invoice.findFirst({ where: { tenantId, id: laFactura.facturaId }, select: { total: true } }),
        tx.invoice.findMany({
          where: { tenantId, comprobanteAsociadoId: laFactura.facturaId, status: { in: ["PENDING", "AUTHORIZED"] } },
          select: { total: true },
        }),
      ]);
      const queda = importeDeLaNota(diferencia.monto, Number(factura?.total ?? 0), sumarAlCentavo(notas.map((n) => Number(n.total))));
      if (queda <= 0) throw new AjusteCobradoRechazado("factura-anulada");
    }
    const turno = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
    const egreso = await tx.cashMovement.create({
      data: {
        tenantId,
        sessionId: turno?.id ?? null,
        type: "EGRESO",
        method: venta!.method,
        amount: diferencia.monto,
        reason: detalleDevolucionPorPeso(order.code, porMercadoPago),
        occurredAt: args.ahora,
        orderId: id,
        createdBy: `${AJUSTE_PESO_ACTOR_PREFIX}${args.actor}`,
      },
      select: { id: true },
    });
    // Con factura (simulada): la nota de crédito por lo devuelto queda ANOTADA en esta tx y se
    // emite en otra (si falla, la devolución no se revierte). Sin factura, no hay nada que acreditar.
    notaDeCredito =
      laFactura.estado === "simulada"
        ? await anotarNotaPorPesoInTx(tx, tenantId, {
            orderId: id,
            egresoId: egreso.id,
            facturaId: laFactura.facturaId,
            importe: diferencia.monto,
            code: order.code,
            actor: args.actor,
          })
        : { estado: "sin-factura" };
  } else if (diferencia.tipo === "cobrar") {
    // Lo pagado queda como cobro del pedido SIN asiento (su plata ya es la VENTA original) y el
    // pedido vuelve a «sin cobrar»: el saldo es la diferencia (saldo-del-pedido.ts).
    await tx.collection.create({
      data: {
        tenantId,
        originType: "ORDER",
        originId: id,
        orderId: id,
        amount: cobrado,
        method: order.paymentMethod!,
        note: notaCobradoAntesDePesar(order.code),
        collectedBy: `${AJUSTE_PESO_ACTOR_PREFIX}${args.actor}`,
        idempotencyKey: claveCobrado,
      },
    });
    await tx.order.updateMany({ where: { tenantId, id }, data: { paid: false } });
  }

  const resultado: ResultadoAjustePeso = { ...out, cobrado, diferencia, porMercadoPago, cambios, repetido: false, notaDeCredito };
  // El rastro, en ESTA transacción: es la clave del doble clic y lo que lee el aviso de «listo».
  await tx.auditLog.create({
    data: {
      tenantId,
      actor: args.actor,
      action: ACCION_AJUSTE_PESO_COBRADO,
      entity: "Order",
      entityId: id,
      channel: "admin",
      changes: JSON.parse(JSON.stringify({ clave, code: order.code, total: { from: out.antes, to: out.total }, resultado })),
    },
  });
  return resultado;
}

/** El mensaje del toast después de ajustar. PURA. */
export function mensajeDelAjuste(r: ResultadoAjustePeso): string {
  const dif = round2(r.total - r.antes);
  const cuenta =
    dif === 0
      ? `El total no cambió: ${fmtMoneyARS(r.total)}.`
      : `${fmtMoneyARS(r.antes)} → ${fmtMoneyARS(r.total)} (${dif > 0 ? "+" : "−"}${fmtMoneyARS(Math.abs(dif))}).`;
  const titulo = `Pedido #${r.code} ${dif === 0 ? "actualizado" : `actualizado${r.conPeso ? " al peso real" : ""}`}: ${cuenta}`;
  if (!r.diferencia || r.diferencia.tipo === "igual") return titulo;
  if (r.diferencia.tipo === "devolver") {
    return (
      `${titulo} Devolvé ${fmtMoneyARS(r.diferencia.monto)}` +
      (r.porMercadoPago ? " desde Mercado Pago (a mano, en la cuenta del local)" : " por el mismo medio con que pagó") +
      ": la salida ya quedó en el libro de hoy." +
      fraseDeLaNota(r.notaDeCredito)
    );
  }
  return `${titulo} Ya había pagado ${fmtMoneyARS(r.cobrado ?? 0)}: quedan ${fmtMoneyARS(r.diferencia.monto)} a cobrar.`;
}
