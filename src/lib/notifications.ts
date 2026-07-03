import { prisma } from "@/lib/prisma";

// Envío de notificaciones al cliente. Hoy soporta email real (si se configura
// RESEND_API_KEY) y deja el mismo punto de entrada listo para conectar
// WhatsApp Business API o Twilio SMS más adelante — solo hay que implementar
// el fetch real en sendWhatsAppReminder() con las credenciales del proveedor elegido.
//
// El texto de cada mensaje sale de MessageTemplate (panel /admin/recordatorios),
// no está hardcodeado acá — esto es lo que permite editar el copy sin tocar código.

type ReminderPayload = {
  tenantId: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string;
  serviceName: string;
  professionalName: string;
  startsAt: Date;
};

function formatDateTime(date: Date) {
  return date.toLocaleString("es-AR", { dateStyle: "full", timeStyle: "short" });
}

function interpolate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function getActiveTemplate(
  tenantId: string,
  type: "APPOINTMENT_REMINDER" | "PROFESSIONAL_NEWS_BROADCAST",
  channel: "EMAIL" | "WHATSAPP"
) {
  return prisma.messageTemplate.findFirst({ where: { tenantId, type, channel, active: true } });
}

const DEFAULT_REMINDER_BODY =
  "Hola {{clientName}}, te esperamos {{startsAt}} para {{serviceName}} con {{professionalName}}.";

async function sendEmailReminder(payload: ReminderPayload) {
  if (!payload.clientEmail) return { sent: false, channel: "email", reason: "sin email" };

  const template = await getActiveTemplate(payload.tenantId, "APPOINTMENT_REMINDER", "EMAIL");
  const vars = {
    clientName: payload.clientName,
    serviceName: payload.serviceName,
    professionalName: payload.professionalName,
    startsAt: formatDateTime(payload.startsAt),
  };
  const subject = template?.subject || "Recordatorio de tu turno";
  const body = interpolate(template?.body || DEFAULT_REMINDER_BODY, vars);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[recordatorio-email:SIMULADO] Para: ${payload.clientEmail} | ${subject} | ${body}`);
    return { sent: false, channel: "email", reason: "RESEND_API_KEY no configurada (modo simulado)" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "turnos@tu-marca.com",
      to: payload.clientEmail,
      subject,
      text: body,
    }),
  });

  return { sent: res.ok, channel: "email", reason: res.ok ? undefined : `HTTP ${res.status}` };
}

async function sendWhatsAppReminder(payload: ReminderPayload) {
  const template = await getActiveTemplate(payload.tenantId, "APPOINTMENT_REMINDER", "WHATSAPP");
  const vars = {
    clientName: payload.clientName,
    serviceName: payload.serviceName,
    professionalName: payload.professionalName,
    startsAt: formatDateTime(payload.startsAt),
  };
  const message = interpolate(template?.body || DEFAULT_REMINDER_BODY, vars);

  // Requiere conectar WhatsApp Business API (Meta Cloud API) o Twilio.
  // Cuando se tenga la cuenta, reemplazar este bloque por la llamada real,
  // usando payload.clientPhone como destinatario.
  console.log(`[recordatorio-whatsapp:SIMULADO] Para: ${payload.clientPhone} | ${message}`);
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
    ? interpolate(template.body, { professionalName: payload.professionalName, message: payload.message })
    : `Novedad de ${payload.professionalName}: ${payload.message}`;

  console.log(`[difusion-novedad:SIMULADO] Para ${payload.recipientCount} clientes | ${text}`);
  return { sent: false, recipients: payload.recipientCount, reason: "proveedor de WhatsApp no conectado (modo simulado)" };
}
