// ============================================================================
// FECHAS DEL MOTOR COMERCIAL — días de calendario del negocio, sin husos. PURO.
// ============================================================================
//
// El motor razona en DÍAS del negocio ("AAAA-MM-DD" en Buenos Aires), no en instantes: una
// clienta que vino el martes a las 21:30 vino el martes, aunque en UTC ya sea miércoles. Los
// instantes se convierten una sola vez, al armar la persona (`dateStrInBusinessTz`), y de ahí
// en más todo es aritmética de calendario anclada al mediodía UTC, que nunca cruza de día.

/** Milisegundos de un día. */
const DIA_MS = 86_400_000;

function aUtc(dia: string): number {
  return Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)));
}

/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / DIA_MS);
}

/** "AAAA-MM-DD" corrido `n` días (n puede ser negativo). */
export function sumarDias(dia: string, n: number): string {
  return new Date(aUtc(dia) + n * DIA_MS).toISOString().slice(0, 10);
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/**
 * "MM-DD" del cumpleaños guardado en la ficha. La fecha se guarda a las 12:00Z (ver
 * `updateClient`) justamente para que el día se lea igual en cualquier huso: por eso acá se lee
 * con los getters UTC y no con la zona del negocio.
 */
export function mesDiaDeNacimiento(nacimiento: Date | string | null | undefined): string | null {
  if (!nacimiento) return null;
  const d = new Date(nacimiento);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** El cumpleaños de un año dado. El 29 de febrero, en un año no bisiesto, se festeja el 28 (PROVISIONAL). */
function cumpleEnAnio(mesDia: string, anio: number): string {
  if (mesDia === "02-29" && !esBisiesto(anio)) return `${anio}-02-28`;
  return `${anio}-${mesDia}`;
}

/**
 * Cuántos días faltan para el próximo cumpleaños (0 = hoy). Cruza el año: el 30 de diciembre,
 * un cumpleaños del 2 de enero está a 3 días, no a -362.
 */
export function diasHastaCumple(mesDia: string, hoy: string): number {
  const anio = Number(hoy.slice(0, 4));
  const esteAnio = cumpleEnAnio(mesDia, anio);
  const dias = diasEntre(hoy, esteAnio);
  return dias >= 0 ? dias : diasEntre(hoy, cumpleEnAnio(mesDia, anio + 1));
}

/** "12 de marzo" de un "MM-DD", para mostrar el cumpleaños sin el año. */
export function fmtMesDia(mesDia: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "numeric", month: "long" }).format(
    new Date(`2000-${mesDia}T12:00:00.000Z`),
  );
}

/** "hoy", "ayer", "hace 12 días". */
export function haceDias(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
