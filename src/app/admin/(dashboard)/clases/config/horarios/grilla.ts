// La grilla de Horarios (matias-DISENO.md §2.3 · E3 · M-079/M-080/M-082). PURO: lo usan el editor,
// la tarjeta de Ajustes, la Bienvenida y grilla.test.ts.
//
// Un día por fila; cada día con sus tramos. Los chips «Mañana 8–12» y «Tarde 16–21» prenden y
// apagan ese tramo; «+ Otro» suma uno a elección (ruedas cada 30 min). «Copiar a…» copia los
// tramos de un día a otros. La vista previa dice lo que el alumno va a ver («lun 8, 9, 10, 11»),
// con la misma cuenta que el turnero: de a una clase por vez desde el inicio del tramo.
// Se guarda la grilla entera de una (guardarCampoConfig("horarios", aTramos(semana))).

import { errorDeTramo, type TramoSemanal } from "@/lib/padel/config-campos";

export type Tramo = { desde: string; hasta: string };
/** Índice = diaSemana (0 = domingo … 6 = sábado). */
export type Semana = Tramo[][];

/** La semana como la piensa el profe: de lunes a domingo. */
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0] as const;
export const DIA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
export const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

export const BLOQUES = [
  { id: "manana", rotulo: "Mañana 8–12", desde: "08:00", hasta: "12:00" },
  { id: "tarde", rotulo: "Tarde 16–21", desde: "16:00", hasta: "21:00" },
] as const;
export type Bloque = (typeof BLOQUES)[number];

const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Las horas de las ruedas: cada 30 minutos, de 06:00 a 23:30. */
export const OPCIONES_HORA: readonly string[] = Array.from({ length: 36 }, (_, i) => aHora(6 * 60 + i * 30));

/** «8», «9:30», «21»: la hora como la dice el profe. */
export const horaCorta = (h: string): string => (h.endsWith(":00") ? String(Number(h.slice(0, 2))) : `${Number(h.slice(0, 2))}:${h.slice(3, 5)}`);

export const semanaVacia = (): Semana => Array.from({ length: 7 }, () => []);

const ordenar = (t: Tramo[]) => [...t].sort((a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta));

/** Las franjas semanales que da clases (sin las excepciones de un día) → la grilla. */
export function semanaDesde(franjas: readonly { diaSemana: number | null; desde: string; hasta: string; fecha?: string | null; tipo?: string }[]): Semana {
  const s = semanaVacia();
  for (const f of franjas) {
    if (f.fecha || f.diaSemana === null || f.diaSemana < 0 || f.diaSemana > 6 || (f.tipo && f.tipo !== "DA")) continue;
    s[f.diaSemana].push({ desde: f.desde, hasta: f.hasta });
  }
  return s.map(ordenar);
}

const conDia = (s: Semana, dia: number, tramos: Tramo[]): Semana => s.map((t, i) => (i === dia ? tramos : t));

export const tieneBloque = (tramos: readonly Tramo[], b: Bloque) => tramos.some((t) => t.desde === b.desde && t.hasta === b.hasta);

export function alternarBloque(s: Semana, dia: number, b: Bloque): Semana {
  const t = s[dia];
  return conDia(s, dia, tieneBloque(t, b) ? t.filter((x) => !(x.desde === b.desde && x.hasta === b.hasta)) : ordenar([...t, { desde: b.desde, hasta: b.hasta }]));
}

/** «+ Otro»: dos horas después del último tramo del día (o 18–20 si no hay). */
export function agregarOtro(s: Semana, dia: number): Semana {
  const t = s[dia];
  const fin = t.length ? Math.max(...t.map((x) => aMin(x.hasta))) : 18 * 60;
  const desde = Math.min(fin, 21 * 60 + 30);
  return conDia(s, dia, [...t, { desde: aHora(desde), hasta: aHora(Math.min(desde + 120, 23 * 60 + 30)) }]);
}

export function cambiarTramo(s: Semana, dia: number, i: number, campo: "desde" | "hasta", valor: string): Semana {
  return conDia(s, dia, s[dia].map((t, k) => (k === i ? { ...t, [campo]: valor } : t)));
}

export const quitarTramo = (s: Semana, dia: number, i: number): Semana => conDia(s, dia, s[dia].filter((_, k) => k !== i));

/** «Copiar a…»: los tramos de `origen` pasan a cada día de `destinos` (pisan lo que tenían). */
export function copiarA(s: Semana, origen: number, destinos: readonly number[]): Semana {
  const fuente = ordenar(s[origen]);
  return s.map((t, i) => (i !== origen && destinos.includes(i) ? fuente.map((x) => ({ ...x })) : t));
}

/** El problema de cada tramo (en rojo debajo) o null. */
export function erroresDe(s: Semana): (string | null)[][] {
  return s.map((tramos) => tramos.map((t, i) => errorDeTramo(t, tramos.filter((_, k) => k !== i))));
}

export const hayErrores = (s: Semana): boolean => erroresDe(s).some((d) => d.some(Boolean));

export function aTramos(s: Semana): TramoSemanal[] {
  return s.flatMap((tramos, diaSemana) => ordenar(tramos).map((t) => ({ diaSemana, desde: t.desde, hasta: t.hasta })));
}

export const iguales = (a: Semana, b: Semana): boolean => JSON.stringify(aTramos(a)) === JSON.stringify(aTramos(b));

/** Las horas que el alumno puede pedir en esos tramos: de a una clase desde el inicio de cada uno. */
export function horasDelDia(tramos: readonly Tramo[], duracionMin: number): string[] {
  const dur = Math.max(15, duracionMin);
  const out = new Set<string>();
  for (const t of ordenar([...tramos])) {
    if (errorDeTramo(t)) continue;
    for (let m = aMin(t.desde); m + dur <= aMin(t.hasta); m += dur) out.add(aHora(m));
  }
  return [...out].sort();
}

/** «El alumno va a ver: lun 8, 9, 10, 11 · mar 16, 17, 18, 19, 20» (M-082). */
export function vistaPrevia(s: Semana, duracionMin: number): string {
  const dias = ORDEN_DIAS.map((d) => ({ d, horas: horasDelDia(s[d], duracionMin) })).filter((x) => x.horas.length);
  if (!dias.length) return "El alumno todavía no ve ningún horario.";
  return `El alumno va a ver: ${dias.map((x) => `${DIA_CORTO[x.d]} ${x.horas.map(horaCorta).join(", ")}`).join(" · ")}`;
}

/** Para la tarjeta de Ajustes: «lun 8–12 y 16–21 · mar 8–12». Vacío si no da clases. */
export function resumenSemana(franjas: Parameters<typeof semanaDesde>[0]): string {
  const s = semanaDesde(franjas);
  return ORDEN_DIAS.filter((d) => s[d].length)
    .map((d) => `${DIA_CORTO[d]} ${s[d].map((t) => `${horaCorta(t.desde)}–${horaCorta(t.hasta)}`).join(" y ")}`)
    .join(" · ");
}
