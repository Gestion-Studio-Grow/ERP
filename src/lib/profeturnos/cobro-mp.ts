// PROFETURNOS · El cobro del abono mensual por Mercado Pago (T2): la preferencia de Checkout Pro y la
// re-lectura del pago, con la cuenta de GSG (`MP_ACCES_TOKEN`, se escribe así). Sin `server-only` para
// probarlo con transportes falsos; sólo lo importan la server action de «Mi plan» y el webhook.
//
// FAIL-CLOSED: sin token no hay botón ni se procesa ningún aviso. El token nunca se loguea ni viaja
// fuera del header Authorization.

import { randomBytes } from "node:crypto";
import { HttpPasarelaCobros, MONEDA_ARS, type TransportePost } from "@/plugins/mercadopago/cobros/http";
import { FetchHttpTransport, MP_API_BASE, construirUrlPago, lanzarSiErrorHttp, type HttpTransport } from "@/plugins/mercadopago/http";
import { PRECIO_MENSUAL } from "./planes";
import { referenciaDelCobro, type PagoLeido } from "./plan-core";

type Env = Record<string, string | undefined>;

/** El token de la cuenta de MP de GSG, o null. */
export function tokenDeGsg(env: Env = process.env): string | null {
  const t = env.MP_ACCES_TOKEN?.trim();
  return t ? t : null;
}

export const pagosDisponibles = (env: Env = process.env): boolean => tokenDeGsg(env) !== null;

export const CONCEPTO_ABONO = "ProfeTurnos · abono mensual";
export const RUTA_WEBHOOK = "/api/webhooks/profeturnos-mp";

/** «https://<host>» de la request (sólo host[:puerto] válido; http sólo en localhost). */
export function origenDelHost(host: string | null | undefined): string | null {
  const h = (host ?? "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(h)) return null;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(h);
  return `${local ? "http" : "https"}://${h}`;
}

export type CobroCreado = { ok: true; url: string; referencia: string } | { ok: false; motivo: "sin-token" | "error" };

/** Crea la preferencia del abono para ESTE negocio. No escribe en la base: el pago lo acredita el webhook. */
export async function crearCobroMensual(p: {
  tenantId: string;
  origen: string | null;
  env?: Env;
  transport?: TransportePost;
  baseUrl?: string;
  nonce?: string;
}): Promise<CobroCreado> {
  const token = tokenDeGsg(p.env ?? process.env);
  if (!token) return { ok: false, motivo: "sin-token" };
  const referencia = referenciaDelCobro(p.tenantId, p.nonce ?? randomBytes(9).toString("base64url"));
  const pasarela = new HttpPasarelaCobros(async () => token, { transport: p.transport, baseUrl: p.baseUrl });
  try {
    const link = await pasarela.crearLinkDePago({
      concepto: CONCEPTO_ABONO,
      monto: PRECIO_MENSUAL,
      referenciaExterna: referencia,
      ...(p.origen ? { urlAviso: `${p.origen}${RUTA_WEBHOOK}`, urlVuelta: `${p.origen}/admin/clases/plan?volviste=1` } : {}),
    });
    return { ok: true, url: link.initPoint, referencia };
  } catch {
    // El detalle de MP no se propaga (puede traer datos de la cuenta); quien llama lo registra genérico.
    return { ok: false, motivo: "error" };
  }
}

/** Lo que nos importa de `GET /v1/payments/{id}` (incluye la moneda, que el normalizador general no trae). */
export function parsearPagoLeido(body: string): PagoLeido {
  const raw = JSON.parse(body) as {
    id?: number | string;
    status?: unknown;
    currency_id?: unknown;
    transaction_amount?: unknown;
    external_reference?: unknown;
  };
  return {
    id: raw.id === undefined || raw.id === null ? "" : String(raw.id),
    status: typeof raw.status === "string" ? raw.status : null,
    currency: typeof raw.currency_id === "string" ? raw.currency_id : null,
    monto: typeof raw.transaction_amount === "number" ? raw.transaction_amount : null,
    referencia: typeof raw.external_reference === "string" ? raw.external_reference : null,
  };
}

/** Re-lee el pago en la API de MP con el token de GSG (nunca se confía en el cuerpo del aviso). */
export async function leerPagoDeMp(paymentId: string, token: string, deps: { transport?: HttpTransport; baseUrl?: string } = {}): Promise<PagoLeido> {
  const transport = deps.transport ?? new FetchHttpTransport();
  const resp = await transport.get(construirUrlPago(deps.baseUrl ?? MP_API_BASE, paymentId), {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  });
  lanzarSiErrorHttp(resp);
  return parsearPagoLeido(resp.body);
}

export { MONEDA_ARS };
