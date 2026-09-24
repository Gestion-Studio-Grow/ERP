// ============================================================================
// EL REINTENTO DE UNA VENTA — ¿lo que llega con una clave ya grabada es lo mismo que se grabó?
// ============================================================================
//
// El mostrador manda cada venta con una clave de ticket (A-1). Si la respuesta se pierde (se
// cortó el wifi, el servidor tardó), la pantalla reintenta con LA MISMA clave, y el alta, al
// encontrarla, devuelve la venta que ya estaba grabada en vez de grabar otra.
//
// El servidor COMPARA lo que pide el reintento con las filas grabadas (`compararConLoGrabado`)
// y compara SÓLO lo que controla quien cobra:
//   · los productos y su cantidad o peso, las líneas con precio a mano (nombre e importe);
//   · el cupón (su código) y el descuento a mano;
//   · cómo se cobró (el medio, a cuenta o sin cobrar);
//   · el teléfono del cliente, por sus dígitos;
//   · en un pedido: entrega, dirección, horario y nota.
// NUNCA lo que la base decide sola: el precio de catálogo (el reintento no re-cotiza: si la
// dueña cambió el precio entre el corte y el reintento, es la misma venta), la ficha que se
// encontró por el teléfono ni el nombre que trae la ficha. Comparar eso daba "Lo que cambiaste"
// sin que la cajera hubiera tocado nada.
//
// Si lo único distinto es que ahora hay MÁS (una línea nueva, más peso de un corte), con el
// mismo medio, el mismo cliente y sin descuentos de por medio, se calcula lo que falta
// (`faltante`): la pantalla ofrece cobrar SÓLO eso. Cualquier otra diferencia (se sacó algo,
// otro medio, otro cliente, otro precio a mano, otra dirección, un descuento) no se "completa"
// con otra venta: se muestra la grabada y qué hacer (anularla y cobrar de nuevo, o dejarla así).
//
// DATO PURO: sin Prisma, sin React. Lo usan el alta (order-core.ts, que arma lo pedido), la
// respuesta al reintento (respuesta-al-reintento.ts), la pantalla (sólo tipos y textos) y los
// tests.

import { round2 } from "@/lib/round";
import { fmtMoneyARS } from "@/components/ui/format";
import { formatearCantidad } from "@/lib/pos-peso";
import { fmtDateTimeAr } from "@/lib/datetime";
import { etiquetaDeMedio } from "@/lib/caja/medio-cobro";
import { aplicarDescuento, esLineaDeEnvio, normalizarCodigoDeCupon, type PedidoDeDescuento } from "@/lib/venta-reglas";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import type { VentaTicket } from "@/app/admin/(dashboard)/vender/reglas-venta";

/** Cómo quedó (o pide quedar) la plata de la venta. */
export type CobroDeVenta = { tipo: "medio"; medio: string } | { tipo: "a-cuenta" } | { tipo: "sin-cobrar" };

/** Lo que pide un envío, SÓLO en lo que controla quien cobra (sin nada que la base re-decida). */
export type PedidoDelReintento = {
  canal: "COUNTER" | "ONLINE";
  productos: readonly { productId: string; cantidad: number }[];
  aMano: readonly { nombre: string; importe: number }[];
  /** El código del cupón, normalizado; `null` sin cupón. */
  cupon: string | null;
  /** El descuento a mano como se pidió (% o $), o `null`. */
  descuento: PedidoDeDescuento | null;
  cobro: CobroDeVenta;
  telefono: string;
  entrega: { tipo: "PICKUP" | "DELIVERY"; direccion: string | null; horario: number | null; notas: string | null };
};

/**
 * Lo pedido, desde los mismos datos que recibe el alta (`OrderInput` y sus opciones). PURA: no
 * lee la base, así que no puede traer nada que la cajera no haya mandado.
 */
export function pedidoDelReintento(
  input: {
    channel: "COUNTER" | "ONLINE";
    fulfillment: "PICKUP" | "DELIVERY";
    customerPhone: string;
    address: string | null;
    notes: string | null;
    scheduledFor: Date | null;
    paid: boolean;
    paymentMethod: string | null;
    items: readonly { productId: string; qty: number }[];
    lineasAMano?: readonly { nombre: string; importe: number }[];
  },
  opts?: { cupon?: string | null; descuento?: { pedido: PedidoDeDescuento } | null; aCuenta?: unknown } | null,
): PedidoDelReintento {
  return {
    canal: input.channel,
    productos: input.items.filter((l) => l.productId && Number.isFinite(l.qty) && l.qty > 0).map((l) => ({ productId: l.productId, cantidad: l.qty })),
    aMano: (input.lineasAMano ?? []).map((m) => ({ nombre: m.nombre, importe: m.importe })),
    cupon: normalizarCodigoDeCupon(opts?.cupon) || null,
    descuento: opts?.descuento?.pedido ?? null,
    cobro: opts?.aCuenta
      ? { tipo: "a-cuenta" }
      : input.paid && input.paymentMethod
        ? { tipo: "medio", medio: input.paymentMethod }
        : { tipo: "sin-cobrar" },
    telefono: input.customerPhone,
    entrega: {
      tipo: input.fulfillment,
      direccion: input.address,
      horario: input.scheduledFor ? input.scheduledFor.getTime() : null,
      notas: input.notes,
    },
  };
}

/** El pedido tal como está en la base (Order + sus líneas + el cupón de su fila de auditoría). */
export type VentaGrabadaLeida = {
  channel: string;
  fulfillment: string;
  customerName: string;
  customerPhone: string;
  address: string | null;
  scheduledFor: Date | null;
  notes: string | null;
  discount: number;
  total: number;
  paid: boolean;
  paymentMethod: string | null;
  items: readonly { productId: string | null; name: string; saleUnit: string; quantity: number; unitPrice: number; lineTotal?: number }[];
  /** El código del cupón con que se grabó (fila `cupon-del-pedido`), o `null`. */
  cupon: string | null;
};

/** Lo que falta cobrar como otra venta: lo que el reintento trae DE MÁS que la grabada. */
export type Faltante = {
  productos: { productId: string; nombre: string; porPeso: boolean; cantidad: number }[];
  aMano: { nombre: string; importe: number }[];
};

/** Una diferencia en palabras, y si es "de más" (se puede cobrar aparte) o no. */
export type Diferencia = { texto: string; aditiva: boolean };

export type ComparacionConLoGrabado = {
  diferencias: Diferencia[];
  /** Sólo si TODAS las diferencias son de más: lo que falta. Si no, `null`. */
  faltante: Faltante | null;
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
  /** Lo que se puede cobrar aparte (sólo si todo lo distinto es "de más" y no está anulada). */
  faltante: Faltante | null;
  /** Lo grabado, para verlo en la pantalla (sólo si la pantalla pidió el ticket). */
  ticket?: VentaTicket;
};

function textoComparable(s: string | null): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}
function nombreComparable(s: string): string {
  return textoComparable(s).toLowerCase();
}
const q3 = (n: number) => Math.round(n * 1000) / 1000;

function textoDeCobro(c: CobroDeVenta): string {
  return c.tipo === "a-cuenta" ? "a cuenta" : c.tipo === "sin-cobrar" ? "sin cobrar" : `en ${etiquetaDeMedio(c.medio)}`;
}
function mismoCobro(a: CobroDeVenta, b: CobroDeVenta): boolean {
  return a.tipo === b.tipo && (a.tipo !== "medio" || a.medio === (b as { medio: string }).medio);
}
function textoDeEntrega(t: "PICKUP" | "DELIVERY"): string {
  return t === "DELIVERY" ? "envío a domicilio" : "retira en el local";
}
function cantidadDe(l: { porPeso: boolean; cantidad: number }): string {
  return `${formatearCantidad(l.cantidad)} ${l.porPeso ? "kg" : "u"}`;
}

/** Cómo quedó la plata de una fila de Order: `paid` sin medio es a cuenta (`esVentaACuenta`). */
export function cobroGrabado(o: { paid: boolean; paymentMethod: string | null }): CobroDeVenta {
  if (o.paid && o.paymentMethod) return { tipo: "medio", medio: o.paymentMethod };
  if (o.paid) return { tipo: "a-cuenta" };
  return { tipo: "sin-cobrar" };
}

/**
 * Qué pidió el reintento que NO es lo grabado (una frase por cosa, marcada "de más" o no) y, si
 * todo es de más, lo que falta. PURA. `catalogo` sólo pone el NOMBRE y la unidad de un producto
 * que no está en la grabada (para decirlo en palabras): nunca un precio.
 */
export function compararConLoGrabado(
  grabada: VentaGrabadaLeida,
  pedido: PedidoDelReintento,
  catalogo: ReadonlyMap<string, { nombre: string; porPeso: boolean }> = new Map(),
): ComparacionConLoGrabado {
  const d: Diferencia[] = [];
  const no = (texto: string) => d.push({ texto, aditiva: false });
  const faltante: Faltante = { productos: [], aMano: [] };

  const canal = grabada.channel === "ONLINE" ? "ONLINE" : "COUNTER";
  if (canal !== pedido.canal) {
    const que = (c: string) => (c === "ONLINE" ? "un pedido" : "una venta de mostrador");
    no(`Se grabó como ${que(canal)}; ahora es ${que(pedido.canal)}.`);
  }

  // Productos: por id, sumando si se repiten; el peso a gramos.
  const lineasGrabadas = grabada.items.filter((it) => !esLineaDeEnvio(it));
  const g = new Map<string, { nombre: string; porPeso: boolean; cantidad: number }>();
  for (const it of lineasGrabadas) {
    if (!it.productId) continue;
    const previo = g.get(it.productId);
    if (previo) previo.cantidad = q3(previo.cantidad + it.quantity);
    else g.set(it.productId, { nombre: it.name.trim(), porPeso: it.saleUnit === "WEIGHT", cantidad: q3(it.quantity) });
  }
  const p = new Map<string, number>();
  for (const l of pedido.productos) p.set(l.productId, q3((p.get(l.productId) ?? 0) + l.cantidad));
  for (const [id, lg] of g) {
    const cant = p.get(id);
    if (cant === undefined) no(`${lg.nombre}: se grabó ${cantidadDe(lg)}; ahora no está.`);
    else if (cant < lg.cantidad) no(`${lg.nombre}: se grabó ${cantidadDe(lg)}; ahora ${cantidadDe({ ...lg, cantidad: cant })}.`);
    else if (cant > lg.cantidad) {
      d.push({ texto: `${lg.nombre}: se grabó ${cantidadDe(lg)}; ahora ${cantidadDe({ ...lg, cantidad: cant })}.`, aditiva: true });
      faltante.productos.push({ productId: id, nombre: lg.nombre, porPeso: lg.porPeso, cantidad: q3(cant - lg.cantidad) });
    }
  }
  for (const [id, cant] of p) {
    if (g.has(id)) continue;
    const c = catalogo.get(id) ?? { nombre: "Un producto", porPeso: false };
    d.push({ texto: `${c.nombre} ${cantidadDe({ porPeso: c.porPeso, cantidad: cant })}: no está en la grabada.`, aditiva: true });
    faltante.productos.push({ productId: id, nombre: c.nombre, porPeso: c.porPeso, cantidad: cant });
  }

  // Precio a mano: por nombre e importe, contando cuántas veces.
  const claveAMano = (nombre: string, importe: number) => `${nombreComparable(nombre)}|${round2(importe)}`;
  const gm = new Map<string, { nombre: string; importe: number; n: number }>();
  for (const it of lineasGrabadas) {
    if (it.productId) continue;
    const importe = round2(it.lineTotal ?? it.quantity * it.unitPrice);
    const k = claveAMano(it.name, importe);
    gm.set(k, { nombre: it.name.trim(), importe, n: (gm.get(k)?.n ?? 0) + 1 });
  }
  const pm = new Map<string, { nombre: string; importe: number; n: number }>();
  for (const m of pedido.aMano) {
    const k = claveAMano(m.nombre, m.importe);
    pm.set(k, { nombre: m.nombre.trim(), importe: round2(m.importe), n: (pm.get(k)?.n ?? 0) + 1 });
  }
  for (const [k, mg] of gm) {
    const n = pm.get(k)?.n ?? 0;
    if (n < mg.n) no(`${mg.nombre} (precio a mano ${fmtMoneyARS(mg.importe)}): se grabó; ahora no está.`);
  }
  for (const [k, mp] of pm) {
    const extra = mp.n - (gm.get(k)?.n ?? 0);
    if (extra <= 0) continue;
    d.push({ texto: `${mp.nombre} (precio a mano ${fmtMoneyARS(mp.importe)}): no está en la grabada.`, aditiva: true });
    for (let i = 0; i < extra; i++) faltante.aMano.push({ nombre: mp.nombre, importe: mp.importe });
  }
  const cambiaronLineas = d.length > 0;

  // Descuento: el cupón por su código; el descuento a mano, en pesos sobre lo que se grabó (las
  // mismas líneas, a los precios de la grabada: el reintento no re-cotiza).
  const cupon = (x: string | null) => (x ? `el cupón ${x}` : "sin cupón");
  const cuponGrabado = grabada.cupon ? normalizarCodigoDeCupon(grabada.cupon) : null;
  if ((cuponGrabado ?? "") !== (pedido.cupon ?? "")) {
    no(`Cupón: se grabó ${cupon(cuponGrabado)}; ahora ${cupon(pedido.cupon)}.`);
  } else if (!pedido.cupon) {
    const base = round2(lineasGrabadas.reduce((s, it) => s + (it.lineTotal ?? round2(it.quantity * it.unitPrice)), 0));
    const pedidoDesc = pedido.descuento ? aplicarDescuento({ subtotal: base, pedido: pedido.descuento, topePct: null }) : null;
    const monto = pedidoDesc ? (pedidoDesc.ok ? pedidoDesc.descuento : null) : 0;
    if (monto === null || round2(monto) !== round2(grabada.discount)) {
      const ahora = monto === null ? "uno que no se puede aplicar" : `−${fmtMoneyARS(monto)}`;
      no(`Descuento: se grabó −${fmtMoneyARS(grabada.discount)}; ahora ${ahora}.`);
    }
  }
  // Con descuento o cupón de por medio, lo "de más" no se cobra aparte: el descuento de la
  // grabada se calculó sobre otras líneas, y el de lo que falta no existe.
  const hayDescuento = grabada.discount > 0 || pedido.cupon !== null || pedido.descuento !== null;
  if (cambiaronLineas && hayDescuento) {
    no(`Descuento: la venta tiene descuento y cambiaron las líneas; lo que se agregó no se puede cobrar aparte con el mismo descuento.`);
  }

  const cobro = cobroGrabado(grabada);
  if (!mismoCobro(cobro, pedido.cobro)) no(`Cómo pagó: se grabó ${textoDeCobro(cobro)}; ahora ${textoDeCobro(pedido.cobro)}.`);

  // El teléfono con la MISMA clave que la ficha ("+54 9 11 4000-0000" = "11 4000 0000").
  if (normalizarTelefono(grabada.customerPhone) !== normalizarTelefono(pedido.telefono)) {
    const t = (x: string) => (x.trim() ? x.trim() : "sin teléfono");
    no(`Teléfono del cliente: se grabó ${t(grabada.customerPhone)}; ahora ${t(pedido.telefono)}.`);
  }

  // La entrega sólo cuenta en un pedido (la venta de mostrador se lleva en el acto).
  if (canal === "ONLINE" && pedido.canal === "ONLINE") {
    const tipo = grabada.fulfillment === "DELIVERY" ? "DELIVERY" : "PICKUP";
    const ep = pedido.entrega;
    if (tipo !== ep.tipo) no(`Entrega: se grabó «${textoDeEntrega(tipo)}»; ahora «${textoDeEntrega(ep.tipo)}».`);
    if (textoComparable(grabada.address) !== textoComparable(ep.direccion)) {
      const t = (x: string | null) => (textoComparable(x) ? `«${textoComparable(x)}»` : "sin dirección");
      no(`Dirección: se grabó ${t(grabada.address)}; ahora ${t(ep.direccion)}.`);
    }
    const horario = grabada.scheduledFor ? grabada.scheduledFor.getTime() : null;
    if (horario !== (ep.horario ?? null)) {
      const t = (x: number | null) => (x == null ? "sin horario" : fmtDateTimeAr(new Date(x)));
      no(`Horario: se grabó ${t(horario)}; ahora ${t(ep.horario)}.`);
    }
    if (textoComparable(grabada.notes) !== textoComparable(ep.notas)) {
      const t = (x: string | null) => (textoComparable(x) ? `«${textoComparable(x)}»` : "sin nota");
      no(`Nota: se grabó ${t(grabada.notes)}; ahora ${t(ep.notas)}.`);
    }
  }

  const todoDeMas = d.length > 0 && d.every((x) => x.aditiva);
  return { diferencias: d, faltante: todoDeMas ? faltante : null };
}

/**
 * LA FIRMA de lo pedido: una cadena que es IGUAL para dos envíos si y sólo si el servidor los
 * trataría como la misma venta (`compararConLoGrabado`). La usa la PANTALLA para saber si un
 * reintento es la misma venta que la cortada, y por eso vive acá, al lado de la comparación: si
 * una cambia, la otra se ve en el mismo archivo, y reintento-de-venta.test.ts lo fija.
 *
 * Incluye exactamente lo que compara el servidor: productos y peso (por producto, sumados, a
 * gramos), precios a mano (nombre e importe), cupón (código), descuento PEDIDO (tipo y valor),
 * cómo se cobra, teléfono (con la clave de la ficha) y, en un pedido, la entrega. NO incluye
 * precios ni totales (la firma de antes metía el total a precios de HOY, y al recargar con otro
 * precio decía "Cambiaste la venta" sin que nadie tocara nada), ni el nombre del cliente.
 *
 * Lo que sí depende de la pantalla es QUÉ líneas le pasa: las que viajan en el formulario. Con un
 * envío en duda, eso incluye las líneas cuyo producto salió del catálogo después del corte
 * (VenderForm, `huerfana`): antes se caían del envío y de la firma, y la pantalla decía
 * "Cambiaste la venta" sola. La firma de una duda guardada se recalcula con las mismas reglas
 * (`firmaDeLoCargado`, cobro-sin-conexion.ts).
 *
 * La única diferencia a propósito: el servidor compara el descuento a mano en PESOS sobre lo
 * grabado (es lo único que la fila guarda), y la firma lo compara como se pidió. Un 10 % cambiado
 * por $1.250 a mano (el mismo monto) es "cambiaste" para la pantalla y "lo mismo" para el
 * servidor: la pantalla frena lo que la cajera sí cambió; nunca deja pasar algo que el servidor
 * rechace.
 */
export function firmaDelPedido(p: PedidoDelReintento): string {
  const productos = new Map<string, number>();
  for (const l of p.productos) productos.set(l.productId, q3((productos.get(l.productId) ?? 0) + l.cantidad));
  const aMano = new Map<string, number>();
  for (const m of p.aMano) {
    const k = `${nombreComparable(m.nombre)}|${round2(m.importe)}`;
    aMano.set(k, (aMano.get(k) ?? 0) + 1);
  }
  const orden = <T,>(m: Map<string, T>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([
    p.canal,
    orden(productos),
    orden(aMano),
    p.cupon ?? "",
    p.descuento ? [p.descuento.tipo, round2(p.descuento.valor)] : null,
    p.cobro.tipo === "medio" ? ["medio", p.cobro.medio] : [p.cobro.tipo],
    normalizarTelefono(p.telefono),
    p.canal === "ONLINE"
      ? [p.entrega.tipo, textoComparable(p.entrega.direccion), p.entrega.horario ?? null, textoComparable(p.entrega.notas)]
      : null,
  ]);
}

/** Lo que falta, en palabras: "Entraña 0,95 kg, Bolsa $500,00". */
export function textoDelFaltante(f: Faltante): string {
  return [
    ...f.productos.map((l) => `${l.nombre} ${cantidadDe(l)}`),
    ...f.aMano.map((m) => `${m.nombre} ${fmtMoneyARS(m.importe)}`),
  ].join(", ");
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
  if (g.faltante && !g.anulada) return `Lo que agregaste (${textoDelFaltante(g.faltante)}) no se registró.`;
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
