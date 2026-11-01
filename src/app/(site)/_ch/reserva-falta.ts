// QUÉ FALTA PARA SEGUIR EN LA RESERVA (diseño nuevo). «Continuar» y «Confirmar» no se deshabilitan: al tocarlos sin completar,
// esta frase dice qué falta. El modal la muestra sólo después de ese intento. Pura, para probarla sin navegador.

export type EstadoDeLaReserva = {
  servicio: boolean;
  profesional: boolean;
  hayProfesionales: boolean;
  dia: boolean;
  /** Ya se sabe que ese día no tiene horarios (terminó de buscar y no hay ninguno). */
  diaSinHorarios: boolean;
  hora: boolean;
  nombre: boolean;
  telefono: "vacio" | "invalido" | "valido";
  emailValido: boolean;
};

function enFrase(partes: string[]): string {
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

export function faltaParaSeguir(paso: number, e: EstadoDeLaReserva): string | null {
  if (paso === 1) return e.servicio ? null : "Falta elegir el servicio.";
  if (paso === 2) {
    if (e.profesional) return null;
    return e.hayProfesionales ? "Falta elegir la profesional." : "Este servicio no tiene profesionales disponibles: volvé y elegí otro.";
  }
  if (paso === 3) {
    if (e.hora) return null;
    if (!e.dia) return "Falta elegir el día y el horario.";
    return e.diaSinHorarios ? "Ese día no tiene horarios: elegí otro." : "Falta elegir el horario.";
  }
  if (paso === 4) {
    const faltan = [...(e.nombre ? [] : ["tu nombre"]), ...(e.telefono === "vacio" ? ["tu teléfono"] : [])];
    const revisar = [...(e.telefono === "invalido" ? ["el teléfono"] : [])];
    const frases: string[] = [];
    if (faltan.length > 0) frases.push(`Falta ${enFrase(faltan)}.`);
    if (revisar.length > 0) frases.push(`Revisá ${enFrase(revisar)}.`);
    // El email es opcional: no «falta». Si está mal escrito, se corrige o se borra.
    if (!e.emailValido) frases.push("El email está mal escrito: corregilo o borralo, es opcional.");
    return frases.length > 0 ? frases.join(" ") : null;
  }
  return null;
}
