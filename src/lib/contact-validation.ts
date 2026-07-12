// ============================================================================
// Validación de contacto (email + teléfono AR) — PURA, compartida cliente/servidor.
// ============================================================================
//
// CH-A1: el teléfono (WhatsApp) y el email son el canal por el que sale el recordatorio del
// turno. Si entran mal formados, el turno se agenda pero el cliente NUNCA recibe el aviso. Estas
// reglas se usan en el modal (feedback inmediato + habilitar "Confirmar") Y en la server action
// (autoridad: nunca se confía en el cliente). Sin DB. Criollo/argentino en los mensajes (ADR-046).

/** Email con forma válida (algo@algo.dominio). Vacío se maneja aparte (campo opcional). */
export function isValidEmail(raw: string | null | undefined): boolean {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Teléfono argentino "razonable": se ignoran separadores (espacios, guiones, paréntesis, +) y se
 * cuentan los dígitos. Válido entre 10 (nacional sin 0 ni 15: área + número) y 13 (con 54 9 +
 * área + número). Rechaza letras y basura tipo "esto-no-es-un-email"/"abc". No pretende ser un
 * validador E.164 estricto — sí atajar el dato que romper­ía el recordatorio.
 */
export function isValidArgentinePhone(raw: string | null | undefined): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  if (/[a-zA-Z]/.test(s)) return false; // letras → no es un teléfono
  if (/[^\d\s()+\-.]/.test(s)) return false; // solo dígitos y separadores usuales
  const digits = s.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

export type ContactValidation = { ok: true } | { ok: false; error: string };

/**
 * Valida el par (teléfono, email) de una reserva. El teléfono es OBLIGATORIO y con formato; el
 * email es OPCIONAL pero, si viene, tiene que ser válido. Devuelve el primer error en criollo.
 */
export function validateBookingContact(phone: string, email?: string | null): ContactValidation {
  if (!isValidArgentinePhone(phone)) {
    return { ok: false, error: "Poné un teléfono válido (con característica, ej: 11 2345 6789)." };
  }
  const mail = String(email ?? "").trim();
  if (mail && !isValidEmail(mail)) {
    return { ok: false, error: "Ese email no parece válido. Revisalo o dejalo vacío." };
  }
  return { ok: true };
}
