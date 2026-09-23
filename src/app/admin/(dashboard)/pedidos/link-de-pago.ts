// ============================================================================
// LINK DE PAGO DE UN PEDIDO — cuándo se ofrece, qué dice y cómo se lee lo que ya se mandó. PURO.
// ============================================================================
//
// Desde la bandeja se genera un link de Mercado Pago atado al pedido: el MONTO sale de la base
// (`Order.total`), nunca de la pantalla, y la referencia del link es el pedido
// (`referenciaDePedido`, plugin de Mercado Pago).
//
// QUÉ PASA CUANDO EL CLIENTE PAGA. El Core sabe cobrar el pedido con el aviso de pago
// (`cobrarPedidoPorAvisoDePago`, order-core.ts: el mismo cobro del botón «Cobrar», un solo
// asiento aunque el aviso se repita), y el handler del plugin reconoce la referencia `pedido:`.
// Pero el webhook de producción TODAVÍA NO LE PASA ese cobro al handler
// (src/lib/mercadopago-dispatch.ts no conecta `cobrarPedido`, y
// src/app/api/webhooks/mercadopago/route.ts descarta el aviso si la facturación está apagada).
// Hasta que se conecte, un pedido pagado con el link se marca a mano con «Cobrar». Lo único
// que hoy recorre el cobro automático es el SIMULADOR (abajo).
//
// CUÁNDO SE OFRECE. Sólo en un negocio que tiene contratado el módulo de Mercado Pago
// (`Tenant.modules`, leído directo, como las apps de varios locales: el token de Mercado Pago es
// uno solo por despliegue, así que sin este candado cualquier comercio del mismo despliegue
// generaría links que cobran en esa cuenta) Y con Mercado Pago conectado (modo `test` o `real`).
// En el modo por defecto (`stub`) el link es de mentira (https://sandbox.local/…): mandárselo a
// un cliente real sería prometerle un cobro que no existe. La única excepción es el SIMULADOR de
// avisos (`MP_SIMULAR_AVISOS`), que existe para recorrer el circuito en QA sin Mercado Pago: ahí
// el link se genera marcado "de prueba" y aparece «Simular que pagó».
//
// Dato puro: lo importan la pantalla, la action y los tests.

import { fmtMoneyARS } from "@/components/ui/format";

export type ModoLink = "stub" | "test" | "real";

/** ¿Está prendido el simulador de avisos de pago? Sólo tiene efecto en modo `stub`. PURA. */
export function simuladorDeAvisosEncendido(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.MP_SIMULAR_AVISOS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** El módulo de cobros por Mercado Pago (src/modules/descriptors/mercadopago.ts). */
export const MODULO_MERCADOPAGO = "mercadopago";

/** ¿El negocio tiene contratado Mercado Pago? Sobre `Tenant.modules` tal cual está en la base. PURA. */
export function tieneMercadoPago(modules: readonly string[] | null | undefined): boolean {
  return Array.isArray(modules) && modules.includes(MODULO_MERCADOPAGO);
}

type CondicionesDelLink = { modo: ModoLink; simulador: boolean; moduloMercadoPago: boolean };

/** ¿Se ofrece «Link de pago» en la bandeja (y lo acepta la action)? PURA. */
export function linkDePagoDisponible(input: CondicionesDelLink): boolean {
  if (!input.moduloMercadoPago) return false;
  return input.modo !== "stub" || input.simulador;
}

/** ¿Se ofrece «Simular que pagó»? Nunca con Mercado Pago de verdad conectado. PURA. */
export function simulacionDisponible(input: CondicionesDelLink): boolean {
  return input.moduloMercadoPago && input.modo === "stub" && input.simulador;
}

/** El mensaje de WhatsApp con el link, para el cliente del pedido. PURA. */
export function textoDelLinkDePago(p: { negocio: string; code: number; monto: number; url: string }): string {
  return (
    `¡Hola! Te paso el link para pagar tu pedido #${p.code} de ${p.negocio} ` +
    `(${fmtMoneyARS(p.monto)}) con Mercado Pago:\n${p.url}`
  );
}

/** La acción de auditoría que deja cada link generado. */
export const ACCION_LINK_DE_PAGO = "link-de-pago";

export type LinkEnviado = { url: string; monto: number; prueba: boolean };

/**
 * El último link generado de cada pedido, leído de la auditoría (no hay columna para guardarlo
 * y sumarla es una migración). Tolerante: una fila rara no tira nada. PURA.
 */
export function ultimosLinks(
  filas: readonly { entityId: string | null; createdAt: Date; changes: unknown }[],
): Map<string, LinkEnviado> {
  const out = new Map<string, { link: LinkEnviado; cuando: number }>();
  for (const f of filas) {
    if (!f.entityId) continue;
    const c = f.changes && typeof f.changes === "object" ? (f.changes as Record<string, unknown>) : {};
    if (typeof c.url !== "string" || typeof c.monto !== "number") continue;
    const cuando = new Date(f.createdAt).getTime();
    const previo = out.get(f.entityId);
    if (previo && previo.cuando >= cuando) continue;
    out.set(f.entityId, { link: { url: c.url, monto: c.monto, prueba: c.modo !== "real" }, cuando });
  }
  return new Map([...out].map(([id, v]) => [id, v.link]));
}
