// ============================================================================
// DELIVERY LOCAL · LO QUE SE GRABA Y SE LEE DEL PEDIDO — sin migración, en AuditLog. PURA.
// ============================================================================
//
// Dos filas de auditoría del pedido (entity "Order", entityId = id) llevan el delivery local:
//   · la del ALTA (action "create", changes.entregaLocal): la ubicación y la forma de pago que
//     eligió el cliente (`extrasDelAlta(...).auditoria`). De acá sale «paga con» para el repartidor
//     y «transferencia» para mostrar el alias en el seguimiento.
//   · «salió con el repartidor» (action ACCION_SALIO): UNA por pedido. Con ella el seguimiento dice
//     «Va en camino».
//
// `mandarAlRepartidor` y `seguimientoParaElCliente` son el núcleo de las acciones del cajón
// (src/app/admin/(dashboard)/pedidos/delivery-local/acciones.ts): reciben el tenant de la sesión
// y el acceso a datos inyectado, así el test prueba el rechazo de otro negocio sin base.

import { configDeliveryLocal } from "./config";
import { MEDIOS_PREFERIDOS, type MedioPreferido } from "./pago";
import { textoDelViaje, textoParaElRepartidor, waSinDestinatario, type PedidoParaElRepartidor } from "./mensajes";

export const ACCION_SALIO = "delivery-local:salio";

export type PagoDelAlta = { medio: MedioPreferido; pagaCon: number | null };

/** La forma de pago que quedó en la fila del alta (`changes.entregaLocal.pago`); null si no hay. */
export function pagoDelAlta(changes: unknown): PagoDelAlta | null {
  if (!changes || typeof changes !== "object") return null;
  const entrega = (changes as { entregaLocal?: unknown }).entregaLocal;
  if (!entrega || typeof entrega !== "object") return null;
  const pago = (entrega as { pago?: unknown }).pago;
  if (!pago || typeof pago !== "object") return null;
  const { medio, pagaCon } = pago as { medio?: unknown; pagaCon?: unknown };
  if (typeof medio !== "string" || !(MEDIOS_PREFERIDOS as readonly string[]).includes(medio)) return null;
  const monto = typeof pagaCon === "number" && Number.isFinite(pagaCon) && pagaCon > 0 ? pagaCon : null;
  return { medio: medio as MedioPreferido, pagaCon: medio === "efectivo" ? monto : null };
}

/** La ruta pública del seguimiento. El token sale de `tokenDeSeguimiento` (base64url y punto). */
export function rutaDeSeguimiento(token: string): string {
  return `/tienda/pedido/${encodeURIComponent(token)}`;
}

// ── Núcleo de las acciones del cajón ─────────────────────────────────────────────────────────────

export type PedidoDelCajon = {
  id: string;
  code: number;
  status: string;
  fulfillment: string;
  customerName: string;
  customerPhone: string;
  address: string | null;
  notes: string | null;
  total: number;
  paid: boolean;
  items: { name: string; quantity: number }[];
};

export type DepsDeLaSalida = {
  /** El pedido por {id, tenantId}: con el id de otro negocio, null. */
  pedido(tenantId: string, orderId: string): Promise<PedidoDelCajon | null>;
  /** La fila de auditoría del alta (sus `changes`), o null. */
  cambiosDelAlta(tenantId: string, orderId: string): Promise<unknown>;
  /** Graba ACCION_SALIO si todavía no está (con candado): «grabada» o «ya-estaba». */
  marcarSalidaUnaVez(tenantId: string, orderId: string, code: number): Promise<"grabada" | "ya-estaba">;
};

export type ResultadoDelCajon = { ok: true; wa: string; url?: string; mensaje: string } | { ok: false; error: string };

const APAGADO = "El delivery local no está prendido en este negocio.";
const NO_ESTA = "Ese pedido ya no está (o no es de este negocio). Recargá la bandeja.";

function idValido(orderId: unknown): orderId is string {
  return typeof orderId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(orderId);
}

/** El link firmado de «Entregué» de un pedido (absoluto), o null si no se puede armar. */
export type LinkDeEntrega = (orderId: string) => string | null;

function paraElRepartidor(p: PedidoDelCajon, negocio: string, pago: PagoDelAlta | null, linkEntrega: string | null): PedidoParaElRepartidor {
  return {
    code: p.code,
    negocio,
    cliente: p.customerName,
    telefono: p.customerPhone,
    direccion: p.address,
    nota: p.notes,
    total: p.total,
    pagado: p.paid,
    medio: pago?.medio ?? null,
    pagaCon: pago?.pagaCon ?? null,
    renglones: p.items.map((i) => ({ nombre: i.name, cantidad: i.quantity })),
    linkEntrega,
  };
}

/** «Mandar al repartidor»: marca la salida UNA vez y devuelve el WhatsApp armado (sin destinatario). */
export async function mandarAlRepartidor(
  ctx: { tenantId: string; slug: string | null; orderId: unknown; linkDeEntrega?: LinkDeEntrega },
  deps: DepsDeLaSalida,
): Promise<ResultadoDelCajon> {
  const cfg = configDeliveryLocal(ctx.slug);
  if (!cfg) return { ok: false, error: APAGADO };
  if (!idValido(ctx.orderId)) return { ok: false, error: NO_ESTA };
  const p = await deps.pedido(ctx.tenantId, ctx.orderId);
  if (!p) return { ok: false, error: NO_ESTA };
  if (p.fulfillment !== "DELIVERY") return { ok: false, error: "Es para retirar en el local: no sale con el repartidor." };
  if (p.status !== "READY") {
    return { ok: false, error: "Primero marcalo «Listo»: al salir, el cliente ve en su link que va en camino." };
  }
  const pago = pagoDelAlta(await deps.cambiosDelAlta(ctx.tenantId, p.id));
  const marca = await deps.marcarSalidaUnaVez(ctx.tenantId, p.id, p.code);
  const texto = textoParaElRepartidor(paraElRepartidor(p, cfg.nombre, pago, ctx.linkDeEntrega?.(p.id) ?? null));
  return {
    ok: true,
    wa: waSinDestinatario(texto),
    mensaje: marca === "grabada" ? `Pedido #${p.code} en camino: el cliente ya lo ve en su link.` : `El pedido #${p.code} ya figuraba en camino. Te armamos el mensaje de nuevo.`,
  };
}

/** Más paradas que esto no entran en un viaje razonable (ni en un WhatsApp legible). */
export const TOPE_DEL_VIAJE = 8;

/**
 * «Mandar juntos al repartidor»: 2 a TOPE_DEL_VIAJE pedidos Listos con envío. Se valida TODO antes
 * de marcar nada (uno que no va → no sale ninguno, con el número que falló); después cada pedido
 * se marca salido UNA vez (el mismo candado que el de a uno) y sale UN WhatsApp con las paradas.
 */
export async function mandarViajeAlRepartidor(
  ctx: { tenantId: string; slug: string | null; orderIds: unknown; linkDeEntrega?: LinkDeEntrega },
  deps: DepsDeLaSalida,
): Promise<ResultadoDelCajon> {
  const cfg = configDeliveryLocal(ctx.slug);
  if (!cfg) return { ok: false, error: APAGADO };
  if (!Array.isArray(ctx.orderIds) || ctx.orderIds.length > TOPE_DEL_VIAJE * 4 || !ctx.orderIds.every(idValido)) return { ok: false, error: NO_ESTA };
  const ids = [...new Set(ctx.orderIds as string[])];
  if (ids.length < 2) return { ok: false, error: "Elegí al menos dos pedidos para mandarlos juntos." };
  if (ids.length > TOPE_DEL_VIAJE) return { ok: false, error: `Hasta ${TOPE_DEL_VIAJE} pedidos por viaje: mandá el resto en otro.` };
  const pedidos: PedidoDelCajon[] = [];
  for (const id of ids) {
    const p = await deps.pedido(ctx.tenantId, id);
    if (!p) return { ok: false, error: NO_ESTA };
    if (p.fulfillment !== "DELIVERY") return { ok: false, error: `El pedido #${p.code} es para retirar en el local: sacalo del viaje.` };
    if (p.status !== "READY") return { ok: false, error: `El pedido #${p.code} todavía no está «Listo»: marcalo o sacalo del viaje.` };
    pedidos.push(p);
  }
  const paradas: PedidoParaElRepartidor[] = [];
  let nuevas = 0;
  for (const p of pedidos) {
    const pago = pagoDelAlta(await deps.cambiosDelAlta(ctx.tenantId, p.id));
    if ((await deps.marcarSalidaUnaVez(ctx.tenantId, p.id, p.code)) === "grabada") nuevas += 1;
    paradas.push(paraElRepartidor(p, cfg.nombre, pago, ctx.linkDeEntrega?.(p.id) ?? null));
  }
  const codigos = pedidos.map((p) => `#${p.code}`).join(", ");
  return {
    ok: true,
    wa: waSinDestinatario(textoDelViaje(cfg.nombre, paradas)),
    mensaje:
      nuevas === pedidos.length
        ? `Viaje armado: ${codigos} en camino. Cada cliente ya lo ve en su link.`
        : `Viaje armado: ${codigos}. ${pedidos.length - nuevas === 1 ? "Uno ya figuraba" : `${pedidos.length - nuevas} ya figuraban`} en camino.`,
  };
}

/** El texto con el link de seguimiento para el cliente. */
export function textoDelSeguimiento(p: { cliente: string; code: number; negocio: string; url: string }): string {
  const nombre = p.cliente.trim().split(/\s+/)[0] || "";
  return `¡Hola${nombre ? ` ${nombre}` : ""}! Acá podés seguir tu pedido #${p.code} de ${p.negocio}: ${p.url}`;
}

/** «Mandar seguimiento al cliente»: el link absoluto y el WhatsApp al teléfono del pedido. */
export async function seguimientoParaElCliente(
  ctx: {
    tenantId: string;
    slug: string | null;
    orderId: unknown;
    origen: string | null;
    token: (orderId: string) => string;
    waAlCliente: (telefono: string, texto: string) => string | null;
  },
  deps: Pick<DepsDeLaSalida, "pedido">,
): Promise<ResultadoDelCajon> {
  const cfg = configDeliveryLocal(ctx.slug);
  if (!cfg) return { ok: false, error: APAGADO };
  if (!idValido(ctx.orderId)) return { ok: false, error: NO_ESTA };
  if (!ctx.origen) return { ok: false, error: "No pudimos armar el link desde esta dirección. Abrí el panel desde la dirección del negocio." };
  const p = await deps.pedido(ctx.tenantId, ctx.orderId);
  if (!p) return { ok: false, error: NO_ESTA };
  const url = `${ctx.origen}${rutaDeSeguimiento(ctx.token(p.id))}`;
  const wa = ctx.waAlCliente(p.customerPhone, textoDelSeguimiento({ cliente: p.customerName, code: p.code, negocio: cfg.nombre, url }));
  if (!wa) return { ok: false, error: `El teléfono del pedido no es un celular. Copiá el link y mandáselo a mano: ${url}` };
  return { ok: true, wa, url, mensaje: `Link de seguimiento del pedido #${p.code} listo para mandar.` };
}
