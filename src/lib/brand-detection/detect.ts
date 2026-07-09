// ============================================================================
// DETECCIÓN DE MARCA — orquestador con red (v1). La ÚNICA parte con I/O.
// ============================================================================
//
// Dada la URL de la web/red del cliente: baja el HTML, extrae señales (extract.ts) y arma
// la propuesta (propose.ts). Todo lo pensable es puro y testeable; acá solo vive el fetch,
// inyectable para poder testear sin red. Defensivo: valida el esquema, acota el tamaño y
// nunca tira — devuelve `error` en la propuesta para que el alta lo muestre.

import { extractBrandSignals, type BrandSignals } from "./extract";
import { proposeBranding, type BrandProposal } from "./propose";

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export type DetectResult = {
  url: string;
  ok: boolean;
  proposal: BrandProposal | null;
  signals: BrandSignals | null;
  error: string | null;
};

const MAX_BYTES = 512 * 1024; // 512 KB de HTML alcanza para el <head> y los estilos.

/** Valida y normaliza la URL de entrada (solo http/https). Devuelve null si no sirve. */
export function normalizeSiteUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Si ya trae un esquema (`algo://`), respetarlo — así un `ftp://`/`javascript:` cae en
  // la validación de protocolo de abajo (y se rechaza) en vez de disfrazarse de https.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s);
  const withScheme = hasScheme ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Detecta la identidad de marca desde una URL. `fetchImpl` es inyectable (default: `fetch`
 * global); `timeoutMs` acota la espera. Nunca lanza: los fallos vuelven en `error`.
 */
export async function detectBrandFromUrl(
  rawUrl: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<DetectResult> {
  const url = normalizeSiteUrl(rawUrl);
  if (!url) {
    return { url: rawUrl, ok: false, proposal: null, signals: null, error: "URL inválida (se espera http/https)." };
  }

  const doFetch: FetchLike = opts.fetchImpl ?? ((u, init) => fetch(u, init) as ReturnType<FetchLike>);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await doFetch(url, {
      signal: controller?.signal,
      headers: { "user-agent": "GSG-BrandDetect/1.0 (+onboarding)", accept: "text/html" },
    });
    if (!res.ok) {
      return { url, ok: false, proposal: null, signals: null, error: `El sitio respondió ${res.status}.` };
    }
    const raw = await res.text();
    const html = raw.length > MAX_BYTES ? raw.slice(0, MAX_BYTES) : raw;
    const signals = extractBrandSignals(html, url);
    const proposal = proposeBranding(signals);
    return { url, ok: true, proposal, signals, error: null };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "El sitio tardó demasiado (timeout)." : "No se pudo leer el sitio.";
    return { url, ok: false, proposal: null, signals: null, error: msg };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
