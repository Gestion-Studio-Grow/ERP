// ============================================================================
// Fechas de las pantallas de plata, como se dicen en el mostrador. PURO.
// ============================================================================
//
// «Jueves 24 de septiembre» (mayúscula sólo en la primera letra, en código y no con CSS: el
// `capitalize` ponía «24 De Septiembre»), «jue 24/09», «ayer», «Septiembre 2026». Todas reciben
// una clave de día (AAAA-MM-DD) o de mes (AAAA-MM) que YA está en la zona del negocio: se arman
// en UTC a mediodía para que ningún corrimiento de zona cambie el día.

const LARGO = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const CORTO = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });

const aFecha = (dia: string) => new Date(`${dia}T12:00:00.000Z`);

export function conMayuscula(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** «Jueves 24 de septiembre». */
export function diaLargo(dia: string): string {
  return conMayuscula(LARGO.format(aFecha(dia)).replace(",", ""));
}

/** «jue 24/09». */
export function diaCorto(dia: string): string {
  const p = Object.fromEntries(CORTO.formatToParts(aFecha(dia)).map((x) => [x.type, x.value]));
  return `${String(p.weekday ?? "").replace(".", "")} ${p.day}/${p.month}`;
}

/** «24/09». */
export function diaMes(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

/** El día anterior (AAAA-MM-DD). */
export function diaAnterior(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** El día siguiente (AAAA-MM-DD). */
export function diaSiguiente(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Días enteros entre dos claves (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000);
}

/** «hoy», «ayer», «mañana» o «jue 24/09», respecto de `hoy`. */
export function diaRelativo(dia: string, hoy: string): string {
  const n = diasEntre(hoy, dia);
  if (n === 0) return "hoy";
  if (n === -1) return "ayer";
  if (n === 1) return "mañana";
  return diaCorto(dia);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «septiembre» (de una clave AAAA-MM). */
export function nombreMes(mes: string): string {
  return MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
}

/** «Septiembre 2026». */
export function mesLargo(mes: string): string {
  return `${conMayuscula(nombreMes(mes))} ${mes.slice(0, 4)}`;
}
