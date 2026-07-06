// Adaptador de PROVEEDOR de WhatsApp — capa 1 del comercio conversacional
// (sector AGENCIA DIGITAL, satélite del ERP). Normaliza el payload crudo del webhook
// de un proveedor (Meta WhatsApp Cloud API o Twilio) a un MENSAJE CANÓNICO que el
// resto del pipeline entiende, sin saber de qué proveedor vino.
//
// Es lógica PURA (sin red, sin DB, sin verificación de firma —eso es del handler HTTP
// que lo envuelve—): dado el JSON ya parseado del webhook, extrae el mensaje de texto
// del cliente o devuelve null si el evento no es un mensaje accionable (recibos de
// entrega, estados, mensajes no-texto). El handler HTTP (otra capa) valida firma,
// idempotencia por messageId y responde 200.
//
// Pipeline: webhook HTTP → **parseInbound (esto)** → parseWaMessage (wa-intent) →
//           dispatch (wa-dispatch) → Server Actions del ERP.

export type WaProvider = "meta" | "twilio";

// Mensaje canónico entrante, ya normalizado e independiente del proveedor.
export type WaInboundMessage = {
  provider: WaProvider;
  // teléfono del cliente, solo dígitos con código de país (sin "+", sin "whatsapp:").
  from: string;
  text: string;
  // id del mensaje del proveedor — clave de idempotencia (no procesar dos veces).
  messageId: string;
  contactName?: string;
  // epoch en ms. Meta trae timestamp (segundos); Twilio no → se usa opts.receivedAt.
  timestamp: number;
};

export type ParseInboundOptions = {
  // sello temporal de recepción (ms) para proveedores que no lo mandan (Twilio).
  // Inyectado para mantener la función pura/testeable.
  receivedAt?: number;
};

// Normaliza un teléfono a solo dígitos con código de país. Quita "whatsapp:", "+",
// espacios, guiones y paréntesis. No infiere código de país si falta (devuelve lo
// que haya): esa política es del dispatcher/tenant, no del adaptador.
export function normalizePhone(raw: string): string {
  return raw.replace(/^whatsapp:/i, "").replace(/[^\d]/g, "");
}

// --- Meta WhatsApp Cloud API --------------------------------------------------

// Extrae el primer mensaje de texto del payload de Meta. Devuelve null si el evento
// no es un mensaje de texto (p. ej. `statuses` de entrega, o `type` != "text").
export function parseInboundMeta(payload: unknown, opts: ParseInboundOptions = {}): WaInboundMessage | null {
  const p = payload as MetaPayload | null;
  const value = p?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg || msg.type !== "text" || !msg.text?.body) return null;

  const contactName = value?.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name;
  // Meta manda el timestamp en SEGUNDOS como string.
  const ts = msg.timestamp ? Number(msg.timestamp) * 1000 : opts.receivedAt ?? 0;

  return {
    provider: "meta",
    from: normalizePhone(msg.from),
    text: msg.text.body,
    messageId: msg.id,
    ...(contactName ? { contactName } : {}),
    timestamp: Number.isFinite(ts) ? ts : opts.receivedAt ?? 0,
  };
}

// --- Twilio WhatsApp ----------------------------------------------------------

// Twilio entrega el webhook como form-urlencoded; asumimos que el handler ya lo pasó
// a objeto. Campos: From ("whatsapp:+549..."), Body, MessageSid, ProfileName.
export function parseInboundTwilio(payload: unknown, opts: ParseInboundOptions = {}): WaInboundMessage | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const from = typeof p.From === "string" ? p.From : "";
  const body = typeof p.Body === "string" ? p.Body : "";
  const sid = typeof p.MessageSid === "string" ? p.MessageSid : "";
  if (!from || !body.trim() || !sid) return null;

  const name = typeof p.ProfileName === "string" ? p.ProfileName : undefined;
  return {
    provider: "twilio",
    from: normalizePhone(from),
    text: body,
    messageId: sid,
    ...(name ? { contactName: name } : {}),
    timestamp: opts.receivedAt ?? 0,
  };
}

// Dispatcher por proveedor — punto único de entrada para el handler HTTP.
export function parseInbound(
  provider: WaProvider,
  payload: unknown,
  opts: ParseInboundOptions = {},
): WaInboundMessage | null {
  return provider === "meta" ? parseInboundMeta(payload, opts) : parseInboundTwilio(payload, opts);
}

// --- Tipos del payload de Meta (parcial, solo lo que consumimos) ---------------

type MetaPayload = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          from: string;
          id: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
};
