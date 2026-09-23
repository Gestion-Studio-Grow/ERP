// Lógica pura del CTA de WhatsApp (sin JSX, testeable con node:test).
//
// Regla del dueño: NUNCA un número hardcodeado ni abrir WhatsApp a un número
// falso. Si el tenant tiene su WhatsApp real configurado (BusinessSettings.whatsapp)
// se usa ese; si no, el CTA pide el número al usuario ahí mismo (just-in-time,
// ver src/components/whatsapp-cta.tsx) y recién con eso abre WhatsApp. El número
// que completa un visitante se guarda en localStorage, nunca en el repo/DB.

import { normalizarTelefono } from "@/lib/clientes/telefono";

/** Solo dígitos — formato E.164 sin "+" que espera wa.me. */
export function sanitizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function buildWhatsAppHref(number: string, message: string): string {
  return `https://wa.me/${sanitizePhone(number)}?text=${encodeURIComponent(message)}`;
}

/** Namespaced por tenant: cada vidriera guarda el número que le completaron a ELLA. */
export function whatsappStorageKey(tenantKey: string): string {
  return `gsg-whatsapp-${tenantKey}`;
}

/**
 * Link de WhatsApp a una CLIENTA, desde la agenda o la ficha. `null` si el teléfono cargado
 * no es un número argentino de 10 dígitos: la regla de arriba vale también acá, no se abre
 * WhatsApp a un número que no es el de ella.
 *
 * Por qué no alcanza con `buildWhatsAppHref(phone)`: la ficha guarda lo que se tipeó, y
 * `sanitizePhone("11 4000-7919")` da "1140007919", sin el 54 del país que wa.me necesita;
 * `sanitizePhone("011 15-4000-7919")` da "0111540007919", con el 0 y el 15 adentro.
 * Se arma desde la clave de `normalizarTelefono` (10 dígitos: área + número) con el 549 del
 * formato internacional de celular argentino adelante.
 */
export function waLinkClienta(phone: string | null | undefined, texto = ""): string | null {
  const clave = normalizarTelefono(phone);
  if (clave.length !== 10) return null;
  const numero = `549${clave}`;
  return texto ? buildWhatsAppHref(numero, texto) : `https://wa.me/${numero}`;
}
