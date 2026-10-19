// ============================================================================
// SEMILLA DEL UAT DE CH ESTÉTICA — sobre una base efímera LOCAL (src/test/base-efimera.ts).
// ============================================================================
//
// El negocio A de la base efímera pasa a ser CH: slug `beauty-spa`, subdominio `chestetica`, sin
// blueprint ni módulos (como en producción). Le sumamos lo mínimo para recorrer el día de la recepción:
//   · 3 boxes, 4 servicios (el masaje con seña de $5.000) y 3 profesionales con su servicio asignado
//     (ADR-055: cada una hace lo suyo, no "todas todo");
//   · horario de 08:00 a 21:00 los 7 días, así el recorrido corre a cualquier hora y día;
//   · una usuaria PROFESIONAL (Laura) vinculada a su ficha, además de la dueña y la recepción;
//   · cuatro turnos CONFIRMADOS que ya empezaron (para «no vino», cobro parcial + saldo, y el de
//     Laura), con horarios relativos a `ahora`.
//
// Nunca toca Neon: la URL pasa por la guarda del arnés (`baseLocalParaSeed`). Datos de demo, sin
// teléfonos reales.

import type { BaseEfimera } from "@/test/base-efimera";
import { prismaComoDuenio } from "@/test/base-efimera";
import { hashPassword } from "@/lib/auth-password";

export const SLUG_CH = "beauty-spa";
export const SUBDOMINIO_CH = "chestetica";
export const EMAIL_PROFESIONAL = "laura@negocio-a.erp.test";
export const SENIA_MASAJE = 5000;

export interface TurnoSembrado {
  id: string;
  clienta: string;
  profesional: string;
  servicio: string;
  startsAt: Date;
}

export interface SemillaCH {
  servicios: Record<"masaje" | "limpieza" | "peeling" | "radio", string>;
  profesionales: Record<"laura" | "marina" | "carla", string>;
  /** CONFIRMADO, Marina, hace 3 h: para «No se presentó». */
  noVino: TurnoSembrado;
  /** CONFIRMADO, Laura (masaje con seña), hace 2 h: seña, cobro parcial y saldo al completar. */
  conCobro: TurnoSembrado;
  /** CONFIRMADO, Laura, hace 4 h: lo completa la propia profesional. */
  deLaura: TurnoSembrado;
  /** CONFIRMADO, Carla, hace 1 h: la profesional Laura NO lo tiene que ver. */
  deCarla: TurnoSembrado;
}

const HORA = 3_600_000;

export async function sembrarCH(base: BaseEfimera, ahora = new Date()): Promise<SemillaCH> {
  const db = await prismaComoDuenio(base);
  const tenantId = base.a.id;
  try {
    await db.tenant.update({
      where: { id: tenantId },
      data: { slug: SLUG_CH, subdomain: SUBDOMINIO_CH, name: "CH Estética" },
    });
    const [b1, b2, b3] = await Promise.all(
      ["Box 1", "Box 2", "Box 3"].map((name) => db.box.create({ data: { tenantId, name } })),
    );
    const servicio = (name: string, durationMin: number, price: number, depositAmount?: number) =>
      db.service.create({ data: { tenantId, name, durationMin, price, depositAmount: depositAmount ?? null } });
    const masaje = await servicio("Masaje descontracturante", 60, 15000, SENIA_MASAJE);
    const limpieza = await servicio("Limpieza facial profunda", 50, 20000);
    const peeling = await servicio("Peeling químico", 40, 22000);
    const radio = await servicio("Radiofrecuencia corporal", 45, 25000);

    const profesional = (name: string, boxId: string, servicios: string[]) =>
      db.professional.create({
        data: { tenantId, name, boxId, commissionPercent: 40, services: { connect: servicios.map((id) => ({ id })) } },
      });
    const laura = await profesional("Laura Gómez", b1.id, [masaje.id]);
    const marina = await profesional("Marina Suárez", b2.id, [limpieza.id, peeling.id]);
    const carla = await profesional("Carla Díaz", b3.id, [radio.id, peeling.id]);
    for (const p of [laura, marina, carla]) {
      await db.workingHours.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          tenantId,
          professionalId: p.id,
          dayOfWeek,
          startTime: "08:00",
          endTime: "21:00",
        })),
      });
    }

    await db.user.create({
      data: {
        tenantId,
        name: "Laura Gómez",
        email: EMAIL_PROFESIONAL,
        passwordHash: await hashPassword("clave-de-prueba-1234"),
        role: "PROFESSIONAL",
        professionalId: laura.id,
      },
    });

    const turno = async (
      clienta: string,
      telefono: string,
      prof: { id: string; name: string; boxId: string | null },
      serv: { id: string; name: string; durationMin: number; price: number },
      haceHoras: number,
    ): Promise<TurnoSembrado> => {
      const client = await db.client.create({ data: { tenantId, name: clienta, phone: telefono } });
      const startsAt = new Date(Math.floor((ahora.getTime() - haceHoras * HORA) / 60_000) * 60_000);
      const a = await db.appointment.create({
        data: {
          tenantId,
          clientId: client.id,
          professionalId: prof.id,
          serviceId: serv.id,
          boxId: prof.boxId!,
          startsAt,
          endsAt: new Date(startsAt.getTime() + serv.durationMin * 60_000),
          status: "CONFIRMED",
          priceAtBooking: serv.price,
        },
      });
      return { id: a.id, clienta, profesional: prof.name, servicio: serv.name, startsAt };
    };

    return {
      servicios: { masaje: masaje.id, limpieza: limpieza.id, peeling: peeling.id, radio: radio.id },
      profesionales: { laura: laura.id, marina: marina.id, carla: carla.id },
      noVino: await turno("Romina Paz", "1130000001", marina, limpieza, 3),
      conCobro: await turno("Valeria Sosa", "1130000002", laura, masaje, 2),
      deLaura: await turno("Julieta Ríos", "1130000003", laura, masaje, 4),
      deCarla: await turno("Natalia Gil", "1130000004", carla, radio, 1),
    };
  } finally {
    await db.$disconnect();
  }
}
