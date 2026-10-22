// ============================================================================
// UN SOLO FIADO (Magra, tanda 2 · 2D) — magra-DISENO.md E14 · E17 · MG-058.
// ============================================================================
//
// Hasta acá había DOS fiados distintos: el «Queda a cobrar» de la bandeja (el pedido queda
// «Entregado · a cobrar» y no aparece en la ficha de la clienta) y el «A cuenta» de Vender (una
// `AccountReceivable` en su cuenta corriente). Con el mostrador boutique y las cuentas corrientes
// prendidas en el negocio, hay UNO: entregar sin cobrar deja la deuda en la cuenta del cliente,
// con el MISMO modelo que «A cuenta» (order-core.ts, `aCuenta`):
//
//   · el pedido queda ENTREGADO y saldado contra la cuenta corriente (`paid` true, sin medio):
//     nunca más se cobra como pedido (`cobrarPedido` contesta «ya estaba cobrado»), así que la
//     misma plata no se puede cobrar dos veces por dos caminos;
//   · la deuda es UNA `AccountReceivable` con `orderId`, por el saldo del pedido (el total menos
//     una seña si la hubiera); se cobra parcial o total desde «Fiado y cuentas de clientes», con
//     su asiento en el libro (`collectReceivable`, cuentas corrientes prendidas);
//   · anular el pedido anula su deuda en la misma transacción (`anularCuentaDeLaVentaEnTx`).
//
// EL CONTRATO DE LA ENTREGA (para la bandeja en columnas, 2C, y para cualquier pantalla que
// entregue): el ÚNICO lugar del servidor que crea el fiado de un pedido es `entregarAlFiadoEnTx`
// (o `registrarFiadoDelPedidoEnTx` para un pedido ya entregado), y lo llama `entregarPedido`
// (order-actions.ts) cuando llega `quedaACobrar=on` y `fiadoAlEntregar` dice que va. Ninguna
// pantalla crea la deuda por su cuenta. Sin ficha, o con el fiado apagado, la entrega es la de
// siempre: «Entregado · a cobrar» en la bandeja.
//
// IDEMPOTENTE: la deuda nace con un compare-and-set sobre el pedido (`paid` false → true, con el
// pedido ENTREGADO), en la misma transacción que la marca de entregado. Dos entregas a la vez:
// la segunda espera el candado de la fila, encuentra el pedido ya entregado y saldado, y no crea
// nada. Además, si ya hay una deuda con ese `orderId`, no se crea otra.
//
// Este archivo NO importa nada de servidor con valor (Prisma entra sólo como tipo): lo puro lo
// pueden usar las pantallas, y las funciones `…EnTx` reciben la transacción del llamador
// (`tenantTransaction`, con el GUC de RLS) y llevan el `tenantId` en cada consulta.

import type { Prisma } from "@/generated/prisma/client";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { dayOfWeekForDate } from "@/lib/datetime";

type Tx = Prisma.TransactionClient;

// ── 1. ¿La entrega sin cobrar va a la cuenta del cliente? ─────────────────────

export type MotivoSinFiado =
  /** Sin mostrador boutique o sin cuentas corrientes en el negocio: la entrega de siempre. */
  | "apagado"
  /** El negocio no tiene la app «Fiado y cuentas de clientes»: no habría dónde cobrarla. */
  | "sin-app"
  /** El pedido no tiene ficha: no hay cuenta donde dejarla. */
  | "sin-ficha";

export type DecisionFiado = { va: true } | { va: false; motivo: MotivoSinFiado };

/** ¿«Queda a cobrar» deja la deuda en la cuenta del cliente? PURA. */
export function fiadoAlEntregar(p: {
  boutique: boolean;
  cuentasCorrientes: boolean;
  /** ¿El DUEÑO de este negocio puede abrir «Fiado y cuentas de clientes»? (módulo, rubro, edición) */
  appCuentas: boolean;
  clientId: string | null | undefined;
}): DecisionFiado {
  if (!p.boutique || !p.cuentasCorrientes) return { va: false, motivo: "apagado" };
  if (!p.appCuentas) return { va: false, motivo: "sin-app" };
  if (!p.clientId) return { va: false, motivo: "sin-ficha" };
  return { va: true };
}

/** Lo que dice la entrega cuando la deuda quedó en la cuenta del cliente. PURA. */
export function mensajeEntregaAlFiado(p: { code: number; cliente: string; monto: string }): string {
  const quien = p.cliente.trim() || "el cliente";
  return `Pedido #${p.code} entregado sin cobrar: quedó en la cuenta de ${quien}, que debe ${p.monto} por este pedido. Se cobra desde su ficha.`;
}

/** Lo que dice la entrega sin cobrar de un pedido sin ficha, con el fiado prendido. PURA. */
export function mensajeEntregaSinFicha(code: number): string {
  return `Pedido #${code} entregado sin cobrar. No tiene ficha de cliente, así que no va a una cuenta: sigue en la bandeja como «Entregado · a cobrar» hasta que se cobre.`;
}

// ── 2. La plata: una sola deuda por pedido ────────────────────────────────────

export type ResultadoFiado =
  | { tipo: "creado"; receivableId: string; monto: number; clientId: string; code: number }
  | { tipo: "ya-estaba"; receivableId: string; code: number }
  | { tipo: "no-corresponde"; motivo: string };

/**
 * Deja en la cuenta del cliente la deuda de un pedido ENTREGADO y sin cobrar, DENTRO de la
 * transacción del llamador. Idempotente (ver arriba). No escribe el libro: no entró plata.
 */
export async function registrarFiadoDelPedidoEnTx(
  tx: Tx,
  tenantId: string,
  args: { orderId: string; actor: string },
): Promise<ResultadoFiado> {
  const orderId = String(args.orderId ?? "").trim();
  if (!tenantId || !orderId) return { tipo: "no-corresponde", motivo: "Falta identificar el pedido." };
  const o = await tx.order.findFirst({
    where: { id: orderId, tenantId },
    select: { id: true, code: true, status: true, paid: true, total: true, clientId: true },
  });
  if (!o) return { tipo: "no-corresponde", motivo: "No se encontró el pedido en este negocio." };

  const previa = await tx.accountReceivable.findFirst({ where: { tenantId, orderId: o.id }, select: { id: true } });
  if (previa) return { tipo: "ya-estaba", receivableId: previa.id, code: o.code };
  if (o.status !== "DELIVERED") return { tipo: "no-corresponde", motivo: `El pedido #${o.code} todavía no está entregado.` };
  if (o.paid) return { tipo: "no-corresponde", motivo: `El pedido #${o.code} ya está cobrado.` };
  if (!o.clientId) return { tipo: "no-corresponde", motivo: `El pedido #${o.code} no tiene ficha de cliente.` };

  // Una seña cobrada antes (cobros del pedido) no se vuelve a deber.
  const sena = await tx.collection.aggregate({
    where: { tenantId, originType: "ORDER", originId: o.id },
    _sum: { amount: true },
  });
  const monto = redondearAlCentavo(o.total - Number(sena._sum.amount ?? 0));
  if (!(monto > 0)) return { tipo: "no-corresponde", motivo: `El pedido #${o.code} no tiene saldo para dejar en la cuenta.` };

  // EL ÁRBITRO: pasar el pedido a saldado contra la cuenta. Con dos entregas a la vez, la segunda
  // espera esta fila y, al seguir, ya no la encuentra sin cobrar.
  const cas = await tx.order.updateMany({
    where: { id: o.id, tenantId, status: "DELIVERED", paid: false },
    data: { paid: true, paymentMethod: null },
  });
  if (cas.count !== 1) {
    const otra = await tx.accountReceivable.findFirst({ where: { tenantId, orderId: o.id }, select: { id: true } });
    return otra
      ? { tipo: "ya-estaba", receivableId: otra.id, code: o.code }
      : { tipo: "no-corresponde", motivo: `El pedido #${o.code} cambió mientras se entregaba: revisá la bandeja.` };
  }
  const r = await tx.accountReceivable.create({
    data: {
      tenantId,
      clientId: o.clientId,
      amount: monto,
      concept: `Pedido #${o.code}`,
      dueDate: null,
      orderId: o.id,
      createdBy: args.actor,
    },
    select: { id: true },
  });
  return { tipo: "creado", receivableId: r.id, monto, clientId: o.clientId, code: o.code };
}

/**
 * Entregar sin cobrar CON fiado, en UNA transacción: Listo → Entregado (compare-and-set, como
 * la entrega de siempre) y la deuda en la cuenta del cliente. Si el pedido no estaba Listo, no
 * toca nada (`entregado: false`); si estaba Listo pero no corresponde el fiado (lo leyó otra
 * pantalla en el medio), queda entregado como siempre, «a cobrar».
 */
export async function entregarAlFiadoEnTx(
  tx: Tx,
  tenantId: string,
  args: { orderId: string; actor: string },
): Promise<{ entregado: boolean; fiado: ResultadoFiado | null }> {
  const r = await tx.order.updateMany({
    where: { id: args.orderId, tenantId, status: "READY" },
    data: { status: "DELIVERED" },
  });
  if (r.count !== 1) return { entregado: false, fiado: null };
  return { entregado: true, fiado: await registrarFiadoDelPedidoEnTx(tx, tenantId, args) };
}

// ── 3. Lo que debe ────────────────────────────────────────────────────────────

export interface DeudaDelCliente {
  /** Todo lo que debe: la cuenta corriente más los pedidos entregados sin cobrar. Al centavo. */
  total: number;
  /** Saldo de la cuenta corriente (las `AccountReceivable` abiertas menos lo cobrado). */
  cuenta: number;
  /** Pedidos entregados sin cobrar que NO están en la cuenta (sin fiado, o de antes). */
  pedidos: { code: number; monto: number }[];
  /** La deuda más vieja que sigue abierta, o null si no debe nada. */
  desde: Date | null;
}

/** Junta lo que debe. PURA. Cada parte con saldo ≤ 0 no cuenta. */
export function deudaDelCliente(p: {
  cuentas: readonly { saldo: number; emitida: Date }[];
  pedidosSinCobrar: readonly { code: number; total: number; cobrado?: number; desde: Date }[];
}): DeudaDelCliente {
  let desde: Date | null = null;
  const masVieja = (d: Date) => {
    if (!desde || d.getTime() < desde.getTime()) desde = d;
  };
  let cuenta = 0;
  for (const c of p.cuentas) {
    const s = redondearAlCentavo(c.saldo);
    if (s <= 0) continue;
    cuenta = redondearAlCentavo(cuenta + s);
    masVieja(c.emitida);
  }
  const pedidos: { code: number; monto: number }[] = [];
  for (const o of p.pedidosSinCobrar) {
    const monto = redondearAlCentavo(o.total - (o.cobrado ?? 0));
    if (monto <= 0) continue;
    pedidos.push({ code: o.code, monto });
    masVieja(o.desde);
  }
  const total = redondearAlCentavo(pedidos.reduce((a, o) => a + o.monto, cuenta));
  return { total, cuenta, pedidos, desde };
}

/**
 * Lo que debe un cliente de ESTE negocio, leído dentro de la transacción del llamador: sus
 * cuentas abiertas con lo cobrado de cada una (la misma cuenta que la ficha y Vender) y sus
 * pedidos entregados sin cobrar. `null` si la ficha no es de este negocio.
 */
export async function deudaDelClienteEnTx(tx: Tx, tenantId: string, clientId: string): Promise<DeudaDelCliente | null> {
  const id = String(clientId ?? "").trim();
  if (!tenantId || !id) return null;
  const c = await tx.client.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!c) return null;
  const [deudas, pedidos] = await Promise.all([
    tx.accountReceivable.findMany({
      where: { tenantId, clientId: id, status: "OPEN" },
      select: { id: true, amount: true, issueDate: true },
    }),
    tx.order.findMany({
      where: { tenantId, clientId: id, status: "DELIVERED", paid: false },
      select: { id: true, code: true, total: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);
  const [cobrosCuenta, cobrosPedido] = await Promise.all([
    deudas.length
      ? tx.collection.groupBy({
          by: ["originId"],
          where: { tenantId, originType: "RECEIVABLE", originId: { in: deudas.map((d) => d.id) } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    pedidos.length
      ? tx.collection.groupBy({
          by: ["originId"],
          where: { tenantId, originType: "ORDER", originId: { in: pedidos.map((o) => o.id) } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);
  const cobrado = (g: readonly { originId: string; _sum: { amount: unknown } }[]) =>
    new Map(g.map((x) => [x.originId, Number(x._sum.amount ?? 0)]));
  const porCuenta = cobrado(cobrosCuenta);
  const porPedido = cobrado(cobrosPedido);
  return deudaDelCliente({
    cuentas: deudas.map((d) => ({ saldo: Number(d.amount) - (porCuenta.get(d.id) ?? 0), emitida: d.issueDate })),
    pedidosSinCobrar: pedidos.map((o) => ({ code: o.code, total: o.total, cobrado: porPedido.get(o.id) ?? 0, desde: o.createdAt })),
  });
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * «desde hoy» · «desde ayer» · «desde el sábado» (en la última semana) · «desde el 12/10». Los dos
 * días son del negocio («2026-10-22»). PURA.
 */
export function desdeCuando(desde: string, hoy: string): string {
  const dia = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  const dias = Math.round((dia(hoy) - dia(desde)) / 86_400_000);
  if (dias <= 0) return "desde hoy";
  if (dias === 1) return "desde ayer";
  if (dias < 7) return `desde el ${DIAS[dayOfWeekForDate(desde)]}`;
  return `desde el ${desde.slice(8, 10)}/${desde.slice(5, 7)}`;
}

// ── 4. «Recordarle» por WhatsApp ──────────────────────────────────────────────

/**
 * EL texto del recordatorio de pago, uno solo para la ficha y la bandeja. PURA.
 *
 * Con `pedido`, es EXACTAMENTE el de la bandeja en columnas (2C, `recordatorioDeCobro`,
 * pedidos-core.ts): en la integración, `recordatorioDeCobro(p)` pasa a ser
 * `recordatorioDePago({ cliente: p.cliente, negocio: p.negocio, monto: p.total, pedido: p.code })`.
 * Sin pedido, habla de la cuenta: lo que debe en total y desde cuándo.
 * Texto PROVISIONAL A CONFIRMAR con el dueño (cómo le gusta pedir la plata).
 */
export function recordatorioDePago(p: {
  cliente: string;
  negocio: string;
  /** El importe ya escrito («$25.700»). */
  monto: string;
  pedido?: number | null;
  /** «desde el sábado» (`desdeCuando`), sólo para la cuenta. */
  desde?: string | null;
}): string {
  const nombre = p.cliente.trim().split(/\s+/)[0] || "";
  const saludo = nombre && nombre.toLowerCase() !== "mostrador" ? `¡Hola ${nombre}!` : "¡Hola!";
  const cierre = "Cuando puedas, lo pagás en el local, por transferencia o con Mercado Pago. ¡Gracias!";
  if (p.pedido != null) {
    return `${saludo} Te escribimos de ${p.negocio} por el pedido #${p.pedido}: quedó pendiente el pago de ${p.monto}. ${cierre}`;
  }
  const cuando = p.desde ? ` ${p.desde}` : "";
  return `${saludo} Te escribimos de ${p.negocio}: en tu cuenta quedó pendiente ${p.monto}${cuando}. ${cierre}`;
}

// ── 5. «Venderle» y «Repetir» desde la ficha ──────────────────────────────────

export const RUTA_VENDER = "/admin/vender";

/** Vender con el cliente ya elegido. */
export function hrefVenderle(clientId: string): string {
  return `${RUTA_VENDER}?cliente=${encodeURIComponent(clientId)}`;
}

/** Vender con el cliente y los renglones de un pedido suyo (lo por kilo pide el peso). */
export function hrefRepetir(clientId: string, code: number): string {
  return `${hrefVenderle(clientId)}&repetir=${encodeURIComponent(String(code))}`;
}

export interface PedidoDeVenta {
  clienteId: string | null;
  repetir: number | null;
}

/** Lee `?cliente=…&repetir=…` de Vender. Lo que no tiene forma, no cuenta. PURA. */
export function leerPedidoDeVenta(params: { cliente?: string | string[]; repetir?: string | string[] }): PedidoDeVenta {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const cliente = uno(params.cliente).trim();
  const repetir = uno(params.repetir).trim();
  const clienteId = /^[A-Za-z0-9_-]{1,64}$/.test(cliente) ? cliente : null;
  const code = /^\d{1,9}$/.test(repetir) ? Number(repetir) : null;
  return { clienteId, repetir: clienteId && code !== null && code > 0 ? code : null };
}

export interface RenglonARepetir {
  productId: string;
  nombre: string;
  porPeso: boolean;
  /**
   * Lo que va en el campo de cantidad del renglón de Vender (`Line.qtyText`). Por kilo va VACÍO:
   * el peso de hoy no es el de la otra vez, se pesa de nuevo (E17). Por unidad, la misma cantidad.
   */
  qtyText: string;
}

/**
 * Los renglones de un pedido anterior que se pueden volver a vender. PURA. El envío y lo cargado
 * a mano no se repiten (el envío se cotiza de nuevo; lo a mano pide su motivo); un producto que
 * ya no está a la venta se nombra en `omitidos`.
 */
export function renglonesParaRepetir(
  items: readonly { productId: string | null; name: string; quantity: number; saleUnit: string }[],
  vigentes: ReadonlySet<string>,
): { renglones: RenglonARepetir[]; omitidos: string[] } {
  const renglones: RenglonARepetir[] = [];
  const omitidos: string[] = [];
  for (const it of items) {
    if (!it.productId) {
      if (!/^env[ií]o\b/i.test(it.name.trim())) omitidos.push(it.name);
      continue;
    }
    if (!vigentes.has(it.productId)) {
      omitidos.push(it.name);
      continue;
    }
    const porPeso = it.saleUnit === "WEIGHT";
    renglones.push({
      productId: it.productId,
      nombre: it.name,
      porPeso,
      qtyText: porPeso ? "" : String(Math.max(1, Math.round(it.quantity))),
    });
  }
  return { renglones, omitidos };
}

export interface RepetirPedido {
  code: number;
  renglones: RenglonARepetir[];
  omitidos: string[];
}

/**
 * Los renglones de «Repetir» del pedido `code` de ESTE cliente en ESTE negocio, o null si el
 * pedido no es suyo (otro cliente, otro negocio, anulado). Dentro de la transacción del llamador.
 */
export async function repetirPedidoEnTx(tx: Tx, tenantId: string, clientId: string, code: number): Promise<RepetirPedido | null> {
  if (!tenantId || !clientId || !Number.isInteger(code) || code <= 0) return null;
  const o = await tx.order.findFirst({
    where: { tenantId, code, clientId, status: { not: "CANCELLED" } },
    select: {
      code: true,
      items: { select: { productId: true, name: true, quantity: true, saleUnit: true }, orderBy: { id: "asc" } },
    },
  });
  if (!o) return null;
  const ids = [...new Set(o.items.map((i) => i.productId).filter((x): x is string => Boolean(x)))];
  const vivos = ids.length
    ? await tx.product.findMany({ where: { tenantId, id: { in: ids }, active: true }, select: { id: true } })
    : [];
  return { code: o.code, ...renglonesParaRepetir(o.items, new Set(vivos.map((p) => p.id))) };
}
