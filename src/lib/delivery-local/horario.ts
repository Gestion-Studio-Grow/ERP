// ============================================================================
// DELIVERY LOCAL · EL HORARIO DEL LOCAL — ¿está abierto?, ¿cuándo abre? PURA.
// ============================================================================
//
// El horario se carga POR DÍA en la config del local (config.ts), con franjas «HH:MM» en la hora
// argentina (reloj.ts, ZONA_HORARIA): el servidor corre en UTC y el día y la hora se leen siempre
// en Buenos Aires. Lo usan dos lugares con la MISMA función:
//   · la vidriera, para decir «Abierto · cierra 20:00» o «Cerrado · abre mañana 8:00» y apagar el
//     botón de pedir;
//   · el alta del pedido (`placeOnlineOrder`), que RECHAZA fuera de horario: el navegador se saltea.
//
// REGLAS:
//   · Una franja es [desde, hasta). A las 20:00 justas, con «08:00–20:00», ya está cerrado.
//   · Una franja que cruza la medianoche («20:00–02:00») es del día en que EMPIEZA: el viernes
//     20:00–02:00 cubre el sábado de 0:00 a 2:00. «24:00» y «00:00» como cierre son la medianoche.
//   · Franja partida: varias franjas por día («08:00–13:00» y «17:00–21:00»).
//   · Los FERIADOS NO se contemplan: un feriado es el día de la semana que le toca. Deuda anotada:
//     cuando el local lo pida, una lista de fechas cerradas en la config.
//   · Dos franjas pegadas (una que termina a las 24:00 y otra que empieza a las 0:00) se informan
//     como dos: «cierra 0:00» aunque siga abierto. Se evita cargándolas como una sola que cruza.
//   · Una franja mal escrita se ignora (no abre nada): la config es código, el test la cuida.

import { horaArgentina, ZONA_HORARIA } from "./reloj";

export const DIAS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;
export type Dia = (typeof DIAS)[number];

/** [desde, hasta] en «HH:MM», hora argentina. */
export type Franja = readonly [desde: string, hasta: string];

export type HorarioDelLocal = {
  /** Las franjas de cada día. Un día sin entrada (o con lista vacía) está cerrado. */
  porDia: Partial<Record<Dia, readonly Franja[]>>;
  /** Se marca en el texto mientras el local no lo confirme. */
  provisional?: boolean;
};

const NOMBRE_DIA: Record<Dia, string> = {
  dom: "domingo",
  lun: "lunes",
  mar: "martes",
  mie: "miércoles",
  jue: "jueves",
  vie: "viernes",
  sab: "sábado",
};

const DIA_EN: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MIN_DIA = 24 * 60;

let formatoDia: Intl.DateTimeFormat | null = null;

/** Día de la semana (0 = domingo) y minutos desde la medianoche, en la hora argentina. */
export function momentoArgentino(ahora: Date): { dia: number; minutos: number } {
  formatoDia ??= new Intl.DateTimeFormat("en-US", { timeZone: ZONA_HORARIA, weekday: "short" });
  const dia = DIA_EN[formatoDia.format(ahora)] ?? 0;
  const [h, m] = horaArgentina(ahora).split(":").map(Number);
  return { dia, minutos: h * 60 + m };
}

/** «HH:MM» → minutos (0..1440), o null si está mal escrito. */
function leerHora(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** La franja en minutos: `hasta` puede pasar de 1440 si cruza la medianoche. null = mal escrita. */
function tramo(f: Franja): { desde: number; hasta: number } | null {
  const desde = leerHora(f[0]);
  let hasta = leerHora(f[1]);
  if (desde === null || hasta === null || desde >= MIN_DIA || hasta === desde) return null;
  if (hasta < desde) hasta += MIN_DIA; // cruza la medianoche (incluye «00:00» como cierre)
  return { desde, hasta };
}

const tramosDe = (h: HorarioDelLocal, dia: number) =>
  (h.porDia[DIAS[((dia % 7) + 7) % 7]] ?? []).map(tramo).filter((t): t is { desde: number; hasta: number } => t !== null);

/** «8:00», «20:00», «0:00»: la hora de reloj de un minuto del día (sin cero adelante). */
function hhmm(minutos: number): string {
  const m = ((minutos % MIN_DIA) + MIN_DIA) % MIN_DIA;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export type EstadoDelHorario = { abierto: true; cierra: string } | { abierto: false };

/** ¿Está abierto ahora? Con la hora de cierre de la franja en curso. */
export function estaAbierto(h: HorarioDelLocal, ahora: Date): EstadoDelHorario {
  const { dia, minutos } = momentoArgentino(ahora);
  for (const t of tramosDe(h, dia)) {
    if (minutos >= t.desde && minutos < t.hasta) return { abierto: true, cierra: hhmm(t.hasta) };
  }
  // Lo que quedó de ayer: una franja que cruzó la medianoche.
  for (const t of tramosDe(h, dia - 1)) {
    if (t.hasta > MIN_DIA && minutos < t.hasta - MIN_DIA) return { abierto: true, cierra: hhmm(t.hasta) };
  }
  return { abierto: false };
}

export type ProximaApertura = { enDias: number; dia: string; hora: string };

/** La próxima vez que abre DESPUÉS de ahora (hoy más tarde, mañana, …), o null si no abre nunca. */
export function proximaApertura(h: HorarioDelLocal, ahora: Date): ProximaApertura | null {
  const { dia, minutos } = momentoArgentino(ahora);
  for (let k = 0; k <= 7; k++) {
    const desdes = tramosDe(h, dia + k)
      .map((t) => t.desde)
      .filter((d) => k > 0 || d > minutos)
      .sort((a, b) => a - b);
    if (desdes.length > 0) return { enDias: k, dia: NOMBRE_DIA[DIAS[(dia + k) % 7]], hora: hhmm(desdes[0]) };
  }
  return null;
}

/** «hoy 17:00», «mañana 8:00», «el lunes 8:00». */
export function cuandoAbre(p: ProximaApertura): string {
  const cuando = p.enDias === 0 ? "hoy" : p.enDias === 1 ? "mañana" : `el ${p.dia}`;
  return `${cuando} ${p.hora}`;
}

/** La línea de la vidriera: «Abierto · cierra 20:00» / «Cerrado · abre mañana 8:00». */
export function textoDelEstado(h: HorarioDelLocal, ahora: Date): string {
  const e = estaAbierto(h, ahora);
  if (e.abierto) return `Abierto · cierra ${e.cierra}`;
  const p = proximaApertura(h, ahora);
  return p ? `Cerrado · abre ${cuandoAbre(p)}` : "Cerrado por ahora";
}

/**
 * El NO del servidor fuera de horario, en criollo; null si está abierto. Sin horario cargado no
 * se controla (null): es lo de antes de que existiera.
 */
export function rechazoPorHorario(cfg: { nombre: string; horario?: HorarioDelLocal | null }, ahora: Date): string | null {
  if (!cfg.horario) return null;
  if (estaAbierto(cfg.horario, ahora).abierto) return null;
  const p = proximaApertura(cfg.horario, ahora);
  const abre = p ? `Abre ${cuandoAbre(p)}` : "Por ahora no tiene horario de atención cargado";
  return `${cfg.nombre} está cerrado y no toma pedidos en este momento. ${abre}: tu pedido queda armado acá para mandarlo cuando abra.`;
}

// ── El texto del horario semanal ──────────────────────────────────────────────

const ORDEN_SEMANA: readonly Dia[] = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

/** «8», «8:30», «0»: la hora de una franja en el texto. */
function horaCorta(t: string): string {
  const m = leerHora(t);
  if (m === null) return t;
  const r = hhmm(m === MIN_DIA ? 0 : m);
  return r.endsWith(":00") ? r.slice(0, -3) : r;
}

const textoFranjas = (fs: readonly Franja[]) => fs.map((f) => `de ${horaCorta(f[0])} a ${horaCorta(f[1])}`).join(" y ");
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Lunes a sábado de 8 a 20» (con «(provisional a confirmar)» si corresponde). */
export function resumenDelHorario(h: HorarioDelLocal): string {
  const grupos: { dias: Dia[]; texto: string }[] = [];
  for (const d of ORDEN_SEMANA) {
    const fs = (h.porDia[d] ?? []).filter((f) => tramo(f) !== null);
    if (fs.length === 0) continue;
    const texto = textoFranjas(fs);
    const ultimo = grupos[grupos.length - 1];
    const anterior = ORDEN_SEMANA[ORDEN_SEMANA.indexOf(d) - 1];
    if (ultimo && ultimo.texto === texto && ultimo.dias[ultimo.dias.length - 1] === anterior) ultimo.dias.push(d);
    else grupos.push({ dias: [d], texto });
  }
  if (grupos.length === 0) return "Sin horario de atención cargado";
  const partes = grupos.map((g) => {
    const primero = NOMBRE_DIA[g.dias[0]];
    const ultimo = NOMBRE_DIA[g.dias[g.dias.length - 1]];
    const dias = g.dias.length === 1 ? primero : g.dias.length === 2 ? `${primero} y ${ultimo}` : `${primero} a ${ultimo}`;
    return `${mayuscula(dias)} ${g.texto}`;
  });
  return `${partes.join(" · ")}${h.provisional ? " (provisional a confirmar)" : ""}`;
}
