import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAppointmentReminder } from "@/lib/notifications";

// Disparador de recordatorios 24hs antes del turno. Pensado para ejecutarse
// una vez por hora vía cron (ej. Vercel Cron en producción). Protegido con
// CRON_SECRET para que no lo pueda llamar cualquiera desde afuera.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const windowStart = new Date(Date.now() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 25 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      startsAt: { gte: windowStart, lte: windowEnd },
    },
    include: { client: true, professional: true, service: true },
  });

  const results = [];
  for (const appt of appointments) {
    const result = await sendAppointmentReminder({
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

  return NextResponse.json({ checked: appointments.length, results });
}
