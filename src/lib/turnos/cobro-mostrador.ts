// ¿QUIÉN PUEDE COBRAR ESTE TURNO? Aritmética pura de la decisión, sin Prisma ni sesión.
//
// Vive acá y no dentro de la server action por la misma razón que el resto de las reglas de
// caja: el caso que importa —la recepción intentando cobrar el turno de la profesional que
// cobra aparte— no se puede probar a mano sin montar media base, y es exactamente el que no
// puede fallar. Acá se prueba con una llamada.
//
// Las tres reglas, en orden de precedencia:
//
//   1. Una PROFESIONAL cobra SUS turnos y ninguno más. Es la regla más vieja y la más dura:
//      la capacidad `agenda:collect` habilita la clase de acción, el dueño de la fila la
//      acota (mismo criterio que `completeAppointment` y `markNoShow`).
//   2. La DUEÑA cobra todo. No hay excepción que valga contra el dueño del negocio.
//   3. El MOSTRADOR (recepción) cobra todo SALVO los turnos de una profesional marcada
//      `cobraEnMostrador = false`. Decisión del dueño del 2026-09-11: la de uñas cobra lo
//      suyo y rinde la comisión después.
//
// Nota sobre el nombre en el mensaje: va el de la profesional, no un "no tenés permiso".
// Quien lo lee es una recepcionista con la clienta enfrente, y necesita saber qué hacer
// ahora mismo —pasarle el cobro a ella—, no que la pantalla le diga que no puede.

export type RolQueCobra = "OWNER" | "RECEPTION" | "PROFESSIONAL" | (string & {});

export type IntentoDeCobro = {
  rol: RolQueCobra;
  /** `professionalId` del usuario logueado (sólo lo tiene una profesional). */
  professionalIdDelUsuario?: string | null;
  professionalIdDelTurno: string;
  /** Nombre de la profesional del turno, para el mensaje. */
  nombreProfesional?: string | null;
  /**
   * ¿El mostrador puede cobrarle a esta profesional? `undefined` = la columna todavía no
   * existe en la base (migración sin aplicar): se trata como `true`, que es el default de
   * la columna y el comportamiento que el sistema ya tenía. Un flag ausente no puede
   * frenar un cobro.
   */
  cobraEnMostrador?: boolean | null;
};

export type Veredicto = { ok: true } | { ok: false; motivo: string };

export function puedeCobrarEsteTurno(i: IntentoDeCobro): Veredicto {
  if (i.rol === "PROFESSIONAL") {
    return i.professionalIdDelUsuario && i.professionalIdDelUsuario === i.professionalIdDelTurno
      ? { ok: true }
      : { ok: false, motivo: "Ese turno es de otra profesional: sólo podés cobrar los tuyos." };
  }

  if (i.rol === "OWNER") return { ok: true };

  // Recepción y cualquier otro rol que tenga la capacidad: es el mostrador.
  if (i.cobraEnMostrador === false) {
    const quien = i.nombreProfesional?.trim();
    return {
      ok: false,
      motivo: quien
        ? `${quien} cobra sus propios turnos. Pasale el cobro a ella; después rinde la comisión.`
        : "Esa profesional cobra sus propios turnos. Pasale el cobro a ella; después rinde la comisión.",
    };
  }
  return { ok: true };
}

/** ¿Se le puede ofrecer el bloque de cobro a esta profesional desde el mostrador? */
export function elMostradorLeCobra(p: { cobraEnMostrador?: boolean | null }): boolean {
  return p.cobraEnMostrador !== false;
}
