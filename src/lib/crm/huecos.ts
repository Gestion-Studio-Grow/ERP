// ============================================================================
// HUECOS LIBERADOS — un turno que se cancela es un lugar para alguien de la espera. PURO.
// ============================================================================
//
// Hasta ahora, cancelar un turno no miraba la lista de espera: el hueco se perdía salvo que
// alguien se acordara. Acá se cruzan las cancelaciones recientes (las de las últimas 48 h,
// leídas de la auditoría: cancela la recepción o la clienta desde su link) con los anotados
// que esperan ESE servicio con ESE profesional (o con cualquiera).
//
// Un hueco sólo se ofrece si:
//   · el turno cancelado todavía no pasó;
//   · nadie volvió a ocupar ese horario con ese profesional (otro turno vivo que se pisa);
//   · hay al menos un anotado que lo quiere.
// Reservar sigue pasando por `bookFromWaitlist`, que vuelve a validar el hueco contra el motor
// de reservas: esto decide qué se MUESTRA, no qué se puede reservar.

export type TurnoCancelado = {
  appointmentId: string;
  startsAt: Date;
  endsAt: Date;
  serviceId: string;
  servicio: string;
  professionalId: string;
  profesional: string;
};

export type TurnoVivo = { professionalId: string; startsAt: Date; endsAt: Date };

export type Anotado = {
  id: string;
  clientName: string;
  clientPhone: string;
  serviceId: string;
  professionalId: string | null;
  status: string;
  notifiedAt: Date | null;
  createdAt: Date;
};

export type HuecoLiberado<A extends Anotado = Anotado> = TurnoCancelado & { anotados: A[] };

function sePisan(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

/** ¿Este anotado quiere este hueco? Mismo servicio, y el profesional que pidió (o cualquiera). */
export function leSirve(a: Pick<Anotado, "serviceId" | "professionalId" | "status">, h: Pick<TurnoCancelado, "serviceId" | "professionalId">): boolean {
  if (a.status !== "WAITING" && a.status !== "NOTIFIED") return false;
  return a.serviceId === h.serviceId && (a.professionalId === null || a.professionalId === h.professionalId);
}

export function huecosLiberados<A extends Anotado>(input: {
  cancelados: readonly TurnoCancelado[];
  vivos: readonly TurnoVivo[];
  anotados: readonly A[];
  ahora: Date;
}): HuecoLiberado<A>[] {
  const vistos = new Set<string>();
  const out: HuecoLiberado<A>[] = [];
  for (const h of [...input.cancelados].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    if (vistos.has(h.appointmentId)) continue;
    vistos.add(h.appointmentId);
    if (h.startsAt.getTime() <= input.ahora.getTime()) continue;
    const ocupado = input.vivos.some((v) => v.professionalId === h.professionalId && sePisan(v, h));
    if (ocupado) continue;
    // El que más espera, primero (el orden de la lista de espera).
    const anotados = input.anotados
      .filter((a) => leSirve(a, h))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (anotados.length === 0) continue;
    out.push({ ...h, anotados });
  }
  return out;
}

/** Cuántos anotados distintos tienen al menos un hueco que les sirve. */
export function anotadosConHueco(huecos: readonly HuecoLiberado[]): number {
  return new Set(huecos.flatMap((h) => h.anotados.map((a) => a.id))).size;
}
