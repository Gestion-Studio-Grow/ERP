// Fábrica de tenants — ADAPTADORES EXTERNOS REALES (ADR-074, wiring Fase 2).
//
// Los efectos externos de la saga (ligar el host/DNS, invitar al dueño por email) que en la
// iteración de scaffold (ADR-074) eran STUBS no-op. Acá van los adaptadores DE VERDAD, pero
// GATEADOS POR CREDENCIALES (SEC-1 / ADR-041: los secretos los pega el dueño, nunca el agente):
//
//   - Si el servicio ESTÁ configurado (env presente) → hace la llamada real (Vercel / email).
//   - Si NO está configurado → se SALTA HONESTAMENTE: devuelve `{bound/sent:false, note:"..."}`
//     en vez de mentir "hecho". La saga lo junta como *followup* (pendiente manual) y el alta
//     igual queda ACTIVE (el tenant existe y opera; falta rematar el link/invitación a mano).
//   - Un fallo REAL (el servicio existe pero rechazó) se LANZA → dispara la compensación.
//
// Puro de Prisma/React: sólo usa `fetch` y `process.env`. La config y el `fetch` se inyectan para
// poder testear los tres caminos (configurado-ok / no-configurado / fallo) sin red. `runtime.ts`
// los ensambla leyendo el env real.

import type { HostBinder, Inviter } from "./ports";
import type { HostBindOutcome, InviteOutcome } from "./types";

type FetchImpl = typeof fetch;

// ============================================================================
// Host binder — Vercel Domains API (subdominio propio del tenant, ADR-029)
// ============================================================================

export interface VercelConfig {
  token: string;
  projectId: string;
  /** Dominio base sobre el que cuelga el subdominio del tenant (`<sub>.<domain>`). */
  domain: string;
  /** Opcional: id del team/scope de Vercel. */
  teamId?: string;
}

/** Lee la config de Vercel del entorno; `null` si falta algo (→ el binder se salta honesto). */
export function readVercelConfig(env: Record<string, string | undefined> = process.env): VercelConfig | null {
  const token = env.VERCEL_TOKEN?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  const domain = (env.APP_BASE_DOMAIN ?? env.VERCEL_TENANT_DOMAIN)?.trim();
  if (!token || !projectId || !domain) return null;
  return { token, projectId, domain, teamId: env.VERCEL_TEAM_ID?.trim() || undefined };
}

const HOST_SKIP_NOTE =
  "binding de host no configurado (faltan VERCEL_TOKEN / VERCEL_PROJECT_ID / APP_BASE_DOMAIN). " +
  "Agregá el subdominio al proyecto de Vercel a mano, o cargá esas credenciales para automatizarlo.";

/**
 * Liga el subdominio del tenant como dominio del proyecto en Vercel. Idempotente en la práctica
 * (re-agregar un dominio ya presente en ESTE proyecto devuelve 200). Sin credenciales → se salta.
 */
export class VercelHostBinder implements HostBinder {
  private readonly config: VercelConfig | null;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: { config?: VercelConfig | null; fetchImpl?: FetchImpl } = {}) {
    this.config = opts.config !== undefined ? opts.config : readVercelConfig();
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private endpoint(path: string): string {
    const c = this.config!;
    const q = c.teamId ? `?teamId=${encodeURIComponent(c.teamId)}` : "";
    return `https://api.vercel.com${path}${q}`;
  }

  async bind(subdomain: string, _tenantId: string): Promise<HostBindOutcome> {
    if (!this.config) return { bound: false, note: HOST_SKIP_NOTE };
    const name = `${subdomain}.${this.config.domain}`;
    const res = await this.fetchImpl(this.endpoint(`/v10/projects/${this.config.projectId}/domains`), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) return { bound: true };
    // Fallo real (dominio tomado por otro proyecto, token inválido, etc.) → se lanza para compensar.
    const detail = await safeErrorDetail(res);
    throw new Error(`Vercel host bind falló (${res.status}) para "${name}": ${detail}`);
  }

  async unbind(subdomain: string, _tenantId: string): Promise<void> {
    if (!this.config) return; // nada que deshacer si nunca se ligó
    const name = `${subdomain}.${this.config.domain}`;
    const res = await this.fetchImpl(
      this.endpoint(`/v9/projects/${this.config.projectId}/domains/${encodeURIComponent(name)}`),
      { method: "DELETE", headers: { Authorization: `Bearer ${this.config.token}` } },
    );
    // 404 = ya no está: la compensación es idempotente, no es error.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Vercel host unbind falló (${res.status}) para "${name}"`);
    }
  }
}

// ============================================================================
// Inviter — email de bienvenida al dueño (proveedor: Resend)
// ============================================================================

export interface EmailConfig {
  apiKey: string;
  from: string;
  /** Base pública para armar el link de acceso del dueño (opcional). */
  appBaseUrl?: string;
}

/** Lee la config de email del entorno; `null` si falta algo (→ el inviter se salta honesto). */
export function readEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.INVITE_EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from, appBaseUrl: env.APP_BASE_URL?.trim() || undefined };
}

const INVITE_SKIP_NOTE =
  "invitación por email no configurada (faltan RESEND_API_KEY / INVITE_EMAIL_FROM). " +
  "Comunicale el acceso al dueño a mano (email de login + contraseña de bootstrap por canal seguro).";

/**
 * Envía el email de bienvenida al dueño con el link de acceso. NO manda la contraseña de bootstrap
 * por email (se entrega aparte, una sola vez, por canal seguro — SEC-1). Sin credenciales → se salta.
 */
export class EmailInviter implements Inviter {
  private readonly config: EmailConfig | null;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: { config?: EmailConfig | null; fetchImpl?: FetchImpl } = {}) {
    this.config = opts.config !== undefined ? opts.config : readEmailConfig();
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async invite(email: string, _tenantId: string): Promise<InviteOutcome> {
    if (!this.config) return { sent: false, note: INVITE_SKIP_NOTE };
    const loginUrl = this.config.appBaseUrl ? `${this.config.appBaseUrl}/admin` : undefined;
    const html =
      `<p>¡Tu panel ya está listo!</p>` +
      `<p>Ingresás con este email${loginUrl ? ` en <a href="${loginUrl}">${loginUrl}</a>` : ""}.</p>` +
      `<p>La contraseña inicial te la comparte tu contacto por un canal seguro (no viaja por este mail).</p>`;
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.config.from, to: email, subject: "Tu panel está listo", html }),
    });
    if (res.ok) return { sent: true };
    const detail = await safeErrorDetail(res);
    throw new Error(`Envío de invitación falló (${res.status}) para "${email}": ${detail}`);
  }

  async revoke(): Promise<void> {
    // Un email ya enviado no se "des-envía"; no hay compensación técnica. La invitación es el ÚLTIMO
    // paso externo antes de ACTIVE, así que en la práctica esta compensación no se dispara.
  }
}

/** Extrae un mensaje de error legible del body sin romper si no es JSON. */
async function safeErrorDetail(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string; code?: string } };
    return data?.error?.message ?? data?.error?.code ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
