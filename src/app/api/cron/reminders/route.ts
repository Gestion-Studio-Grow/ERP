import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAppointmentReminder } from "@/lib/notifications";

// Disparador de recordatorios, pensado para ejecutarse una vez por hora vía
// cron. Protegido con CRON_SECRET para que no lo pueda llamar cualquiera
// desde afuera.
//
// La anticipación (reminderHoursBefore) y si el recordatorio está activado
// (reminderEnabled) son config por servicio (panel /admin/recordatorios), no
// una ventana fija — por eso se trae un rango amplio (72hs) y se filtra acá
// mismo, en memoria, contra el valor de cada servicio. Tolerancia de 1h
// alrededor del punto exacto porque el cron corre cada hora.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const now = Date.now();
  const wideWindowEnd = new Date(now + 72 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      startsAt: { gte: new Date(now), lte: wideWindowEnd },
      service: { reminderEnabled: true },
    },
    include: { client: true, professional: true, service: true },
  });

  const due = appointments.filter((appt) => {
    const dueAt = appt.startsAt.getTime() - appt.service.reminderHoursBefore * 60 * 60 * 1000;
    return now >= dueAt - 30 * 60 * 1000 && now <= dueAt + 30 * 60 * 1000;
  });

  const results = [];
  for (const appt of due) {
    const result = await sendAppointmentReminder({
      tenantId: appt.tenantId,
      clientName: appt.client.name,
      clientEmail: appt.client.email,
      clientPhone: appt.client.phone,
      serviceName: appt.service.name,
      professionalName: appt.professional.name,
      startsAt: appt.startsAt,
    });
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { reminderSentAt: new Date() },
    });
    results.push({ appointmentId: appt.id, ...result });
  }

  return NextResponse.json({ checked: appointments.length, sent: due.length, results });
}
