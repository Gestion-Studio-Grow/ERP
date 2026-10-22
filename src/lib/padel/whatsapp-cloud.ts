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

export type Intencion = "confirmar" | "cancelar" | "quiereCancelar" | null;

/** Minúsculas, sin tildes ni signos, espacios simples: «¡Sí!» → «si», «No puedo, perdón» → «no puedo perdon». */
const normalizar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** El payload del botón de respuesta rápida «Cancelar» de la plantilla aprobada en Meta. */
export const PAYLOAD_CANCELAR = "CANCELAR";

/**
 * Lee la respuesta corta del alumno al aviso de su clase (texto o botón de respuesta rápida).
 * Nada se cancela sin una confirmación explícita:
 *  · `cancelar`: el mensaje es EXACTAMENTE la palabra CANCELAR (sin signos, sin emojis, sin nada más;
 *    sólo se perdonan los espacios de los costados y las mayúsculas) o el botón rápido con payload
 *    CANCELAR. Es lo único que cancela.
 *  · `quiereCancelar`: cualquier otro texto que hable de cancelar («¿cancelar?», «cancelar.»,
 *    «cancelar la de…», «cancelo…») o un «no», «no puedo…», «no voy…»: parece que no viene, pero no
 *    se adivina → se le pregunta «Respondé CANCELAR» y la clase sigue igual (O-4).
 *  · `confirmar`: el mensaje ENTERO es un sí («sí», «dale», «ok», «listo», «voy», «confirmo»…).
 *    «no hay drama, voy» o «dale, nos vemos» no: van a la bandeja para que el profe los lea.
 *  · null: todo lo demás («no sé si llego», «¿a qué hora era?») → bandeja del profe.
 */
export function interpretarRespuesta(texto: string, payload?: string | null): Intencion {
  if (payload != null && payload.trim().toUpperCase() === PAYLOAD_CANCELAR) return "cancelar";
  if (texto.trim().toUpperCase() === PAYLOAD_CANCELAR) return "cancelar";
  const t = normalizar(texto);
  if (t === "no" || /^(no puedo|no voy|cancelo|cancelar)( |$)/.test(t)) return "quiereCancelar";
  if (/^(si+|dale|ok|okey|listo|voy|confirmo|confirmado)$/.test(t)) return "confirmar";
  return null;
}

/**
 * La respuesta que se le manda al alumno por la ventana de 24 h (texto libre), o null si no hay
 * nada que decirle. Siempre se le contesta lo que pasó: nunca queda adivinando.
 */
export function respuestaAlAlumno(
  r: { tipo: "preguntar"; cuando: string } | { tipo: "cancelada"; turnero: string } | { tipo: "fueraDeTermino"; profe: string },
): string {
  switch (r.tipo) {
    case "preguntar":
      return `¿Cancelás la clase del ${r.cuando}? Respondé CANCELAR y queda libre. Si venís, no hace falta que contestes.`;
    case "cancelada":
      return `Listo, cancelada. Elegí otro horario: ${r.turnero}`;
    case "fueraDeTermino":
      return `Ya está fuera del plazo para cancelar. Le aviso ${r.profe ? `a ${r.profe}` : "al profe"}.`;
  }
}

/**
 * El toque de un botón de respuesta rápida. Meta lo manda como `type: "button"` (plantilla) o
 * `type: "interactive"` con `button_reply` (mensaje interactivo); parseInboundMeta (wa-provider)
 * sólo lee texto, así que este lo completa. Devuelve null si no es un botón.
 */
export function botonRespuestaMeta(payload: unknown): { from: string; text: string; payload: string; messageId: string; contactName?: string } | null {
  type Msg = {
    from?: string;
    id?: string;
    type?: string;
    button?: { payload?: string; text?: string };
    interactive?: { button_reply?: { id?: string; title?: string } };
  };
  const value = (payload as { entry?: { changes?: { value?: { messages?: Msg[]; contacts?: { wa_id?: string; profile?: { name?: string } }[] } }[] }[] } | null)?.entry?.[0]
    ?.changes?.[0]?.value;
  const m = value?.messages?.[0];
  if (!m?.from || !m.id) return null;
  const boton =
    m.type === "button" && m.button ? { payload: m.button.payload ?? m.button.text ?? "", text: m.button.text ?? m.button.payload ?? "" } :
    m.type === "interactive" && m.interactive?.button_reply ? { payload: m.interactive.button_reply.id ?? "", text: m.interactive.button_reply.title ?? "" } :
    null;
  if (!boton || !(boton.payload || boton.text)) return null;
  const contactName = value?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
  return { from: m.from.replace(/\D/g, ""), text: boton.text, payload: boton.payload, messageId: m.id, ...(contactName ? { contactName } : {}) };
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
  linkAlumno: { nombre: "link_alumno", variables: ["nombre", "link"] },
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
