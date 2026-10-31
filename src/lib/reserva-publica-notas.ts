// La nota que trae la reserva PÚBLICA (`createAppointment`, formulario de /reserva y del taller).
// PURO. El taller manda ahí la patente y el modelo («Patente: AB 123 CD · Auto: VW Gol»); CH no
// manda nada y su turno queda como siempre (sin nota).
//
// La escribe un anónimo: se recorta a un largo razonable para que nadie llene la fila con un texto
// enorme, sin espacios de más, y vacía queda `null` (no una cadena vacía).
//
// G1 (cert fronts v2 / r2): la nota pública y la del equipo viven en el mismo campo, y el panel
// mostraba todo como nota del equipo: un anónimo que armara el POST a mano podía dejar «Seña pagada
// por transferencia» en el turno. Ahora la reserva pública guarda SÓLO los datos del cliente que un
// formulario público manda de verdad (`Patente:` y `Auto:`); el resto se descarta. Y el panel separa
// lo que es del cliente de lo que escribió el equipo con `separarNota`.

export const LARGO_MAXIMO_NOTA_PUBLICA = 500;

/** Un tramo de la nota que viene del cliente (lo que manda el formulario público del taller). */
const TRAMO_DEL_CLIENTE = /^(Patente|Auto): \S/;
const SEPARADOR = " · ";
// Controles + U+0085, U+2028 y U+2029. Con `fromCharCode` porque un U+2028 literal corta la expresión en el fuente.
const CORTES_DE_RENGLON = new RegExp(`[\\u0000-\\u001f\\u007f${String.fromCharCode(0x85, 0x2028, 0x2029)}]+`, "g");

export function notaDeReservaPublica(valor: FormDataEntryValue | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  // Sin saltos de línea ni caracteres de control: la nota del cliente es una sola línea. U+0085, U+2028 y U+2029 también
  // cortan renglón (BAJA-10): con `whitespace-pre-line` el panel los mostraba como un salto.
  const nota = valor.replace(CORTES_DE_RENGLON, " ").trim().slice(0, LARGO_MAXIMO_NOTA_PUBLICA).trim();
  const delCliente = nota
    .split(SEPARADOR)
    .map((t) => t.trim())
    .filter((t) => TRAMO_DEL_CLIENTE.test(t))
    .join(SEPARADOR);
  return delCliente || null;
}

/** Para el panel: qué parte de la nota del turno puso el cliente (patente y auto) y cuál el equipo. */
export function separarNota(nota: string | null | undefined): { delCliente: string | null; delEquipo: string | null } {
  const tramos = (nota ?? "").split(SEPARADOR).map((t) => t.trim()).filter(Boolean);
  const delCliente = tramos.filter((t) => TRAMO_DEL_CLIENTE.test(t)).join(SEPARADOR);
  const delEquipo = tramos.filter((t) => !TRAMO_DEL_CLIENTE.test(t)).join(SEPARADOR);
  return { delCliente: delCliente || null, delEquipo: delEquipo || null };
}
