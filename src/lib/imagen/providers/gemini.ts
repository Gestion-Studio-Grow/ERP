// Adaptador Google Gemini (Google AI Studio) — opción GRATIS con key. Da más
// control que pollinations. Credencial: GEMINI_API_KEY (se saca gratis en
// https://aistudio.google.com/apikey).
//
// Usa el modelo de imagen de Gemini vía la REST API generateContent: el modelo
// devuelve la imagen como `inlineData` en base64 dentro de la respuesta.
//   POST https://generativelanguage.googleapis.com/v1beta/models/<MODELO>:generateContent
//   header: x-goog-api-key: <GEMINI_API_KEY>
// La clave llega por `req.apiKey` (index.ts la lee del entorno); NUNCA se loguea
// ni viaja en la URL.

import { ProviderError, type ImageBytes, type ImageProvider, type ImageRequest } from "../types";

// Modelo de imagen de Gemini. En una constante para poder cambiarlo sin tocar la
// lógica cuando Google renombre/promocione la versión (p. ej. de -preview a GA).
const MODELO = "gemini-2.5-flash-image-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

type FetchLike = typeof fetch;

export function crearGeminiProvider(fetchImpl: FetchLike = fetch): ImageProvider {
  return {
    id: "gemini",
    envVar: "GEMINI_API_KEY",
    async generate(req: ImageRequest): Promise<ImageBytes> {
      if (!req.apiKey) throw new ProviderError("gemini", "falta la clave (GEMINI_API_KEY)");

      const r = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": req.apiKey,
        },
        // La relación de aspecto se pide en el propio prompt (el modelo no toma
        // width/height por parámetro); index.ts ya la incluye en el texto.
        body: JSON.stringify({
          contents: [{ parts: [{ text: req.prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: req.signal,
      });
      if (!r.ok) throw new ProviderError("gemini", `HTTP ${r.status} al generar`);

      const json = (await r.json()) as GeminiResponse;
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
      if (!inline?.data) throw new ProviderError("gemini", "la respuesta no trajo imagen (inlineData)");

      const contentType = inline.mimeType ?? "image/png";
      const data = new Uint8Array(Buffer.from(inline.data, "base64"));
      return { data, contentType, ext: extDe(contentType) };
    },
  };
}

function extDe(contentType: string): string {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "png";
}

// Forma parcial de la respuesta de generateContent (solo lo que consumimos).
type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: { inlineData?: { data?: string; mimeType?: string } }[];
    };
  }[];
};
