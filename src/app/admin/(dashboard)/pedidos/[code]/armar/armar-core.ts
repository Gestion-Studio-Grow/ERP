// ============================================================================
// ARMAR Y PESAR — las cuentas de la pantalla, PURAS (Magra, tanda 1 · 1C; magra-DISENO.md §2.2).
// ============================================================================
//
// La pantalla `pedidos/[code]/armar` y sus acciones de servidor usan ESTAS funciones: lo que se
// ve antes de guardar es lo que el servidor va a grabar.
//
//   · El precio es el del PEDIDO, nunca el de hoy (order-anulacion.ts `lineasDelAjuste`): cada
//     renglón lleva su `unitPrice` congelado. La cuenta del renglón es `round2(cantidad × precio)`,
//     la misma de `lineasDelAjuste`; el descuento, el de `descuentoDelAjuste` (venta-reglas.ts).
//   · El desvío se mide contra lo que PIDIÓ la clienta: la cantidad original queda en AuditLog al
//     primer ajuste (`ACCION_PEDIDO_ORIGINAL`). Sin esa fila, lo pedido es lo que tiene hoy.
//   · El peso implausible («1500» por 1,5 kg) FRENA: `confirmacionDePeso` (pos-peso.ts), la misma
//     pregunta que en Vender.
//
// Sin Prisma, sin React, sin nada de servidor: lo importan el client component y las acciones.

import { round2 } from "@/lib/round";
import {
  cantidadParaFormulario,
  confirmacionDePeso,
  formatearCantidad,
  leerCantidad,
  pesoPorConfirmar,
  redondearCantidad,
  TOLERANCIA_DEL_PESO,
} from "@/lib/pos-peso";
import { descuentoDelAjuste, envioDeLasLineas, esLineaDeEnvio } from "@/lib/venta-reglas";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import type { LecturaUnica } from "@/lib/lector/decidir-lectura";

/** La fila de AuditLog con lo que pidió la clienta, escrita una sola vez, al primer ajuste. */
export const ACCION_PEDIDO_ORIGINAL = "pedido-original";
/** La constancia del aviso de la diferencia (no cuenta como «avisado que está listo»). */
export const TIPO_AVISO_DIFERENCIA = "diferencia-de-peso";

export type Unidad = "UNIT" | "WEIGHT";

/** Un renglón del pedido como está guardado. */
export type LineaDelPedido = {
  productId: string | null;
  name: string;
  saleUnit: Unidad;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/** Lo que pidió la clienta, como queda en la fila `pedido-original`. */
export type PedidoOriginal = {
  lineas: { productId: string | null; name: string; saleUnit: Unidad; quantity: number; unitPrice: number }[];
  subtotal: number;
  descuento: number;
  total: number;
};

/** Un renglón de la pantalla (sólo los que tienen producto: el envío y lo a mano no se arman). */
export type RenglonDelArmado = {
  key: number;
  productId: string;
  nombre: string;
  unidad: Unidad;
  /** Precio del PEDIDO (por kg o por unidad). */
  precio: number;
  /** Lo que pidió la clienta. */
  pidio: number;
  /** Lo que tiene el pedido hoy (si ya se pesó una vez, esa pesada). */
  guardado: number;
  /** Lo escrito en el campo («0,62»). "0" = se saca. */
  texto: string;
  /** Tildado: ya está en la bolsa (o se decidió sacarlo). */
  listo: boolean;
  /** El peso implausible que la persona confirmó («Sí, son 1500 kg»), o null. */
  confirmado: number | null;
};

/** La fila guardada → lo que pidió la clienta. null si no se entiende (se usa lo de hoy). */
export function leerPedidoOriginal(changes: unknown): PedidoOriginal | null {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as { lineas?: unknown; subtotal?: unknown; descuento?: unknown; total?: unknown };
  if (!Array.isArray(c.lineas)) return null;
  const lineas: PedidoOriginal["lineas"] = [];
  for (const l of c.lineas as unknown[]) {
    if (!l || typeof l !== "object") return null;
    const x = l as Record<string, unknown>;
    if (typeof x.quantity !== "number" || typeof x.unitPrice !== "number" || typeof x.name !== "string") return null;
    if (x.saleUnit !== "UNIT" && x.saleUnit !== "WEIGHT") return null;
    lineas.push({
      productId: typeof x.productId === "string" ? x.productId : null,
      name: x.name,
      saleUnit: x.saleUnit,
      quantity: x.quantity,
      unitPrice: x.unitPrice,
    });
  }
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const subtotal = n(c.subtotal);
  const descuento = n(c.descuento);
  const total = n(c.total);
  if (subtotal === null || descuento === null || total === null) return null;
  return { lineas, subtotal, descuento, total };
}

/** Lo que se guarda como «pedido original» (el pedido tal como está antes del primer ajuste). */
export function pedidoOriginalDe(o: { items: readonly LineaDelPedido[]; subtotal: number; discount: number; total: number }): PedidoOriginal {
  return {
    lineas: o.items.map((it) => ({
      productId: it.productId,
      name: it.name,
      saleUnit: it.saleUnit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
    subtotal: o.subtotal,
    descuento: o.discount,
    total: o.total,
  };
}

/**
 * Los renglones de la pantalla. Cada renglón con producto busca su cantidad original (el mismo
 * producto, en el mismo orden de aparición); si no hay fila original, lo pedido es lo de hoy.
 */
export function renglonesDelArmado(items: readonly LineaDelPedido[], original: PedidoOriginal | null): RenglonDelArmado[] {
  const usados = new Map<string, number>();
  const out: RenglonDelArmado[] = [];
  items.forEach((it, i) => {
    if (!it.productId) return;
    const vez = usados.get(it.productId) ?? 0;
    usados.set(it.productId, vez + 1);
    const delOriginal = original?.lineas.filter((l) => l.productId === it.productId)[vez];
    out.push({
      key: i,
      productId: it.productId,
      nombre: it.name,
      unidad: it.saleUnit,
      precio: it.unitPrice,
      pidio: delOriginal ? delOriginal.quantity : it.quantity,
      guardado: it.quantity,
      texto: formatearCantidad(it.quantity),
      listo: false,
      confirmado: null,
    });
  });
  return out;
}

/** La cantidad que vale hoy en el renglón (0 si se saca o si lo escrito no se entiende). */
export function cantidadDe(r: Pick<RenglonDelArmado, "texto">): { qty: number; invalida: boolean } {
  const l = leerCantidad(r.texto);
  return l.estado === "ok" ? { qty: l.valor, invalida: false } : { qty: 0, invalida: l.estado === "invalida" };
}

export type RenglonCalculado = RenglonDelArmado & {
  qty: number;
  invalida: boolean;
  total: number;
  /** Contra lo que pidió la clienta, en kg (o unidades) y en $ al precio del pedido. */
  difCantidad: number;
  difPlata: number;
  /** Desvío relativo contra lo pedido (0,24 = +24 %); sólo por kilo y con las dos cantidades. */
  desvio: number | null;
  /** El desvío pasa la tolerancia (±15 %, provisional a confirmar con Magra). */
  avisar: boolean;
  /** El peso es implausible y todavía no se confirmó: frena. */
  frena: boolean;
};

export type CuentaDelArmado = {
  renglones: RenglonCalculado[];
  /** Lo que pidió la clienta (la fila original; si no hay, el total de hoy). */
  totalPedido: number;
  subtotal: number;
  descuento: number;
  /** El % del descuento (el de la venta, o el del cupón), para el texto. */
  porcentajeDescuento: number;
  total: number;
  /** total − totalPedido. */
  diferencia: number;
  envio: number;
  listos: number;
  /** El renglón con más desvío arriba de la tolerancia (para el aviso), o null. */
  mayorDesvio: RenglonCalculado | null;
  /** El primer renglón con un peso por confirmar, o null. */
  porConfirmar: RenglonCalculado | null;
  hayInvalida: boolean;
  sinLineas: boolean;
  /** ¿Cambió alguna cantidad contra lo guardado? */
  cambio: boolean;
};

/**
 * La cuenta entera. `aMano`: las líneas sin producto (envío, precio a mano), que quedan igual.
 * `antes`: el subtotal y el descuento GUARDADOS hoy (la base de `descuentoDelAjuste`, como el
 * servidor) y el cupón, si el pedido tuvo uno.
 */
export function cuentaDelArmado(
  renglones: readonly RenglonDelArmado[],
  aMano: readonly LineaDelPedido[],
  antes: { subtotal: number; descuento: number; cupon?: { tipo: "PERCENT" | "FIXED"; valor: number } | null; totalPedido: number },
): CuentaDelArmado {
  const calculados: RenglonCalculado[] = renglones.map((r) => {
    const { qty, invalida } = cantidadDe(r);
    const total = round2(redondearCantidad(qty) * r.precio);
    const totalPidio = round2(redondearCantidad(r.pidio) * r.precio);
    const difCantidad = redondearCantidad(qty - r.pidio);
    const desvio = r.unidad === "WEIGHT" && r.pidio > 0 && qty > 0 ? (qty - r.pidio) / r.pidio : null;
    return {
      ...r,
      qty,
      invalida,
      total,
      difCantidad,
      difPlata: round2(total - totalPidio),
      desvio,
      // El mismo borde que `desvioDelPeso` (pos-peso.ts): justo 15 % no avisa.
      avisar: desvio !== null && Math.abs(desvio) > TOLERANCIA_DEL_PESO + 0.0005,
      frena: !invalida && pesoPorConfirmar({ valor: qty, saleUnit: r.unidad, confirmado: r.confirmado }),
    };
  });
  const subtotal = round2(calculados.reduce((s, l) => s + l.total, 0) + aMano.reduce((s, l) => s + l.lineTotal, 0));
  const envio = envioDeLasLineas(aMano);
  const { descuento, porcentaje } = descuentoDelAjuste({
    descuentoAntes: antes.descuento,
    subtotalAntes: antes.subtotal,
    subtotalNuevo: subtotal,
    envio,
    cupon: antes.cupon ?? null,
  });
  const total = round2(subtotal - descuento);
  const conAviso = calculados.filter((l) => l.avisar);
  const mayorDesvio = conAviso.length
    ? conAviso.reduce((a, b) => (Math.abs(b.desvio ?? 0) > Math.abs(a.desvio ?? 0) ? b : a))
    : null;
  return {
    renglones: calculados,
    totalPedido: antes.totalPedido,
    subtotal,
    descuento,
    porcentajeDescuento: porcentaje,
    total,
    diferencia: round2(total - antes.totalPedido),
    envio,
    listos: calculados.filter((l) => l.listo).length,
    mayorDesvio,
    porConfirmar: calculados.find((l) => l.frena) ?? null,
    hayInvalida: calculados.some((l) => l.invalida),
    sinLineas: !calculados.some((l) => l.qty > 0) && aMano.length === 0,
    cambio: calculados.some((l) => redondearCantidad(l.qty) !== redondearCantidad(l.guardado)),
  };
}

/** «+0,12 kg» / «−2 u» / «0 kg». */
export function textoDifCantidad(dif: number, unidad: Unidad): string {
  const signo = dif > 0 ? "+" : dif < 0 ? "−" : "";
  return `${signo}${formatearCantidad(Math.abs(dif))} ${unidad === "WEIGHT" ? "kg" : "u"}`;
}

/** «+$3.432» / «−$1.430» / «$0». */
export function textoDifPlata(dif: number): string {
  const signo = dif > 0 ? "+" : dif < 0 ? "−" : "";
  return `${signo}${textoPlata(Math.abs(dif))}`;
}

/** «24 % más» / «10 % menos». */
export function textoDelDesvio(desvio: number): string {
  const pct = Math.round(Math.abs(desvio) * 100);
  return `${pct} % ${desvio > 0 ? "más" : "menos"}`;
}

/** Lo que viaja a `updateOrderItems`: id y, por renglón con cantidad, productId + quantity. */
export function camposDelArmado(id: string, renglones: readonly RenglonDelArmado[]): [string, string][] {
  const out: [string, string][] = [["id", id]];
  for (const r of renglones) {
    const { qty } = cantidadDe(r);
    if (!(qty > 0)) continue;
    out.push(["productId", r.productId], ["quantity", cantidadParaFormulario(qty)]);
  }
  return out;
}

/** «No, es 1,5 kg»: el renglón queda con el peso corregido. */
export function corregirPeso(r: RenglonDelArmado): RenglonDelArmado {
  const c = confirmacionDePeso({ valor: cantidadDe(r).qty, saleUnit: r.unidad });
  return c ? { ...r, texto: formatearCantidad(c.corregido), confirmado: null } : r;
}

/** «Sí, son 1500 kg»: queda confirmado ESE peso (si después se cambia, se vuelve a preguntar). */
export function confirmarPeso(r: RenglonDelArmado): RenglonDelArmado {
  return { ...r, confirmado: cantidadDe(r).qty };
}

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export type ResultadoDeLaLectura = {
  renglones: RenglonDelArmado[];
  /** El renglón que queda activo (el que toma el peso de la balanza), o null si no cambia. */
  activo: number | null;
  /** Lo que se dice en pantalla («Vacío: 0,62 kg»). */
  aviso: string;
  tono: "ok" | "error";
};

/**
 * Lo que hace una lectura del campo único en Armar:
 *   · etiqueta de la balanza → el renglón de ese producto (el primero sin tildar) toma el peso de
 *     la etiqueta y queda tildado; el precio sigue siendo el del pedido (no el de la etiqueta);
 *   · código de un producto por unidad → su renglón queda tildado (la cantidad, la pedida; se
 *     corrige con − / +); por kilo → su renglón queda activo, esperando el peso;
 *   · texto → el renglón cuyo nombre lo contiene queda activo;
 *   · algo que no está en el pedido → se dice y no se toca nada.
 */
export function aplicarLectura(renglones: readonly RenglonDelArmado[], l: LecturaUnica): ResultadoDeLaLectura {
  const nada = (aviso: string): ResultadoDeLaLectura => ({ renglones: [...renglones], activo: null, aviso, tono: "error" });
  if (l.tipo === "desconocida") return nada(`No se pudo leer «${l.crudo}». Probá de nuevo o buscalo por el nombre.`);
  if (l.tipo === "texto") {
    const q = sinAcentos(l.texto);
    const r = q ? renglones.find((x) => sinAcentos(x.nombre).includes(q)) : undefined;
    if (!r) return nada(`«${l.texto}» no está en este pedido.`);
    return { renglones: [...renglones], activo: r.key, aviso: `${r.nombre}: ${r.unidad === "WEIGHT" ? "pesalo" : "contalo"}.`, tono: "ok" };
  }
  const delProducto = renglones.filter((x) => x.productId === l.productId);
  if (delProducto.length === 0) return nada("Eso no está en este pedido.");
  const destino = delProducto.find((x) => !x.listo) ?? delProducto[0];
  if (l.tipo === "etiqueta") {
    if (destino.unidad !== "WEIGHT") return nada(`${destino.nombre} va por unidad: pasá su código.`);
    const texto = formatearCantidad(l.kg);
    return {
      renglones: renglones.map((x) => (x.key === destino.key ? { ...x, texto, listo: true, confirmado: null } : x)),
      activo: destino.key,
      aviso: `${destino.nombre}: ${texto} kg.`,
      tono: "ok",
    };
  }
  // Código de barras.
  if (destino.unidad === "WEIGHT") {
    return { renglones: [...renglones], activo: destino.key, aviso: `${destino.nombre}: falta el peso.`, tono: "ok" };
  }
  return {
    renglones: renglones.map((x) => (x.key === destino.key ? { ...x, listo: true } : x)),
    activo: destino.key,
    aviso: `${destino.nombre}: ${formatearCantidad(cantidadDe(destino).qty)} u.`,
    tono: "ok",
  };
}

/** «Hola Ana» (sin nombre o venta anónima: «Hola»). El mismo saludo que `avisoPedidoListo`. */
function saludo(cliente: string): string {
  const nombre = cliente.trim().split(/\s+/)[0];
  return nombre && nombre !== "Mostrador" ? `Hola ${nombre}` : "Hola";
}

/** «Vacío: pesó 0,62 kg (pediste 0,5 kg)». Sólo los renglones por kilo que se apartaron. */
export function pesosQueCambiaron(
  renglones: readonly { nombre: string; unidad: Unidad; pidio: number; qty: number }[],
): string[] {
  return renglones
    .filter((r) => r.unidad === "WEIGHT" && r.qty > 0 && redondearCantidad(r.qty) !== redondearCantidad(r.pidio))
    .map((r) => `${r.nombre}: pesó ${formatearCantidad(r.qty)} kg (pediste ${formatearCantidad(r.pidio)} kg)`);
}

/**
 * El WhatsApp «Avisar la diferencia» (MG-025): los dos pesos y el total nuevo, antes de cobrar.
 * Criollo, 1 a 1, desde el teléfono del que atiende.
 */
export function textoDeLaDiferencia(p: {
  cliente: string;
  code: number;
  negocio: string;
  renglones: readonly { nombre: string; unidad: Unidad; pidio: number; qty: number }[];
  totalPedido: number;
  total: number;
}): string {
  const pesos = pesosQueCambiaron(p.renglones);
  const detalle = pesos.length ? ` ${pesos.join("; ")}.` : "";
  const plata =
    p.total === p.totalPedido
      ? ` El total queda igual: ${textoPlata(p.total)}.`
      : ` El total queda en ${textoPlata(p.total)} (antes ${textoPlata(p.totalPedido)}).`;
  return `${saludo(p.cliente)}, te escribo de ${p.negocio} por tu pedido #${p.code}.${detalle}${plata} ¿Te lo dejamos así? Si preferís, lo ajustamos.`;
}

/**
 * Lo que suma «Listo y avisar» al aviso de siempre (`avisoPedidoListo`): el peso real y, si no
 * está pago, cómo pagar. Los medios son los del mostrador; el alias de la transferencia es
 * PROVISIONAL A CONFIRMAR con Magra (no hay dónde cargarlo todavía).
 */
export function agregadoDelListo(p: {
  renglones: readonly { nombre: string; unidad: Unidad; pidio: number; qty: number }[];
  pagado: boolean;
}): string {
  const pesos = pesosQueCambiaron(p.renglones);
  const partes: string[] = [];
  if (pesos.length) partes.push(`${pesos.join("; ")}.`);
  if (!p.pagado) partes.push("Podés pagar en efectivo, con Mercado Pago o por transferencia.");
  return partes.join(" ");
}

/** El aviso de listo con el agregado, antes del «¡Gracias!» final. */
export function avisoDelListo(base: string, agregado: string): string {
  if (!agregado) return base;
  const gracias = " ¡Gracias!";
  return base.endsWith(gracias) ? `${base.slice(0, -gracias.length)} ${agregado}${gracias}` : `${base} ${agregado}`;
}

/** Las líneas sin producto que se muestran (envío, precio a mano): quedan como están. */
export function rotuloDeLineaAMano(l: Pick<LineaDelPedido, "productId" | "name">): string {
  return esLineaDeEnvio(l) ? "Envío" : "Precio a mano";
}
