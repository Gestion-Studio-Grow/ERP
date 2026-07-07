/**
 * ADAPTER real de COBROS: implementa `PasarelaCobros` contra Checkout Pro de
 * Mercado Pago (`POST /checkout/preferences`). Gemelo del adapter de ingesta
 * (../http.ts) pero para la SALIDA (crear link de pago).
 *
 * Diseño (idéntico en espíritu al de ingesta y al de ARCA):
 *  - Armado de body y parseo de la respuesta son PUROS y exportados (sin I/O),
 *    testeables con fixtures.
 *  - El transporte HTTP (POST) vive detrás de `TransportePost` (inyectable): en
 *    producción hace `fetch` POST; en tests se mockea.
 *  - El access token (credencial por tenant) reusa el seam `ProveedorAccessToken`
 *    de ../http — NUNCA hay secretos en el repo. Sin token, el default falla con
 *    "credencial requerida (acción humana)".
 *
 * Reusa de ../http: MP_API_BASE, RespuestaHttp, MercadoPagoApiError,
 * lanzarSiErrorHttp, ProveedorAccessToken, tokenNoConfigurado — misma familia MP.
 */

import {
  MP_API_BASE,
  type RespuestaHttp,
  type ProveedorAccessToken,
  tokenNoConfigurado,
  lanzarSiErrorHttp,
} from "../http";
import {
  type LinkDePago,
  type PasarelaCobros,
  type SolicitudCobro,
  SolicitudCobroInvalidaError,
  validarSolicitud,
} from "./port";

/** Moneda de la operación (pyme argentina). */
export const MONEDA_ARS = "ARS";

// ────────────────────────────────────────────────────────────────────────────
// Transporte POST (fetch en prod, mockeable en tests) — no lo tiene ../http (GET).
// ────────────────────────────────────────────────────────────────────────────

/** Transporte HTTP POST con cuerpo JSON. */
export interface TransportePost {
  post(url: string, headers: Record<string, string>, body: string): Promise<RespuestaHttp>;
}

/** Transporte real: POST JSON. No lanza en no-2xx: el status viaja al parser puro. */
export class FetchTransportePost implements TransportePost {
  async post(url: string, headers: Record<string, string>, body: string): Promise<RespuestaHttp> {
    const res = await fetch(url, { method: "POST", headers, body });
    const text = await res.text();
    return { status: res.status, body: text };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Forma cruda de Checkout Pro (lo que nos importa)
// ────────────────────────────────────────────────────────────────────────────

/** Body de `POST /checkout/preferences` (campos que mandamos). */
export interface RawPreferenceRequest {
  items: Array<{ title: string; quantity: number; unit_price: number; currency_id: string }>;
  external_reference?: string;
  payer?: { email: string };
}

/** Respuesta de `POST /checkout/preferences` (campos usados). */
export interface RawPreferenceResponse {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Armado de URL + body (PURO)
// ────────────────────────────────────────────────────────────────────────────

/** URL de `POST /checkout/preferences`. */
export function construirUrlPreferencia(baseUrl: string): string {
  return `${baseUrl}/checkout/preferences`;
}

/**
 * Arma el body de la preferencia desde una `SolicitudCobro` (PURO). Redondea el
 * monto a 2 decimales (centavos) para no mandar floats sucios a MP.
 */
export function armarBodyPreferencia(s: SolicitudCobro): RawPreferenceRequest {
  const body: RawPreferenceRequest = {
    items: [
      {
        title: s.concepto.trim(),
        quantity: s.cantidad ?? 1,
        unit_price: Math.round(s.monto * 100) / 100,
        currency_id: MONEDA_ARS,
      },
    ],
  };
  if (s.referenciaExterna) body.external_reference = s.referenciaExterna;
  if (s.emailPagador) body.payer = { email: s.emailPagador };
  return body;
}

/**
 * Parsea la respuesta de Checkout Pro → `LinkDePago` (PURO). Lanza si falta el id o
 * el init_point (respuesta inutilizable: no habría link para compartir).
 */
export function parsearPreferencia(body: string, s: SolicitudCobro): LinkDePago {
  const raw = JSON.parse(body) as RawPreferenceResponse;
  if (!raw.id || !raw.init_point) {
    throw new Error("Mercado Pago: respuesta de preferencia sin id o init_point.");
  }
  const link: LinkDePago = {
    preferenceId: raw.id,
    initPoint: raw.init_point,
    estado: "activa",
  };
  if (raw.sandbox_init_point) link.sandboxInitPoint = raw.sandbox_init_point;
  if (s.referenciaExterna) link.referenciaExterna = s.referenciaExterna;
  return link;
}

// ────────────────────────────────────────────────────────────────────────────
// Cliente
// ────────────────────────────────────────────────────────────────────────────

/** Dependencias inyectables (todas con default de producción). */
export interface HttpPasarelaCobrosDeps {
  transport?: TransportePost;
  baseUrl?: string;
}

/**
 * Adapter real de cobros. Implementa `PasarelaCobros` sobre Checkout Pro.
 * Sin credenciales, el token por defecto (`tokenNoConfigurado`) hace fallar la
 * operación con "acción humana requerida". Con un `ProveedorAccessToken` real, anda.
 */
export class HttpPasarelaCobros implements PasarelaCobros {
  private readonly transport: TransportePost;
  private readonly baseUrl: string;
  private readonly token: ProveedorAccessToken;

  constructor(token: ProveedorAccessToken = tokenNoConfigurado, deps: HttpPasarelaCobrosDeps = {}) {
    this.token = token;
    this.transport = deps.transport ?? new FetchTransportePost();
    this.baseUrl = deps.baseUrl ?? MP_API_BASE;
  }

  async crearLinkDePago(solicitud: SolicitudCobro): Promise<LinkDePago> {
    const errores = validarSolicitud(solicitud);
    if (errores.length > 0) throw new SolicitudCobroInvalidaError(errores);

    const resp = await this.transport.post(
      construirUrlPreferencia(this.baseUrl),
      {
        Authorization: `Bearer ${await this.token()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      JSON.stringify(armarBodyPreferencia(solicitud)),
    );
    lanzarSiErrorHttp(resp);
    return parsearPreferencia(resp.body, solicitud);
  }
}
