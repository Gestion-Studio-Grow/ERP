// ============================================================================
// REGLAS DE LA VENTA — descuento y precio a mano. PURO.
// ============================================================================
//
// Las usan la pantalla de Vender (client component, vía vender/reglas-venta.ts, que las
// re-exporta), la Server Action (`createOrder`, order-actions.ts), el núcleo del alta
// (`insertOrder`, order-core.ts, que también usan la tienda y la API) y el ajuste de un pedido
// (order-anulacion.ts). Viven acá y no en la carpeta de la pantalla para que el núcleo no
// dependa de una ruta del panel: si alguien la movía, se rompía la vidriera.
//
// DATO PURO: sin Prisma, sin React, sin nada de servidor. Si un día importara el `prisma` de
// valor, Turbopack rompería el build de /admin/vender sin que tsc lo vea.
//
// La regla de cada cosa se decide UNA vez y la aplican los dos lados: la pantalla la usa para
// avisar antes de cobrar y el servidor para rechazar, con el mismo texto.

import { round2 } from "@/lib/round";
import { leerImporte } from "@/lib/pos-peso";
import { validarMotivo, MOTIVO_MIN } from "@/lib/turnos/anulacion";
import { fmtMoneyARS } from "@/components/ui/format";
import type { Role } from "@/lib/capabilities";

// ── DESCUENTO ────────────────────────────────────────────────────────────────
//
// Se guarda en `Order.discount` (el MONTO en pesos) y el total queda en subtotal menos
// descuento. El libro de caja asienta el TOTAL (order-core.ts): si asentara el subtotal, cada
// descuento sería un sobrante falso en el arqueo por el importe descontado.

export type TipoDescuento = "porcentaje" | "monto";
export type PedidoDeDescuento = { tipo: TipoDescuento; valor: number };

/**
 * Hasta cuánto descuenta recepción, en % del subtotal de la venta. PROVISIONAL A CONFIRMAR
 * con la dueña de MAGRA: no hay todavía una pantalla de "ajustes de venta" donde fijarlo por
 * negocio, y agregarla es una columna nueva (ola 9). La dueña o el dueño no tiene tope.
 */
export const TOPE_DESCUENTO_RECEPCION_PCT = 10;

/** El tope de descuento de quien vende, en %. `null` = sin tope (la dueña o el dueño). */
export function topeDeDescuento(role: Role): number | null {
  return role === "OWNER" ? null : TOPE_DESCUENTO_RECEPCION_PCT;
}

export type ResultadoDescuento =
  | { ok: true; descuento: number; total: number; porcentaje: number }
  | { ok: false; error: string };

/**
 * El descuento en pesos y el total que queda, o el rechazo con el porqué. PURA.
 *
 *   · sin descuento (o 0)            → total = subtotal.
 *   · negativo o no numérico         → rechazo.
 *   · más del 100 % o más que el total → rechazo: no existe la venta con saldo a favor.
 *   · por encima del tope de quien vende → rechazo que dice hasta cuánto puede y a quién pedir.
 *
 * El tope se compara en PESOS (`subtotal × tope`, redondeado igual que el descuento), no en
 * porcentaje: un 10 % exacto cargado como monto no puede rebotar por un centavo de redondeo.
 */
export function aplicarDescuento(input: {
  subtotal: number;
  pedido: PedidoDeDescuento | null;
  topePct: number | null;
}): ResultadoDescuento {
  const subtotal = round2(input.subtotal);
  const p = input.pedido;
  if (!p || p.valor === 0) return { ok: true, descuento: 0, total: subtotal, porcentaje: 0 };
  if (!Number.isFinite(p.valor) || p.valor < 0) {
    return { ok: false, error: "El descuento tiene que ser un número mayor que cero." };
  }
  if (p.tipo === "porcentaje" && p.valor > 100) {
    return { ok: false, error: "Un descuento no puede pasar del 100 %." };
  }
  const descuento = p.tipo === "porcentaje" ? round2((subtotal * p.valor) / 100) : round2(p.valor);
  if (descuento > subtotal) {
    return {
      ok: false,
      error: `El descuento (${fmtMoneyARS(descuento)}) es más que el total de la venta (${fmtMoneyARS(subtotal)}).`,
    };
  }
  if (input.topePct != null) {
    const maximo = round2((subtotal * input.topePct) / 100);
    if (descuento > maximo) {
      return {
        ok: false,
        error:
          `Con tu usuario el descuento llega hasta el ${input.topePct} % (${fmtMoneyARS(maximo)} en esta venta). ` +
          "Para más, pedíselo a la dueña o al dueño del negocio.",
      };
    }
  }
  const porcentaje = subtotal > 0 ? round2((descuento / subtotal) * 100) : 0;
  return { ok: true, descuento, total: round2(subtotal - descuento), porcentaje };
}

/**
 * El descuento de un pedido que se PESA Y AJUSTA (bandeja de pedidos). PURA.
 *
 * Se conserva el PORCENTAJE que se aplicó al cargar la venta, no los pesos. Antes se
 * conservaban los pesos (topeados al subtotal nuevo) y eso era una puerta para pasar el tope
 * de recepción: 10 kg de vacío ($125.000) con el 10 % ($12.500) pasaban el alta, y al
 * ajustar a 1 kg el pedido quedaba en $12.500 − $12.500 = $0, un 100 % de descuento que nadie
 * aprobó. Y sin trampa también: cualquier pesada a la baja subía el porcentaje sin aviso.
 *
 * Escalar en proporción deja el mismo % que ya pasó por `aplicarDescuento` con el tope de
 * quien vendió, así que el ajuste no necesita volver a mirar el rol: no puede crear un
 * descuento que el alta no habría aceptado. Si el pedido sube (pesó más, o se sumó un corte),
 * el descuento sube con él, al mismo %: es lo que el cliente espera de "te hago el 10 %".
 *
 * `Order.discount` guarda sólo el monto, no si se cargó en % o en $; por eso el ajuste
 * razona siempre en %. Sin subtotal anterior no hay % que conservar: el descuento cae a cero
 * (nunca se inventa uno). Nunca pasa del subtotal nuevo: el total no queda negativo.
 */
export function descuentoDelAjuste(input: {
  descuentoAntes: number;
  subtotalAntes: number;
  subtotalNuevo: number;
}): { descuento: number; porcentaje: number } {
  const antes = round2(input.descuentoAntes || 0);
  const base = round2(input.subtotalAntes || 0);
  const nuevo = round2(input.subtotalNuevo || 0);
  if (!(antes > 0) || !(base > 0) || !(nuevo > 0)) return { descuento: 0, porcentaje: 0 };
  const descuento = Math.min(round2((antes * nuevo) / base), nuevo);
  return { descuento, porcentaje: round2((Math.min(antes, base) / base) * 100) };
}

/**
 * Lee el descuento del formulario. `null` = no se pidió descuento. El valor se lee como
 * IMPORTE (`leerImporte`) también cuando es porcentaje: "12,5" y "12.5" son 12,5 %, y en
 * pesos "3.212,50" son tres mil doscientos doce con cincuenta.
 */
export function descuentoDelFormulario(
  tipoRaw: unknown,
  valorRaw: unknown,
): { ok: true; pedido: PedidoDeDescuento | null } | { ok: false; error: string } {
  const valorTxt = typeof valorRaw === "string" ? valorRaw : "";
  const lectura = leerImporte(valorTxt);
  if (lectura.estado === "vacio") return { ok: true, pedido: null };
  if (lectura.estado === "invalida") {
    return { ok: false, error: `"${valorTxt.trim()}" no es un descuento: escribí un número, como 10 o 1.500.` };
  }
  if (lectura.valor === 0) return { ok: true, pedido: null };
  const tipo: TipoDescuento = tipoRaw === "monto" ? "monto" : "porcentaje";
  return { ok: true, pedido: { tipo, valor: lectura.valor } };
}

// ── PRECIO A MANO ────────────────────────────────────────────────────────────
//
// Cuando un corte no tiene precio cargado (o el cliente se lleva algo que no está en el
// catálogo), el cajero no puede cargar precios —el catálogo es de la dueña— y la venta se
// perdía. La línea a mano se vende con nombre, importe y MOTIVO obligatorio:
//   · va SIN producto (`OrderItem.productId` vacío, la columna ya lo acepta): no mueve stock,
//     porque nadie sabe de qué producto descontarlo;
//   · queda marcada: la línea sin producto se ve como "precio a mano" en Ventas del día, y el
//     motivo queda en la auditoría del alta.

export type LineaAMano = { nombre: string; importe: number; motivo: string };

export const NOMBRE_A_MANO_MAX = 80;

export function validarLineaAMano(input: {
  nombre: string | null | undefined;
  importe: string | null | undefined;
  motivo: string | null | undefined;
}): { ok: true; linea: LineaAMano } | { ok: false; error: string } {
  const nombre = String(input.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, NOMBRE_A_MANO_MAX);
  if (!nombre) {
    return { ok: false, error: "Escribí qué se vende en la línea con precio a mano (por ejemplo, «Bondiola, sin precio cargado»)." };
  }
  const l = leerImporte(input.importe);
  if (l.estado === "vacio") return { ok: false, error: `Poné el importe de «${nombre}».` };
  if (l.estado === "invalida") {
    return { ok: false, error: `El importe de «${nombre}» no es un número: escribilo como $6.543 o $6.543,50.` };
  }
  if (!(l.valor > 0)) return { ok: false, error: `El importe de «${nombre}» tiene que ser mayor que cero.` };
  const m = validarMotivo(input.motivo);
  if (!m.ok) {
    return {
      ok: false,
      error:
        m.error === "vacio"
          ? `Escribí por qué «${nombre}» va con precio a mano: queda marcado en Ventas del día.`
          : `El motivo de «${nombre}» es muy corto: contá qué pasó (al menos ${MOTIVO_MIN} letras).`,
    };
  }
  return { ok: true, linea: { nombre, importe: round2(l.valor), motivo: m.motivo } };
}

/**
 * Las líneas a mano del formulario (arrays paralelos `manualNombre[]`, `manualImporte[]`,
 * `manualMotivo[]`, el mismo patrón que productId/quantity). Una sola inválida rechaza la
 * venta entera con su motivo: descartarla en silencio cobraría de menos sin que nadie se entere.
 */
export function lineasAManoDelFormulario(
  leer: (campo: string) => string[],
): { ok: true; lineas: LineaAMano[] } | { ok: false; error: string } {
  const nombres = leer("manualNombre");
  const importes = leer("manualImporte");
  const motivos = leer("manualMotivo");
  const n = Math.max(nombres.length, importes.length, motivos.length);
  const lineas: LineaAMano[] = [];
  for (let i = 0; i < n; i++) {
    const r = validarLineaAMano({ nombre: nombres[i], importe: importes[i], motivo: motivos[i] });
    if (!r.ok) return r;
    lineas.push(r.linea);
  }
  return { ok: true, lineas };
}
