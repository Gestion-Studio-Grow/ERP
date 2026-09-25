// ============================================================================
// REGLAS DE LA VENTA — descuento, precio a mano (con su tope), envío y cupones. PURO.
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
import { porcentajeDe, type UnidadDeRedondeo } from "@/lib/dinero/redondeo";
import { leerImporte } from "@/lib/pos-peso";
import { validarMotivo, MOTIVO_MIN } from "@/lib/turnos/anulacion";
import { fmtMoneyARS } from "@/components/ui/format";
import { fmtShortDate } from "@/lib/datetime";
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
 * `Order.discount` guarda sólo el monto, no si se cargó en % o en $; por eso el descuento a
 * mano razona siempre en %. Sin subtotal anterior no hay % que conservar: el descuento cae a
 * cero (nunca se inventa uno). Nunca pasa del subtotal nuevo: el total no queda negativo.
 *
 * EL CUPÓN ES OTRA COSA. Si el pedido se tomó con un cupón, `cupon` trae su regla tal como
 * quedó escrita al tomarlo (`CuponDelPedido`, que el alta graba en la misma transacción) y el
 * descuento se vuelve a calcular con ESA regla sobre lo que se compra ahora (`montoDeCupon`):
 * el de % sigue siendo el mismo %, y el de MONTO FIJO sigue siendo el mismo monto, sin pasarse
 * de la compra. Escalar el fijo en proporción regalaba plata que el cupón no daba: 1,6 kg de
 * vacío ($20.000) con un cupón de $2.000, pesados a 2,4 kg, quedaban con $3.000 de descuento;
 * pesados a 0,8 kg, con $1.000, y el cliente perdía la mitad del cupón. El cupón lo creó la
 * dueña, así que no hay tope de quien vende que cuidar (el alta tampoco lo mira).
 *
 * `envio`: la línea de envío del pedido de la tienda (`envioDeLasLineas`). No es base del
 * descuento: el cupón se calculó sólo sobre lo que se compra, y el ajuste no toca el envío.
 * Sin restarlo, $20.000 de productos + $3.500 de envío con un 10 % ($2.000) pesados a $10.000
 * quedaban con $1.148,94 de descuento en vez de $1.000.
 */
export function descuentoDelAjuste(input: {
  descuentoAntes: number;
  subtotalAntes: number;
  subtotalNuevo: number;
  envio?: number;
  /** El cupón del pedido (`leerCuponDelPedido`), o nada si el descuento fue a mano. */
  cupon?: Pick<CuponDelPedido, "tipo" | "valor"> | null;
}): { descuento: number; porcentaje: number } {
  const envio = input.envio && input.envio > 0 ? round2(input.envio) : 0;
  const antes = round2(input.descuentoAntes || 0);
  const base = round2((input.subtotalAntes || 0) - envio);
  const nuevo = round2((input.subtotalNuevo || 0) - envio);
  if (input.cupon) {
    const descuento = montoDeCupon(input.cupon.tipo, input.cupon.valor, nuevo);
    return { descuento, porcentaje: nuevo > 0 ? round2((descuento / nuevo) * 100) : 0 };
  }
  if (!(antes > 0) || !(base > 0) || !(nuevo > 0)) return { descuento: 0, porcentaje: 0 };
  const descuento = Math.min(round2((antes * nuevo) / base), nuevo);
  return { descuento, porcentaje: round2((Math.min(antes, base) / base) * 100) };
}

/**
 * El renglón del descuento en «Pesar y ajustar», antes de guardar. PURA. Dice de dónde sale el
 * número: el cupón de monto fijo no es "el X % de la venta". `null` = no hay descuento.
 */
export function textoDelDescuentoDelAjuste(
  d: { descuento: number; porcentaje: number },
  cupon: CuponDelPedido | null | undefined,
): string | null {
  if (!(d.descuento > 0)) return null;
  const monto = fmtMoneyARS(d.descuento);
  if (cupon?.tipo === "FIXED") return `Cupón ${cupon.codigo} de ${fmtMoneyARS(cupon.valor)}: −${monto}`;
  if (cupon) return `Cupón ${cupon.codigo} del ${String(Math.min(cupon.valor, 100)).replace(".", ",")} %: −${monto}`;
  return `Descuento del ${String(d.porcentaje).replace(".", ",")} %, el de la venta: −${monto}`;
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
  // El nombre de la línea de envío de la tienda está reservado: una línea a mano que se llamara
  // igual dejaría de verse como «precio a mano» en Ventas del día, que es el control de la dueña.
  if (esNombreDeEnvio(nombre)) {
    return {
      ok: false,
      error: `«${NOMBRE_LINEA_ENVIO}» es el nombre que usa la tienda para el envío: escribí otro, como «Envío Canning».`,
    };
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

// ── TEXTO: comparar nombres como los escribe una persona ─────────────────────

/** "  Vacío  especial " y "vacio especial" son el mismo nombre. PURA. */
export function normalizarNombre(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ── PRECIO A MANO: el tope de recepción ──────────────────────────────────────
//
// La línea a mano no tiene tope en el alta: recepción podía vender un vacío de $12.500 el kilo
// escribiendo «Vacío» a $1.000, y lo único que quedaba era la marca en Ventas del día. Se le
// pone un tope con la MISMA forma que el del descuento: una regla pura acá, que el alta aplica
// DENTRO de la transacción (order-core.ts, con el catálogo leído ahí mismo), y un mensaje que
// dice hasta dónde llega y a quién pedir más. La dueña o el dueño no tiene tope.
//
//   · Si el nombre es el de un producto del catálogo CON precio:
//       - por unidad: no puede bajar más del 10 % del precio de lista;
//       - por kilo: no se puede cargar a mano (sin el peso no hay con qué comparar); se carga
//         el producto con su peso, y si hace falta, con el descuento, que tiene su propio tope.
//   · Si no hay producto con precio con ese nombre: hasta un monto máximo por línea.
//
// PROVISIONAL A CONFIRMAR con la dueña de MAGRA: el 10 % y los $50.000. Fijarlos por negocio
// pide una columna nueva (ola 9). El nombre se compara sin mayúsculas ni tildes; un nombre
// inventado para esquivar el catálogo cae en el monto máximo, y la línea sigue marcada.

/** Cuánto puede bajar recepción el precio de lista con una línea a mano, en %. Provisional. */
export const TOPE_BAJA_A_MANO_RECEPCION_PCT = 10;
/** Hasta cuánto vale una línea a mano de recepción sin producto con precio. Provisional. */
export const MAXIMO_A_MANO_RECEPCION = 50_000;

export type TopePrecioAMano = { bajaPct: number; maximo: number };

/** El tope de precio a mano de quien vende. `null` = sin tope (la dueña o el dueño). */
export function topeDePrecioAMano(role: Role): TopePrecioAMano | null {
  return role === "OWNER" ? null : { bajaPct: TOPE_BAJA_A_MANO_RECEPCION_PCT, maximo: MAXIMO_A_MANO_RECEPCION };
}

export type ProductoDeLista = {
  name: string;
  saleUnit: "UNIT" | "WEIGHT" | string;
  price: number | null;
  pricePerKg: number | null;
};

const PIDE_A_LA_DUENIA = "Para más, pedíselo a la dueña o al dueño del negocio.";

/**
 * ¿Esta línea a mano entra en el tope de quien vende? PURA. `catalogo` son los productos del
 * negocio (no borrados) tal como los leyó el alta dentro de su transacción.
 */
export function controlarPrecioAMano(input: {
  linea: LineaAMano;
  catalogo: readonly ProductoDeLista[];
  tope: TopePrecioAMano | null;
}): { ok: true } | { ok: false; error: string } {
  const { linea, tope } = input;
  if (!tope) return { ok: true };
  const clave = normalizarNombre(linea.nombre);
  const producto = input.catalogo.find((p) => {
    if (normalizarNombre(p.name) !== clave) return false;
    const precio = p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price;
    return precio != null && precio > 0;
  });
  if (producto) {
    if (producto.saleUnit === "WEIGHT") {
      return {
        ok: false,
        error:
          `«${producto.name}» se vende por kilo y tiene precio en el catálogo: cargalo como producto, con su peso. ` +
          `Con tu usuario no se carga a mano. ${PIDE_A_LA_DUENIA}`,
      };
    }
    const lista = producto.price as number;
    const minimo = round2((lista * (100 - tope.bajaPct)) / 100);
    if (linea.importe < minimo) {
      return {
        ok: false,
        error:
          `«${producto.name}» está a ${fmtMoneyARS(lista)} en el catálogo: con tu usuario, a mano llega hasta ` +
          `${tope.bajaPct} % menos (${fmtMoneyARS(minimo)}). ${PIDE_A_LA_DUENIA}`,
      };
    }
    return { ok: true };
  }
  if (linea.importe > tope.maximo) {
    return {
      ok: false,
      error: `Con tu usuario, una línea con precio a mano llega hasta ${fmtMoneyARS(tope.maximo)}. ${PIDE_A_LA_DUENIA}`,
    };
  }
  return { ok: true };
}

// ── ENVÍO: una línea más del pedido ──────────────────────────────────────────
//
// La tienda mostraba el envío y no lo registraba: el pedido de la bandeja decía $20.000 y el
// cliente había visto $23.500. Ahora el envío lo calcula el SERVIDOR (con la tarifa de la
// marca, storefront-shipping.ts) y entra como una línea sin producto del pedido: suma al
// total, se cobra y se asienta con él, y no mueve stock. Se reconoce por su nombre, que por
// eso está reservado para la línea a mano (`validarLineaAMano`).

export const NOMBRE_LINEA_ENVIO = "Envío a domicilio";

/** ¿Este nombre es el de la línea de envío? Sin mayúsculas ni tildes. PURA. */
export function esNombreDeEnvio(nombre: string | null | undefined): boolean {
  return normalizarNombre(nombre) === normalizarNombre(NOMBRE_LINEA_ENVIO);
}

/** ¿Esta línea guardada es el envío? Sin producto y con el nombre reservado. PURA. */
export function esLineaDeEnvio(l: { productId: string | null; name: string }): boolean {
  return l.productId == null && esNombreDeEnvio(l.name);
}

/**
 * Lo que suma el envío entre las líneas guardadas de un pedido (0 si no tiene). PURA. Lo usa el
 * ajuste («Pesar y ajustar») para dejar el envío fuera de la base del descuento.
 */
export function envioDeLasLineas(
  lineas: readonly { productId?: string | null; name?: string | null; lineTotal: number }[],
): number {
  return round2(
    lineas.reduce((s, l) => s + (l.productId == null && esNombreDeEnvio(l.name) ? l.lineTotal || 0 : 0), 0),
  );
}

// ── CUPONES en el mostrador y en la tienda ───────────────────────────────────
//
// Hasta acá los cupones valían sólo para los turnos. En un pedido el cupón se guarda como el
// descuento (`Order.discount`), su regla (% o fijo) queda en la auditoría del pedido para
// poder pesarlo después (`CuponDelPedido`, al final de este archivo) y el control del máximo
// de usos va en la MISMA transacción que crea el pedido (order-core.ts, compare-and-set sobre
// `usedCount`): dos ventas simultáneas no pueden gastar el último uso las dos. Esta es la
// regla, pura, que usan el alta y la vista previa ("Aplicar") de la pantalla.
//
// El cupón lo creó la dueña: su descuento no pasa por el tope de recepción. Un cupón y un
// descuento a mano no se suman: es uno o el otro.

export const CODIGO_CUPON_MAX = 40;

/** Código como lo guarda el catálogo de cupones: sin espacios alrededor y en mayúsculas. */
export function normalizarCodigoDeCupon(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().slice(0, CODIGO_CUPON_MAX);
}

export type CuponLeido = {
  code: string;
  type: "PERCENT" | "FIXED" | string;
  value: number;
  active: boolean;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
};

export type ResultadoCupon =
  | { ok: true; codigo: string; descuento: number }
  /** `sinDescuento`: el cupón vale pero sobre esta compra no descuenta nada; el motivo se puede mostrar. */
  | { ok: false; error: string; sinDescuento?: true };

export const CUPON_Y_DESCUENTO = "Un cupón y un descuento a mano no se suman: usá uno de los dos.";

/**
 * El rechazo de un código que no se puede usar. Hacia afuera (la tienda) es el ÚNICO texto para
 * inexistente, apagado, vencido o agotado (cupones/prueba-publica.ts): decir "venció" le
 * confirmaría a quien prueba códigos que ése existe.
 */
export const CUPON_NO_VALE = "Ese cupón no existe o no está activo. Revisá cómo está escrito.";

/**
 * El descuento de un cupón sobre `base` (lo que se compra, sin el envío), o el rechazo con el
 * porqué. PURA. Sin cupón, vencido, inactivo o agotado: rechazo, nunca un descuento de 0 que
 * el cliente descubra después. Tampoco un cupón que vale pero que, redondeado, no descuenta nada
 * (5 % de $9 en turnos): se rechaza con `sinDescuento` y quien lo llama no gasta el uso.
 * `camino`: con qué unidad se redondea el % (`UNIDAD_DEL_DESCUENTO_DE_CUPON`); la venta si no se dice.
 */
export function aplicarCupon(input: { cupon: CuponLeido | null; base: number; ahora: Date; camino?: CaminoDelCupon }): ResultadoCupon {
  const c = input.cupon;
  if (!c || !c.active) return { ok: false, error: CUPON_NO_VALE };
  if (c.expiresAt && c.expiresAt.getTime() < input.ahora.getTime()) {
    return { ok: false, error: `El cupón ${c.code} venció el ${fmtShortDate(c.expiresAt)}.` };
  }
  if (c.maxUses != null && c.usedCount >= c.maxUses) {
    return { ok: false, error: `El cupón ${c.code} ya se usó todas las veces que permitía.` };
  }
  const base = round2(input.base);
  if (!(base > 0)) return { ok: false, error: "Agregá algo a la compra antes de usar el cupón." };
  if (!(c.value > 0)) return { ok: false, error: `El cupón ${c.code} no tiene un descuento cargado.`, sinDescuento: true };
  const descuento = montoDeCupon(c.type, c.value, base, input.camino ?? "venta");
  if (!(descuento > 0)) {
    return { ok: false, error: `El cupón ${c.code} no llega a descontar nada sobre ${fmtMoneyARS(base)}.`, sinDescuento: true };
  }
  return { ok: true, codigo: c.code, descuento };
}

/**
 * Cuánto descuenta un cupón ya validado sobre `base`: el % de lo que se compra, o el monto fijo
 * sin pasarse de la compra. El % se redondea UNA vez a la unidad de su `camino`
 * (`UNIDAD_DEL_DESCUENTO_DE_CUPON`); el fijo, al centavo; 100 % o más es la compra entera. PURA.
 * Es la ÚNICA cuenta del descuento de un cupón (ENG-109): la usan la reserva de turno y su vista
 * previa (`cupones/cupon-de-reserva.ts`, `checkCoupon`, camino "turno"), la venta, la tienda y
 * sus pantallas para recalcular la vista previa cuando cambia la bolsa (camino "venta").
 */
export function montoDeCupon(tipo: string, valor: number, base: number, camino: CaminoDelCupon = "venta"): number {
  const b = round2(base);
  if (!(b > 0) || !(valor > 0)) return 0;
  if (tipo !== "PERCENT") return round2(Math.min(valor, b));
  // 100 % o más es la compra entera, con sus centavos: al peso quedarían centavos a pagar.
  if (valor >= 100) return b;
  return Math.min(porcentajeDe(b, valor, UNIDAD_DEL_DESCUENTO_DE_CUPON[camino]), b);
}

/** Dónde se usa el cupón: la reserva de un turno, o la venta (mostrador, pedido y tienda). */
export type CaminoDelCupon = "turno" | "venta";

/**
 * A qué se redondea el descuento de un cupón de porcentaje en cada camino (ENG-109, D1-PLAN §3.3
 * R4). Que sea UNA sola unidad para todos es decisión del dueño (D1-PLAN §7), pendiente: hasta
 * que decida, cada camino conserva la que tenía antes de ENG-109, así CH no ve cambiar sus
 * precios. Turnos al peso (el cobro de turnos no acepta centavos); venta y tienda al centavo (lo
 * que se factura). Cuando decida, las dos claves pasan a la misma unidad (y el test que la fija).
 */
export const UNIDAD_DEL_DESCUENTO_DE_CUPON: Readonly<Record<CaminoDelCupon, UnidadDeRedondeo>> = {
  turno: "peso",
  venta: "centavo",
};

/**
 * Qué consume un cupón que pasó `aplicarCupon`: el compare-and-set sobre el `usedCount` que se
 * leyó. Si otra venta lo gastó en el medio, el `where` no encuentra la fila y el alta vuelve a
 * leer (order-core.ts). PURA: sólo arma el `where`, para que el test vea la guarda.
 */
export function whereConsumoDeCupon(tenantId: string, cupon: { id: string; usedCount: number }) {
  return { id: cupon.id, tenantId, active: true, usedCount: cupon.usedCount };
}

/**
 * El `where` de "cupones vigentes": prendidos y sin vencer a `ahora`. Lo usan la pantalla de
 * Promociones y el número de su botón: el mismo `where`, la misma cuenta. Un cupón prendido que
 * llegó a su máximo de usos sigue contando acá (Postgres no compara dos columnas en un `where`
 * de Prisma sin SQL a mano); la pantalla lo marca "agotado". PURA.
 */
export function whereCuponesVigentes(tenantId: string, ahora: Date) {
  return { tenantId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gte: ahora } }] };
}

/** ¿Este cupón ya no se puede usar porque llegó a su máximo? PURA. */
export function cuponAgotado(c: { maxUses: number | null; usedCount: number }): boolean {
  return c.maxUses != null && c.usedCount >= c.maxUses;
}

// ── EL CUPÓN QUE USÓ UN PEDIDO, para pesarlo y ajustarlo ─────────────────────
//
// `Order.discount` guarda sólo el monto: no dice si vino de un cupón ni si era de % o fijo, y
// el esquema no se toca en esta ola. Sin eso, «Pesar y ajustar» escalaba en proporción también
// el cupón de monto fijo (`descuentoDelAjuste`). La regla del cupón queda escrita en la
// auditoría del pedido, en la MISMA transacción que lo crea (`registrarCuponDelPedidoEnTx`,
// order-core.ts): si el pedido existe, su cupón está escrito; si el alta se deshace, no queda
// nada. No depende de la fila del cupón, que la dueña puede borrar o reemplazar por otra con
// el mismo código. La auditoría de siempre del alta ("create") sigue igual.

/** La acción de auditoría que guarda el cupón de un pedido. */
export const ACCION_CUPON_DEL_PEDIDO = "cupon-del-pedido";

/**
 * El cupón con el que se tomó un pedido, como era al tomarlo. `cuponId` es la fila del cupón
 * que se gastó: la usa la anulación para devolver ESE uso (`cuponADevolver`), aunque la dueña
 * haya creado después otro cupón con el mismo código. Las filas escritas antes no lo tienen.
 */
export type CuponDelPedido = { codigo: string; tipo: "PERCENT" | "FIXED"; valor: number; cuponId?: string };

/** El `where` de la fila del cupón de uno o varios pedidos, siempre dentro del negocio. PURA. */
export function whereCuponDelPedido(tenantId: string, orderIds: string | readonly string[]) {
  return {
    tenantId,
    entity: "Order",
    action: ACCION_CUPON_DEL_PEDIDO,
    entityId: typeof orderIds === "string" ? orderIds : { in: [...orderIds] },
  };
}

/** Lo que se escribe en `changes` de esa fila (lo lee `leerCuponDelPedido`). PURA. */
export function cambiosDelCuponDelPedido(cupon: CuponDelPedido, monto: number) {
  return {
    codigo: cupon.codigo,
    tipo: cupon.tipo,
    valor: cupon.valor,
    monto: round2(monto),
    ...(cupon.cuponId ? { cuponId: cupon.cuponId } : {}),
  };
}

/**
 * El cupón de la fila de auditoría, o `null` si no es un cupón que se pueda recalcular (sin
 * fila, tipo desconocido, valor que no es un número positivo). PURA. Con `null`, el ajuste usa
 * la regla del descuento a mano: conservar el %.
 */
export function leerCuponDelPedido(changes: unknown): CuponDelPedido | null {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as { codigo?: unknown; tipo?: unknown; valor?: unknown };
  if (typeof c.codigo !== "string" || !c.codigo) return null;
  if (c.tipo !== "PERCENT" && c.tipo !== "FIXED") return null;
  if (typeof c.valor !== "number" || !Number.isFinite(c.valor) || !(c.valor > 0)) return null;
  return { codigo: c.codigo, tipo: c.tipo, valor: c.valor };
}

// ── DEVOLVER EL USO del cupón de una venta anulada ───────────────────────────
//
// Un cupón de UN uso que se gastó en una venta que después se anuló quedaba agotado: la venta
// no existe y el cliente no puede volver a usarlo, ni siquiera para rehacer la misma compra
// (que es justamente lo que se hace cuando se pesó mal). La anulación devuelve el uso en su
// MISMA transacción (order-anulacion.ts), leyendo la fila que escribió el alta.

/** Qué cupón devolver según la fila del pedido: el id si el alta lo guardó, si no el código. PURA. */
export function cuponADevolver(changes: unknown): { cuponId: string | null; codigo: string } | null {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as { codigo?: unknown; cuponId?: unknown };
  if (typeof c.codigo !== "string" || !c.codigo) return null;
  return { cuponId: typeof c.cuponId === "string" && c.cuponId ? c.cuponId : null, codigo: c.codigo };
}

/**
 * El `where` que baja en uno el `usedCount` del cupón a devolver, siempre dentro del negocio y
 * nunca por debajo de cero (`usedCount > 0`: si la dueña lo reinició a mano, no queda negativo).
 * PURA.
 *
 * Con `cuponId` (las filas que escribe el alta desde la tanda 2a) va a ESA fila. Las filas viejas
 * sólo tienen el código: si la dueña borró el cupón y creó otro con el mismo código, buscar por
 * código le devolvería un uso al cupón NUEVO, que nunca se gastó en este pedido. Por eso, sin id,
 * sólo cuenta un cupón creado ANTES que el pedido (`createdAt <= pedidoCreadoEl`): uno creado
 * después no puede ser el que se usó. Si no hay ninguno así, no se devuelve nada.
 */
export function whereDevolucionDeCupon(
  tenantId: string,
  c: { cuponId: string | null; codigo: string },
  pedidoCreadoEl: Date,
) {
  return c.cuponId
    ? { id: c.cuponId, tenantId, usedCount: { gt: 0 } }
    : { tenantId, code: c.codigo, usedCount: { gt: 0 }, createdAt: { lte: pedidoCreadoEl } };
}

// ── VENTA A CUENTA: vendida, no cobrada ──────────────────────────────────────
//
// La venta «A cuenta» (fiado, order-core.ts) queda `paid` en true y SIN medio: sale de la
// bandeja de "a cobrar" porque se cobra desde Cuentas a cobrar, pero su plata NO entró. Todo
// número que diga "cobrado" la tiene que dejar afuera: el de Vender del Inicio y el "Gastó en el
// último año" de la ficha la sumaban como si fuera plata en la caja.

/** ¿Es una venta a cuenta (saldada sin medio: la plata no entró)? PURA. */
export function esVentaACuenta(v: { paid?: boolean | null; paymentMethod?: string | null }): boolean {
  return v.paid !== false && !v.paymentMethod;
}
