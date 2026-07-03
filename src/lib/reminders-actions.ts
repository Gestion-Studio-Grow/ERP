"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { broadcastProfessionalNews } from "@/lib/notifications";

const PATH = "/admin/recordatorios";

export async function getReminderPanelData() {
  const tenantId = await getCurrentTenantId();

  const [services, templates, professionals, news] = await Promise.all([
    prisma.service.findMany({
      where: { tenantId, deletedAt: null, active: true },
      orderBy: [{ category: { order: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        reminderEnabled: true,
        reminderHoursBefore: true,
        category: { select: { id: true, name: true } },
      },
    }),
    prisma.messageTemplate.findMany({ where: { tenantId }, orderBy: [{ type: "asc" }, { channel: "asc" }] }),
    prisma.professional.findMany({
      where: { tenantId, deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.professionalNews.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { professional: { select: { name: true } } },
    }),
  ]);

  return { services, templates, professionals, news };
}

// Config de recordatorio por servicio (habilitado + horas de anticipación).
export async function updateServiceReminderConfig(formData: FormData) {
  const id = String(formData.get("id"));
  const reminderEnabled = formData.get("reminderEnabled") === "on";
  const reminderHoursBefore = Number(formData.get("reminderHoursBefore"));

  if (!Number.isFinite(reminderHoursBefore) || reminderHoursBefore <= 0) {
    throw new Error("La anticipación debe ser un número de horas mayor a 0.");
  }

  await prisma.service.update({
    where: { id },
    data: { reminderEnabled, reminderHoursBefore },
  });

  await auditAdmin({
    action: "update",
    entity: "ServiceReminderConfig",
    entityId: id,
    changes: { reminderEnabled, reminderHoursBefore },
  });

  revalidatePath(PATH);
}

// Alta/edición de una plantilla de mensaje (recordatorio o difusión de novedad).
export async function upsertMessageTemplate(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  const type = String(formData.get("type")) as "APPOINTMENT_REMINDER" | "PROFESSIONAL_NEWS_BROADCAST";
  const channel = String(formData.get("channel")) as "EMAIL" | "WHATSAPP";
  const subject = String(formData.get("subject") || "").trim() || null;
  const body = String(formData.get("body") || "").trim();
  const active = formData.get("active") === "on";

  if (!body) throw new Error("El texto del mensaje no puede estar vacío.");

  await prisma.messageTemplate.upsert({
    where: { tenantId_type_channel: { tenantId, type, channel } },
    update: { subject, body, active },
    create: { tenantId, type, channel, subject, body, active },
  });

  await auditAdmin({
    action: "update",
    entity: "MessageTemplate",
    entityId: `${type}:${channel}`,
    changes: { subject, body, active },
  });

  revalidatePath(PATH);
}

// Carga una novedad de un profesional (queda pendiente de difundir).
export async function createProfessionalNews(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  const professionalId = String(formData.get("professionalId"));
  const message = String(formData.get("message") || "").trim();

  if (!message) throw new Error("La novedad no puede estar vacía.");

  const item = await prisma.professionalNews.create({
    data: { tenantId, professionalId, message },
  });

  await auditAdmin({ action: "create", entity: "ProfessionalNews", entityId: item.id, changes: { message } });

  revalidatePath(PATH);
}

// Dispara la difusión de una novedad ya cargada (hoy simulada hasta conectar
// un proveedor real de WhatsApp — ver src/lib/notifications.ts).
export async function broadcastProfessionalNewsAction(formData: FormData) {
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id"));

  const news = await prisma.professionalNews.findUniqueOrThrow({
    where: { id },
    include: { professional: true },
  });

  const recipientCount = await prisma.client.count({ where: { tenantId } });

  const result = await broadcastProfessionalNews({
    tenantId,
    professionalName: news.professional.name,
    message: news.message,
    recipientCount,
  });

  await prisma.professionalNews.update({ where: { id }, data: { broadcastAt: new Date() } });

  await auditAdmin({
    action: "broadcast",
    entity: "ProfessionalNews",
    entityId: id,
    changes: result,
  });

  revalidatePath(PATH);
}
