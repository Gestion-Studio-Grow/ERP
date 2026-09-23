// ============================================================================
// TIENDA ONLINE — lo que se decide sin base: disponibilidad, bolsa y el mensaje de WhatsApp.
// ============================================================================
//
// Lo usan las cuatro vidrieras (client components) y la Server Action que toma el pedido
// (`placeOnlineOrder`, order-actions.ts). DATO PURO: sin Prisma, sin React, sin nada de
// servidor; si un día importara el `prisma` de valor, Turbopack rompería el build de /tienda
// sin que tsc lo vea.
//
// La vidriera NO recibe el stock: recibe la etiqueta ya decidida ("Sin stock", "Últimas
// unidades"). Publicar cuántos kilos quedan le cuenta a cualquiera cuánto vende el local.

import { formatearCantidad } from "@/lib/pos-peso";
import { fmtMoneyARS } from "@/components/ui/format";
import { esLineaDeEnvio } from "@/lib/venta-reglas";

// ── DISPONIBILIDAD ───────────────────────────────────────────────────────────

export type Disponibilidad = "sin-stock" | "ultimas" | null;

/** Medio gramo: la misma tolerancia de coma flotante que el ledger (stock/ledger.ts). */
const TOLERANCIA = 0.0005;

/**
 * Qué dice la vidriera de un producto. PURA.
 *   · sin control de stock → nada (se vende sin bloqueo, como en el mostrador);
 *   · sin stock → "sin-stock": no se puede sumar a la bolsa;
 *   · en el aviso de stock bajo del producto (`lowStockAt`, el mismo del inventario) →
 *     "ultimas".
 */
export function disponibilidadDe(p: { trackStock: boolean; stock: number; lowStockAt: number }): Disponibilidad {
  if (!p.trackStock) return null;
  if (!(p.stock > TOLERANCIA)) return "sin-stock";
  if (p.stock <= Math.max(0, p.lowStockAt) + TOLERANCIA) return "ultimas";
  return null;
}

export function etiquetaDeDisponibilidad(d: Disponibilidad): string | null {
  if (d === "sin-stock") return "Sin stock";
  if (d === "ultimas") return "Últimas unidades";
  return null;
}

// ── LA BOLSA ANTES DE TOMAR EL PEDIDO ────────────────────────────────────────

export type ProductoParaBolsa = {
  id: string;
  trackStock: boolean;
  stock: number;
  active: boolean;
  deletedAt: Date | string | null;
  saleUnit: string;
  price: number | null;
  pricePerKg: number | null;
};

/**
 * Qué línea de la bolsa no se puede pedir, y por qué, en palabras del cliente. PURA.
 *
 * Es el MISMO criterio que la guarda del alta (el stock tiene que alcanzar; nada de ventas
 * parciales), dicho por línea y antes de abrir la transacción, para que el mensaje quede al
 * lado del producto y la bolsa no se toque. Nunca dice cuánto hay: "no nos alcanza".
 */
export function problemasDeLaBolsa(
  productos: readonly ProductoParaBolsa[],
  pedidas: readonly { productId: string; qty: number }[],
): Record<string, string> {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const cantidades = new Map<string, number>();
  for (const l of pedidas) {
    if (!l.productId || !(l.qty > 0)) continue;
    cantidades.set(l.productId, (cantidades.get(l.productId) ?? 0) + l.qty);
  }
  const out: Record<string, string> = {};
  for (const [id, qty] of cantidades) {
    const p = porId.get(id);
    const precio = p ? (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) : null;
    if (!p || !p.active || p.deletedAt || precio == null || !(precio > 0)) {
      out[id] = "Ya no está a la venta: sacalo de tu pedido.";
      continue;
    }
    if (!p.trackStock) continue;
    if (!(p.stock > TOLERANCIA)) {
      out[id] = "Se agotó: sacalo de tu pedido o escribinos.";
      continue;
    }
    if (p.stock + TOLERANCIA < qty) out[id] = "No nos alcanza para esa cantidad: probá con menos.";
  }
  return out;
}

export const MENSAJE_BOLSA_CON_PROBLEMAS =
  "Hay productos de tu pedido que no podemos preparar: mirá el aviso en cada uno. Tu pedido sigue acá.";

export const MENSAJE_NO_SE_PUDO =
  "No pudimos tomar el pedido. Tu pedido sigue acá: probá de nuevo en un rato o escribinos por WhatsApp.";

// ── LO QUE CONTESTA EL SERVIDOR ──────────────────────────────────────────────

/**
 * Lo que `placeOnlineOrder` le devuelve a la vidriera. Un rechazo viaja DEVUELTO, no lanzado:
 * lanzado, Next lo reemplaza por la pantalla genérica de error y el cliente pierde la bolsa.
 *
 *   · `porLinea`: el aviso de cada producto que no se puede pedir (por id);
 *   · `campo`: si el problema es el cupón o los datos de contacto, para marcar ese campo;
 *   · ok: sólo vuelve cuando se pidió por WhatsApp (el pedido de la tienda redirige a Gracias).
 */
export type EstadoPedidoOnline =
  | null
  | { ok: false; error: string; porLinea?: Record<string, string>; campo?: "cupon" | "datos" }
  | { ok: true; code: number; total: number; whatsapp: string | null };

// ── EL MENSAJE DE WHATSAPP ───────────────────────────────────────────────────

export type LineaDelPedido = {
  productId: string | null;
  name: string;
  saleUnit: string;
  quantity: number;
  lineTotal: number;
};

/**
 * El mensaje que se abre en WhatsApp DESPUÉS de registrar el pedido: con su número, para que
 * el local lo encuentre en la bandeja sin volver a tipearlo. Sale de lo que quedó GRABADO
 * (líneas, envío, descuento y total de la base), no de lo que mostraba la vidriera. PURA.
 */
export function mensajeWhatsAppDelPedido(p: {
  negocio: string;
  code: number;
  cliente: string;
  lineas: readonly LineaDelPedido[];
  descuento: number;
  total: number;
  fulfillment: "PICKUP" | "DELIVERY" | string;
  address: string | null;
}): string {
  const renglones: string[] = [`¡Hola ${p.negocio}! Te escribo por mi pedido #${p.code} de la tienda:`];
  for (const l of p.lineas) {
    if (esLineaDeEnvio(l)) continue;
    const cant = `${formatearCantidad(l.quantity)} ${l.saleUnit === "WEIGHT" ? "kg" : "u"}`;
    renglones.push(`• ${cant} · ${l.name}`);
  }
  const envio = p.lineas.find((l) => esLineaDeEnvio(l));
  if (envio) renglones.push(`Envío: ${fmtMoneyARS(envio.lineTotal)}`);
  if (p.descuento > 0) renglones.push(`Descuento: −${fmtMoneyARS(p.descuento)}`);
  renglones.push(`Total: ${fmtMoneyARS(p.total)}`);
  renglones.push(
    p.fulfillment === "DELIVERY"
      ? `Entrega: envío a domicilio${p.address ? ` (${p.address})` : ""}`
      : "Entrega: retiro en el local",
  );
  renglones.push(`A nombre de: ${p.cliente}`);
  return renglones.join("\n");
}

// ── Medios de pago que la vidriera promete ───────────────────────────────────
//
// El copy editorial de MAGRA (magra-content.ts) decía "Todos los medios de pago: efectivo,
// crédito, débito…" y el local no cobra con tarjeta (no hay medio "Tarjeta" en la caja); ya se
// corrigió en la fuente. Igual la franja de propuestas toma los medios de la MARCA
// (storefront.ts), que son los que el mostrador puede cobrar: una sola fuente. PURA.

/** "Efectivo, transferencia y Mercado Pago." a partir de la lista de la marca. PURA. */
export function textoDeMediosDePago(medios: readonly string[]): string {
  const limpios = medios.map((m) => m.trim()).filter(Boolean);
  const partes = limpios.map((m, i) => (i === 0 || /^Mercado Pago/.test(m) ? m : m.charAt(0).toLowerCase() + m.slice(1)));
  if (partes.length === 0) return "";
  const texto = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  return `${texto}.`;
}

/**
 * Las propuestas de valor con la de "medios de pago" reescrita con los medios de la marca. Sin
 * medios de la marca, quedan como están. PURA.
 */
export function propuestasConMediosDeLaMarca<T extends { title: string; text: string }>(
  propuestas: readonly T[],
  medios: readonly string[] | null | undefined,
): T[] {
  const texto = textoDeMediosDePago(medios ?? []);
  if (!texto) return [...propuestas];
  return propuestas.map((v) => (/medios de pago/i.test(v.title) ? { ...v, title: "Medios de pago", text: texto } : v));
}
