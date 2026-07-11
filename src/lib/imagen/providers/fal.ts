// Adaptador fal.ai — FLUX1.1 [pro]. Proveedor DEFAULT de la capacidad de imagen.
// Fotorrealismo editorial, API REST simple, ~US$0.04/img. Doc del contrato en
// ../types.ts; este archivo solo traduce el pedido canónico a la API de fal y
// devuelve los bytes de la imagen.
//
// Usa la queue API de fal por HTTP (sin SDK, cero dependencias nuevas):
//   POST https://queue.fal.run/fal-ai/flux-pro/v1.1   → { request_id, ... }
//   GET  .../requests/{id}/status                     → { status }
//   GET  .../requests/{id}                            → { images: [{ url, content_type }] }
// Auth: header  Authorization: Key <FAL_KEY>.
//
// IMPORTANTE: este código solo corre cuando existe FAL_KEY. Sin clave, index.ts
// corta antes con FaltaKeyError y este adaptador nunca se invoca (build/tests
// verdes sin key). La clave llega por `req.apiKey`; NUNCA se loguea.

import { ProviderError, type AspectRatio, type ImageBytes, type ImageProvider, type ImageRequest } from "../types";

const ENDPOINT = "https://queue.fal.run/fal-ai/flux-pro/v1.1";

// fal expone tamaños como enum `image_size`. Mapeo desde nuestra relación canónica.
function imageSize(aspectRatio: AspectRatio): string {
  switch (aspectRatio) {
    case "16:9":
      return "landscape_16_9";
    case "4:3":
      return "landscape_4_3";
    case "9:16":
      return "portrait_16_9";
    case "3:4":
      return "portrait_4_3";
    default:
      return "square_hd";
  }
}

// `fetch` inyectable para testear sin red (default: el global de Node 20+).
type FetchLike = typeof fetch;

export function crearFalProvider(fetchImpl: FetchLike = fetch): ImageProvider {
  return {
    id: "fal",
    envVar: "FAL_KEY",
    async generate(req: ImageRequest): Promise<ImageBytes> {
      const headers = {
        Authorization: `Key ${req.apiKey}`,
        "Content-Type": "application/json",
      };

      // 1) Encolar el pedido.
      const encolar = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: req.prompt,
          image_size: imageSize(req.aspectRatio),
          num_images: 1,
          output_format: "png",
          enable_safety_checker: true,
        }),
        signal: req.signal,
      });
      if (!encolar.ok) {
        throw new ProviderError("fal", `HTTP ${encolar.status} al encolar el pedido`);
      }
      const encolado = (await encolar.json()) as { request_id?: string; response_url?: string };
      const requestId = encolado.request_id;
      if (!requestId) throw new ProviderError("fal", "la respuesta no trajo request_id");

      // 2) Poll de estado hasta COMPLETED (o error/timeout del signal).
      const statusUrl = `${ENDPOINT}/requests/${requestId}/status`;
      const resultUrl = encolado.response_url ?? `${ENDPOINT}/requests/${requestId}`;
      for (let intento = 0; intento < MAX_POLLS; intento++) {
        const st = await fetchImpl(statusUrl, { headers, signal: req.signal });
        if (!st.ok) throw new ProviderError("fal", `HTTP ${st.status} al consultar estado`);
        const estado = (await st.json()) as { status?: string };
        if (estado.status === "COMPLETED") break;
        if (estado.status === "FAILED" || estado.status === "ERROR") {
          throw new ProviderError("fal", `el pedido terminó en estado ${estado.status}`);
        }
        await esperar(POLL_INTERVAL_MS, req.signal);
        if (intento === MAX_POLLS - 1) throw new ProviderError("fal", "timeout esperando el resultado");
      }

      // 3) Traer el resultado y bajar la primera imagen.
      const res = await fetchImpl(resultUrl, { headers, signal: req.signal });
      if (!res.ok) throw new ProviderError("fal", `HTTP ${res.status} al traer el resultado`);
      const data = (await res.json()) as { images?: { url?: string; content_type?: string }[] };
      const img = data.images?.[0];
      if (!img?.url) throw new ProviderError("fal", "el resultado no trajo ninguna imagen");

      return await descargar(fetchImpl, img.url, img.content_type, req.signal);
    },
  };
}

const MAX_POLLS = 60;
const POLL_INTERVAL_MS = 1500;

// Baja el binario de la imagen desde la URL firmada que devuelve fal.
async function descargar(
  fetchImpl: FetchLike,
  url: string,
  contentTypeHint: string | undefined,
  signal?: AbortSignal,
): Promise<ImageBytes> {
  const r = await fetchImpl(url, { signal });
  if (!r.ok) throw new ProviderError("fal", `HTTP ${r.status} al descargar la imagen`);
  const contentType = contentTypeHint ?? r.headers.get("content-type") ?? "image/png";
  const buf = new Uint8Array(await r.arrayBuffer());
  return { data: buf, contentType, ext: extDe(contentType) };
}

function extDe(contentType: string): string {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "png";
}

// Espera cancelable por AbortSignal (sin dejar timers colgados).
function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError("fal", "cancelado"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("fal", "cancelado"));
    }, { once: true });
  });
}
