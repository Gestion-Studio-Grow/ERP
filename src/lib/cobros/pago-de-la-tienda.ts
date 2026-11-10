// ============================================================================
// PAGAR UN PEDIDO DE LA TIENDA CON MERCADO PAGO DESDE «GRACIAS» (Magra T6a). PURO.
// ============================================================================
//
// La clienta que acaba de pedir en la vidriera puede pagar con Mercado Pago desde la página de
// Gracias. El link es el MISMO que arma la bandeja (`generarLinkDePagoDePedido`): monto de la base,
// referencia `gsg:<slug>:pedido:<id>` y el webhook lo cobra solo (`cobrarPedidoPorAvisoDePago`).
//
// QUIÉN PUEDE PEDIRLO. La página es pública y el número de pedido es correlativo (adivinable): con
// sólo el número, cualquiera generaría links de pedidos ajenos. Por eso el redirect del alta lleva
// un TOKEN (`&t=`): HMAC del negocio y del id del pedido (que no viaja), con una clave derivada de
// `AUTH_SECRET` con su propia etiqueta, como `turnos/codigo-anulacion.ts`. Una firma de sesión no
// sirve de token ni al revés. Se compara en tiempo constante.
//
// Este módulo usa `node:crypto`: sólo del lado del servidor. No lee la base ni el entorno.

import { createHmac, timingSafeEqual } from "node:crypto";
import { round2 } from "@/lib/round";
import { linkDePagoDisponible, type LinkEnviado, type ModoLink } from "@/app/admin/(dashboard)/pedidos/link-de-pago";

const ETIQUETA_DE_LA_CLAVE = "gsg:pago-de-la-tienda:v1";

/** Cuánto vale el botón después del pedido: pasado esto, el pago se coordina con el local. */
export const VIGENCIA_PAGO_TIENDA_MS = 48 * 60 * 60 * 1000;

function firma(secreto: string, tenantId: string, orderId: string): Buffer {
  const clave = createHmac("sha256", secreto).update(ETIQUETA_DE_LA_CLAVE).digest();
  // JSON: los campos quedan separados sin ambigüedad, sea cual sea su contenido.
  return createHmac("sha256", clave).update(JSON.stringify([tenantId, orderId])).digest();
}

/** El token que viaja en `/tienda/gracias?pedido=<code>&t=<token>`. base64url, 43 caracteres. PURA. */
export function tokenDelPedido(secreto: string, tenantId: string, orderId: string): string {
  return firma(secreto, tenantId, orderId).toString("base64url");
}

/** ¿El token es el de ESE pedido de ESE negocio? Tiempo constante; nunca tira. PURA. */
export function tokenDelPedidoValido(secreto: string, tenantId: string, orderId: string, token: unknown): boolean {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const esperado = firma(secreto, tenantId, orderId);
  const recibido = Buffer.from(token, "base64url");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/** Lo que la página manda: el número de pedido y el token, tal como vinieron en la URL. PURA. */
export function leerPedidoYToken(pedido: unknown, token: unknown): { code: number; token: string } | null {
  const p = typeof pedido === "string" ? pedido.trim() : "";
  const t = typeof token === "string" ? token.trim() : "";
  if (!/^\d{1,9}$/.test(p) || !/^[A-Za-z0-9_-]{43}$/.test(t)) return null;
  return { code: Number(p), token: t };
}

export type PedidoParaPagar = {
  id: string;
  code: number;
  tenantId: string;
  channel: string;
  status: string;
  paid: boolean;
  total: number;
  createdAt: Date;
};

export type MotivoSinPago = "token" | "otro-negocio" | "no-es-online" | "pagado" | "anulado" | "vencido" | "sin-importe";

/** Los textos para la clienta, en criollo. */
export const MENSAJE_SIN_PAGO: Record<MotivoSinPago | "sin-mp" | "falla", string> = {
  token: "No pudimos comprobar que el pedido es tuyo. Escribinos y te pasamos el link para pagar.",
  "otro-negocio": "No encontramos ese pedido. Escribinos y lo vemos juntos.",
  "no-es-online": "Este pedido se paga en el local.",
  pagado: "Este pedido ya está pagado. ¡Gracias!",
  anulado: "Este pedido está anulado: no hay nada para pagar.",
  vencido: "El link para pagar este pedido venció. Escribinos y te pasamos uno nuevo.",
  "sin-importe": "Este pedido todavía no tiene importe para pagar. Te escribimos con el total.",
  "sin-mp": "El pago con Mercado Pago no está disponible ahora. Te escribimos para coordinar el pago.",
  falla: "No pudimos abrir Mercado Pago ahora. Probá de nuevo en un rato o escribinos.",
};

/**
 * ¿Se puede pagar este pedido desde la tienda? El orden importa: primero la prueba de que es de
 * quien pregunta (token) y de este negocio; recién después se dice algo del estado del pedido
 * (sin el token, «ya está pagado» filtraría datos de un pedido ajeno). PURA.
 */
export function decidirPagoDeLaTienda(input: {
  pedido: PedidoParaPagar;
  tenantId: string;
  tokenValido: boolean;
  ahoraMs: number;
}): { ok: true; monto: number } | { ok: false; motivo: MotivoSinPago } {
  const p = input.pedido;
  if (p.tenantId !== input.tenantId) return { ok: false, motivo: "otro-negocio" };
  if (!input.tokenValido) return { ok: false, motivo: "token" };
  if (p.channel !== "ONLINE") return { ok: false, motivo: "no-es-online" };
  if (p.status === "CANCELLED") return { ok: false, motivo: "anulado" };
  if (p.paid) return { ok: false, motivo: "pagado" };
  const edad = input.ahoraMs - new Date(p.createdAt).getTime();
  if (!(edad <= VIGENCIA_PAGO_TIENDA_MS)) return { ok: false, motivo: "vencido" };
  const monto = round2(p.total);
  if (!(monto > 0)) return { ok: false, motivo: "sin-importe" };
  return { ok: true, monto };
}

/**
 * El link ya generado que se puede volver a mandar (no se crea otro): el último auditado del pedido
 * (`ultimosLinks`), si es por el MISMO monto que hoy tiene el pedido (Magra ajusta el total al peso
 * real: con otro monto el aviso no cobraría solo) y del mismo modo (prueba/real). PURA.
 */
export function linkParaReusar(ultimo: LinkEnviado | undefined, monto: number, modo: ModoLink): LinkEnviado | null {
  if (!ultimo) return null;
  if (Math.abs(round2(ultimo.monto) - round2(monto)) > 0.009) return null;
  if (ultimo.prueba !== (modo !== "real")) return null;
  return ultimo;
}

/** ¿Se muestra «Pagar ahora con Mercado Pago» en Gracias? Misma regla que la bandeja, más el token. PURA. */
export function botonDePagoVisible(input: {
  modo: ModoLink;
  simulador: boolean;
  moduloMercadoPago: boolean;
  pedidoYToken: { code: number; token: string } | null;
}): boolean {
  if (!input.pedidoYToken) return false;
  return linkDePagoDisponible({ modo: input.modo, simulador: input.simulador, moduloMercadoPago: input.moduloMercadoPago });
}
