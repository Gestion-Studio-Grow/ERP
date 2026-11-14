import { tenantTransaction } from "@/lib/rls";
import { interpolarPlantilla, textoRecordatorio } from "@/lib/turnos/turno-abierto";
import { htmlDePlataforma } from "@/lib/gsg/mail-gsg";

// Envío de notificaciones al cliente. Hoy soporta email real (si se configura
// RESEND_API_KEY) y deja el mismo punto de entrada listo para conectar
// WhatsApp Business API o Twilio SMS más adelante — solo hay que implementar
// el fetch real en sendWhatsAppReminder() con las credenciales del proveedor elegido.
//
// El texto de cada mensaje sale de MessageTemplate (panel /admin/recordatorios),
// no está hardcodeado acá — esto es lo que permite editar el copy sin tocar código.
//
// `getActiveTemplate` lee vía `tenantTransaction` con `tenantId` EXPLÍCITO (no
// ambiental): esto lo llama el worker del cron de recordatorios, sin
// request/host — con RLS_ENFORCEMENT on, `getCurrentTenantId()` ambiental
// rompería con >1 tenant (ADR-018 §4). El `tenantId` ya viene en el payload.

type ReminderPayload = {
  tenantId: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string;
  serviceName: string;
  professionalName: string;
  startsAt: Date;
  /** La aclaración del servicio para la clienta, si tiene (ficha completa). */
  aclaracion?: string | null;
};

// El texto (plantilla + hora) sale de `textoRecordatorio` (turno-abierto.ts), puro y probado.
// Antes se formateaba con `toLocaleString` SIN zona: medido con TZ=UTC —la del servidor en
// Vercel—, un turno de las 16:00 de Buenos Aires salía "7:00 p. m.". Ahora va con
// BUSINESS_TIMEZONE, y es el MISMO texto que arma el botón "WhatsApp" de "Mañana: confirmar".

async function getActiveTemplate(
  tenantId: string,
  type: "APPOINTMENT_REMINDER" | "PROFESSIONAL_NEWS_BROADCAST",
  channel: "EMAIL" | "WHATSAPP"
) {
  return tenantTransaction(
    (tx) => tx.messageTemplate.findFirst({ where: { tenantId, type, channel, active: true } }),
    { tenantId },
  );
}

async function sendEmailReminder(payload: ReminderPayload) {
  if (!payload.clientEmail) return { sent: false, channel: "email", reason: "sin email" };

  const template = await getActiveTemplate(payload.tenantId, "APPOINTMENT_REMINDER", "EMAIL");
  const subject = template?.subject || "Recordatorio de tu turno";
  const body = textoRecordatorio(template?.body, payload);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Sin email, teléfono ni texto (lleva el nombre de la clienta) en el log: estándar §4.
    console.log(`[recordatorio-email:SIMULADO] negocio ${payload.tenantId} · ${body.length} caracteres`);
    return { sent: false, channel: "email", reason: "RESEND_API_KEY no configurada (modo simulado)" };
  }

  // Sin remitente propio del negocio no se manda: nunca un remitente inventado.
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    console.log(`[recordatorio-email:SIN_REMITENTE] negocio ${payload.tenantId}`);
    return { sent: false, channel: "email", reason: "RESEND_FROM_EMAIL no configurada" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: payload.clientEmail,
      subject,
      text: body,
    }),
  });

  return { sent: res.ok, channel: "email", reason: res.ok ? undefined : `HTTP ${res.status}` };
}

export const mailConectado = (): boolean => !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL?.trim();

/**
 * Un mail de texto al equipo del negocio. Sin clave o sin remitente no sale: nunca un remitente inventado.
 * `marcaGsg`: sólo los mails de la PLATAFORMA (código para entrar, constancias de GSG) suman una versión HTML con el
 * logo de GSG arriba (PNG de /gsg/logo-mail.png); el texto plano va igual. Sin `APP_BASE_DOMAIN`, sólo texto.
 */
export async function enviarMailInterno(d: { tenantId: string; para: string; asunto: string; cuerpo: string; marcaGsg?: boolean }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    // Sin dirección ni texto en el log: estándar §4.
    console.log(`[aviso-mail:SIMULADO] negocio ${d.tenantId} · ${d.cuerpo.length} caracteres`);
    return { sent: false, reason: "mail no configurado" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: d.para, subject: d.asunto, text: d.cuerpo, ...htmlDePlataforma(d) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) console.error(`[aviso-mail] el servicio respondió ${res.status}`);
  return { sent: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
}

async function sendWhatsAppReminder(payload: ReminderPayload) {
  const template = await getActiveTemplate(payload.tenantId, "APPOINTMENT_REMINDER", "WHATSAPP");
  const message = textoRecordatorio(template?.body, payload);

  // Requiere conectar WhatsApp Business API (Meta Cloud API) o Twilio.
  // Cuando se tenga la cuenta, reemplazar este bloque por la llamada real,
  // usando payload.clientPhone como destinatario.
  // Sin teléfono ni texto (lleva el nombre de la clienta) en el log: estándar §4.
  console.log(`[recordatorio-whatsapp:SIMULADO] negocio ${payload.tenantId} · ${message.length} caracteres`);
  return { sent: false, channel: "whatsapp", reason: "proveedor de WhatsApp no conectado (modo simulado)" };
}

export async function sendAppointmentReminder(payload: ReminderPayload) {
  const [email, whatsapp] = await Promise.all([
    sendEmailReminder(payload),
    sendWhatsAppReminder(payload),
  ]);
  return { email, whatsapp };
}

// Difusión de una novedad de profesional (franco, promo, nueva técnica) a la
// base de clientes. Hoy solo WhatsApp simulado; el mismo punto de entrada
// sirve el día que se conecte un proveedor real o, a futuro, publicación de
// Stories vía Instagram Graph API (requiere cuenta business + pieza gráfica,
// no solo texto — se deja como fase separada, no bloquea esto).
export async function broadcastProfessionalNews(payload: {
  tenantId: string;
  professionalName: string;
  message: string;
  recipientCount: number;
}) {
  const template = await getActiveTemplate(payload.tenantId, "PROFESSIONAL_NEWS_BROADCAST", "WHATSAPP");
  const text = template
    ? interpolarPlantilla(template.body, { professionalName: payload.professionalName, message: payload.message })
    : `Novedad de ${payload.professionalName}: ${payload.message}`;

  console.log(`[difusion-novedad:SIMULADO] Para ${payload.recipientCount} clientes | ${text}`);
  return { sent: false, recipients: payload.recipientCount, reason: "proveedor de WhatsApp no conectado (modo simulado)" };
}
