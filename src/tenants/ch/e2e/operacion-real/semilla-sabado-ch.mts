// Complemento de src/tenants/ch/e2e/semilla-ch.ts para el recorrido del sábado (base LOCAL, nunca Neon).
// Sábado elegido: 14/11/2026 (el próximo sábado: hoy en AR es el sábado 07/11 a las 23:5x, ya sin día).
// Reloj America/Argentina/Buenos_Aires (UTC-3 fijo). Supuestos provisionales a confirmar: horario 09-20,
// 18 turnos, fondo $20.000, nombres, precios, seña $5.000. «Tarjeta» de octubre va como MERCADOPAGO:
// DEBITO/CREDITO no existen en una base sin el paquete de Gate 2 (schema.prisma:51-53).
import type { BaseEfimera } from "../../../../test/base-efimera.ts";
import { prismaComoDuenio, CLAVE_DE_PRUEBA } from "../../../../test/base-efimera.ts";
import { hashPassword } from "../../../../lib/auth-password.ts";
import type { SemillaCH } from "../semilla-ch.ts";

export const SABADO = "2026-11-14";
/** Hora local AR (UTC-3) del sábado → Date UTC. */
export const ar = (hhmm: string, dia = SABADO) => new Date(`${dia}T${hhmm}:00-03:00`);

export const USUARIOS = {
  duenia: "", r1: "", r2: "r2@negocio-a.erp.test", profA: "laura@negocio-a.erp.test", profB: "belen@negocio-a.erp.test",
};

export interface TurnoSab { id: string; hora: string; prof: "A" | "B"; clienta: string; servicio: string; precio: number; senia: number }
export interface SemillaSabado {
  turnos: Record<string, TurnoSab>;
  lista: TurnoSab[];
  crema: { id: string; stock: number };
  profA: string; profB: string;
  octubre: { turnos: number; noShow: number; completados: number; facturado: number; porMedio: Record<string, number>; comisionPorProf: Record<string, number> };
}

function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

export async function sembrarSabado(base: BaseEfimera, semilla: SemillaCH): Promise<SemillaSabado> {
  const db = await prismaComoDuenio(base);
  const tenantId = base.a.id;
  USUARIOS.duenia = base.a.duenia.email; USUARIOS.r1 = base.a.recepcion.email;
  try {
    // Fuera los 4 turnos de la semilla base (son de «ahora» y ensucian el sábado).
    await db.appointment.deleteMany({ where: { id: { in: [semilla.noVino.id, semilla.conCobro.id, semilla.deLaura.id, semilla.deCarla.id] } } });
    const svc = (name: string, durationMin: number, price: number, depositAmount: number | null = null) =>
      db.service.create({ data: { tenantId, name, durationMin, price, depositAmount } });
    const esmaltado = await svc("Esmaltado semipermanente", 45, 9000);
    const kapping = await svc("Kapping gel", 60, 14000);
    const esculpidas = await svc("Uñas esculpidas", 90, 32000, 5000);
    await db.service.update({ where: { id: semilla.servicios.limpieza }, data: { depositAmount: 5000 } });
    const boxU = await db.box.create({ data: { tenantId, name: "Box Uñas" } });
    const belen = await db.professional.create({
      data: { tenantId, name: "Belén Ortiz", boxId: boxU.id, commissionPercent: 40, cobraEnMostrador: false,
        services: { connect: [esmaltado, kapping, esculpidas].map((s) => ({ id: s.id })) } },
    });
    await db.workingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, professionalId: belen.id, dayOfWeek: d, startTime: "08:00", endTime: "21:00" })) });
    // Laura (Prof A, cosmetología) también hace limpieza y peeling.
    const lauraId = semilla.profesionales.laura;
    await db.professional.update({ where: { id: lauraId }, data: { services: { connect: [{ id: semilla.servicios.limpieza }, { id: semilla.servicios.peeling }] } } });
    const hash = await hashPassword(CLAVE_DE_PRUEBA);
    await db.user.create({ data: { tenantId, name: "Rocío (tarde)", email: USUARIOS.r2, passwordHash: hash, role: "RECEPTION" } });
    await db.user.create({ data: { tenantId, name: "Belén Ortiz", email: USUARIOS.profB, passwordHash: hash, role: "PROFESSIONAL", professionalId: belen.id } });
    const crema = await db.product.create({ data: { tenantId, name: "Crema hidratante facial", price: 12500, stock: 10, trackStock: true } });

    const S = semilla.servicios;
    const servicios: Record<string, { id: string; name: string; durationMin: number; price: number }> = {};
    for (const s of await db.service.findMany({ where: { tenantId } })) servicios[s.id] = s;
    const profBox: Record<string, string> = {};
    for (const p of await db.professional.findMany({ where: { tenantId } })) profBox[p.id] = p.boxId!;

    // ── Octubre: ~360 turnos, 8 % no-show, medios 35/45/20, comisiones pendientes de 4 profesionales.
    const rnd = lcg(20261031);
    const clientes = [] as string[];
    for (let i = 0; i < 60; i++) {
      const c = await db.client.create({ data: { tenantId, name: `Clienta Octubre ${String(i + 1).padStart(2, "0")}`, phone: `11300${String(10000 + i)}` } });
      clientes.push(c.id);
    }
    const profsOct: [string, string[]][] = [
      [lauraId, [S.masaje, S.limpieza, S.peeling]],
      [semilla.profesionales.marina, [S.limpieza, S.peeling]],
      [semilla.profesionales.carla, [S.radio, S.peeling]],
      [belen.id, [esmaltado.id, kapping.id, esculpidas.id]],
    ];
    const oct = { turnos: 0, noShow: 0, completados: 0, facturado: 0, porMedio: { EFECTIVO: 0, TRANSFERENCIA: 0, MERCADOPAGO: 0 } as Record<string, number>, comisionPorProf: {} as Record<string, number> };
    const actor = `user:${base.a.duenia.id}`;
    for (let dia = 1; dia <= 31; dia++) {
      const fecha = `2026-10-${String(dia).padStart(2, "0")}`;
      const horas = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00", "18:30"];
      // 3 por profesional por día ≈ 372; recortamos al azar a ~360.
      for (const [pid, svcs] of profsOct) {
        const elegidas = horas.filter(() => rnd() < 3 / 7).slice(0, 3);
        for (const h of elegidas) {
          const s = servicios[svcs[Math.floor(rnd() * svcs.length)]];
          const startsAt = ar(h, fecha);
          const noShow = rnd() < 0.08;
          const a = await db.appointment.create({ data: { tenantId, clientId: clientes[Math.floor(rnd() * clientes.length)], professionalId: pid, serviceId: s.id,
            boxId: profBox[pid], startsAt, endsAt: new Date(startsAt.getTime() + s.durationMin * 60000), status: noShow ? "NO_SHOW" : "COMPLETED", priceAtBooking: s.price, createdAt: ar("08:00", fecha) } });
          oct.turnos++;
          if (noShow) { oct.noShow++; continue; }
          oct.completados++;
          const r = rnd();
          const method = r < 0.35 ? "EFECTIVO" : r < 0.8 ? "TRANSFERENCIA" : "MERCADOPAGO";
          await db.collection.create({ data: { tenantId, originType: "APPOINTMENT", originId: a.id, appointmentId: a.id, amount: s.price, method,
            note: method === "MERCADOPAGO" ? "tarjeta (posnet de MP) — semilla" : null, collectedBy: actor, createdAt: new Date(startsAt.getTime() + s.durationMin * 60000) } });
          await db.payment.create({ data: { tenantId, appointmentId: a.id, amount: s.price, method, status: "APPROVED", createdAt: new Date(startsAt.getTime() + s.durationMin * 60000) } });
          oct.facturado += s.price; oct.porMedio[method] += s.price;
          oct.comisionPorProf[pid] = (oct.comisionPorProf[pid] ?? 0) + s.price * 0.4;
        }
      }
    }

    // ── El sábado: 18 turnos, Laura (A) y Belén (B). Seña $5.000 cobrada el viernes en 9 de ellos.
    const plan: [string, string, "A" | "B", string, string, boolean][] = [
      // clave, hora, prof, clienta, servicioId, conSeña
      ["a0900", "09:00", "A", "Sofía Méndez", S.masaje, true],
      ["a1000", "10:00", "A", "Lucía Ferreyra", S.peeling, false],
      ["a1045", "10:45", "A", "Paula Romero", S.limpieza, true],
      ["a1200", "12:00", "A", "Agustina Vera", S.limpieza, false],
      ["a1300", "13:00", "A", "Camila Ibarra", S.masaje, false],
      ["a1400", "14:00", "A", "Florencia Paz", S.peeling, false],
      ["a1500", "15:00", "A", "Micaela Torres", S.masaje, true],
      ["a1600", "16:00", "A", "Daniela Ruiz", S.limpieza, false],
      ["a1700", "17:00", "A", "Victoria Luna", S.masaje, true],
      ["a1800", "18:00", "A", "Brenda Acosta", S.peeling, true],
      ["a1900", "19:00", "A", "Carolina Medina", S.limpieza, false],
      ["b0900", "09:00", "B", "Julieta Navarro", kapping.id, true],
      ["b1000", "10:00", "B", "Martina Ríos", esmaltado.id, false],
      ["b1100", "11:00", "B", "Antonella Sosa", esculpidas.id, true],
      ["b1300", "13:00", "B", "Rocío Benítez", kapping.id, false],
      ["b1500", "15:00", "B", "Ailén Castro", esmaltado.id, true],
      ["b1630", "16:30", "B", "Milagros Herrera", kapping.id, false],
      ["b1800", "18:00", "B", "Jazmín Godoy", esculpidas.id, true],
    ];
    const turnos: Record<string, TurnoSab> = {};
    let tel = 1130500001;
    for (const [clave, hora, prof, clienta, sid, conSenia] of plan) {
      const s = servicios[sid];
      const pid = prof === "A" ? lauraId : belen.id;
      const c = await db.client.create({ data: { tenantId, name: clienta, phone: String(tel++) } });
      const startsAt = ar(hora);
      const a = await db.appointment.create({ data: { tenantId, clientId: c.id, professionalId: pid, serviceId: s.id, boxId: profBox[pid] ?? boxU.id, startsAt,
        endsAt: new Date(startsAt.getTime() + s.durationMin * 60000), status: "CONFIRMED", priceAtBooking: s.price, createdAt: ar("10:00", "2026-11-12") } });
      if (conSenia) await db.collection.create({ data: { tenantId, originType: "APPOINTMENT", originId: a.id, appointmentId: a.id, amount: 5000, method: "TRANSFERENCIA",
        note: "Seña", collectedBy: actor, createdAt: ar("18:00", "2026-11-13") } });
      turnos[clave] = { id: a.id, hora, prof, clienta, servicio: s.name, precio: s.price, senia: conSenia ? 5000 : 0 };
    }
    return { turnos, lista: Object.values(turnos), crema: { id: crema.id, stock: 10 }, profA: lauraId, profB: belen.id, octubre: oct };
  } finally {
    await db.$disconnect();
  }
}
