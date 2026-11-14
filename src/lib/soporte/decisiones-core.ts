// ============================================================================
// MANTENIMIENTO GSG — las decisiones del dueño del 14/11/2026, en código (GSG-MANT-002).
// ============================================================================
//
// Fuente: DISENO-MANT-001.md §13 («MANT-OK · OK a las 9 recomendadas», D1 a, D2 b). Cada función
// es una regla chica y PURA (la prueba decisiones-core.test.ts). Lo que es de la base (D9) está en
// prisma/pending-gate2/MANT_roles_soporte.sql; el permiso del cliente (D4), en consentimiento-core.ts;
// CH (D5), en agentes-permisos.ts.

import type { Prioridad } from "./config";
import { PRIORIDAD } from "./config";

const HORA = 3_600_000;
const MINUTO = 60_000;

// ── D1 · WhatsApp: número nuevo de GSG, sólo para soporte ─────────────────────────────────────────

/**
 * La variable con el `phone_number_id` del número de Soporte GSG en WhatsApp Cloud. No es secreta
 * (es un id público de Meta), pero la carga el dueño. Sin ella, se arranca sin WhatsApp (D1).
 */
export const VAR_WHATSAPP_SOPORTE = "SOPORTE_WHATSAPP_PHONE_NUMBER_ID";

/** Los canales que reciben pedidos hoy. WhatsApp sólo si está el número propio de soporte. PURA. */
export function canalesDeSoporteActivos(env: Record<string, string | undefined>): ("erp" | "mail" | "whatsapp")[] {
  const id = env[VAR_WHATSAPP_SOPORTE]?.trim() ?? "";
  // Un id de Meta son sólo dígitos: cualquier otra cosa es un error de carga y se trata como ausente.
  return /^\d{6,30}$/.test(id) ? ["erp", "mail", "whatsapp"] : ["erp", "mail"];
}

// ── D2 · Horario de guardia: L a V 9–19 y sábado 9–13; lo grave, a toda hora y sólo en vivo ────────

/** Argentina no tiene horario de verano desde 2009: UTC−3 fijo. */
const DESFASE_AR_MS = -3 * HORA;

/** Ventana de guardia por día de la semana (0 = domingo), en minutos desde la medianoche argentina. */
export const GUARDIA: Readonly<Record<number, { desde: number; hasta: number } | null>> = {
  0: null,
  1: { desde: 9 * 60, hasta: 19 * 60 },
  2: { desde: 9 * 60, hasta: 19 * 60 },
  3: { desde: 9 * 60, hasta: 19 * 60 },
  4: { desde: 9 * 60, hasta: 19 * 60 },
  5: { desde: 9 * 60, hasta: 19 * 60 },
  6: { desde: 9 * 60, hasta: 13 * 60 },
};

/**
 * Feriados nacionales «AAAA-MM-DD» (hora argentina) en los que no hay guardia. Fuente oficial, leída el
 * 14/11/2026: https://www.argentina.gob.ar/sites/default/files/holidays-2026-es.json (el recurso que publica
 * https://datos.gob.ar/dataset/feriados-nacionales y que arma https://www.argentina.gob.ar/jefatura/feriados-nacionales-2026;
 * normas: Ley 27.399, Decreto 614/2025, Resolución 164/2025, Decreto 1103/2026). Fechas ya trasladadas.
 * Criterio (provisional a confirmar por el dueño): entran «inamovible», «trasladable» y «turistico»; quedan
 * afuera los «no_laborable» de cada credo y los «especial» de una sola provincia (10 y 11/11). 2027 todavía no
 * está publicado (sólo el 1/1, que viene en el mismo archivo): hay que sumarlo cuando salga.
 */
export const FERIADOS_NACIONALES: ReadonlySet<string> = new Set([
  "2026-01-01", // Año Nuevo
  "2026-02-16", // Carnaval
  "2026-02-17", // Carnaval
  "2026-03-23", // Día no laborable con fines turísticos
  "2026-03-24", // Día Nacional de la Memoria por la Verdad y la Justicia
  "2026-04-02", // Veteranos y Caídos en la Guerra de Malvinas
  "2026-04-03", // Viernes Santo
  "2026-05-01", // Día del Trabajador
  "2026-05-25", // Revolución de Mayo
  "2026-06-15", // Güemes (17/6, trasladado)
  "2026-06-20", // Belgrano
  "2026-07-09", // Independencia
  "2026-07-10", // Día no laborable con fines turísticos
  "2026-08-17", // San Martín
  "2026-10-12", // 12 de octubre
  "2026-11-09", // Visita del Papa León XIV (Decreto 1103/2026)
  "2026-11-23", // Soberanía Nacional (20/11, trasladado)
  "2026-12-07", // Día no laborable con fines turísticos
  "2026-12-08", // Inmaculada Concepción de María
  "2026-12-25", // Navidad
  "2027-01-01", // Año Nuevo
]);

/** Lo que el reloj necesita saber del negocio. `enVivo`: el negocio ya opera de verdad (provisional: `Tenant.status = ACTIVE`). */
export interface ContextoDeReloj {
  enVivo?: boolean;
  /** Feriados «AAAA-MM-DD» (hora argentina): no hay guardia. Si no se pasa, los nacionales oficiales. */
  feriados?: ReadonlySet<string>;
}

/** Provisional a confirmar: «en vivo» = el negocio está ACTIVE (no en prueba ni suspendido). PURA. */
export const negocioEnVivo = (status: string | null | undefined) => status === "ACTIVE";

const diaAr = (msAr: number) => new Date(msAr).toISOString().slice(0, 10);
const medianocheAr = (msAr: number) => Math.floor(msAr / (24 * HORA)) * 24 * HORA;

function ventanaDelDia(msAr: number, feriados: ReadonlySet<string>): { desde: number; hasta: number } | null {
  if (feriados.has(diaAr(msAr))) return null;
  return GUARDIA[new Date(msAr).getUTCDay()] ?? null;
}

/** ¿Este instante cae dentro del horario de guardia? PURA. */
export function enHorarioDeGuardia(instante: Date, feriados: ReadonlySet<string> = FERIADOS_NACIONALES): boolean {
  const ar = instante.getTime() + DESFASE_AR_MS;
  const v = ventanaDelDia(ar, feriados);
  if (!v) return false;
  const min = (ar - medianocheAr(ar)) / MINUTO;
  return min >= v.desde && min < v.hasta;
}

/** Suma `horas` de guardia a `desde`: el reloj sólo corre dentro de la ventana. PURA. */
export function sumarHorasDeGuardia(desde: Date, horas: number, feriados: ReadonlySet<string> = FERIADOS_NACIONALES): Date {
  let resta = Math.max(0, horas) * HORA;
  let ar = desde.getTime() + DESFASE_AR_MS;
  // Tope de vueltas: 120 h de guardia son ~3 semanas; 400 días alcanzan aun con feriados de más.
  for (let i = 0; i < 400; i++) {
    const cero = medianocheAr(ar);
    const v = ventanaDelDia(ar, feriados);
    if (v) {
      const abre = cero + v.desde * MINUTO;
      const cierra = cero + v.hasta * MINUTO;
      if (ar < abre) ar = abre;
      if (ar < cierra) {
        const hay = cierra - ar;
        if (resta <= hay) return new Date(ar + resta - DESFASE_AR_MS);
        resta -= hay;
      }
    }
    ar = cero + 24 * HORA;
  }
  throw new Error("Horario de guardia sin ventanas: revisá GUARDIA y los feriados.");
}

/**
 * ¿El reloj de esta prioridad corre a toda hora? Sólo P1 de un negocio en vivo (D2). Lo demás
 * corre en horario de guardia. PURA.
 */
export const correATodaHora = (prioridad: Prioridad, ctx: ContextoDeReloj = {}) => prioridad === "P1" && ctx.enVivo === true;

/** El vencimiento de la resolución según D2. PURA. */
export function vencimientoDeResolucion(prioridad: Prioridad, desde: Date, ctx: ContextoDeReloj = {}): Date {
  const horas = PRIORIDAD[prioridad].resolucionHoras;
  return correATodaHora(prioridad, ctx) ? new Date(desde.getTime() + horas * HORA) : sumarHorasDeGuardia(desde, horas, ctx.feriados);
}

/**
 * ¿Hay que avisar YA al teléfono del dueño? Lo grave (P1) de un negocio en vivo que entra fuera de
 * guardia. En horario lo ve quien esté de guardia en la consola. PURA.
 */
export function avisarAlDuenioFueraDeHora(prioridad: Prioridad, ahora: Date, ctx: ContextoDeReloj = {}): boolean {
  return correATodaHora(prioridad, ctx) && !enHorarioDeGuardia(ahora, ctx.feriados);
}

// ── D3 · Tope: el soporte usa como máximo ¼ del tope semanal de IA ─────────────────────────────────

export const TOPE_SOPORTE = {
  /** Fracción del tope semanal del plan que puede usar el soporte. */
  fraccionDelPlan: 0.25,
  /** Al 80 % de esa fracción se avisa; al 100 % el motor pasa a manual. */
  aviso: 0.8,
} as const;

export type EstadoDelTope = "normal" | "aviso" | "manual";

/**
 * Qué motor atiende el próximo ticket de este negocio. `usadoSemana` y `topeSemanalPlan` en la
 * misma unidad (lo que mida el plan: US$ equivalentes o mensajes). Un negocio que no paga: cero IA,
 * manual. Un número roto (negativo, NaN, tope 0) también es manual: falla cerrado. PURA.
 */
export function estadoDelTope(p: { usadoSemana: number; topeSemanalPlan: number; negocioPaga: boolean }): {
  estado: EstadoDelTope;
  motivo: string;
} {
  if (!p.negocioPaga) return { estado: "manual", motivo: "El negocio no paga todavía: el soporte con IA es cero (D3)." };
  const { usadoSemana: u, topeSemanalPlan: t } = p;
  if (!Number.isFinite(u) || !Number.isFinite(t) || u < 0 || t <= 0) {
    return { estado: "manual", motivo: "No se puede medir el consumo: pasa a manual hasta corregirlo." };
  }
  const tope = t * TOPE_SOPORTE.fraccionDelPlan;
  if (u >= tope) return { estado: "manual", motivo: "El soporte llegó a su cuarto del tope semanal: pasa a manual (D3)." };
  if (u >= tope * TOPE_SOPORTE.aviso) return { estado: "aviso", motivo: "El soporte pasó el 80 % de su cuarto del tope semanal." };
  return { estado: "normal", motivo: "Dentro del tope." };
}

// ── D6 y D8 · Revisión humana y pasos a automático ────────────────────────────────────────────────

/**
 * El motor vigente. «plan»: sesiones de Claude en la nube con el plan de GSG como herramienta
 * interna (D-10, D-11): nada sale ni se aplica sin una persona. «api»: si algún día se pasa a la
 * sección 16. Cambiarlo es una decisión del dueño (y un PR).
 */
export type Motor = "plan" | "api";
export const MOTOR_VIGENTE: Motor = "plan";

export const UMBRAL_N1_AUTOMATICO = {
  /** Semanas de revisión antes de evaluar (D6). */
  semanas: 4,
  /** Fracción de borradores aprobados sin cambios (D6: 9 de cada 10). */
  sinCambios: 0.9,
  /** Muestra mínima para que el 90 % signifique algo. Provisional a confirmar. */
  muestraMinima: 30,
} as const;

/**
 * D6: ¿esta respuesta N1 puede salir sin revisión? Toda respuesta se revisa. A las 4 semanas, si 9
 * de cada 10 consultas P3 salieron sin cambios, esas se mandan solas, PERO sólo si el motor lo
 * permite: con el plan (D-11) la aprobación humana es la condición de uso y nunca hay envío solo
 * (DISENO §13 D-6, §15.6). PURA.
 */
export function n1PuedeSalirSolo(p: {
  motor: Motor;
  inicioRevision: Date;
  ahora: Date;
  aprobadosSinCambios: number;
  revisados: number;
  ticket: { tipo: string; prioridad: Prioridad };
  esCH: boolean;
}): { solo: boolean; motivo: string } {
  if (p.esCH) return { solo: false, motivo: "CH: todo borrador lo aprueba el dueño (D5)." };
  if (p.motor !== "api") return { solo: false, motivo: "Con el plan actual nada sale sin una persona (D-11)." };
  if (p.ticket.tipo !== "consulta" || p.ticket.prioridad !== "P3") return { solo: false, motivo: "Sólo las consultas P3 pueden salir solas." };
  const semanas = (p.ahora.getTime() - p.inicioRevision.getTime()) / (7 * 24 * HORA);
  if (!(semanas >= UMBRAL_N1_AUTOMATICO.semanas)) return { solo: false, motivo: "Todavía no pasaron 4 semanas de revisión." };
  if (!(p.revisados >= UMBRAL_N1_AUTOMATICO.muestraMinima)) return { solo: false, motivo: "Todavía no hay muestra suficiente." };
  const tasa = p.aprobadosSinCambios / p.revisados;
  if (!(tasa >= UMBRAL_N1_AUTOMATICO.sinCambios)) return { solo: false, motivo: "Menos de 9 de cada 10 salieron sin cambios." };
  return { solo: true, motivo: "Cumple D6: 4 semanas y 9 de cada 10 sin cambios." };
}

/** D8: cambios N2 sin error antes de que la lista verde reversible se aplique sola. */
export const UMBRAL_N2_AUTOMATICO = 20;

/**
 * D8: ¿este cambio N2 se aplica sin el clic del dueño? Cada cambio con un clic. Después de 20
 * cambios seguidos sin error, los REVERSIBLES de la lista verde se aplican solos, otra vez sólo si
 * el motor lo permite (con el plan, nunca: D-11). Un error vuelve la cuenta a cero (lo cuenta quien
 * llama: `cambiosSeguidosSinError`). PURA.
 */
export function n2SeAplicaSolo(p: { motor: Motor; cambiosSeguidosSinError: number; reversible: boolean; esCH: boolean }): {
  solo: boolean;
  motivo: string;
} {
  if (p.esCH) return { solo: false, motivo: "CH: los agentes no cambian nada (D5)." };
  if (p.motor !== "api") return { solo: false, motivo: "Con el plan actual cada cambio lleva el clic del dueño (D-11)." };
  if (!p.reversible) return { solo: false, motivo: "Lo que no se puede deshacer lleva siempre el clic." };
  if (!(p.cambiosSeguidosSinError >= UMBRAL_N2_AUTOMATICO)) return { solo: false, motivo: "Todavía no hay 20 cambios seguidos sin error." };
  return { solo: true, motivo: "Cumple D8: 20 cambios sin error y es reversible." };
}
