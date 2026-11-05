// ============================================================================
// OAuth REAL de Mercado Pago (authorization code + PKCE S256) — sin base, sin React.
// ============================================================================
//
// Lo usa «Conectá tu Mercado Pago» de Factoque (src/lib/facturita-mp.server.ts). El negocio
// autoriza en el sitio de MP; volvemos con un `code` de un solo uso (vale 10 minutos) y lo
// canjeamos por access_token (180 días) + refresh_token. Nunca la clave de MP del negocio.
//
// Fuente (verificada el 05/11/2026; el ejemplo oficial trae `grant_type` mal, se sigue el texto):
//   https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/security/oauth/creation
//   https://www.mercadopago.com.br/developers/en/reference/authentication/oauth/_oauth_token/post
//
// La app de MP es de GSG (una sola, para todos los negocios). Sus credenciales viven en el entorno:
// sin ellas `configOAuthMP` devuelve null y la pantalla dice «todavía no disponible».

import { createHash, randomBytes } from "node:crypto";

export const VARIABLE_CLIENT_ID_MP = "MP_OAUTH_CLIENT_ID";
export const VARIABLE_CLIENT_SECRET_MP = "MP_OAUTH_CLIENT_SECRET";
/** La «clave secreta» de webhooks de la app de MP: firma los avisos de todos los negocios conectados. */
export const VARIABLE_WEBHOOK_SECRET_MP = "MP_OAUTH_WEBHOOK_SECRET";
/** Opcional: la URL de vuelta exacta registrada en la app (si no, se arma con el host del pedido). */
export const VARIABLE_REDIRECT_MP = "MP_OAUTH_REDIRECT_URI";

export const URL_AUTORIZACION_MP = "https://auth.mercadopago.com/authorization";
export const URL_TOKEN_MP = "https://api.mercadopago.com/oauth/token";

export interface ConfigOAuthMP {
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  redirectUri: string | null;
}

/** Las credenciales de la app de GSG, o null si falta alguna (no rompe: «todavía no disponible»). */
export function configOAuthMP(env: Record<string, string | undefined>): ConfigOAuthMP | null {
  const clientId = env[VARIABLE_CLIENT_ID_MP]?.trim();
  const clientSecret = env[VARIABLE_CLIENT_SECRET_MP]?.trim();
  const webhookSecret = env[VARIABLE_WEBHOOK_SECRET_MP]?.trim();
  if (!clientId || !clientSecret || !webhookSecret) return null;
  // El client id de MP es numérico; si no, es un error de carga y no se arma un link roto.
  if (!/^\d{1,32}$/.test(clientId)) return null;
  const redirect = env[VARIABLE_REDIRECT_MP]?.trim() || null;
  if (redirect && !esUrlDeVueltaValida(redirect)) return null;
  return { clientId, clientSecret, webhookSecret, redirectUri: redirect };
}

/** https obligatorio (http sólo en localhost, para probar en la compu). */
export function esUrlDeVueltaValida(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password || u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

// ── PKCE y state ─────────────────────────────────────────────────────────────

/** 32 bytes al azar en base64url (43 caracteres): sirve de `state` y de `code_verifier`. */
export function azarUrl(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** code_challenge = BASE64URL(SHA256(code_verifier)), método S256. */
export function desafioPkce(verificador: string): string {
  return createHash("sha256").update(verificador, "ascii").digest("base64url");
}

export function urlAutorizacionMP(p: { clientId: string; redirectUri: string; state: string; verificador: string }): string {
  const qs = new URLSearchParams({
    client_id: p.clientId,
    response_type: "code",
    platform_id: "mp",
    state: p.state,
    redirect_uri: p.redirectUri,
    code_challenge: desafioPkce(p.verificador),
    code_challenge_method: "S256",
  });
  return `${URL_AUTORIZACION_MP}?${qs.toString()}`;
}

// ── Canje y renovación ───────────────────────────────────────────────────────

export interface TokensMP {
  accessToken: string;
  refreshToken: string;
  /** Vencimiento del access token. */
  expiraEn: Date;
  /** La cuenta de MP del negocio (user_id / collector id). */
  cuentaMp: string;
}

/** Lo mínimo de `fetch` que se usa (inyectable en los tests). */
export type PedirMP = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Por qué no salió. Nunca lleva el cuerpo de MP (podría traer tokens). */
export class OAuthMPError extends Error {
  constructor(
    readonly motivo: "rechazado" | "respuesta_invalida" | "sin_red",
    readonly estadoHttp: number | null = null,
  ) {
    super(`OAuth de Mercado Pago: ${motivo}${estadoHttp ? ` (HTTP ${estadoHttp})` : ""}`);
    this.name = "OAuthMPError";
  }
}

const RE_TOKEN = /^[A-Za-z0-9_.:-]{8,512}$/;
const RE_CUENTA = /^\d{1,20}$/;
/** Si MP no dice cuánto dura, se toma corto (un día): se renueva antes y no se confía de más. */
const DURACION_POR_DEFECTO_S = 24 * 60 * 60;
const DURACION_MAXIMA_S = 400 * 24 * 60 * 60;

/** Valida la respuesta de /oauth/token: todo lo que se guarda tiene forma conocida. */
export function parsearTokensMP(cuerpo: unknown, ahora: Date): TokensMP {
  const o = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
  const accessToken = o.access_token;
  const refreshToken = o.refresh_token;
  const userId = typeof o.user_id === "number" ? String(o.user_id) : o.user_id;
  if (typeof accessToken !== "string" || !RE_TOKEN.test(accessToken)) throw new OAuthMPError("respuesta_invalida");
  if (typeof refreshToken !== "string" || !RE_TOKEN.test(refreshToken)) throw new OAuthMPError("respuesta_invalida");
  if (typeof userId !== "string" || !RE_CUENTA.test(userId)) throw new OAuthMPError("respuesta_invalida");
  const exp = typeof o.expires_in === "number" && Number.isFinite(o.expires_in) && o.expires_in > 0
    ? Math.min(o.expires_in, DURACION_MAXIMA_S)
    : DURACION_POR_DEFECTO_S;
  return { accessToken, refreshToken, cuentaMp: userId, expiraEn: new Date(ahora.getTime() + exp * 1000) };
}

async function pedirTokens(pedir: PedirMP, campos: Record<string, string>, ahora: Date): Promise<TokensMP> {
  let r: Awaited<ReturnType<PedirMP>>;
  try {
    r = await pedir(URL_TOKEN_MP, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(campos).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OAuthMPError("sin_red");
  }
  if (!r.ok) throw new OAuthMPError("rechazado", r.status);
  let cuerpo: unknown;
  try {
    cuerpo = await r.json();
  } catch {
    throw new OAuthMPError("respuesta_invalida", r.status);
  }
  return parsearTokensMP(cuerpo, ahora);
}

export function canjearCodigoMP(
  cfg: ConfigOAuthMP,
  p: { code: string; redirectUri: string; verificador: string },
  pedir: PedirMP,
  ahora: Date = new Date(),
): Promise<TokensMP> {
  return pedirTokens(
    pedir,
    {
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code: p.code,
      redirect_uri: p.redirectUri,
      code_verifier: p.verificador,
    },
    ahora,
  );
}

export function refrescarTokenMP(cfg: ConfigOAuthMP, refreshToken: string, pedir: PedirMP, ahora: Date = new Date()): Promise<TokensMP> {
  return pedirTokens(
    pedir,
    { grant_type: "refresh_token", client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken },
    ahora,
  );
}

/** Margen de renovación: el access token dura 180 días; se renueva cuando faltan 15. */
export const MARGEN_RENOVACION_MS = 15 * 24 * 60 * 60 * 1000;

export function hayQueRenovar(expiraEn: Date | null, ahora: Date): boolean {
  return !!expiraEn && expiraEn.getTime() - ahora.getTime() < MARGEN_RENOVACION_MS;
}
