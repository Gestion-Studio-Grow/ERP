// ============================================================================
// COBRO ÚNICO TURNO + PRODUCTOS — las reglas puras (Venta y agenda simples, T1).
// ============================================================================
//
// Con el interruptor `venta-agenda-simple` prendido, el cajón del turno suma productos y cobra el
// saldo del turno y los productos en UN cobro (cobro-con-producto-actions.ts). Acá viven, sin base,
// las tres cosas que la pantalla y el servidor tienen que leer igual: los renglones que llegan del
// formulario, el total que se muestra y las claves de idempotencia. Client-safe: no importa Prisma.
//
// El total que se COBRA lo decide el servidor con los precios de la base (`decidirAlta`); el de acá
// es la misma cuenta para la vista previa y para el test, con los precios que ya tiene la pantalla.

import { round2 } from "@/lib/round";

/** Los medios del cobro único: los del turno y, con la tarjeta habilitada, Débito y Crédito (D-C01). */
export const MEDIOS_CON_PRODUCTO = ["EFECTIVO", "TRANSFERENCIA", "MERCADOPAGO", "DEBITO", "CREDITO"] as const;
export type MedioConProducto = (typeof MEDIOS_CON_PRODUCTO)[number];

export function esMedioConProducto(raw: unknown): raw is MedioConProducto {
  return (MEDIOS_CON_PRODUCTO as readonly unknown[]).includes(raw);
}

/** Débito y Crédito sólo se escriben con `tarjetaHabilitada()` en true (N2_enums.sql). */
export function esMedioDeTarjeta(m: MedioConProducto): boolean {
  return m === "DEBITO" || m === "CREDITO";
}

/** Débito y Crédito en criollo para el historial del turno (los demás medios, con su etiqueta de siempre). */
export const ETIQUETA_DE_TARJETA: Readonly<Record<string, string>> = { DEBITO: "Débito", CREDITO: "Crédito" };

export type RenglonPedido ={ productId: string; qty: number };

/** Tope de renglones y de cantidad: un turno no se lleva un depósito. */
export const MAX_RENGLONES = 30;
export const MAX_CANTIDAD = 999;

/**
 * Los renglones del formulario (`productos`, JSON de `{ productId, qty }[]`). El mismo producto dos
 * veces se suma en un renglón. Cantidad finita, > 0 y ≤ MAX_CANTIDAD. Al menos uno. PURA.
 */
export function leerRenglones(raw: unknown): { ok: true; renglones: RenglonPedido[] } | { ok: false; error: string } {
  let lista: unknown;
  try {
    lista = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    lista = null;
  }
  if (!Array.isArray(lista) || lista.length === 0) return { ok: false, error: "Sumá al menos un producto." };
  if (lista.length > MAX_RENGLONES) return { ok: false, error: `Son demasiados renglones (máximo ${MAX_RENGLONES}).` };
  const porProducto = new Map<string, number>();
  for (const r of lista) {
    const productId = typeof r?.productId === "string" ? r.productId.trim().slice(0, 64) : "";
    const qty = typeof r?.qty === "number" ? r.qty : Number(r?.qty);
    if (!productId) return { ok: false, error: "Falta identificar un producto." };
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "La cantidad de cada producto tiene que ser mayor a cero." };
    porProducto.set(productId, round3((porProducto.get(productId) ?? 0) + qty));
  }
  for (const qty of porProducto.values()) {
    if (qty > MAX_CANTIDAD) return { ok: false, error: `La cantidad de un producto no puede pasar de ${MAX_CANTIDAD}.` };
  }
  return { ok: true, renglones: [...porProducto].map(([productId, qty]) => ({ productId, qty })) };
}

/**
 * En el cobro con el turno, un producto por unidad se vende de a enteros (1, 2, 3…); los por kilo
 * siguen aceptando decimales. Devuelve el motivo del rechazo, o null si la cantidad sirve. PURA.
 */
export function rechazoDeCantidad(saleUnit: "UNIT" | "WEIGHT", qty: number): string | null {
  if (!Number.isFinite(qty) || qty <= 0) return "La cantidad de cada producto tiene que ser mayor a cero.";
  if (saleUnit === "UNIT" && !Number.isInteger(qty)) return "Los productos por unidad van de a uno entero (1, 2, 3…), sin decimales.";
  return null;
}

/**
 * ¿El reenvío (misma clave) pide lo MISMO que quedó grabado? Mismos productos con las mismas
 * cantidades y el mismo medio. Si no, el segundo envío no se cobra ni se da por hecho. PURA.
 */
export function coincideConLoGrabado(
  pedido: { method: string; renglones: readonly RenglonPedido[] },
  grabado: { method: string | null; renglones: readonly { productId: string | null; qty: number }[] },
): boolean {
  if (grabado.method !== pedido.method) return false;
  const suma = (rs: readonly { productId: string | null; qty: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rs) m.set(r.productId ?? "", round3((m.get(r.productId ?? "") ?? 0) + r.qty));
    return m;
  };
  const a = suma(pedido.renglones);
  const b = suma(grabado.renglones);
  if (a.size !== b.size) return false;
  for (const [id, qty] of a) if (b.get(id) !== qty) return false;
  return true;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** El total que se muestra: saldo del turno + cada renglón (cantidad × precio, redondeado). PURA. */
export function totalDelCobro(p: {
  saldo: number;
  renglones: readonly { qty: number; precio: number }[];
}): { turno: number; productos: number; total: number } {
  const turno = round2(Math.max(0, p.saldo));
  const productos = round2(p.renglones.reduce((s, r) => s + round2(r.qty * r.precio), 0));
  return { turno, productos, total: round2(turno + productos) };
}

const FORMA_CLAVE = /^[0-9a-z-]{8,64}$/i;

/** La clave del formulario (un uuid por apertura de la hoja), o null si no tiene forma. PURA. */
export function leerClave(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  return FORMA_CLAVE.test(v) ? v : null;
}

/**
 * Clave del cobro del turno (`Collection.idempotencyKey`), derivada en el servidor de la clave de la
 * hoja + el id del turno: la misma clave reusada en OTRO turno es otra clave (no se da por cobrado).
 */
export function claveDelCobro(clave: string, appointmentId: string): string {
  return `turno-producto:${appointmentId}:${clave}`;
}

/** Clave de la orden de los productos, derivada de la del cobro (`Order.idempotencyKey`). */
export function claveDelPedido(clave: string, appointmentId: string): string {
  return `${claveDelCobro(clave, appointmentId)}:pedido`;
}

const MAX_RESULTADOS = 8;

/** Los productos que coinciden con lo que se tipeó (sin acentos ni mayúsculas), hasta 8. PURA. */
export function buscarProductos<P extends { name: string }>(lista: readonly P[], q: string): P[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const busca = norm(q.trim());
  return (busca ? lista.filter((p) => norm(p.name).includes(busca)) : lista).slice(0, MAX_RESULTADOS);
}
