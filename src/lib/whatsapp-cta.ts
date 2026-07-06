// Lógica pura del CTA de WhatsApp (sin JSX, testeable con node:test).
//
// Regla del dueño: NUNCA un número hardcodeado ni abrir WhatsApp a un número
// falso. Si el tenant tiene su WhatsApp real configurado (BusinessSettings.whatsapp)
// se usa ese; si no, el CTA pide el número al usuario ahí mismo (just-in-time,
// ver src/components/whatsapp-cta.tsx) y recién con eso abre WhatsApp. El número
// que completa un visitante se guarda en localStorage, nunca en el repo/DB.

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
