// QUÉ FALTA PARA SEGUIR EN LA RESERVA (diseño nuevo). «Continuar» y «Confirmar» no se deshabilitan: al tocarlos sin completar,
// esta frase dice qué falta. El modal la muestra sólo después de ese intento. Pura, para probarla sin navegador.

export type EstadoDeLaReserva = {
  servicio: boolean;
  profesional: boolean;
  hayProfesionales: boolean;
  dia: boolean;
  hora: boolean;
  nombre: boolean;
  telefonoValido: boolean;
  emailValido: boolean;
};

export function faltaParaSeguir(paso: number, e: EstadoDeLaReserva): string | null {
  if (paso === 1) return e.servicio ? null : "Falta elegir el servicio.";
  if (paso === 2) {
    if (e.profesional) return null;
    return e.hayProfesionales ? "Falta elegir la profesional." : "Este servicio no tiene profesionales disponibles: volvé y elegí otro.";
  }
  if (paso === 3) {
    if (e.hora) return null;
    return e.dia ? "Falta elegir el horario." : "Falta elegir el día y el horario.";
  }
  if (paso === 4) {
    const faltan = [!e.nombre && "tu nombre", !e.telefonoValido && "un teléfono válido", !e.emailValido && "un email válido"].filter(Boolean);
    if (faltan.length === 0) return null;
    return `Falta ${faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(", ")} y ${faltan[faltan.length - 1]}`}.`;
  }
  return null;
}
