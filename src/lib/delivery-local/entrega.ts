// ============================================================================
// DELIVERY LOCAL · «ENTREGUÉ» DEL REPARTIDOR — el link que viaja en su WhatsApp. PURA.
// ============================================================================
//
// DEL-1, opción A: el local tiene la última palabra. El repartidor no tiene app ni cuenta: en el
// mensaje de «Mandar al repartidor» va un link `/tienda/entrega/<token>`; lo abre, toca «Entregué»
// y en la auditoría del pedido queda UN aviso (ACCION_ENTREGO). El estado del pedido NO cambia: el
// local ve el chip «Repartidor: entregado» en la bandeja y lo cierra con su tecla de siempre.
//
// EL TOKEN. `<orderId>.<firma>`, HMAC sobre el PROPÓSITO, el negocio y el pedido, con una clave
// derivada de `AUTH_SECRET` con etiqueta propia. El propósito va en la etiqueta de la clave Y en lo
// firmado: un link de seguimiento del cliente no sirve de «Entregué» ni al revés, y con el id de
// otro pedido o en el host de otro negocio la firma no da.
//
// LA PÁGINA no muestra datos del cliente (ni nombre, ni teléfono, ni dirección): sólo el número.
// El aviso se graba por POST (acción del servidor), nunca al abrir: la vista previa del link en
// WhatsApp no puede marcar nada.

import { createHmac, timingSafeEqual } from "node:crypto";
import { configDeliveryLocal } from "./config";

export const ACCION_ENTREGO = "delivery-local:repartidor-entrego";

const PROPOSITO = "entrega-repartidor";
const ETIQUETA = `gsg:delivery-local:${PROPOSITO}:v1`;
const LARGO_FIRMA = 22; // base64url → 132 bits

function firma(secreto: string, tenantId: string, orderId: string): string {
  const clave = createHmac("sha256", secreto).update(ETIQUETA).digest();
  return createHmac("sha256", clave).update(`${PROPOSITO}:${tenantId}:${orderId}`).digest("base64url").slice(0, LARGO_FIRMA);
}

export function tokenDeEntrega(secreto: string, tenantId: string, orderId: string): string {
  if (!secreto) throw new Error("Falta el secreto del link de entrega.");
  return `${orderId}.${firma(secreto, tenantId, orderId)}`;
}

/** El id del pedido si la firma es de «Entregué» para este negocio; null si no (sin decir por qué). */
export function verificarTokenDeEntrega(secreto: string, tenantId: string, token: unknown): string | null {
  if (!secreto || !tenantId || typeof token !== "string" || token.length > 120) return null;
  const m = /^([A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const [, orderId, recibida] = m;
  const a = Buffer.from(recibida);
  const b = Buffer.from(firma(secreto, tenantId, orderId));
  return a.length === b.length && timingSafeEqual(a, b) ? orderId : null;
}

/** La ruta pública del «Entregué». */
export function rutaDeEntrega(token: string): string {
  return `/tienda/entrega/${encodeURIComponent(token)}`;
}

// ── Núcleo de la página y de la acción ───────────────────────────────────────────────────────────

export type PedidoDeLaEntrega = { id: string; code: number; status: string; fulfillment: string };

export type DepsDeLaEntrega = {
  /** El pedido por {id, tenantId}: con el id de otro negocio, null. */
  pedido(tenantId: string, orderId: string): Promise<PedidoDeLaEntrega | null>;
  /** ¿Ya hay un aviso ACCION_ENTREGO de este pedido? */
  yaAvisado(tenantId: string, orderId: string): Promise<boolean>;
  /** Graba ACCION_ENTREGO si todavía no está (con candado): «grabada» o «ya-estaba». */
  marcarEntregaUnaVez(tenantId: string, orderId: string, code: number): Promise<"grabada" | "ya-estaba">;
};

export type CtxDeLaEntrega = { tenantId: string; slug: string | null; secreto: string | null; token: unknown };

/** Lo que ve el repartidor: el botón, «ya avisaste» o por qué no hay nada que marcar. */
export type VistaDeLaEntrega =
  | { estado: "para-marcar" | "ya-avisado"; code: number }
  | { estado: "sin-efecto"; code: number | null; mensaje: string };

export type ResultadoDeLaEntrega = { ok: true; code: number; mensaje: string } | { ok: false; error: string };

const LINK_INVALIDO = "Este link no es de un pedido de este negocio. Avisale al local por WhatsApp.";

type Chequeo = { ok: true; pedido: PedidoDeLaEntrega } | { ok: false; code: number | null; mensaje: string };

async function chequear(ctx: CtxDeLaEntrega, deps: Pick<DepsDeLaEntrega, "pedido">): Promise<Chequeo> {
  if (!configDeliveryLocal(ctx.slug) || !ctx.secreto) return { ok: false, code: null, mensaje: LINK_INVALIDO };
  const orderId = verificarTokenDeEntrega(ctx.secreto, ctx.tenantId, ctx.token);
  if (!orderId) return { ok: false, code: null, mensaje: LINK_INVALIDO };
  const p = await deps.pedido(ctx.tenantId, orderId);
  if (!p || p.fulfillment !== "DELIVERY") return { ok: false, code: null, mensaje: LINK_INVALIDO };
  if (p.status === "CANCELLED") return { ok: false, code: p.code, mensaje: `El pedido #${p.code} fue cancelado: no hay nada que marcar. Si lo llevaste igual, avisale al local.` };
  if (p.status === "DELIVERED") return { ok: false, code: p.code, mensaje: `El local ya cerró el pedido #${p.code} como entregado. No hace falta marcar nada.` };
  if (p.status !== "READY") return { ok: false, code: p.code, mensaje: `El pedido #${p.code} todavía no figura listo para salir. Avisale al local.` };
  return { ok: true, pedido: p };
}

export async function vistaDeLaEntrega(ctx: CtxDeLaEntrega, deps: Pick<DepsDeLaEntrega, "pedido" | "yaAvisado">): Promise<VistaDeLaEntrega> {
  const c = await chequear(ctx, deps);
  if (!c.ok) return { estado: "sin-efecto", code: c.code, mensaje: c.mensaje };
  return { estado: (await deps.yaAvisado(ctx.tenantId, c.pedido.id)) ? "ya-avisado" : "para-marcar", code: c.pedido.code };
}

/** «Entregué»: graba el aviso UNA vez. No cambia el estado del pedido. */
export async function repartidorEntrego(ctx: CtxDeLaEntrega, deps: Pick<DepsDeLaEntrega, "pedido" | "marcarEntregaUnaVez">): Promise<ResultadoDeLaEntrega> {
  const c = await chequear(ctx, deps);
  if (!c.ok) return { ok: false, error: c.mensaje };
  const marca = await deps.marcarEntregaUnaVez(ctx.tenantId, c.pedido.id, c.pedido.code);
  return {
    ok: true,
    code: c.pedido.code,
    mensaje: marca === "grabada" ? `Listo: el local ya sabe que entregaste el pedido #${c.pedido.code}. ¡Gracias!` : `Ya lo habías marcado: el local ya sabe que el pedido #${c.pedido.code} está entregado.`,
  };
}
