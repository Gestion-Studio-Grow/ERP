// Fantasma Agenda · el uso: cuándo el bot atiende y cuándo no (PURO, sin base ni reloj propio).
//
// Tres frenos, en este orden:
//   · apagado (interruptor «fantasma-agenda»): silencio total, ni una respuesta.
//   · tope de charlas del mes (`TOPE_CHARLAS_MES`, override FANTASMA_TOPE_CHARLAS_MES): una charla
//     NUEVA pasado el tope no se atiende; se avisa una sola vez y después silencio.
//   · charla larga (`MAX_MENSAJES_POR_CHARLA`): pasado el máximo, se avisa una vez que sigue el local.
// Una charla es la ventana de 24 h desde el último mensaje del cliente (`VENTANA_CHARLA_MS`).

export const TOPE_CHARLAS_MES = 300;
export const MAX_MENSAJES_POR_CHARLA = 12;
export const VENTANA_CHARLA_MS = 24 * 60 * 60 * 1000;

export type MotivoSinAtender = "apagado" | "tope" | "charla-larga";

export const AVISOS: Record<Exclude<MotivoSinAtender, "apagado">, string> = {
  tope: "Por este mes ya no tomo más turnos automáticos por acá. Te contesta alguien del local apenas pueda.",
  "charla-larga": "Para seguir te paso con alguien del local, que te contesta por acá apenas pueda.",
};

/** El tope del mes: FANTASMA_TOPE_CHARLAS_MES si es un entero positivo; si no, 300. */
export function topeCharlasMes(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.FANTASMA_TOPE_CHARLAS_MES?.trim());
  return Number.isInteger(n) && n > 0 ? n : TOPE_CHARLAS_MES;
}

export type EntradaAtencion = {
  prendido: boolean;
  /** Charlas ya iniciadas este mes en el negocio. */
  charlasDelMes: number;
  /** Mensajes del cliente ya atendidos en la charla actual. */
  mensajesEnCharla: number;
  /** El último mensaje del cliente, o null si nunca escribió. */
  ultimoMensaje: Date | null;
  ahora: Date;
  /** El aviso que ya se le dio en esta charla (para no repetirlo). */
  yaAvisado?: MotivoSinAtender | null;
  tope?: number;
};

export type DecisionAtencion =
  | { atender: true; charlaNueva: boolean }
  | { atender: false; motivo: MotivoSinAtender; aviso?: string };

export function decidirAtencion(e: EntradaAtencion): DecisionAtencion {
  if (!e.prendido) return { atender: false, motivo: "apagado" };
  const charlaNueva = !e.ultimoMensaje || e.ahora.getTime() - e.ultimoMensaje.getTime() > VENTANA_CHARLA_MS;
  // Una charla nueva arranca sin avisos previos: el aviso de la charla vieja ya no cuenta.
  const yaAvisado = charlaNueva ? null : (e.yaAvisado ?? null);
  const tope = e.tope ?? TOPE_CHARLAS_MES;

  // Ya frenado por el tope en esta ventana: la charla nunca arrancó. Sigue frenado mientras dure
  // el tope (silencio); si el tope se liberó (mes nuevo), arranca una charla nueva.
  if (!charlaNueva && yaAvisado === "tope") {
    return e.charlasDelMes >= tope ? { atender: false, motivo: "tope" } : { atender: true, charlaNueva: true };
  }
  if (charlaNueva && e.charlasDelMes >= tope) {
    return conAviso("tope", yaAvisado);
  }
  if (!charlaNueva && e.mensajesEnCharla >= MAX_MENSAJES_POR_CHARLA) {
    return conAviso("charla-larga", yaAvisado);
  }
  return { atender: true, charlaNueva };
}

function conAviso(motivo: "tope" | "charla-larga", yaAvisado: MotivoSinAtender | null): DecisionAtencion {
  return yaAvisado === motivo ? { atender: false, motivo } : { atender: false, motivo, aviso: AVISOS[motivo] };
}
