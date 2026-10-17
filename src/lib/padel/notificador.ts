import "server-only";

// ============================================================================
// NOTIFICADOR — cómo le llega al alumno lo que decide el profe.
// ============================================================================
//
//   manual (default): no se manda nada solo. La acción devuelve el link wa.me con el texto
//                     armado y el panel lo muestra como botón: el profe lo toca y WhatsApp
//                     abre con el mensaje listo. Costo cero, anda hoy.
//   cloud:            PADEL_WHATSAPP=cloud + WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID.
//                     El mensaje sale solo por la Cloud API de Meta. Si Meta rechaza (plantilla
//                     sin aprobar, token vencido), cae al link wa.me: el profe nunca queda sin
//                     forma de avisar.
//
// Las credenciales las pega SIEMPRE el dueño en Vercel (FASE 2); el código no las guarda ni
// las escribe en el log. TODO: cuando WhatsApp entre al registro de conectores
// (src/integraciones/registro.ts, con su simulador), leerlas de IntegracionCredencial por negocio.

import { logger } from "@/lib/logger";
import { linkWhatsApp, telefonoAlumno } from "./core";
import { GRAPH_VERSION, credencialesCloud, cuerpoMensaje, modoWhatsApp, type ClaveMeta, type CredencialesCloud } from "./whatsapp-cloud";

export interface MensajeAlumno {
  telefono: string;
  /** El texto completo (el del wa.me y el de la ventana de 24 h). */
  texto: string;
  /** La plantilla aprobada en Meta que corresponde, para mandar fuera de la ventana de 24 h. */
  plantilla?: { clave: ClaveMeta; vars: Record<string, string> };
}

export interface ResultadoEnvio {
  canal: "WA_LINK" | "WA_CLOUD";
  /** Link para que el profe lo mande con un toque (manual, o cloud que falló). */
  wa: string | null;
  enviado: boolean;
  idExterno?: string;
  error?: string;
}

export interface Notificador {
  readonly modo: "manual" | "cloud";
  enviar(m: MensajeAlumno): Promise<ResultadoEnvio>;
}

export const notificadorManual: Notificador = {
  modo: "manual",
  async enviar(m) {
    return { canal: "WA_LINK", wa: linkWhatsApp(m.telefono, m.texto), enviado: false };
  },
};

export function notificadorCloud(cred: CredencialesCloud, fetchImpl: typeof fetch = fetch): Notificador {
  return {
    modo: "cloud",
    async enviar(m) {
      const wa = linkWhatsApp(m.telefono, m.texto);
      const tel = telefonoAlumno(m.telefono);
      if (!tel) return { canal: "WA_LINK", wa, enviado: false, error: "teléfono inválido" };
      const cuerpo = cuerpoMensaje(`549${tel}`, m.plantilla ? { tipo: "plantilla", ...m.plantilla } : { tipo: "texto", texto: m.texto });
      try {
        const r = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${cred.phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cred.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(8000),
        });
        const json = (await r.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
        const id = json.messages?.[0]?.id;
        if (r.ok && id) return { canal: "WA_CLOUD", wa: null, enviado: true, idExterno: id };
        const error = `Meta ${r.status}${json.error?.code ? ` (${json.error.code})` : ""}: ${json.error?.message ?? "sin detalle"}`.slice(0, 300);
        logger.warn("padel.whatsapp", "Meta no aceptó el mensaje; queda el link manual", { status: r.status, code: json.error?.code });
        return { canal: "WA_LINK", wa, enviado: false, error };
      } catch (e) {
        logger.warn("padel.whatsapp", "no se pudo llegar a Meta; queda el link manual", { motivo: e instanceof Error ? e.name : "desconocido" });
        return { canal: "WA_LINK", wa, enviado: false, error: "sin conexión con WhatsApp" };
      }
    },
  };
}

/** El notificador según el entorno. Con `cloud` pero sin credenciales completas → manual. */
export function notificadorActual(env: Record<string, string | undefined> = process.env): Notificador {
  if (modoWhatsApp(env) !== "cloud") return notificadorManual;
  const cred = credencialesCloud(env);
  return cred ? notificadorCloud(cred) : notificadorManual;
}
