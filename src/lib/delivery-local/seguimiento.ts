// ============================================================================
// DELIVERY LOCAL · EL SEGUIMIENTO DEL PEDIDO — el link que recibe el cliente y lo que ve. PURA.
// ============================================================================
//
// EL LINK. `/tienda/pedido/<token>`, con token = `<orderId>.<firma>`. La firma es un HMAC sobre el
// negocio y el pedido con una clave DERIVADA de `AUTH_SECRET` (etiqueta propia: una firma de sesión
// no sirve de link ni al revés). Sin tabla nueva y sin guardar nada: el link vale para ESE pedido de
// ESE negocio y nada más; con el id de otro pedido, o en el host de otro negocio, la firma no da.
// Rotar `AUTH_SECRET` invalida los links viejos (el pedido sigue en la bandeja; sólo se pierde el
// seguimiento público, que dura lo que dura un delivery).
//
// LO QUE SE MUESTRA. Sólo lo que el cliente ya sabe: número, estado, lo que pidió, total y cómo
// pagar. NUNCA la dirección, el teléfono ni la ubicación (un link reenviado no expone a nadie).

import { createHmac, timingSafeEqual } from "node:crypto";
import { vueltoALlevar, type MedioPreferido } from "./pago";

const ETIQUETA = "gsg:delivery-local:seguimiento:v1";
const LARGO_FIRMA = 22; // base64url → 132 bits

function clave(secreto: string): Buffer {
  return createHmac("sha256", secreto).update(ETIQUETA).digest();
}

function firma(secreto: string, tenantId: string, orderId: string): string {
  return createHmac("sha256", clave(secreto)).update(`${tenantId}:${orderId}`).digest("base64url").slice(0, LARGO_FIRMA);
}

export function tokenDeSeguimiento(secreto: string, tenantId: string, orderId: string): string {
  if (!secreto) throw new Error("Falta el secreto del seguimiento.");
  return `${orderId}.${firma(secreto, tenantId, orderId)}`;
}

/** El id del pedido si la firma es de este negocio; null si no (sin decir por qué). */
export function verificarToken(secreto: string, tenantId: string, token: string): string | null {
  if (!secreto || typeof token !== "string" || token.length > 120) return null;
  const m = /^([A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const [, orderId, recibida] = m;
  const esperada = firma(secreto, tenantId, orderId);
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b) ? orderId : null;
}

// ── Los pasos que ve el cliente ───────────────────────────────────────────────────────────────────

export type EstadoDelPedido = "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";

export type PasoVisible = { id: string; titulo: string };

export type VistaDelSeguimiento = {
  pasos: PasoVisible[];
  /** Índice del paso actual en `pasos`; -1 si se canceló. */
  actual: number;
  titular: string;
  detalle: string;
  terminado: boolean;
};

export function vistaDelSeguimiento(p: {
  status: EstadoDelPedido;
  envio: boolean;
  enCamino: boolean;
  paid: boolean;
  medio: "transferencia" | "efectivo" | "mercadopago" | null;
}): VistaDelSeguimiento {
  const pasos: PasoVisible[] = [
    { id: "recibido", titulo: "Recibido" },
    { id: "confirmado", titulo: "Confirmado" },
    { id: "preparando", titulo: "En preparación" },
    p.envio ? { id: "camino", titulo: "En camino" } : { id: "listo", titulo: "Listo para retirar" },
    { id: "entregado", titulo: "Entregado" },
  ];
  if (p.status === "CANCELLED") {
    return { pasos, actual: -1, titular: "El pedido se canceló", detalle: "Si ya pagaste, el local te devuelve la plata por el mismo medio. Escribile por WhatsApp.", terminado: true };
  }
  if (p.status === "PENDING") {
    const detalle =
      p.medio === "transferencia" && !p.paid
        ? "Hacé la transferencia y mandale el comprobante al local por WhatsApp. Lo confirman apenas ven la plata."
        : p.medio === "mercadopago" && !p.paid
          ? "El local te va a mandar el link de Mercado Pago por WhatsApp."
          : "El local está mirando tu pedido. Te confirman en unos minutos.";
    return { pasos, actual: 0, titular: "Recibimos tu pedido", detalle, terminado: false };
  }
  if (p.status === "CONFIRMED") return { pasos, actual: 1, titular: "¡Pedido confirmado!", detalle: "El local ya lo tiene en la lista.", terminado: false };
  if (p.status === "PREPARING") return { pasos, actual: 2, titular: "Lo están preparando", detalle: "Ya está en la cocina.", terminado: false };
  if (p.status === "READY") {
    if (!p.envio) return { pasos, actual: 3, titular: "Listo para retirar", detalle: "Pasá por el local cuando quieras.", terminado: false };
    return p.enCamino
      ? { pasos, actual: 3, titular: "Va en camino", detalle: "El repartidor del local ya salió para tu casa.", terminado: false }
      : { pasos, actual: 2, titular: "Listo, sale en un ratito", detalle: "Está esperando al repartidor del local.", terminado: false };
  }
  return { pasos, actual: 4, titular: "Entregado", detalle: "¡Que lo disfrutes! Gracias por pedirle directo al local.", terminado: true };
}

// ── Cómo paga el cliente (sale de la AUDITORÍA del alta, `entregaLocal.pago`; nunca de la nota) ──

const pesosEnteros = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/**
 * El renglón de pago del seguimiento: cómo dijo que paga y, en efectivo, con cuánto y su vuelto.
 * null si no eligió medio, si ya está pagado (la página ya lo dice) o si se canceló.
 * `transferenciaVisible`: si el alias se muestra en la página (si no, el local lo pasa por WhatsApp).
 */
export function pagoParaElCliente(p: {
  medio: MedioPreferido | null;
  pagaCon: number | null;
  total: number;
  paid: boolean;
  cancelado: boolean;
  transferenciaVisible: boolean;
}): { titulo: string; detalle: string } | null {
  if (!p.medio || p.paid || p.cancelado) return null;
  if (p.medio === "efectivo") {
    if (p.pagaCon === null) return { titulo: "Pagás en efectivo", detalle: "Justo, sin vuelto." };
    const vuelto = vueltoALlevar(p.total, p.pagaCon);
    return {
      titulo: "Pagás en efectivo",
      detalle: vuelto !== null ? `Con ${pesosEnteros(p.pagaCon)}: tu vuelto es ${pesosEnteros(vuelto)}.` : `Con ${pesosEnteros(p.pagaCon)}, justo.`,
    };
  }
  if (p.medio === "transferencia") {
    return {
      titulo: "Pagás por transferencia",
      detalle: p.transferenciaVisible ? "Los datos para transferir están acá abajo." : "El local te pasa el alias por WhatsApp al confirmar.",
    };
  }
  return { titulo: "Pagás con link de Mercado Pago", detalle: "El local te lo manda por WhatsApp." };
}
