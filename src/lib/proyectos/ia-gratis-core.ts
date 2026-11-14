// ============================================================================
// El servicio gratis de IA hasta vender a MIA: Cloudflare Workers AI, con el cupo diario sin cargo. Texto e imágenes usan la
// misma cuenta. Sólo arma pedidos y lee respuestas: la llamada vive en ia.server.ts.
// ============================================================================

export const MODELO_TEXTO_GRATIS = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const MODELO_IMAGEN_GRATIS = "@cf/black-forest-labs/flux-1-schnell";
export const CUPO_AGOTADO = "Se agotó el cupo gratis de IA de hoy. Se renueva a las 21 de Argentina; mientras tanto se puede seguir a mano.";

export const urlGratis = (cuenta: string, modelo: string): string => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cuenta)}/ai/run/${modelo}`;

export function pedidoDeTexto(p: { sistema: string; mensajes: readonly { role: "user" | "assistant"; content: string }[]; maxTokens?: number; esquema?: Record<string, unknown> }): Record<string, unknown> {
  return {
    messages: [{ role: "system", content: p.sistema }, ...p.mensajes],
    max_tokens: p.maxTokens ?? 2000,
    ...(p.esquema && { response_format: { type: "json_schema", json_schema: p.esquema } }),
  };
}

export const pedidoDeImagen = (pedido: string): Record<string, unknown> => ({ prompt: pedido.slice(0, 2048), steps: 4 });

interface Sobre {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: { response?: unknown; image?: unknown; usage?: { completion_tokens?: number } };
}

/** El mensaje para la persona, o null si el servicio respondió bien. */
export function errorDeGratis(status: number, cuerpo: Sobre | null): string | null {
  if (status >= 200 && status < 300 && cuerpo?.success !== false) return null;
  if (status === 429 || cuerpo?.errors?.some((e) => e.code === 4006)) return CUPO_AGOTADO;
  // Con una cuenta inexistente, Cloudflare responde 404.
  if (status === 401 || status === 403 || status === 404) return "La conexión con la IA no está andando. Avisale a quien administra el sistema.";
  return "La IA no pudo responder este pedido. Probá de nuevo.";
}

/** Con esquema la respuesta llega como objeto: se devuelve como texto JSON, igual que en la otra conexión. */
export function textoDeGratis(cuerpo: Sobre | null, maxTokens: number): { texto: string; cortada: boolean } | null {
  const r = cuerpo?.result?.response;
  const texto = typeof r === "string" ? r.trim() : r && typeof r === "object" ? JSON.stringify(r) : "";
  if (!texto) return null;
  return { texto, cortada: cuerpo?.result?.usage?.completion_tokens === maxTokens };
}

export function imagenDeGratis(cuerpo: Sobre | null): string | null {
  const i = cuerpo?.result?.image;
  return typeof i === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(i) ? `data:image/jpeg;base64,${i}` : null;
}
