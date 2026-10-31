// LA RESERVA A MEDIAS (P1-2 de la ronda 2, QA 16: al recargar se perdía todo lo elegido). Vive en `sessionStorage`: se
// muere con la pestaña y no pasa a otra. Sólo la ELECCIÓN (paso, servicio, profesional, día, hora, vecina): nombre,
// teléfono, email y cupón no se guardan nunca. Lo guardado no se cree: `estadoInicial` del modal vuelve a validarlo contra
// los datos públicos y la disponibilidad, y el servidor valida el horario al confirmar.
//
// Sin navegador, o con el almacenamiento bloqueado (navegación privada, cuota), es como si no hubiera nada guardado.

export type ReservaGuardada = {
  paso: number;
  serviceId: string;
  professionalId?: string;
  day?: string;
  slot?: string;
  vecina?: boolean;
};

const CLAVE = "ch-reserva-en-curso";

/** Lo leído de vuelta, sólo si tiene forma de reserva guardada; cualquier otra cosa es «nada». PURA. */
export function reservaDesdeTexto(texto: string | null | undefined): ReservaGuardada | null {
  if (!texto) return null;
  let d: unknown;
  try {
    d = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const { paso, serviceId, professionalId, day, slot, vecina } = d as Record<string, unknown>;
  if (typeof serviceId !== "string" || !serviceId) return null;
  if (typeof paso !== "number" || !Number.isInteger(paso) || paso < 1 || paso > 4) return null;
  const texto2 = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return { paso, serviceId, professionalId: texto2(professionalId), day: texto2(day), slot: texto2(slot), vecina: vecina === true ? true : undefined };
}

function almacen(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function leerReservaGuardada(): ReservaGuardada | null {
  try {
    return reservaDesdeTexto(almacen()?.getItem(CLAVE));
  } catch {
    return null;
  }
}

export function guardarReserva(r: ReservaGuardada): void {
  try {
    almacen()?.setItem(CLAVE, JSON.stringify(r));
  } catch {
    /* sin lugar o bloqueado: la reserva sigue, sólo no sobrevive a un recargar */
  }
}

export function borrarReservaGuardada(): void {
  try {
    almacen()?.removeItem(CLAVE);
  } catch {
    /* nada que hacer */
  }
}
