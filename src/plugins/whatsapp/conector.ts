// ============================================================================
// CONECTOR WHATSAPP (suite E3, mínimo) — una URL para toda la aplicación.
// ============================================================================
//
// Meta firma el CUERPO crudo: "x-hub-signature-256: sha256=<HMAC-SHA256 hex del cuerpo>" con el
// secreto de la aplicación de GSG (WHATSAPP_APP_SECRET, uno para todos los negocios). La cuenta
// (`metadata.phone_number_id`) viene adentro del cuerpo firmado: el aviso entra por
// `/api/integraciones/whatsapp` y cada evento se rutea a la conexión de SU número.
//
// Mínimo a propósito: mensajes de texto/interactivos/documentos/imágenes (sólo la referencia del
// adjunto) y estados de entrega. El webhook viejo (src/app/api/webhooks/whatsapp) sigue igual.

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  encabezado,
  type ConectorDescriptor,
  type DatosEventoCanonico,
  type EntradaCruda,
  type EventoCanonico,
  type ResultadoFirma,
  type TransporteHttp,
} from "@/integraciones/contrato";
import { whatsappModule } from "./module";

export const VARIABLE_SECRETO_APP_WA = "WHATSAPP_APP_SECRET";
export const VARIABLE_TOKEN_DESAFIO_WA = "WHATSAPP_VERIFY_TOKEN";

const enc = new TextEncoder();

function iguales(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function firmaMeta(secreto: string, cuerpo: Uint8Array): string {
  return `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;
}

function verificarFirmaWa(req: EntradaCruda, secreto: string): ResultadoFirma {
  const recibida = encabezado(req, "x-hub-signature-256");
  if (!recibida) return { ok: false, motivo: "sin_firma" };
  return iguales(firmaMeta(secreto, req.cuerpo), recibida) ? { ok: true } : { ok: false, motivo: "firma_invalida" };
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : null);
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const texto = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

/** Unix en segundos (texto) → ISO, o null. */
function isoDe(ts: unknown): string | null {
  if (typeof ts !== "string" || !/^\d{1,12}$/.test(ts)) return null;
  return new Date(Number(ts) * 1000).toISOString();
}

const CLASES: Readonly<Record<string, DatosEventoCanonico["mensaje.recibido"]["clase"]>> = {
  text: "texto",
  document: "documento",
  image: "imagen",
  interactive: "interactivo",
  button: "interactivo",
};

const ESTADOS: Readonly<Record<string, DatosEventoCanonico["mensaje.estado"]["estado"]>> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

function mensaje(m: Obj, cuenta: string): EventoCanonico | null {
  const id = texto(m.id);
  const de = texto(m.from);
  if (!id || !de) return null;
  const tipo = typeof m.type === "string" ? m.type : "";
  const clase = CLASES[tipo] ?? "otro";
  const media = obj(m[tipo]);
  const inter = obj(m.interactive);
  const opcion = texto(obj(inter?.button_reply)?.id) ?? texto(obj(inter?.list_reply)?.id) ?? texto(obj(m.button)?.payload);
  const adjunto =
    (clase === "documento" || clase === "imagen") && texto(media?.id)
      ? {
          mediaId: texto(media?.id) as string,
          mimeDeclarado: texto(media?.mime_type),
          nombre: texto(media?.filename),
          sha256Declarado: texto(media?.sha256),
        }
      : null;
  return {
    tipo: "mensaje.recibido",
    idExterno: `msg:${id}`,
    cuentaExterna: cuenta,
    ocurridoEn: isoDe(m.timestamp),
    datos: { remitente: de, idMensaje: id, clase, texto: texto(obj(m.text)?.body), opcion, adjunto },
  };
}

function estado(s: Obj, cuenta: string): EventoCanonico | null {
  const id = texto(s.id);
  const e = typeof s.status === "string" ? ESTADOS[s.status] : undefined;
  if (!id || !e) return null;
  const codigo = obj(lista(s.errors)[0])?.code;
  return {
    tipo: "mensaje.estado",
    idExterno: `estado:${id}:${e}`,
    cuentaExterna: cuenta,
    ocurridoEn: isoDe(s.timestamp),
    datos: {
      idMensaje: id,
      estado: e,
      destinatario: texto(s.recipient_id),
      codigoProveedor: typeof codigo === "number" || typeof codigo === "string" ? String(codigo) : null,
    },
  };
}

/** entry[].changes[].value → eventos, cada uno con el phone_number_id de su `metadata`. */
function normalizarWa(payload: unknown): EventoCanonico[] {
  const eventos: EventoCanonico[] = [];
  for (const entrada of lista(obj(payload)?.entry)) {
    for (const cambio of lista(obj(entrada)?.changes)) {
      const valor = obj(obj(cambio)?.value);
      const cuenta = texto(obj(valor?.metadata)?.phone_number_id);
      if (!valor || !cuenta) continue;
      for (const m of lista(valor.messages)) {
        const e = obj(m) && mensaje(obj(m) as Obj, cuenta);
        if (e) eventos.push(e);
      }
      for (const s of lista(valor.statuses)) {
        const e = obj(s) && estado(obj(s) as Obj, cuenta);
        if (e) eventos.push(e);
      }
    }
  }
  return eventos;
}

/** Un aviso de Meta con un mensaje de texto y un estado, firmado (simulador y tests). */
export function avisoWaFirmado(secreto: string, cuenta = "109876543210987"): EntradaCruda {
  const cuerpo = enc.encode(
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5491100000000", phone_number_id: cuenta },
                messages: [
                  { from: "5491122223333", id: "wamid.HBgM1", timestamp: "1730000000", type: "text", text: { body: "hola" } },
                ],
                statuses: [{ id: "wamid.HBgM0", status: "delivered", timestamp: "1730000001", recipient_id: "5491122223333" }],
              },
            },
          ],
        },
      ],
    }),
  );
  return { metodo: "POST", encabezados: { "x-hub-signature-256": firmaMeta(secreto, cuerpo) }, consulta: {}, cuerpo };
}

const transporteFalsoWa: TransporteHttp = async () => ({
  estado: 200,
  encabezados: { "content-type": "application/json" },
  cuerpo: enc.encode(JSON.stringify({ id: "109876543210987" })),
});

export const conectorWhatsApp: ConectorDescriptor = {
  ...whatsappModule,
  kind: "plugin",
  categoria: "mensajeria",
  auth: { tipo: "token-sistema" },
  entrada: {
    modo: "url-de-app",
    secretoFirma: { origen: "entorno", variable: VARIABLE_SECRETO_APP_WA },
    verificarFirma: verificarFirmaWa,
    normalizar: normalizarWa,
    desafio: {
      variable: VARIABLE_TOKEN_DESAFIO_WA,
      responder(req, tokenEsperado) {
        if (req.consulta["hub.mode"] !== "subscribe") return null;
        const recibido = req.consulta["hub.verify_token"];
        if (typeof recibido !== "string" || !iguales(recibido, tokenEsperado)) return null;
        return { estado: 200, cuerpo: req.consulta["hub.challenge"] ?? "" };
      },
    },
  },
  // Sin salida todavía: el envío sigue por el canal de siempre. La prueba no sale a la red.
  async probarConexion() {
    return { ok: true, detalle: "La firma de Meta se verifica con el secreto de la aplicación." };
  },
  limites: { porMinuto: 80, eventosMesPorPlan: { micro: 1000, pyme: null } },
  errores: ["credencial_vencida", "permiso_revocado", "proveedor_caido"],
  redaccion: { textos: ["body"] },
  simulador: () => ({
    fuente:
      "https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples (a verificar contra tráfico real)",
    escenarios: [
      {
        id: "texto-y-estado",
        descripcion: "Un mensaje de texto entrante y un estado de entrega del mismo número",
        armar: (secreto) => avisoWaFirmado(secreto),
        esperado: { tipos: ["mensaje.recibido", "mensaje.estado"], cuentaExterna: "109876543210987" },
      },
    ],
    transporte: transporteFalsoWa,
    desafio: (token) => ({
      metodo: "GET",
      encabezados: {},
      consulta: { "hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": "1158201444" },
      cuerpo: new Uint8Array(0),
    }),
  }),
};
