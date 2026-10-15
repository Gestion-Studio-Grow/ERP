// ============================================================================
// WhatsApp Business (Cloud API de Meta) — piezas puras del adaptador del profe.
// ============================================================================
//
// Hoy el turnero avisa con links wa.me (los toca el alumno o el profe, cuesta cero). Esto es
// lo que hace falta para que, el día que el dueño cargue las credenciales de Meta, los avisos
// salgan solos. Paso a paso: docs/tenants/matiasconsoli/whatsapp-business-paso-a-paso.md.
//
// Sin red ni base: la firma, el desafío del webhook, la lectura de la respuesta del alumno y
// el armado del mensaje se prueban acá (whatsapp-cloud.test.ts). El fetch vive en
// notificador.ts y el endpoint en src/app/api/webhooks/whatsapp/route.ts.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Versión de la Graph API. Se sube a mano, mirando el changelog de Meta. */
export const GRAPH_VERSION = "v21.0";

export type ModoWhatsApp = "manual" | "cloud";

/** `PADEL_WHATSAPP=cloud` prende el envío automático. Cualquier otro valor (o nada) = manual. */
export const modoWhatsApp = (env: Record<string, string | undefined>): ModoWhatsApp =>
  env.PADEL_WHATSAPP === "cloud" ? "cloud" : "manual";

export interface CredencialesCloud {
  token: string;
  phoneNumberId: string;
}

/** Las credenciales del entorno, o null si falta alguna (fail-closed: sin ellas no se manda). */
export function credencialesCloud(env: Record<string, string | undefined>): CredencialesCloud | null {
  const token = env.WHATSAPP_CLOUD_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId || !/^\d{5,20}$/.test(phoneNumberId)) return null;
  return { token, phoneNumberId };
}

// ── Webhook: verificación (GET) ─────────────────────────────────────────────

export type RespuestaHttp = { status: number; body: string };

/**
 * El GET con que Meta verifica el webhook. Sin token configurado → 503 (no se adivina);
 * token distinto → 403; el eco sólo con letras, dígitos, "_" y "-" (nada que se pueda
 * interpretar como HTML).
 */
export function responderDesafio(params: URLSearchParams, tokenEsperado: string | undefined): RespuestaHttp {
  if (!tokenEsperado) return { status: 503, body: "webhook sin configurar" };
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const eco = params.get("hub.challenge") ?? "";
  if (modo !== "subscribe" || !iguales(token, tokenEsperado)) return { status: 403, body: "forbidden" };
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(eco)) return { status: 400, body: "bad challenge" };
  return { status: 200, body: eco };
}

// ── Webhook: firma (POST) ───────────────────────────────────────────────────

/**
 * `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 del cuerpo CRUDO con el App Secret.
 * Comparación en tiempo constante. Sin secreto o sin firma → false.
 */
export function firmaValida(cuerpoCrudo: string, encabezado: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !encabezado?.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", appSecret).update(cuerpoCrudo, "utf8").digest("hex");
  return iguales(encabezado.slice(7), esperada);
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ── Lo que contesta el alumno ───────────────────────────────────────────────

export type Intencion = "confirmar" | "cancelar" | null;

/**
 * Lee la respuesta corta del alumno al aviso de la próxima clase (texto o botón de respuesta
 * rápida). Sólo dos intenciones; cualquier otra cosa queda en la bandeja del profe como
 * mensaje para leer, no se adivina.
 */
export function interpretarRespuesta(texto: string): Intencion {
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(si|sii+|dale|confirmo|confirmado|ok|okey|listo|voy)( .*)?$/.test(t)) return "confirmar";
  if (/^(no|cancelo|cancelar|no puedo|no voy)( .*)?$/.test(t)) return "cancelar";
  return null;
}

// ── Lo que se manda ─────────────────────────────────────────────────────────

/** Plantillas a aprobar en Meta (categoría UTILITY, español de Argentina). Ver el manual. */
export const PLANTILLAS_META = {
  confirmada: { nombre: "clase_confirmada", variables: ["nombre", "dia", "hora", "link"] },
  rechazada: { nombre: "clase_rechazada", variables: ["nombre", "dia", "hora", "turnero"] },
  proxima: { nombre: "proxima_clase", variables: ["nombre", "dia", "hora", "link"] },
  pagoOk: { nombre: "pago_recibido", variables: ["nombre", "dia"] },
  pagoNo: { nombre: "comprobante_no_valido", variables: ["nombre", "dia", "link"] },
  recordatorio: { nombre: "recordatorio_clase", variables: ["nombre", "dia", "hora"] },
} as const;
export type ClaveMeta = keyof typeof PLANTILLAS_META;

/**
 * El cuerpo del POST a /{phone-number-id}/messages. Fuera de la ventana de 24 h Meta sólo
 * acepta plantillas aprobadas; dentro, un texto libre. `para` va con código de país (549…).
 */
export function cuerpoMensaje(
  para: string,
  m: { tipo: "plantilla"; clave: ClaveMeta; vars: Record<string, string> } | { tipo: "texto"; texto: string },
): Record<string, unknown> {
  const to = para.replace(/\D/g, "");
  if (m.tipo === "texto") {
    return { messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: m.texto.slice(0, 4096) } };
  }
  const p = PLANTILLAS_META[m.clave];
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: p.nombre,
      language: { code: "es_AR" },
      components: [{ type: "body", parameters: p.variables.map((v) => ({ type: "text", text: m.vars[v] ?? "-" })) }],
    },
  };
}
