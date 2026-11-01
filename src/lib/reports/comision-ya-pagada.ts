// COMISIÓN YA PAGADA + COBRO ANULADO DESPUÉS: SÓLO UN AVISO (orden del dueño, cert ronda 2, F2).
//
// Se paga la comisión de un turno y después se anula un cobro de ese turno: el pago queda en pie y
// nadie se enteraba. Este módulo lo dice, a quien anula y en la pantalla de comisiones, y NADA MÁS:
// no revierte, no recalcula y no asienta. Sólo lee.
//
// El monto es el de la LIQUIDACIÓN, que es lo único congelado: `CommissionPayout` guarda el total y la
// cantidad de turnos, no lo de cada turno. Sacar lo de un turno con el % de hoy sería una cuenta que
// puede no coincidir con lo que se pagó.

import type { Prisma } from "@/generated/prisma/client";
import { fmtShortDate } from "@/lib/datetime";
import { round2 } from "@/lib/round";
import { MARCA_ANULACION, claseDeCobro } from "@/lib/turnos/anulacion";
import { pesosDelCobro } from "@/lib/turnos/cobro-dividido";

export type ComisionYaPagada = {
  payoutId: string;
  profesional: string;
  /** El total de esa liquidación, congelado. */
  monto: number;
  /** Cuántos turnos cubrió esa liquidación. */
  turnos: number;
  pagadaEl: Date;
};

export type ComisionConCobroAnulado = ComisionYaPagada & {
  turnoId: string;
  inicio: Date;
  cliente: string;
  /** Lo que se anuló después del pago y no volvió a entrar. */
  anulado: number;
};

/** «Macarena cobró $6.000 el 01/11.» o «… $20.000 el 01/11 por 3 turnos, este entre ellos.» */
export function textoDelPago(c: Pick<ComisionYaPagada, "profesional" | "monto" | "turnos" | "pagadaEl">): string {
  const base = `${c.profesional} cobró ${pesosDelCobro(c.monto)} el ${fmtShortDate(c.pagadaEl)}`;
  return c.turnos > 1 ? `${base} por ${c.turnos} turnos, este entre ellos.` : `${base}.`;
}

/**
 * Lo que ve quien anula sin `reports:read` (recepción, con el código de la dueña): que hay algo que
 * avisar, sin quién cobró ni cuánto. Eso lo ve la dueña en Comisiones y en la auditoría (cert ronda 2, V2-1).
 */
export const AVISO_COMISION_PAGADA_SIN_DETALLE = "Este cobro ya entró en una liquidación de comisión pagada. Avisale a la dueña.";

/** Lo que ve quien anula con `reports:read`. */
export function avisoDeComisionYaPagada(c: Pick<ComisionYaPagada, "profesional" | "monto" | "turnos" | "pagadaEl">): string {
  return `La comisión de este turno ya se pagó: ${textoDelPago(c)} Es sólo un aviso: ese pago sigue como está.`;
}

/**
 * Lo anulado después del pago que todavía no volvió a entrar. Lo anulado ANTES de pagar ya estaba en
 * la base de esa comisión, y si la plata se volvió a cobrar no hay nada que avisar.
 */
export function anuladoDespuesDelPago(filas: readonly { amount: number; note: string | null; createdAt: Date }[], pagadaEl: Date): number {
  let anulado = 0;
  for (const f of filas) {
    if (f.createdAt <= pagadaEl) continue;
    const clase = claseDeCobro(f.note);
    if (clase === "anulacion") anulado += Math.abs(f.amount);
    else if (clase === "cobro") anulado -= f.amount;
  }
  return Math.max(0, round2(anulado));
}

/** La comisión ya pagada de este turno, o `null` si todavía no se pagó. */
export async function leerComisionPagadaDelTurno(
  db: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<ComisionYaPagada | null> {
  const a = await db.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { commissionPayout: { select: { id: true, amount: true, appointmentCount: true, createdAt: true, professional: { select: { name: true } } } } },
  });
  const p = a?.commissionPayout;
  if (!p) return null;
  return { payoutId: p.id, profesional: p.professional.name, monto: p.amount, turnos: p.appointmentCount, pagadaEl: p.createdAt };
}

/** Para la pantalla de comisiones: los turnos con la comisión pagada y plata anulada después. */
export async function leerComisionesConCobroAnulado(db: Prisma.TransactionClient, tenantId: string): Promise<ComisionConCobroAnulado[]> {
  const turnos = await db.appointment.findMany({
    where: { tenantId, commissionPayoutId: { not: null }, collections: { some: { note: { startsWith: MARCA_ANULACION } } } },
    select: {
      id: true,
      startsAt: true,
      client: { select: { name: true } },
      commissionPayout: { select: { id: true, amount: true, appointmentCount: true, createdAt: true, professional: { select: { name: true } } } },
      collections: { select: { amount: true, note: true, createdAt: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 50,
  });
  const filas: ComisionConCobroAnulado[] = [];
  for (const t of turnos) {
    const p = t.commissionPayout;
    if (!p) continue;
    const anulado = anuladoDespuesDelPago(
      t.collections.map((c) => ({ amount: c.amount.toNumber(), note: c.note, createdAt: c.createdAt })),
      p.createdAt,
    );
    if (anulado <= 0) continue;
    filas.push({
      payoutId: p.id,
      profesional: p.professional.name,
      monto: p.amount,
      turnos: p.appointmentCount,
      pagadaEl: p.createdAt,
      turnoId: t.id,
      inicio: t.startsAt,
      cliente: t.client.name,
      anulado,
    });
  }
  return filas;
}
