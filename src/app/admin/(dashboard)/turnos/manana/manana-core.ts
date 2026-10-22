// ============================================================================
// MAÑANA CON RESPUESTAS — qué dijo cada clienta y el contador. PURO, client-safe.
// ============================================================================
//
// Reingeniería CH, Tanda 2 (§3.2 «Confirmar y avisar», CH-027). La recepción avisa a las de mañana
// por WhatsApp (de a una o desde la lista) y, al volver, anota lo que respondió cada una con un
// toque: [Confirmó] (confirma el turno, `confirmarTurno`), [Quiere cambiar] (abre mover) o [Cancela]
// (abre la cancelación, que pregunta por la seña). Arriba, el contador:
// «7 avisadas · 5 confirmadas · 1 cambia · 1 cancela».
//
// Qué queda guardado y qué no: «avisada» (reminderSentAt) y «confirmada» (CONFIRMED) son del
// turno, en la base; «quiere cambiar» y «cancela» son de ESTA vuelta por la lista (al mover o
// cancelar, el turno deja de ser «de mañana» y se va de la lista). Por eso el contador cuenta
// sobre los turnos que se vieron al abrir MÁS los que hay ahora (`unirTurnos`): una que canceló
// no desaparece del conteo cuando el servidor refresca la lista.

export type Respuesta = "confirmo" | "cambia" | "cancela";

export interface TurnoDeManana {
  id: string;
  status: "PENDING" | "CONFIRMED";
  avisadaEl: string | null;
}

/** Los turnos que se vieron al abrir, actualizados con los de ahora (mismo id → el de ahora). */
export function unirTurnos<T extends { id: string }>(antes: readonly T[], ahora: readonly T[]): T[] {
  const porId = new Map(antes.map((t) => [t.id, t]));
  for (const t of ahora) porId.set(t.id, t);
  return [...porId.values()];
}

/** Lo que respondió: lo anotado en esta vuelta manda; si no, un Confirmado ya confirmó. */
export function respuestaDe(t: TurnoDeManana, respuestas: Readonly<Record<string, Respuesta>>): Respuesta | null {
  return respuestas[t.id] ?? (t.status === "CONFIRMED" ? "confirmo" : null);
}

export interface Contador {
  total: number;
  avisadas: number;
  confirmadas: number;
  cambian: number;
  cancelan: number;
}

export function contarManana(
  turnos: readonly TurnoDeManana[],
  avisadas: Readonly<Record<string, string>>,
  respuestas: Readonly<Record<string, Respuesta>>,
): Contador {
  const c: Contador = { total: turnos.length, avisadas: 0, confirmadas: 0, cambian: 0, cancelan: 0 };
  for (const t of turnos) {
    if (t.avisadaEl || avisadas[t.id]) c.avisadas += 1;
    const r = respuestaDe(t, respuestas);
    if (r === "confirmo") c.confirmadas += 1;
    else if (r === "cambia") c.cambian += 1;
    else if (r === "cancela") c.cancelan += 1;
  }
  return c;
}

const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

/** «7 avisadas · 5 confirmadas · 1 cambia · 1 cancela». Lo que está en cero no se dice (salvo las dos primeras). */
export function textoDelContador(c: Contador): string {
  return [
    n(c.avisadas, "avisada", "avisadas"),
    n(c.confirmadas, "confirmada", "confirmadas"),
    c.cambian > 0 ? n(c.cambian, "cambia", "cambian") : null,
    c.cancelan > 0 ? n(c.cancelan, "cancela", "cancelan") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Qué se ofrece en el renglón: las tres teclas mientras no respondió; un Confirmado de antes todavía
 * puede querer cambiar o cancelar (al recibir el recordatorio); lo anotado en esta vuelta, nada más.
 */
export function teclasDeRespuesta(t: TurnoDeManana, respuestas: Readonly<Record<string, Respuesta>>): readonly Respuesta[] {
  if (respuestas[t.id]) return [];
  return t.status === "CONFIRMED" ? ["cambia", "cancela"] : ["confirmo", "cambia", "cancela"];
}

export const ETIQUETA_RESPUESTA: Record<Respuesta, { tecla: string; hecho: string }> = {
  confirmo: { tecla: "Confirmó", hecho: "Confirmado" },
  cambia: { tecla: "Quiere cambiar", hecho: "Quiere cambiar" },
  cancela: { tecla: "Cancela", hecho: "Canceló" },
};
