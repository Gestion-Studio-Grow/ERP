// Envío de notificaciones al cliente. Hoy soporta email real (si se configura
// RESEND_API_KEY) y deja el mismo punto de entrada listo para conectar
// WhatsApp Business API o Twilio SMS más adelante — solo hay que implementar
// sendWhatsAppReminder() con las credenciales del proveedor que se elija.

type ReminderPayload = {
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

async function sendEmailReminder(payload: ReminderPayload) {
  if (!payload.clientEmail) return { sent: false, channel: "email", reason: "sin email" };

  const apiKey = process.env.RESEND_API_KEY;
  const subject = `Recordatorio: tu turno es mañana`;
  const body = `Hola ${payload.clientName}, te esperamos mañana ${formatDateTime(payload.startsAt)} para ${payload.serviceName} con ${payload.professionalName}.`;

  if (!apiKey) {
    // Sin proveedor configurado: se deja registrado en logs para no perder el envío
    // silenciosamente. Configurar RESEND_API_KEY en .env activa el envío real.
    console.log(`[recordatorio-email:SIMULADO] Para: ${payload.clientEmail} | ${subject} | ${body}`);
    return { sent: false, channel: "email", reason: "RESEND_API_KEY no configurada (modo simulado)" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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
  // Requiere conectar WhatsApp Business API (Meta Cloud API) o Twilio.
  // Cuando se tenga la cuenta, reemplazar este bloque por la llamada real,
  // usando payload.clientPhone como destinatario.
  const message = `Hola ${payload.clientName}, te esperamos mañana ${formatDateTime(payload.startsAt)} para ${payload.serviceName} con ${payload.professionalName}.`;
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
