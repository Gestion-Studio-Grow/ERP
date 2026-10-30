// La nota que trae la reserva PÚBLICA (`createAppointment`, formulario de /reserva y del taller).
// PURO. El taller manda ahí la patente y el modelo («Patente: AB 123 CD · Auto: VW Gol»); CH no
// manda nada y su turno queda como siempre (sin nota).
//
// La escribe un anónimo: se recorta a un largo razonable para que nadie llene la fila con un texto
// enorme, sin espacios de más, y vacía queda `null` (no una cadena vacía).

export const LARGO_MAXIMO_NOTA_PUBLICA = 500;

export function notaDeReservaPublica(valor: FormDataEntryValue | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const nota = valor.trim().slice(0, LARGO_MAXIMO_NOTA_PUBLICA).trim();
  return nota || null;
}
