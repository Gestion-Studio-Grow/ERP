// ============================================================================
// "PARA CONTACTAR HOY" — la bandeja comercial de la recepción. PURO.
// ============================================================================
//
// Una lista CORTA de clientas a escribir hoy, cada una con su motivo. Se escribe 1 a 1 por
// WhatsApp, con el texto armado (textos.ts) y dejando constancia (crm-actions.ts): nada masivo.
//
// MOTIVOS, en este orden de prioridad (una fila por clienta, el primero que cumpla):
//   1. pasada      → la recepción o la dueña la sumó hoy desde "Por recuperar";
//   2. resena      → vino ayer, el turno quedó completado y no dejó reseña;
//   3. cumpleanios → cumple de hoy a dentro de 7 días (cruza el año);
//   4. recuperar   → está "en riesgo" (segmentos.ts), la de más valor primero.
//
// EXCLUSIONES, para todos los motivos (la pantalla muestra cuántas y por qué):
//   · pidió no recibir mensajes (el permiso, constancias.ts);
//   · se le escribió hace menos de 14 días;
//   · ya tiene un turno reservado;
//   · el teléfono cargado no es un celular válido (no hay WhatsApp que abrir).
//
// TOPE: 15 por día (PROVISIONAL), contando las ya contactadas hoy. Al recargar, las que se
// contactaron salen (contacto reciente) y entran otras hasta completar el tope, no más.

import { waLinkClienta } from "@/lib/whatsapp-cta";
import { diasEntre, diasHastaCumple, fmtMesDia, sumarDias } from "./fechas";
import type { Constancias } from "./constancias";
import type { Persona } from "./personas";
import { explicarSegmento, type Evaluacion } from "./segmentos";
import { CRM_REGLAS, MOTIVOS_CONTACTO, type MotivoContacto, type ReglasCrm } from "./reglas";

export type FilaBandeja = {
  clientId: string;
  nombre: string;
  telefono: string;
  motivo: MotivoContacto;
  /** Por qué está, en una línea, con los números de la regla. */
  explicacion: string;
  /** El servicio que da contexto al texto (el de ayer para la reseña, el último para recuperar). */
  servicio: string | null;
  /** El turno del que se pide la reseña. */
  appointmentId: string | null;
  diasParaCumple: number | null;
  /** Lo que gasta por año (estimado). Sólo lo muestra quien ve plata. */
  valorAnual: number;
};

export type MotivoExclusion = "baja" | "contactoReciente" | "conTurno" | "sinCelular";

export type Bandeja = {
  filas: FilaBandeja[];
  /** Cuántas tenían motivo antes de excluir. */
  candidatas: number;
  excluidas: Record<MotivoExclusion, number>;
  tope: number;
  contactadasHoy: number;
  /** Cuántas quedaban en la bandeja hoy, antes de cortar por el tope. */
  pendientes: number;
  porMotivo: Record<MotivoContacto, number>;
};

type Candidata = FilaBandeja & { orden: number };

function textoCumple(dias: number, mesDia: string): string {
  if (dias === 0) return "Cumple hoy.";
  if (dias === 1) return "Cumple mañana.";
  return `Cumple el ${fmtMesDia(mesDia)} (en ${dias} días).`;
}

/** El motivo de más prioridad de UNA persona, o null si no tiene ninguno. */
export function motivoDe(
  persona: Persona,
  ev: Evaluacion,
  c: Pick<Constancias, "pasadasHoy">,
  hoy: string,
  opciones: { pedirResenas: boolean },
  reglas: ReglasCrm = CRM_REGLAS,
): Candidata | null {
  const base = {
    clientId: persona.id,
    nombre: persona.nombre,
    telefono: persona.telefono,
    servicio: persona.visitas.at(-1)?.servicio ?? null,
    appointmentId: null,
    diasParaCumple: persona.cumple ? diasHastaCumple(persona.cumple, hoy) : null,
    valorAnual: ev.valorAnual,
  };
  if (c.pasadasHoy.has(persona.id)) {
    return { ...base, motivo: "pasada", explicacion: `La sumaste hoy desde Por recuperar. ${explicarSegmento(ev)}`, orden: 0 };
  }
  if (opciones.pedirResenas) {
    const dia = sumarDias(hoy, -reglas.resenaDiasAtras);
    const turno = persona.sinResena.filter((t) => t.fecha === dia).at(-1);
    if (turno) {
      return {
        ...base,
        motivo: "resena",
        servicio: turno.servicio,
        appointmentId: turno.appointmentId,
        explicacion: `Vino ${reglas.resenaDiasAtras === 1 ? "ayer" : `hace ${reglas.resenaDiasAtras} días`} (${turno.servicio}) y todavía no dejó reseña.`,
        orden: 0,
      };
    }
  }
  if (persona.cumple && base.diasParaCumple !== null && base.diasParaCumple <= reglas.cumpleAvisoDias) {
    return { ...base, motivo: "cumpleanios", explicacion: textoCumple(base.diasParaCumple, persona.cumple), orden: base.diasParaCumple };
  }
  if (ev.segmento === "en-riesgo") {
    return { ...base, motivo: "recuperar", explicacion: explicarSegmento(ev), orden: -ev.valorAnual };
  }
  return null;
}

/** Por qué una candidata NO entra hoy, o null si entra. El orden es el que se informa. */
export function exclusionDe(
  persona: Persona,
  c: Pick<Constancias, "bajas" | "ultimoContacto">,
  hoy: string,
  reglas: Pick<ReglasCrm, "contactoRecienteDias"> = CRM_REGLAS,
): MotivoExclusion | null {
  if (c.bajas.has(persona.id)) return "baja";
  const ultimo = c.ultimoContacto.get(persona.id);
  if (ultimo && diasEntre(ultimo, hoy) < reglas.contactoRecienteDias) return "contactoReciente";
  if (persona.proximoTurno) return "conTurno";
  if (!waLinkClienta(persona.telefono)) return "sinCelular";
  return null;
}

export function armarBandeja(input: {
  evaluadas: readonly { persona: Persona; ev: Evaluacion }[];
  constancias: Constancias;
  hoy: string;
  pedirResenas: boolean;
  reglas?: ReglasCrm;
}): Bandeja {
  const reglas = input.reglas ?? CRM_REGLAS;
  const excluidas: Record<MotivoExclusion, number> = { baja: 0, contactoReciente: 0, conTurno: 0, sinCelular: 0 };
  const entran: Candidata[] = [];
  let candidatas = 0;
  for (const { persona, ev } of input.evaluadas) {
    const cand = motivoDe(persona, ev, input.constancias, input.hoy, { pedirResenas: input.pedirResenas }, reglas);
    if (!cand) continue;
    candidatas++;
    const fuera = exclusionDe(persona, input.constancias, input.hoy, reglas);
    if (fuera) excluidas[fuera]++;
    else entran.push(cand);
  }
  const prioridad = (m: MotivoContacto) => MOTIVOS_CONTACTO.indexOf(m);
  entran.sort(
    (a, b) =>
      prioridad(a.motivo) - prioridad(b.motivo) ||
      a.orden - b.orden ||
      a.nombre.localeCompare(b.nombre, "es") ||
      (a.clientId < b.clientId ? -1 : 1),
  );
  const tope = reglas.topeBandejaPorDia;
  const lugares = Math.max(0, tope - input.constancias.contactadasHoy);
  const filas: FilaBandeja[] = entran.slice(0, lugares).map((c) => ({
    clientId: c.clientId,
    nombre: c.nombre,
    telefono: c.telefono,
    motivo: c.motivo,
    explicacion: c.explicacion,
    servicio: c.servicio,
    appointmentId: c.appointmentId,
    diasParaCumple: c.diasParaCumple,
    valorAnual: c.valorAnual,
  }));
  const porMotivo = { pasada: 0, resena: 0, cumpleanios: 0, recuperar: 0 } satisfies Record<MotivoContacto, number>;
  for (const f of filas) porMotivo[f.motivo]++;
  return {
    filas,
    candidatas,
    excluidas,
    tope,
    contactadasHoy: input.constancias.contactadasHoy,
    pendientes: entran.length,
    porMotivo,
  };
}

/** "3 cumpleaños · 5 por recuperar · 4 reseñas": el detalle del número del Inicio. */
export function detallePorMotivo(porMotivo: Record<MotivoContacto, number>): string {
  const partes: string[] = [];
  if (porMotivo.cumpleanios) partes.push(`${porMotivo.cumpleanios} cumpleaños`);
  const recuperar = porMotivo.recuperar + porMotivo.pasada;
  if (recuperar) partes.push(`${recuperar} por recuperar`);
  if (porMotivo.resena) partes.push(`${porMotivo.resena} ${porMotivo.resena === 1 ? "reseña" : "reseñas"}`);
  return partes.join(" · ");
}
