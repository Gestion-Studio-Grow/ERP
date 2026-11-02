// Ingreso con Google (OpenID Connect, código con PKCE). Puro: arma la dirección y valida lo que vuelve. Google no crea
// cuentas: sólo entra quien ya tiene un usuario activo con ese mail en este negocio.

import { createHash, randomBytes } from "node:crypto";

export const COOKIE_GOOGLE = "admin_ingreso_google";
const EMISORES = ["https://accounts.google.com", "accounts.google.com"];

export interface EstadoGoogle {
  estado: string;
  nonce: string;
  verificador: string;
  next: string;
}

export function nuevoEstadoGoogle(next: string): EstadoGoogle {
  const azar = () => randomBytes(32).toString("base64url");
  return { estado: azar(), nonce: azar(), verificador: azar(), next };
}

export function direccionDeGoogle(d: { clienteId: string; vuelta: string; estado: EstadoGoogle }): string {
  const q = new URLSearchParams({
    client_id: d.clienteId,
    redirect_uri: d.vuelta,
    response_type: "code",
    scope: "openid email",
    state: d.estado.estado,
    nonce: d.estado.nonce,
    code_challenge: createHash("sha256").update(d.estado.verificador).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/**
 * El token llega directo de Google por TLS en el canje del código, así que OpenID Connect (Core §3.1.3.7) no exige comprobar su
 * firma; sí emisor, destinatario, vencimiento y nonce. Devuelve el mail sólo si Google lo verificó.
 */
export function mailDelToken(idToken: string, d: { clienteId: string; nonce: string; ahoraMs: number }): string | null {
  let c: { iss?: string; aud?: string; exp?: number; nonce?: string; email?: string; email_verified?: boolean | string };
  try {
    c = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!c.iss || !EMISORES.includes(c.iss)) return null;
  if (c.aud !== d.clienteId || c.nonce !== d.nonce) return null;
  if (typeof c.exp !== "number" || c.exp * 1000 <= d.ahoraMs) return null;
  if (c.email_verified !== true && c.email_verified !== "true") return null;
  return c.email ? c.email.trim().toLowerCase() : null;
}

/** Sólo a una ruta de este mismo sitio. */
export const nextSeguro = (next: string | null): string => (next && /^\/(?![/\\])[^\s\\]*$/.test(next) ? next : "/admin");
