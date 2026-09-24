// ============================================================================
// EL REINTENTO DE UNA VENTA — ¿lo que llega con una clave ya grabada es lo mismo que se grabó?
// ============================================================================
//
// El mostrador manda cada venta con una clave de ticket (A-1). Si la respuesta se pierde (se
// cortó el wifi, el servidor tardó), la pantalla reintenta con LA MISMA clave, y el alta, al
// encontrarla, devuelve la venta que ya estaba grabada en vez de grabar otra.
//
// Hasta acá, esa devolución NO miraba lo que llegaba. Toda la protección vivía en la pantalla
// (la firma de cobro-sin-conexion.ts), y la pantalla no cubría todo: se cambiaba el teléfono de
// una venta A CUENTA después del corte, el reintento viajaba con la misma clave y la deuda
// quedaba en la ficha del cliente viejo con el mensaje "ya estaba registrada"; se cambiaba la
// dirección de un pedido y quedaba la vieja. El servidor decía "ya estaba" y nadie se enteraba
// de que lo que se pidió no era lo que había.
//
// Ahora el servidor compara (`diferenciasConLoGrabado`) lo que PIDE el reintento con las filas
// GRABADAS (el pedido y sus líneas; el cupón, de la fila que el alta escribe en su misma
// transacción). Sin migración: se compara contra lo que ya está en la base.
//   · Igual y vigente → se devuelve la grabada, como siempre (con su ticket, leído de la base).
//   · Distinta, o anulada → NO se graba nada nuevo, y se devuelve «ya-grabada-distinta» con la
//     venta grabada (#N, total, cliente, estado) y las diferencias EN PALABRAS: la pantalla lo
//     dice y ofrece cobrar sólo lo que falta como otra venta.
//
// DATO PURO: sin Prisma, sin React. Lo usan la Server Action (order-actions.ts), la pantalla
// (VenderForm, sólo los tipos y los textos) y los tests.

import { round2 } from "@/lib/round";
import { fmtMoneyARS } from "@/components/ui/format";
import { formatearCantidad } from "@/lib/pos-peso";
import { fmtDateTimeAr } from "@/lib/datetime";
import { etiquetaDeMedio } from "@/lib/caja/medio-cobro";
import type { VentaTicket } from "@/app/admin/(dashboard)/vender/reglas-venta";

/** Cómo quedó (o pide quedar) la plata de la venta. */
export type CobroDeVenta = { tipo: "medio"; medio: string } | { tipo: "a-cuenta" } | { tipo: "sin-cobrar" };

/** Lo que una venta o un pedido DICE, en la forma en que se compara un reintento con lo grabado. */
export type ContenidoDeVenta = {
  canal: "COUNTER" | "ONLINE";
  /** Con producto: su id. Precio a mano (o envío): `null`, y se reconoce por el nombre. */
  lineas: readonly { productId: string | null; nombre: string; porPeso: boolean; cantidad: number; precio: number }[];
  /** En pesos. `null` = no se sabe (un cupón distinto del grabado, que no se evaluó). */
  descuento: number | null;
  /** `null` = no se sabe (ídem). */
  total: number | null;
  /** El código del cupón, normalizado; `null` sin cupón. */
  cupon: string | null;
  cobro: CobroDeVenta;
  cliente: { telefono: string; nombre: string; clientId: string | null };
  entrega: { tipo: "PICKUP" | "DELIVERY"; direccion: string | null; horario: number | null; notas: string | null };
};

/** La venta ya grabada, como vuelve a la pantalla cuando el reintento no coincide o está anulada. */
export type VentaYaGrabada = {
  id: string;
  code: number;
  esPedido: boolean;
  total: number;
  /** Cómo quedó, en palabras: "cobrada en Efectivo", "a cuenta", "sin cobrar". */
  como: string;
  /** Nombre del cliente, o `null` en la venta anónima de mostrador. */
  cliente: string | null;
  telefono: string | null;
  anulada: boolean;
  /** Lo que pidió el reintento y no es lo grabado, una frase por cosa. Vacío = igual (y anulada). */
  diferencias: string[];
  /** Lo grabado, para verlo en la pantalla (sólo si la pantalla pidió el ticket). */
  ticket?: VentaTicket;
};

/** El nombre que ponen el POS y la vidriera cuando no hay cliente (el mismo de reglas-venta.ts). */
const SIN_CLIENTE = "mostrador";

function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}
function nombreComparable(s: string): string {
  const n = s.trim().replace(/\s+/g, " ").toLowerCase();
  return n === SIN_CLIENTE ? "" : n;
}
function textoComparable(s: string | null): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}
const q3 = (n: number) => Math.round(n * 1000) / 1000;

function textoDeCobro(c: CobroDeVenta): string {
  return c.tipo === "a-cuenta" ? "a cuenta" : c.tipo === "sin-cobrar" ? "sin cobrar" : `en ${etiquetaDeMedio(c.medio)}`;
}
function mismoCobro(a: CobroDeVenta, b: CobroDeVenta): boolean {
  return a.tipo === b.tipo && (a.tipo !== "medio" || a.medio === (b as { medio: string }).medio);
}
function textoDeCliente(c: ContenidoDeVenta["cliente"]): string {
  const nombre = nombreComparable(c.nombre) ? c.nombre.trim() : "";
  const tel = c.telefono.trim();
  if (nombre && tel) return `${nombre} (${tel})`;
  return nombre || tel || "sin cliente";
}
function textoDeEntrega(t: "PICKUP" | "DELIVERY"): string {
  return t === "DELIVERY" ? "envío a domicilio" : "retira en el local";
}
function cantidadDe(l: { porPeso: boolean; cantidad: number }): string {
  return `${formatearCantidad(l.cantidad)} ${l.porPeso ? "kg" : "u"}`;
}
function precioDe(l: { porPeso: boolean; precio: number }): string {
  return `${fmtMoneyARS(l.precio)}${l.porPeso ? "/kg" : ""}`;
}

type Renglon = { nombre: string; porPeso: boolean; cantidad: number; precio: number; aMano: boolean };

/** Las líneas por producto (o por nombre, las que no tienen), sumando si se repiten. */
function agrupar(lineas: ContenidoDeVenta["lineas"]): Map<string, Renglon> {
  const m = new Map<string, Renglon>();
  for (const l of lineas) {
    const clave = l.productId ?? `sin-producto:${nombreComparable(l.nombre)}:${round2(l.precio)}`;
    const previo = m.get(clave);
    if (previo) previo.cantidad = q3(previo.cantidad + l.cantidad);
    else m.set(clave, { nombre: l.nombre.trim(), porPeso: l.porPeso, cantidad: q3(l.cantidad), precio: round2(l.precio), aMano: l.productId == null });
  }
  return m;
}

/**
 * Qué pidió el reintento que NO es lo grabado, una frase por cosa ("Cliente: se grabó María
 * Pérez (11 4000 0000); ahora Juan Gómez (11 5000 0000)."). Vacía = es la misma venta. PURA.
 *
 * Se compara TODO lo que define la plata, el stock, la deuda y la entrega: canal, líneas
 * (producto, cantidad o peso, precio), descuento, cupón, total, cómo se cobró (o a cuenta),
 * cliente (teléfono, nombre y ficha) y, en un pedido, entrega, dirección, horario y nota.
 * Los números se comparan redondeados como se graban (pesos a centavos, kilos a gramos); los
 * textos sin espacios de más; el teléfono por sus dígitos ("11 4000-0000" = "1140000000").
 */
export function diferenciasConLoGrabado(grabado: ContenidoDeVenta, pedido: ContenidoDeVenta): string[] {
  const d: string[] = [];
  if (grabado.canal !== pedido.canal) {
    const que = (c: string) => (c === "ONLINE" ? "un pedido" : "una venta de mostrador");
    d.push(`Se grabó como ${que(grabado.canal)}; ahora es ${que(pedido.canal)}.`);
  }

  const g = agrupar(grabado.lineas);
  const p = agrupar(pedido.lineas);
  for (const [clave, lg] of g) {
    const lp = p.get(clave);
    if (!lp) {
      d.push(`${lg.nombre}: se grabó ${lg.aMano ? fmtMoneyARS(lg.precio) : cantidadDe(lg)}; ahora no está.`);
      continue;
    }
    if (lg.cantidad !== lp.cantidad) d.push(`${lg.nombre}: se grabó ${cantidadDe(lg)}; ahora ${cantidadDe(lp)}.`);
    if (lg.precio !== lp.precio) d.push(`${lg.nombre}: se grabó a ${precioDe(lg)}; ahora ${precioDe(lp)}.`);
  }
  for (const [clave, lp] of p) {
    if (!g.has(clave)) d.push(`${lp.nombre} ${lp.aMano ? fmtMoneyARS(lp.precio) : cantidadDe(lp)}: no está en la grabada.`);
  }

  if ((grabado.cupon ?? "") !== (pedido.cupon ?? "")) {
    const c = (x: string | null) => (x ? `el cupón ${x}` : "sin cupón");
    d.push(`Cupón: se grabó ${c(grabado.cupon)}; ahora ${c(pedido.cupon)}.`);
  }
  if (grabado.descuento !== null && pedido.descuento !== null && round2(grabado.descuento) !== round2(pedido.descuento)) {
    d.push(`Descuento: se grabó −${fmtMoneyARS(grabado.descuento)}; ahora −${fmtMoneyARS(pedido.descuento)}.`);
  }
  if (grabado.total !== null && pedido.total !== null && round2(grabado.total) !== round2(pedido.total)) {
    d.push(`Total: se grabó ${fmtMoneyARS(grabado.total)}; ahora ${fmtMoneyARS(pedido.total)}.`);
  }
  if (!mismoCobro(grabado.cobro, pedido.cobro)) {
    d.push(`Cómo pagó: se grabó ${textoDeCobro(grabado.cobro)}; ahora ${textoDeCobro(pedido.cobro)}.`);
  }

  const cg = grabado.cliente;
  const cp = pedido.cliente;
  if (soloDigitos(cg.telefono) !== soloDigitos(cp.telefono) || (cg.clientId ?? null) !== (cp.clientId ?? null)) {
    d.push(`Cliente: se grabó ${textoDeCliente(cg)}; ahora ${textoDeCliente(cp)}.`);
  } else if (nombreComparable(cg.nombre) !== nombreComparable(cp.nombre)) {
    const n = (x: string) => (nombreComparable(x) ? `«${x.trim()}»` : "sin nombre");
    d.push(`Nombre del cliente: se grabó ${n(cg.nombre)}; ahora ${n(cp.nombre)}.`);
  }

  const eg = grabado.entrega;
  const ep = pedido.entrega;
  if (eg.tipo !== ep.tipo) d.push(`Entrega: se grabó «${textoDeEntrega(eg.tipo)}»; ahora «${textoDeEntrega(ep.tipo)}».`);
  if (textoComparable(eg.direccion) !== textoComparable(ep.direccion)) {
    const t = (x: string | null) => (textoComparable(x) ? `«${textoComparable(x)}»` : "sin dirección");
    d.push(`Dirección: se grabó ${t(eg.direccion)}; ahora ${t(ep.direccion)}.`);
  }
  if ((eg.horario ?? null) !== (ep.horario ?? null)) {
    const t = (x: number | null) => (x == null ? "sin horario" : fmtDateTimeAr(new Date(x)));
    d.push(`Horario: se grabó ${t(eg.horario)}; ahora ${t(ep.horario)}.`);
  }
  if (textoComparable(eg.notas) !== textoComparable(ep.notas)) {
    const t = (x: string | null) => (textoComparable(x) ? `«${textoComparable(x)}»` : "sin nota");
    d.push(`Nota: se grabó ${t(eg.notas)}; ahora ${t(ep.notas)}.`);
  }
  return d;
}

// ── De las filas grabadas y de lo que pide el alta, a la forma comparable ───────────────────

/** El pedido tal como está en la base (Order + sus líneas + el cupón de su fila de auditoría). */
export type VentaGrabadaLeida = {
  channel: string;
  fulfillment: string;
  customerName: string;
  customerPhone: string;
  clientId: string | null;
  address: string | null;
  scheduledFor: Date | null;
  notes: string | null;
  discount: number;
  total: number;
  paid: boolean;
  paymentMethod: string | null;
  items: readonly { productId: string | null; name: string; saleUnit: string; quantity: number; unitPrice: number }[];
  /** El código del cupón con que se grabó (fila `cupon-del-pedido`), o `null`. */
  cupon: string | null;
};

/** Cómo quedó la plata de una fila de Order: `paid` sin medio es a cuenta (`esVentaACuenta`). */
export function cobroGrabado(o: { paid: boolean; paymentMethod: string | null }): CobroDeVenta {
  if (o.paid && o.paymentMethod) return { tipo: "medio", medio: o.paymentMethod };
  if (o.paid) return { tipo: "a-cuenta" };
  return { tipo: "sin-cobrar" };
}

export function contenidoGrabado(o: VentaGrabadaLeida): ContenidoDeVenta {
  return {
    canal: o.channel === "ONLINE" ? "ONLINE" : "COUNTER",
    lineas: o.items.map((it) => ({
      productId: it.productId,
      nombre: it.name,
      porPeso: it.saleUnit === "WEIGHT",
      cantidad: it.quantity,
      precio: it.unitPrice,
    })),
    descuento: o.discount,
    total: o.total,
    cupon: o.cupon,
    cobro: cobroGrabado(o),
    cliente: { telefono: o.customerPhone, nombre: o.customerName, clientId: o.clientId },
    entrega: {
      tipo: o.fulfillment === "DELIVERY" ? "DELIVERY" : "PICKUP",
      direccion: o.address,
      horario: o.scheduledFor ? o.scheduledFor.getTime() : null,
      notas: o.notes,
    },
  };
}

/** Lo que el alta decidió para ESTE envío (`AltaDecidida` de order-core.ts, más la ficha). */
export type AltaPedida = {
  input: {
    channel: "COUNTER" | "ONLINE";
    fulfillment: "PICKUP" | "DELIVERY";
    customerName: string;
    customerPhone: string;
    address: string | null;
    notes: string | null;
    scheduledFor: Date | null;
    paid: boolean;
    paymentMethod: string | null;
  };
  lines: readonly { productId: string; name: string; saleUnit: string; quantity: number; unitPrice: number }[];
  aMano: readonly { nombre: string; importe: number }[];
  subtotal: number;
  descuento: number;
  total: number;
  envio?: number;
  cupon?: string | null;
  aCuenta?: unknown;
  clientId: string | null;
};

/**
 * Lo que pide el reintento, comparable. El descuento de un CUPÓN no lo decide el alta antes de
 * la transacción (lo decide `aplicarCuponEnTx`, que además lo consume): llega en
 * `descuentoDelCupon`, calculado con la regla del cupón grabado cuando es el mismo código, o
 * `null` si es otro (no se sabe cuánto sería, y la diferencia de cupón ya se dice sola).
 */
export function contenidoPedido(a: AltaPedida, descuentoDelCupon: number | null = null): ContenidoDeVenta {
  const cupon = a.cupon || null;
  const descuento = cupon ? descuentoDelCupon : a.descuento;
  return {
    canal: a.input.channel,
    lineas: [
      ...a.lines.map((l) => ({
        productId: l.productId,
        nombre: l.name,
        porPeso: l.saleUnit === "WEIGHT",
        cantidad: l.quantity,
        precio: l.unitPrice,
      })),
      ...a.aMano.map((m) => ({ productId: null, nombre: m.nombre, porPeso: false, cantidad: 1, precio: m.importe })),
    ],
    descuento,
    total: descuento === null ? null : round2(a.subtotal - descuento),
    cupon,
    cobro: a.aCuenta
      ? { tipo: "a-cuenta" }
      : a.input.paid && a.input.paymentMethod
        ? { tipo: "medio", medio: a.input.paymentMethod }
        : { tipo: "sin-cobrar" },
    cliente: { telefono: a.input.customerPhone, nombre: a.input.customerName, clientId: a.clientId },
    entrega: {
      tipo: a.input.fulfillment,
      direccion: a.input.address,
      horario: a.input.scheduledFor ? a.input.scheduledFor.getTime() : null,
      notas: a.input.notes,
    },
  };
}

// ── Lo que se dice ──────────────────────────────────────────────────────────────────────────

/** "cobrada en Efectivo" / "a cuenta" / "sin cobrar", para la venta grabada. */
export function comoQuedo(o: { paid: boolean; paymentMethod: string | null }, esPedido: boolean): string {
  const c = cobroGrabado(o);
  if (c.tipo === "medio") return `${esPedido ? "cobrado" : "cobrada"} en ${etiquetaDeMedio(c.medio)}`;
  return c.tipo === "a-cuenta" ? "a cuenta" : "sin cobrar";
}

/** "La venta #42" / "El pedido #42". */
function laVenta(g: Pick<VentaYaGrabada, "code" | "esPedido">): string {
  return g.esPedido ? `El pedido #${g.code}` : `La venta #${g.code}`;
}

/**
 * La primera frase: qué es lo que YA está grabado. "La venta #42 ya se había grabado con
 * $15.500,00 (a cuenta, María Pérez)." Si está anulada, se dice: no es una venta vigente.
 */
export function tituloDeYaGrabada(g: VentaYaGrabada): string {
  const quien = g.cliente ? `, ${g.cliente}` : "";
  const verbo = g.esPedido ? "ya se había registrado" : "ya se había grabado";
  const base = `${laVenta(g)} ${verbo} con ${fmtMoneyARS(g.total)} (${g.como}${quien})`;
  return g.anulada ? `${base} y después se anuló.` : `${base}.`;
}

/**
 * Lo que NO se hizo: "Lo que cambiaste (Cliente: …) no se registró." Anulada y sin cambios:
 * que no se volvió a cobrar (ni a registrar).
 */
export function detalleDeYaGrabada(g: VentaYaGrabada): string {
  if (g.diferencias.length > 0) {
    const lista = g.diferencias.map((x) => x.replace(/\.$/, "")).join("; ");
    return `Lo que cambiaste (${lista}) no se registró.`;
  }
  return g.esPedido ? "No se registró otro pedido." : "No se volvió a cobrar.";
}

/** El texto entero (el `error` que ve la bandeja, que no tiene las salidas de Vender). */
export function textoDeYaGrabada(g: VentaYaGrabada): string {
  return `${tituloDeYaGrabada(g)} ${detalleDeYaGrabada(g)}`;
}

/** El reintento que coincide con lo grabado y vigente: se dice sin prometer lo que no pasó. */
export function mensajeDeYaGrabadaIgual(g: { code: number; esPedido: boolean; cobrada: boolean }): string {
  if (g.esPedido) return `Ese pedido ya estaba registrado (#${g.code}): no se registró dos veces.`;
  return g.cobrada
    ? `Esa venta ya estaba registrada (#${g.code}): no se cobró dos veces.`
    : `Esa venta ya estaba registrada (#${g.code}): no se registró dos veces.`;
}
