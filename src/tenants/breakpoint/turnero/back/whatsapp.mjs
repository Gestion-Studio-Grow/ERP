// WHATSAPP BUSINESS — Turnero de Break Point Pádel.
//
// Puertos y adaptadores (la demo enchufa los simulados; post-venta se enchufa la API oficial de WhatsApp Cloud
// con las credenciales que pega el dueño — nunca el agente):
//   · webhook entrante: verificación de la suscripción (hub.challenge) y firma X-Hub-Signature-256 (HMAC-SHA256
//     del cuerpo crudo con el App Secret). Sin firma válida no se procesa nada (SEC-3).
//   · canal saliente: `enviar(tel, texto)`. Demo = buzón en memoria (se ve en el backoffice); Cloud = Graph API.
//   · lector de comprobantes: `leer(mensaje)` → texto del comprobante. Demo = el texto o el "OCR" simulado de la
//     imagen; post-venta = descarga del media + OCR/visión.
// Datos personales: nunca se loguea el comprobante entero ni se guarda la imagen; el buzón de demo enmascara.
import { createHmac, timingSafeEqual } from "node:crypto";

export function firmar(cuerpoCrudo, secreto) {
  return `sha256=${createHmac("sha256", secreto).update(cuerpoCrudo).digest("hex")}`;
}

/** ¿La firma X-Hub-Signature-256 corresponde a este cuerpo? Comparación en tiempo constante. */
export function verificarFirma(cuerpoCrudo, cabecera, secreto) {
  if (!secreto || typeof cabecera !== "string" || !cabecera.startsWith("sha256=")) return false;
  const esperado = Buffer.from(firmar(cuerpoCrudo, secreto));
  const recibido = Buffer.from(cabecera);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

/** GET del webhook: Meta manda hub.mode=subscribe, hub.verify_token y hub.challenge. */
export function verificarSuscripcion(params, tokenVerificacion) {
  if (params.get("hub.mode") === "subscribe" && tokenVerificacion && params.get("hub.verify_token") === tokenVerificacion) {
    return { ok: true, challenge: params.get("hub.challenge") ?? "" };
  }
  return { ok: false };
}

/**
 * Saca los mensajes de un payload de WhatsApp Cloud (entry[].changes[].value.messages[]).
 * Tipos soportados: text, image, document (PDF del comprobante). El resto se ignora con aviso.
 */
export function extraerMensajes(payload) {
  const out = [];
  for (const entry of payload?.entry ?? []) {
    for (const ch of entry?.changes ?? []) {
      const v = ch?.value;
      if (!v?.messages) continue;
      for (const m of v.messages) {
        const base = { id: String(m.id ?? ""), de: String(m.from ?? ""), ts: Number(m.timestamp ?? 0), tipo: m.type };
        if (m.type === "text") out.push({ ...base, texto: String(m.text?.body ?? "").slice(0, 4000) });
        else if (m.type === "image" || m.type === "document") {
          const media = m[m.type] ?? {};
          out.push({ ...base, mediaId: String(media.id ?? ""), mime: String(media.mime_type ?? ""), texto: String(media.caption ?? "").slice(0, 1000) });
        } else out.push({ ...base, ignorado: true });
      }
    }
  }
  return out;
}

/** Arma un payload con la forma exacta de WhatsApp Cloud (lo usan el simulador de demo y los tests). */
export function payloadCloud({ de, id, texto, mediaId, tipo = mediaId ? "image" : "text", ts = Math.floor(Date.now() / 1000) }) {
  const msg = { from: de, id, timestamp: String(ts), type: tipo };
  if (tipo === "text") msg.text = { body: texto };
  else msg[tipo] = { id: mediaId, mime_type: tipo === "image" ? "image/jpeg" : "application/pdf", caption: texto ?? "" };
  return { object: "whatsapp_business_account", entry: [{ id: "WABA_DEMO", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "DEMO" }, messages: [msg] } }] }] };
}

const enmascararTel = (t) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length > 4 ? `••• ${d.slice(-4)}` : "•••"; };

/** Canal de DEMO: no manda nada a nadie. Guarda los mensajes (con el número enmascarado) para mostrarlos. */
export function crearCanalDemo({ maximo = 50, ahora = () => Date.now() } = {}) {
  const buzon = [];
  return {
    tipo: "demo",
    async enviar(tel, texto) {
      buzon.unshift({ a: enmascararTel(tel), texto: String(texto).slice(0, 1000), cuando: ahora() });
      if (buzon.length > maximo) buzon.length = maximo;
      return { ok: true, simulado: true };
    },
    buzon: () => buzon.slice(),
  };
}

/**
 * Canal REAL (post-venta): WhatsApp Cloud API. Sólo se construye si el dueño cargó WHATSAPP_TOKEN y
 * WHATSAPP_PHONE_ID. Fuera de la ventana de 24 h, Meta exige plantillas aprobadas (ver TURNERO-PLAN.md).
 */
export function crearCanalCloud({ token, phoneId, version = "v21.0", fetch: f = globalThis.fetch }) {
  return {
    tipo: "cloud",
    async enviar(tel, texto) {
      const r = await f(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: String(tel).replace(/\D/g, ""), type: "text", text: { body: texto } }),
      });
      return { ok: r.ok, status: r.status };
    },
  };
}

/**
 * Lector de DEMO: el texto viene en el mensaje o, si es una imagen, en el "OCR" simulado que guardó el
 * simulador para ese mediaId (confianza 0,9 como un OCR bueno). Post-venta: descargar el media de la Graph API
 * y pasarlo por OCR/visión; el contrato de salida es el mismo { texto, confianzaOcr }.
 */
export function crearLectorDemo() {
  const medios = new Map();
  return {
    tipo: "demo",
    guardarMedio(mediaId, textoOcr, confianzaOcr = 0.9) { medios.set(mediaId, { texto: textoOcr, confianzaOcr }); if (medios.size > 200) medios.delete(medios.keys().next().value); },
    async leer(m) {
      if (m.mediaId) {
        const x = medios.get(m.mediaId);
        medios.delete(m.mediaId); // la "imagen" no se guarda una vez leída
        return x ? { texto: `${m.texto ?? ""}\n${x.texto}`, confianzaOcr: x.confianzaOcr } : { texto: m.texto ?? "", confianzaOcr: 0.3 };
      }
      return { texto: m.texto ?? "", confianzaOcr: 1 };
    },
  };
}
