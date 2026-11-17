// ============================================================================
// CRM COMERCIAL — motor puro (GSG-CRM-010, tanda T1).
// ============================================================================
//
// Las reglas del ciclo de la oportunidad, la evidencia que exige cada pase, el puntaje explicado, la
// supresión y las eventualidades E1–E24 del diseño (docs/tenants/mia-producciones/CRM-REINGENIERIA.md
// §2 y §5, rama ccr-63f5f4f3-r4z98m). Sin DOM, sin red y sin disco: recibe datos y devuelve
// `{ ok, motivo }` en criollo. El repo (repo.ts) junta los datos, llama acá y recién después escribe.
//
// Regla de oro (E10, E24): el texto libre que trae una fuente o una consulta es DATO. El motor nunca lo
// lee para decidir: el puntaje sale de campos estructurados y la detección de instrucciones sólo anota.

import { createHash } from "node:crypto";
import { VARA, type Vara } from "./vara";
import { PRONOSTICO, type Pronostico } from "./pronostico";
import { proporcionAlCentavo } from "@/lib/dinero/redondeo";

// ── Etapas ──────────────────────────────────────────────────────────────────

export const ETAPAS = [
  "DETECTADA",
  "VERIFICADA",
  "SIN_CONTACTO",
  "CONTACTADA",
  "RECIBIDA",
  "EN_CONVERSACION",
  "FALTAN_DATOS",
  "CALIFICADA",
  "ASIGNADA",
  "DORMIDA",
  "GANADA",
  "PERDIDA",
  "DESCARTADA",
  "DERIVADA_AL_TALLER",
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const TERMINALES = ["GANADA", "PERDIDA", "DESCARTADA", "DERIVADA_AL_TALLER"] as const satisfies readonly Etapa[];
export const esEtapa = (v: unknown): v is Etapa => typeof v === "string" && (ETAPAS as readonly string[]).includes(v);
export const esTerminal = (e: Etapa): boolean => (TERMINALES as readonly string[]).includes(e);
export const estaAbierta = (e: Etapa): boolean => !esTerminal(e);

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  DETECTADA: "Detectada",
  VERIFICADA: "Verificada",
  SIN_CONTACTO: "Sin contacto",
  CONTACTADA: "Contactada",
  RECIBIDA: "Consulta recibida",
  EN_CONVERSACION: "En conversación",
  FALTAN_DATOS: "Faltan datos",
  CALIFICADA: "Calificada",
  ASIGNADA: "Asignada",
  DORMIDA: "Dormida",
  GANADA: "Ganada",
  PERDIDA: "Perdida",
  DESCARTADA: "Descartada",
  DERIVADA_AL_TALLER: "Derivada al Taller",
};

// GSG-CRM-011: lo que se escribe en la línea de tiempo va en criollo, nunca con el valor interno
// («VERIFICAR», «armador_brief», «AGENCIA»). Las pantallas usan las mismas etiquetas (crm-core.ts).
export const ETIQUETA_PUESTO_CRM: Record<string, string> = {
  descubridor: "Descubridor",
  identificador: "Identificador de marcas",
  verificador: "Verificador",
  contactos: "Buscador de contactos",
  redactor: "Redactor",
  seguidor: "Seguidor",
  calificador: "Calificador",
  armador_brief: "Armador de brief",
};
export const ETIQUETA_TAREA: Record<string, string> = {
  SEGUIMIENTO: "Seguimiento",
  CARGAR_CONTACTO: "Cargar un contacto",
  PUNTUAR: "Puntuar",
  VERIFICAR: "Verificar la fuente",
  ARMAR_BRIEF: "Armar el brief",
  REDACTAR: "Escribir un borrador",
};
/** «Verificar la fuente»; un tipo nuevo sin etiqueta sale en minúsculas y sin guiones bajos. */
export const etiquetaTarea = (t: string): string => ETIQUETA_TAREA[t] ?? t.replaceAll("_", " ").toLowerCase();
/** A quién va una tarea: un puesto, «una persona» o «Dirección». */
export const ETIQUETA_PARA = (p: string): string =>
  p === "PERSONA" ? "una persona (comercial o Dirección)" : p === "DIRECCION" ? "Dirección" : (ETIQUETA_PUESTO_CRM[p] ?? p.replaceAll("_", " "));
export const ETIQUETA_DESTINO: Record<string, string> = { AGENCIA: "Agencia", TALLER: "Taller" };

export const TIPOS = ["PROSPECTO", "CONSULTA"] as const;
export type TipoOportunidad = (typeof TIPOS)[number];
export const DESTINOS = ["AGENCIA", "TALLER"] as const;
export type Destino = (typeof DESTINOS)[number];
export const MONEDAS = ["ARS", "USD"] as const;
export type Moneda = (typeof MONEDAS)[number];

/** Dónde nace cada tipo de oportunidad. */
export const ETAPA_INICIAL: Record<TipoOportunidad, Etapa> = { PROSPECTO: "DETECTADA", CONSULTA: "RECIBIDA" };

/**
 * Catálogo cerrado de motivos (diseño §1: «motivo de pérdida en texto libre» es la debilidad del referente).
 * PROVISIONAL A CONFIRMAR con Dirección (§9). Se acompaña siempre de una nota libre opcional.
 */
export const MOTIVOS = {
  SIN_PRESUPUESTO: "No tiene presupuesto",
  ELIGIO_OTRO: "Eligió a otro proveedor",
  SIN_RESPUESTA: "No respondió",
  SIN_DATOS: "No mandó los datos que faltaban",
  EVENTO_CANCELADO: "Se canceló el evento",
  PROXIMA_EDICION: "Lo deja para la próxima edición",
  NO_ENCAJA: "No es lo que vendemos",
  YA_ES_CLIENTE: "Ya es cliente: lo atiende su comercial",
  NO_CONTACTAR: "Pidió que no le escriban más",
  DUPLICADA: "Es la misma oportunidad que otra",
  OTRO: "Otro motivo",
} as const;
export type Motivo = keyof typeof MOTIVOS;
export const esMotivo = (v: unknown): v is Motivo => typeof v === "string" && Object.hasOwn(MOTIVOS, v);

/** Los motivos que valen para dormir una oportunidad (E19, E23). */
export const MOTIVOS_DORMIDA: readonly Motivo[] = ["EVENTO_CANCELADO", "PROXIMA_EDICION", "SIN_RESPUESTA", "OTRO"];

/** Pases que un puesto del equipo de agentes sólo puede PROPONER: los aplica Dirección (diseño §3). */
export const PASES_CON_APROBACION: readonly Etapa[] = ["CALIFICADA", "ASIGNADA", "DORMIDA", "DESCARTADA", "PERDIDA", "DERIVADA_AL_TALLER"];
/** Pases que sólo pone el cierre del proyecto (diseño §2: la oportunidad toma el cierre del proyecto). */
export const PASES_DEL_PROYECTO: readonly Etapa[] = ["GANADA"];

/** El grafo del ciclo. DORMIDA vuelve a la etapa en que estaba (`etapaPrevia`), lo resuelve `despertar`. */
const SIGUIENTES: Record<Etapa, readonly Etapa[]> = {
  DETECTADA: ["VERIFICADA", "DORMIDA", "DESCARTADA"],
  VERIFICADA: ["SIN_CONTACTO", "CONTACTADA", "DORMIDA", "DESCARTADA"],
  SIN_CONTACTO: ["CONTACTADA", "DORMIDA", "DESCARTADA"],
  CONTACTADA: ["EN_CONVERSACION", "DORMIDA", "PERDIDA", "DESCARTADA"],
  RECIBIDA: ["EN_CONVERSACION", "DESCARTADA"],
  EN_CONVERSACION: ["FALTAN_DATOS", "CALIFICADA", "DORMIDA", "PERDIDA", "DESCARTADA", "DERIVADA_AL_TALLER"],
  FALTAN_DATOS: ["EN_CONVERSACION", "CALIFICADA", "DORMIDA", "PERDIDA", "DESCARTADA", "DERIVADA_AL_TALLER"],
  CALIFICADA: ["ASIGNADA", "FALTAN_DATOS", "DORMIDA", "PERDIDA", "DESCARTADA", "DERIVADA_AL_TALLER"],
  ASIGNADA: ["GANADA", "PERDIDA"],
  DORMIDA: ["PERDIDA", "DESCARTADA"],
  GANADA: [],
  PERDIDA: [],
  DESCARTADA: [],
  DERIVADA_AL_TALLER: [],
};

export function pasesPosibles(desde: Etapa): readonly Etapa[] {
  return SIGUIENTES[desde];
}

// ── Resultado ───────────────────────────────────────────────────────────────

export type Rechazo = { ok: false; motivo: string };
export type Resultado<T extends object = object> = ({ ok: true } & T) | Rechazo;
const no = (motivo: string): Rechazo => ({ ok: false, motivo });
const lista = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

// ── Datos estructurados y puntaje (A9, E6, E24) ─────────────────────────────

/**
 * Los únicos datos que cuentan para calificar. Cada uno lo carga una persona o un puesto desde una fuente
 * vista; ninguno sale del texto libre de la consulta. Un campo ausente es «no sabemos».
 */
export interface DatosComerciales {
  /** Día del evento (AAAA-MM-DD). */
  fechaEvento?: string | null;
  /** Tipo de trabajo, de un catálogo corto (stand_modular, experiencia, activacion…). */
  tipoTrabajo?: string | null;
  /** Presupuesto o rango, en la moneda de la oportunidad. */
  presupuestoMin?: number | null;
  presupuestoMax?: number | null;
  /**
   * GSG-CRM-018c (V5): al asignar, el rango viaja al proyecto del negocio destino y se vacía del ARM; en el ARM queda
   * sólo si lo tenía. Cuenta como el presupuesto para el puntaje (el puntaje no cambia por asignar).
   */
  teniaPresupuesto?: boolean | null;
  /** Quién decide la compra (nombre del puesto, no datos de contacto). */
  quienDecide?: string | null;
  /** ¿Encaja con lo que se vende? Lo marca una persona o el Calificador, con fuente. */
  encaje?: boolean | null;
}

export interface CriterioPuntaje {
  criterio: keyof Vara["puntos"];
  suma: number;
  /** En criollo: qué sumó, o qué faltó. */
  explicacion: string;
}

export interface Puntaje {
  puntaje: number;
  detalle: CriterioPuntaje[];
  /** Los criterios que no sumaron (sirven de lista para pedir datos). */
  faltantes: (keyof Vara["puntos"])[];
  /** Puntaje sobre el umbral Y encaje «sí» (GSG-CRM-018c): lo que pide «Calificada», además del brief y el destino. */
  califica: boolean;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 86_400_000;

export function diaValido(s: unknown): s is string {
  if (typeof s !== "string" || !DIA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Días enteros desde `ahora` hasta el día `dia` (negativo si ya pasó). */
export function diasHasta(dia: string, ahora: Date): number {
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  return Math.round((new Date(`${dia}T00:00:00Z`).getTime() - hoy) / MS_DIA);
}

/**
 * El puntaje, explicado criterio por criterio. Firma cerrada a propósito: NO recibe el texto libre de la
 * consulta, así que un mensaje no lo puede inflar (E24). Mismos datos → mismo puntaje, siempre.
 */
export function puntuar(datos: DatosComerciales, ahora: Date, vara: Vara = VARA): Puntaje {
  const p = vara.puntos;
  const detalle: CriterioPuntaje[] = [];

  if (datos.fechaEvento && diaValido(datos.fechaEvento)) {
    const dias = diasHasta(datos.fechaEvento, ahora);
    detalle.push(
      dias > vara.diasMinimos
        ? { criterio: "fechaConocida", suma: p.fechaConocida, explicacion: `El evento es en ${dias} días: hay tiempo para producirlo.` }
        : { criterio: "fechaConocida", suma: 0, explicacion: dias < 0 ? "La fecha del evento ya pasó." : `El evento es en ${dias} días: menos de los ${vara.diasMinimos} que hacen falta.` },
    );
  } else detalle.push({ criterio: "fechaConocida", suma: 0, explicacion: "No sabemos la fecha del evento." });

  detalle.push(
    datos.tipoTrabajo?.trim()
      ? { criterio: "tipoTrabajo", suma: p.tipoTrabajo, explicacion: `Sabemos qué trabajo pide (${tipoDeTrabajoLegible(datos.tipoTrabajo)}).` }
      : { criterio: "tipoTrabajo", suma: 0, explicacion: "No sabemos qué tipo de trabajo pide." },
  );

  const min = datos.presupuestoMin ?? null;
  const max = datos.presupuestoMax ?? null;
  const hayPresupuesto = (min !== null && Number.isFinite(min) && min > 0) || (max !== null && Number.isFinite(max) && max > 0);
  if (!hayPresupuesto && datos.teniaPresupuesto === true) {
    detalle.push({ criterio: "presupuesto", suma: p.presupuesto, explicacion: "Tenía presupuesto: el rango quedó en el proyecto." });
  } else detalle.push(
    hayPresupuesto && !(min !== null && max !== null && max < min)
      ? { criterio: "presupuesto", suma: p.presupuesto, explicacion: "Tiene presupuesto o un rango." }
      : { criterio: "presupuesto", suma: 0, explicacion: hayPresupuesto ? "El rango de presupuesto no cierra (el máximo es menor que el mínimo)." : "No sabemos el presupuesto." },
  );

  detalle.push(
    datos.quienDecide?.trim()
      ? { criterio: "quienDecide", suma: p.quienDecide, explicacion: `Sabemos quién decide (${datos.quienDecide.trim()}).` }
      : { criterio: "quienDecide", suma: 0, explicacion: "No sabemos quién decide la compra." },
  );

  detalle.push(
    datos.encaje === true
      ? { criterio: "encaje", suma: p.encaje, explicacion: "Encaja con lo que vendemos." }
      : { criterio: "encaje", suma: 0, explicacion: datos.encaje === false ? "No encaja con lo que vendemos." : "Falta confirmar que encaje con lo que vendemos." },
  );

  const puntaje = detalle.reduce((s, c) => s + c.suma, 0);
  return { puntaje, detalle, faltantes: detalle.filter((c) => c.suma === 0).map((c) => c.criterio), califica: puntaje >= vara.umbral && datos.encaje === true };
}

/** Lo que propone el Calificador; lo confirma Dirección (E14). */
export function proponerDestino(datos: DatosComerciales, vara: Vara = VARA): Destino | null {
  const t = datos.tipoTrabajo?.trim();
  if (!t) return null;
  return vara.tiposEstandarizados.includes(t) ? "TALLER" : "AGENCIA";
}

// ── Brief (lo que recibe el comercial) ──────────────────────────────────────

export const CAMPOS_BRIEF = ["marca", "evento", "fechaEvento", "tipoTrabajo", "presupuesto", "quienDecide", "objetivo"] as const;
export type CampoBrief = (typeof CAMPOS_BRIEF)[number];
/** Sin estos no se califica. `objetivo` se pide pero no traba. */
export const CAMPOS_BRIEF_OBLIGATORIOS: readonly CampoBrief[] = ["marca", "fechaEvento", "tipoTrabajo", "presupuesto", "quienDecide"];
export const ETIQUETA_CAMPO: Record<CampoBrief, string> = {
  marca: "la marca",
  evento: "el evento",
  fechaEvento: "la fecha del evento",
  tipoTrabajo: "el tipo de trabajo",
  presupuesto: "el presupuesto o un rango",
  quienDecide: "quién decide la compra",
  objetivo: "el objetivo de la marca en el evento",
};

export type CamposBrief = Partial<Record<CampoBrief, string | null>>;

export function faltantesDelBrief(c: CamposBrief): CampoBrief[] {
  return CAMPOS_BRIEF.filter((k) => !c[k]?.toString().trim());
}
export function faltantesObligatorios(c: CamposBrief): CampoBrief[] {
  return faltantesDelBrief(c).filter((k) => CAMPOS_BRIEF_OBLIGATORIOS.includes(k));
}

// ── Pases y evidencia (A2, E4) ──────────────────────────────────────────────

export type Verificacion = "confirmado" | "en duda" | "falla" | "sin verificar";

/** Todo lo que el motor necesita ver de una oportunidad para decidir un pase. Lo arma el repo, de la base. */
export interface VistaPase {
  tipo: TipoOportunidad;
  etapa: Etapa;
  etapaPrevia?: Etapa | null;
  marca: { verificacion: Verificacion | string; urlFuente: string | null } | null;
  evento: { verificacion: Verificacion | string; urlFuente: string | null } | null;
  /** El contacto: `cargadoPorPersona` es falso si no lo cargó una persona (ningún agente crea contactos). */
  contacto: { cargadoPorPersona: boolean; suprimido: boolean } | null;
  borradoresEnviadosPorPersona: number;
  respuestasDelCliente: number;
  identidadComprobada: boolean;
  brief: CamposBrief;
  datos: DatosComerciales;
  destino: Destino | null;
  destinoConfirmado: boolean;
}

/** Lo que trae el pedido de pase, además de la oportunidad. */
export interface EvidenciaPase {
  motivo?: string | null;
  nota?: string | null;
  /** DORMIDA: cuándo vuelve. AAAA-MM-DD. */
  despertarEl?: string | null;
  /** ASIGNADA: el comercial elegido (ya comprobado como comercial activo por el repo). */
  comercialUserId?: string | null;
  /** GANADA y PERDIDA desde ASIGNADA: el pase lo pone el cierre del proyecto, no una persona. */
  desdeProyecto?: boolean;
}

function fuenteOk(x: { verificacion: string; urlFuente: string | null } | null): boolean {
  return !!x && x.verificacion === "confirmado" && !!x.urlFuente && /^https?:\/\//i.test(x.urlFuente);
}

function evidenciaVerificada(v: VistaPase): string[] {
  const falta: string[] = [];
  if (!fuenteOk(v.marca)) falta.push("la marca verificada como «confirmado» con la URL de la fuente");
  if (v.tipo === "PROSPECTO" && v.evento && !fuenteOk(v.evento)) falta.push("el evento verificado como «confirmado» con la URL de la fuente");
  if (v.tipo === "PROSPECTO" && !v.evento) falta.push("el evento al que va la marca");
  return falta;
}

/**
 * ¿Se puede pasar la oportunidad a `destino`? Valida el grafo y la evidencia de la tabla del diseño §2.
 * El rechazo dice QUÉ falta, en criollo. Es el único camino: el repo no escribe una etapa sin pasar por acá.
 */
export function validarPase(v: VistaPase, destino: Etapa, ev: EvidenciaPase, ahora: Date, vara: Vara = VARA): Resultado {
  if (v.etapa === destino) return no(`La oportunidad ya está en «${ETIQUETA_ETAPA[destino]}».`);
  if (esTerminal(v.etapa)) return no(`La oportunidad está cerrada («${ETIQUETA_ETAPA[v.etapa]}»): no se mueve más.`);
  if (!SIGUIENTES[v.etapa].includes(destino)) {
    return no(`De «${ETIQUETA_ETAPA[v.etapa]}» no se puede pasar a «${ETIQUETA_ETAPA[destino]}».`);
  }
  if (v.tipo === "CONSULTA" && ["VERIFICADA", "SIN_CONTACTO", "CONTACTADA", "DETECTADA"].includes(destino)) {
    return no("Una consulta entrante no recorre el camino del prospecto.");
  }

  const falta: string[] = [];
  const motivoOk = esMotivo(ev.motivo);
  switch (destino) {
    case "VERIFICADA":
    case "SIN_CONTACTO":
      falta.push(...evidenciaVerificada(v));
      break;
    case "CONTACTADA":
      if (!v.contacto || !v.contacto.cargadoPorPersona) falta.push("un contacto cargado por una persona");
      else if (v.contacto.suprimido) return no("Ese contacto pidió que no le escriban más: no se lo puede contactar.");
      if (v.borradoresEnviadosPorPersona < 1) falta.push("un borrador aprobado y marcado como enviado por la persona que lo mandó");
      break;
    case "EN_CONVERSACION":
      if (v.tipo === "PROSPECTO" && v.respuestasDelCliente < 1) falta.push("una respuesta del cliente registrada en la línea de tiempo");
      if (v.tipo === "CONSULTA" && !v.identidadComprobada) {
        falta.push("comprobar quién escribe (el dominio del mail coincide con la marca, o una persona lo confirma)");
      }
      break;
    case "FALTAN_DATOS":
      if (faltantesDelBrief(v.brief).length === 0) falta.push("al menos un dato faltante marcado en el brief");
      break;
    case "CALIFICADA": {
      const f = faltantesObligatorios(v.brief);
      if (f.length) falta.push(`el brief completo (falta ${lista(f.map((k) => ETIQUETA_CAMPO[k]))})`);
      const p = puntuar(v.datos, ahora, vara);
      if (p.puntaje < vara.umbral) falta.push(`un puntaje de al menos ${vara.umbral} (tiene ${p.puntaje})`);
      // GSG-CRM-018c · CRM-ENCAJE A (GSG-MIA-047 § 1.2): el encaje es condición, como el brief. Un pedido que no es
      // de lo que se vende no llega a «Calificada» aunque el puntaje alcance.
      if (v.datos.encaje !== true) falta.push("el encaje marcado «sí» (que pida algo que vendemos)");
      if (!v.destino) falta.push("el destino (Agencia o Taller)");
      break;
    }
    case "ASIGNADA":
      if (!ev.comercialUserId) falta.push("el comercial que lo va a atender, elegido por Dirección");
      if (v.destino !== "AGENCIA" || !v.destinoConfirmado) falta.push("el destino Agencia confirmado por Dirección");
      break;
    case "DORMIDA":
      if (!ev.despertarEl || !diaValido(ev.despertarEl)) falta.push("la fecha en que se despierta");
      else if (diasHasta(ev.despertarEl, ahora) <= 0) return no("La fecha para despertarla tiene que ser futura.");
      if (!motivoOk || !MOTIVOS_DORMIDA.includes(ev.motivo as Motivo)) falta.push("el motivo (evento cancelado, próxima edición, sin respuesta u otro)");
      break;
    case "GANADA":
      if (!ev.desdeProyecto) return no("«Ganada» la pone sólo el proyecto cuando llega a «Confirmado».");
      break;
    case "PERDIDA":
      if (v.etapa === "ASIGNADA" && !ev.desdeProyecto) return no("Una oportunidad asignada se pierde desde su proyecto, no desde el CRM.");
      if (!motivoOk) falta.push("el motivo de la pérdida, del catálogo");
      break;
    case "DESCARTADA":
      if (!motivoOk) falta.push("el motivo del descarte, del catálogo");
      break;
    case "DERIVADA_AL_TALLER":
      if (v.destino !== "TALLER" || !v.destinoConfirmado) falta.push("el destino Taller confirmado por Dirección");
      break;
    default:
      break;
  }
  if (motivoOk === false && ev.motivo && ["PERDIDA", "DESCARTADA", "DORMIDA"].includes(destino)) {
    return no("Ese motivo no está en el catálogo. Elegí uno de la lista y, si hace falta, sumá una nota.");
  }
  return falta.length ? no(`Para pasar a «${ETIQUETA_ETAPA[destino]}» falta ${lista(falta)}.`) : { ok: true };
}

// ── Próximo paso (E5) ───────────────────────────────────────────────────────

/** Toda oportunidad abierta tiene próximo paso con fecha. Sin eso no se guarda. */
export function validarProximoPaso(etapa: Etapa, proximoPaso: string | null | undefined, proximoPasoEl: Date | null | undefined): Resultado {
  if (esTerminal(etapa)) return { ok: true };
  const falta: string[] = [];
  if (!proximoPaso?.trim()) falta.push("el próximo paso");
  if (!proximoPasoEl || Number.isNaN(proximoPasoEl.getTime())) falta.push("la fecha del próximo paso");
  return falta.length ? no(`Una oportunidad abierta no se guarda sin ${lista(falta)}.`) : { ok: true };
}

export function pasoVencido(o: { etapa: Etapa; proximoPasoEl: Date | null }, ahora: Date): boolean {
  return estaAbierta(o.etapa) && o.etapa !== "DORMIDA" && !!o.proximoPasoEl && o.proximoPasoEl.getTime() < ahora.getTime();
}

/** La huella de la tarea de seguimiento: la misma vencida no entra dos veces a la cola del Seguidor. */
export function claveTareaVencida(oportunidadId: string, proximoPasoEl: Date): string {
  return `seguimiento:${oportunidadId}:${proximoPasoEl.toISOString()}`;
}

// ── Cambio de fecha del evento (E6) ─────────────────────────────────────────

export function alCambiarFechaDelEvento(
  o: { etapa: Etapa; datos: DatosComerciales },
  nuevaFecha: string,
  ahora: Date,
  vara: Vara = VARA,
): { datos: DatosComerciales; puntaje: Puntaje; nuevaEtapa: Etapa | null; aviso: string | null } {
  const datos = { ...o.datos, fechaEvento: nuevaFecha };
  const puntaje = puntuar(datos, ahora, vara);
  if (o.etapa === "CALIFICADA" && puntaje.puntaje < vara.umbral) {
    return { datos, puntaje, nuevaEtapa: "FALTAN_DATOS", aviso: `Cambió la fecha del evento y ya no califica (puntaje ${puntaje.puntaje} de ${vara.umbral}). Volvió a «Faltan datos».` };
  }
  return { datos, puntaje, nuevaEtapa: null, aviso: null };
}

// ── Propuestas automáticas: E7, E9, E19, E20, E23 ───────────────────────────

/** E7: calificada y sin asignar más de las horas de la vara → vence en «Hoy» de Dirección. */
export function asignacionVencida(o: { etapa: Etapa; calificadaEl: Date | null }, ahora: Date, vara: Vara = VARA): boolean {
  return o.etapa === "CALIFICADA" && !!o.calificadaEl && ahora.getTime() - o.calificadaEl.getTime() >= vara.horasParaAsignar * 3_600_000;
}

export interface PropuestaDePase {
  destino: Etapa;
  motivo: Motivo;
  explicacion: string;
}

/** E9: después de N pedidos de datos sin brief completo se propone descartar «sin datos». Decide una persona. */
export function propuestaPorFaltaDeDatos(o: { etapa: Etapa; pedidosDeDatos: number; brief: CamposBrief }, vara: Vara = VARA): PropuestaDePase | null {
  if (o.etapa !== "FALTAN_DATOS" || o.pedidosDeDatos < vara.pedidosDeDatosMax) return null;
  if (faltantesObligatorios(o.brief).length === 0) return null;
  return { destino: "DESCARTADA", motivo: "SIN_DATOS", explicacion: `Se pidieron los datos ${o.pedidosDeDatos} veces y el brief sigue incompleto.` };
}

/** E23: sin respuesta después de N seguimientos → se propone dormirla (o perderla). Decide una persona. */
export function propuestaPorSilencio(o: { etapa: Etapa; seguimientosSinRespuesta: number }, vara: Vara = VARA): PropuestaDePase | null {
  if (!estaAbierta(o.etapa) || o.etapa === "DORMIDA" || o.etapa === "ASIGNADA") return null;
  if (o.seguimientosSinRespuesta < vara.seguimientosMax) return null;
  const destino: Etapa = SIGUIENTES[o.etapa].includes("DORMIDA") ? "DORMIDA" : "DESCARTADA";
  return { destino, motivo: "SIN_RESPUESTA", explicacion: `Van ${o.seguimientosSinRespuesta} seguimientos sin respuesta.` };
}

/** E19: ¿le toca despertar? Vuelve a la etapa en que estaba. */
export function despertar(o: { etapa: Etapa; etapaPrevia: Etapa | null; despertarEl: Date | null }, ahora: Date): Resultado<{ etapa: Etapa }> {
  if (o.etapa !== "DORMIDA") return no("La oportunidad no está dormida.");
  if (!o.despertarEl || o.despertarEl.getTime() > ahora.getTime()) return no("Todavía no es la fecha para despertarla.");
  const etapa = o.etapaPrevia && estaAbierta(o.etapaPrevia) && o.etapaPrevia !== "DORMIDA" ? o.etapaPrevia : "EN_CONVERSACION";
  return { ok: true, etapa };
}

// ── Pronóstico y contactos con papel (GSG-CRM-011) ──────────────────────────

/** Papel de un contacto en la oportunidad. Los mismos valores que el CHECK de `OportunidadContacto`. */
export const PAPELES = ["DECIDE", "PIDE", "PAGA"] as const;
export type Papel = (typeof PAPELES)[number];
export const esPapel = (v: unknown): v is Papel => typeof v === "string" && (PAPELES as readonly string[]).includes(v);
export const ETIQUETA_PAPEL: Record<Papel, string> = { DECIDE: "Decide", PIDE: "Pide", PAGA: "Paga" };

/** Días enteros desde `desde` hasta `ahora` (nunca negativo). Sin fecha (fila anterior a la migración) = null. */
export function diasDesde(desde: Date | null | undefined, ahora: Date): number | null {
  if (!desde) return null;
  return Math.max(0, Math.floor((ahora.getTime() - desde.getTime()) / MS_DIA));
}

/** «Días en esta etapa». */
export const diasEnEtapa = (etapaDesde: Date | null | undefined, ahora: Date): number | null => diasDesde(etapaDesde, ahora);

/** Monto × probabilidad de la etapa, redondeado al centavo. Sin monto = null (no es cero: falta el dato). */
export function montoPonderado(monto: number | null | undefined, etapa: Etapa, pronostico: Pronostico = PRONOSTICO): number | null {
  if (monto == null || !Number.isFinite(monto) || monto < 0) return null;
  const p = Math.min(100, Math.max(0, pronostico[etapa].probabilidad));
  // Probabilidad entera (pronostico.ts): la cuenta va en centavos enteros, una sola vez al centavo (src/lib/dinero).
  return proporcionAlCentavo(monto, p, 100);
}

/**
 * ¿Se pasó del plazo de seguimiento de la etapa? Cuenta desde la última actividad (o, si no hay, desde que
 * entró a la etapa). Etapa sin plazo (cerrada, DORMIDA) o sin fechas = no.
 */
export function sinSeguimiento(
  o: { etapa: Etapa; ultimaActividadEl?: Date | null; etapaDesde?: Date | null },
  ahora: Date,
  pronostico: Pronostico = PRONOSTICO,
): { atrasada: boolean; dias: number | null; plazo: number | null } {
  const plazo = pronostico[o.etapa].seguimientoDias;
  const dias = diasDesde(o.ultimaActividadEl ?? o.etapaDesde ?? null, ahora);
  return { atrasada: plazo != null && dias != null && dias > plazo, dias, plazo };
}

// ── «Hoy»: la urgencia (E7, E19, E20) ───────────────────────────────────────

export interface ItemHoy {
  id: string;
  etapa: Etapa;
  proximoPasoEl: Date | null;
  fechaLimite: Date | null;
  calificadaEl: Date | null;
  despertarEl: Date | null;
  pasePropuesto: Etapa | null;
  /** GSG-CRM-011: para «sin seguimiento» (opcionales: sin ellas no se evalúa). */
  ultimaActividadEl?: Date | null;
  etapaDesde?: Date | null;
}

export interface EntradaHoy {
  id: string;
  urgencia: number;
  por: string[];
}

/** Lo que va a «Hoy» y en qué orden. Más urgencia = más arriba. Lo que no tiene nada que hacer no entra. */
export function bandejaHoy(items: readonly ItemHoy[], ahora: Date, vara: Vara = VARA): EntradaHoy[] {
  const out: EntradaHoy[] = [];
  for (const o of items) {
    if (!estaAbierta(o.etapa)) continue;
    const por: string[] = [];
    let urgencia = 0;
    if (o.pasePropuesto) {
      por.push(`Pase propuesto a «${ETIQUETA_ETAPA[o.pasePropuesto]}»`);
      urgencia += 30;
    }
    if (asignacionVencida(o, ahora, vara)) {
      por.push(`Calificada hace más de ${vara.horasParaAsignar} h y sin comercial`);
      urgencia += 60;
    }
    if (o.etapa === "DORMIDA" && o.despertarEl && o.despertarEl.getTime() <= ahora.getTime()) {
      por.push("Le tocó despertar");
      urgencia += 40;
    }
    if (pasoVencido(o, ahora)) {
      por.push("El próximo paso está vencido");
      urgencia += 50;
    }
    const seg = sinSeguimiento(o, ahora);
    if (seg.atrasada) {
      por.push(`Sin actividad hace ${seg.dias} días (el plazo de la etapa es ${seg.plazo})`);
      urgencia += 20;
    }
    if (o.fechaLimite) {
      const dias = Math.ceil((o.fechaLimite.getTime() - ahora.getTime()) / MS_DIA);
      if (dias <= 14) {
        por.push(dias < 0 ? "Venció la fecha de entrega de la licitación" : `Licitación: faltan ${dias} días para la entrega`);
        urgencia += dias < 0 ? 90 : Math.max(10, 80 - dias * 5);
      }
    }
    if (por.length) out.push({ id: o.id, urgencia, por });
  }
  return out.sort((a, b) => b.urgencia - a.urgencia || a.id.localeCompare(b.id));
}

// ── Borradores (E2) ─────────────────────────────────────────────────────────

export const ESTADOS_BORRADOR = ["BORRADOR", "APROBADO", "ENVIADO_POR_PERSONA", "RECHAZADO"] as const;
export type EstadoBorrador = (typeof ESTADOS_BORRADOR)[number];
export const CANALES = ["MAIL", "WHATSAPP"] as const;
export type Canal = (typeof CANALES)[number];

const PASES_BORRADOR: Record<EstadoBorrador, readonly EstadoBorrador[]> = {
  BORRADOR: ["APROBADO", "RECHAZADO"],
  APROBADO: ["ENVIADO_POR_PERSONA", "RECHAZADO"],
  ENVIADO_POR_PERSONA: [],
  RECHAZADO: [],
};

export function validarPaseBorrador(desde: EstadoBorrador, hacia: EstadoBorrador, motivo?: string | null): Resultado {
  if (!PASES_BORRADOR[desde].includes(hacia)) {
    if (desde === "ENVIADO_POR_PERSONA") return no("Ese borrador ya se mandó: no cambia más.");
    if (desde === "RECHAZADO") return no("Ese borrador está rechazado. Escribí uno nuevo.");
    if (hacia === "ENVIADO_POR_PERSONA") return no("Sólo se marca como enviado un borrador aprobado.");
    return no("Ese cambio de estado del borrador no existe.");
  }
  if (hacia === "RECHAZADO" && !motivo?.trim()) return no("Para rechazar un borrador escribí el motivo.");
  return { ok: true };
}

/** Link de WhatsApp sin número (prueba interna: nunca a un tercero real). */
export function linkWhatsappSinNumero(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

// ── Contactos y supresión (E8) ──────────────────────────────────────────────

export function normalizarEmail(e: string): string | null {
  const s = e.trim().toLowerCase();
  // ≤ 254: igual al CHECK de `ContactoComercial.email` (si no, la base lo frena con un error sin explicar).
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}
/**
 * Clave del teléfono para la huella de la baja (A8): el mismo número escrito de cualquier forma usual da la misma
 * clave, y dos números distintos nunca dan la misma. Devuelve el número en E.164 sin «+» (Argentina: «54» + los 10
 * dígitos de área + abonado, sin el 9 ni el 15, que sólo son marcas de discado del celular) o null si no se puede
 * saber de qué número se trata.
 *
 * Reglas (plan de numeración argentino): el área mide 2 (sólo el 11), 3 o 4 dígitos, empieza con 1, 2 o 3, y área
 * más abonado suman siempre 10. Así, «+54 9 11 5555-0102», «011 15 5555-0102», «11 5555-0102» y «15 5555 0102»
 * dan «541155550102».
 *
 * CRITERIO PARA EL NÚMERO SIN CÓDIGO DE ÁREA (decidido acá, a propósito sin segunda huella):
 *   - 8 dígitos de abonado (con o sin el 15 adelante): sólo existen en el área 11, la única de 2 dígitos. Se le
 *     pone el 11 y es la misma clave que el número completo. No es una suposición: no hay otra área posible.
 *   - 6 o 7 dígitos de abonado: puede ser de cualquier área de 3 o 4 dígitos. Una huella por sufijo (p. ej. los
 *     últimos 7 u 8) haría chocar números distintos de áreas distintas («351 555-0102» y «341 555-0102» comparten
 *     los últimos 8), y adivinar el área haría que la baja no frene. Por eso no se acepta: se pide el área al
 *     cargarlo (`validarTelefono`). Un contacto sin área no entra, así que nunca se le escribe sin chequear la baja.
 * Del exterior («+» u «00» y otro código de país) se compara el número entero, con su código: nunca empieza con 54,
 * así que no choca con uno argentino.
 */
export function normalizarTelefono(t: string): string | null {
  const crudo = t.trim();
  let d = crudo.replace(/\D/g, "");
  const internacional = crudo.startsWith("+") || d.startsWith("00");
  if (d.startsWith("00")) d = d.slice(2);
  if (internacional && !d.startsWith("54")) return d.length >= 8 && d.length <= 15 ? d : null;
  // Ningún número nacional empieza con 5 (las áreas empiezan con 1, 2 o 3): un 54 adelante es el código de país.
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1); // el 9 del celular en formato internacional
  } else if (d.startsWith("9") && d.length === 11) {
    d = d.slice(1); // «9 11 5555-0102»: el 9 sin el 54
  }
  if (d.startsWith("0")) d = d.slice(1); // el 0 de larga distancia
  if (d.length === 12) d = sinQuinceDespuesDelArea(d) ?? d;
  // Sin área: 8 dígitos (con o sin 15) sólo pueden ser del área 11. Con 6 o 7 no se adivina.
  if (d.length === 10 && d.startsWith("15")) d = `11${d.slice(2)}`;
  else if (d.length === 8 && /^[2-9]/.test(d)) d = `11${d}`;
  return /^(11|[23]\d)\d{8}$/.test(d) ? `54${d}` : null;
}

/** «área 15 abonado» (12 dígitos) → «área abonado». El área se reconoce sin ambigüedad: 11, o 3-4 dígitos que empiezan con 2 o 3. */
function sinQuinceDespuesDelArea(d: string): string | null {
  for (const largo of [2, 3, 4]) {
    const area = d.slice(0, largo);
    const areaPosible = largo === 2 ? area === "11" : /^[23]/.test(area);
    if (areaPosible && d.slice(largo, largo + 2) === "15") return area + d.slice(largo + 2);
  }
  return null;
}

/**
 * Validación del teléfono al cargarlo. Es la del CHECK de `ContactoComercial.telefono` (6 a 15 dígitos y hasta 40
 * caracteres, A11) más que se pueda saber de qué número se trata (`normalizarTelefono`): si no, la baja no lo frena.
 */
export function validarTelefono(t: string): Resultado {
  const crudo = t.trim();
  const digitos = crudo.replace(/\D/g, "").length;
  if (crudo.length > 40) return no("El teléfono es demasiado largo: escribilo sin texto extra, sólo el número.");
  if (digitos > 15) return no("El teléfono tiene más de 15 dígitos. Escribilo sin el 0 y sin el 15, por ejemplo +54 9 11 5555-0102.");
  if (digitos < 6) return no("El teléfono tiene muy pocos dígitos.");
  if (!normalizarTelefono(crudo)) {
    return no("Escribí el teléfono con código de área, por ejemplo 351 15 555-0102 o +54 9 351 555-0102. Sin el área no se puede saber si esa persona pidió la baja.");
  }
  return { ok: true };
}

/** Huellas del contacto: sha256 del mail normalizado y del teléfono en dígitos. No guarda el dato. */
export function huellasDeContacto(c: { email?: string | null; telefono?: string | null }): string[] {
  const out: string[] = [];
  const e = c.email ? normalizarEmail(c.email) : null;
  const t = c.telefono ? normalizarTelefono(c.telefono) : null;
  if (e) out.push(createHash("sha256").update(`mail:${e}`).digest("hex"));
  if (t) out.push(createHash("sha256").update(`tel:${t}`).digest("hex"));
  return out;
}

/** Lo que queda del contacto después de la baja: nada que identifique a la persona. */
export const CONTACTO_ANONIMO = { nombre: "(baja)", email: null, telefono: null, cargo: null } as const;

export function puedeEscribirle(huellas: readonly string[], suprimidas: ReadonlySet<string>): Resultado {
  return huellas.some((h) => suprimidas.has(h)) ? no("Esa persona pidió que no le escriban más. No se le prepara ningún mensaje, nunca.") : { ok: true };
}

// ── E1 · la misma marca: dominio y CUIT ─────────────────────────────────────

export function dominioDe(s: string | null | undefined): string | null {
  if (!s) return null;
  let t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("@")) t = t.split("@").pop() ?? "";
  t = t.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t) ? t : null;
}

/**
 * GSG-CRM-011: una web o una fuente escrita como la escribe la gente («bodega.com.ar», «www.x.com/sponsors»)
 * queda con `https://` adelante, como piden los CHECK de la base (`MarcaRelevada_web_check`,
 * `EventoRelevado_urlFuente_check`). Lo que no es una dirección web (espacios, sin punto, otro protocolo) → null.
 */
export function urlWeb(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  if (!t || /\s/.test(t) || t.length > 1000) return null;
  const conProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
  let u: URL;
  try {
    u = new URL(conProtocolo);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)) return null;
  return conProtocolo;
}

/** CUIT con su dígito verificador (11 dígitos, sin guiones). */
export function cuitValido(c: string | null | undefined): string | null {
  const d = (c ?? "").replace(/\D/g, "");
  if (d.length !== 11) return null;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
  const r = 11 - (s % 11);
  const dv = r === 11 ? 0 : r === 10 ? 9 : r;
  return dv === Number(d[10]) ? d : null;
}

export function mismaMarca(a: { dominio?: string | null; cuit?: string | null }, b: { dominio?: string | null; cuit?: string | null }): boolean {
  const ca = cuitValido(a.cuit);
  const cb = cuitValido(b.cuit);
  if (ca && cb) return ca === cb;
  const da = dominioDe(a.dominio);
  const db = dominioDe(b.dominio);
  return !!da && da === db;
}

/** E2 de la consulta entrante: ¿el dominio del mail de quien escribe coincide con la marca? */
export function identidadPorDominio(emailDeQuienEscribe: string | null | undefined, dominioDeLaMarca: string | null | undefined): boolean {
  const a = dominioDe(emailDeQuienEscribe ?? null);
  const b = dominioDe(dominioDeLaMarca ?? null);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`);
}

// ── E10 · el texto de las fuentes es dato ───────────────────────────────────

const INSTRUCCION = [
  /ignor[aá]\s+(todo\s+)?(lo\s+)?(anterior|previo|instrucciones)/i,
  /ignore\s+(all\s+)?(previous|prior|above)/i,
  /(olvid[aá]|desestim[aá])\s+(tus|las)\s+(reglas|instrucciones)/i,
  /(sos|eres|you are)\s+(ahora|now)\b/i,
  /system\s*prompt|instrucciones\s+del\s+sistema/i,
  /(asign[aá]|pon[eé]|dale|marc[aá])\s+(el\s+)?(puntaje|score)\s*(m[aá]ximo|\d+)/i,
  /(marc[aá]|pas[aá])\s+(esto|esta|la\s+oportunidad)\s+(como\s+)?(calificad|ganad|aprobad)/i,
  /\b(enviá|mandá)\s+(un\s+)?(mail|correo|whatsapp)\s+a\b/i,
];

/**
 * ¿El texto trae algo con forma de instrucción? Sólo ANOTA: el motor no lee ese texto para decidir nada,
 * así que no hay nada que «ejecutar». Sirve para dejarlo marcado en la línea de tiempo (E10, E24).
 */
export function detectarInstruccion(texto: string | null | undefined): { sospechosa: boolean; nota: string | null } {
  if (!texto) return { sospechosa: false, nota: null };
  const hit = INSTRUCCION.some((r) => r.test(texto));
  return hit
    ? { sospechosa: true, nota: "El texto trae algo con forma de instrucción. Se guarda como dato y no se ejecuta." }
    : { sospechosa: false, nota: null };
}

// ── E17, E18, E21 · avisos que decide una persona ───────────────────────────

/** E17: la marca ya es cliente o tiene un proyecto activo → no se prospecta en frío. */
export function prospectarEnFrio(m: { esCliente: boolean; proyectoActivo: boolean }): Resultado {
  if (m.proyectoActivo) return no("La marca tiene un proyecto activo: no se prospecta en frío. Avisale al comercial que la atiende.");
  if (m.esCliente) return no("La marca ya es cliente: no se prospecta en frío. Avisale al comercial que la atiende.");
  return { ok: true };
}

/** E18: dos marcas distintas no se unen solas. Mismo dominio o CUIT = la misma (E1); lo demás, lo propone y decide una persona. */
export function decidirUnion(a: { dominio?: string | null; cuit?: string | null }, b: { dominio?: string | null; cuit?: string | null }): "misma" | "proponer" {
  return mismaMarca(a, b) ? "misma" : "proponer";
}

/** E21: un competidor (mismo rubro) de un cliente activo va al mismo evento → aviso; decide una persona. */
export function avisoDeExclusividad(
  marca: { id: string; rubro: string | null },
  clientesActivosEnElEvento: readonly { id: string; nombre: string; rubro: string | null }[],
): string | null {
  const r = marca.rubro?.trim().toLowerCase();
  if (!r) return null;
  const choca = clientesActivosEnElEvento.filter((c) => c.id !== marca.id && c.rubro?.trim().toLowerCase() === r);
  return choca.length ? `Ojo con la exclusividad de rubro: ${lista(choca.map((c) => c.nombre))} ya es cliente y va al mismo evento. Decidí antes de seguir.` : null;
}

// ── E11 · topes del puesto ──────────────────────────────────────────────────

export function dentroDelTope(
  tope: { accionesDia: number | null; costoDiaUsd: number | null },
  hoy: { acciones: number; costoUsd: number },
  estaAccion: { costoUsd: number },
): Resultado {
  if (tope.accionesDia !== null && hoy.acciones + 1 > tope.accionesDia) {
    return no(`El puesto llegó a su tope de ${tope.accionesDia} acciones por día. Se frena hasta mañana o hasta que Dirección lo suba.`);
  }
  if (tope.costoDiaUsd !== null && hoy.costoUsd + estaAccion.costoUsd > tope.costoDiaUsd) {
    return no(`El puesto llegó a su tope de gasto del día (US$ ${tope.costoDiaUsd}). Se frena y avisa a Dirección.`);
  }
  return { ok: true };
}

// ── E3 · idempotencia ───────────────────────────────────────────────────────

/** La clave que manda el agente al reintentar. Mismos datos → misma clave → la base no duplica. */
export function claveIdempotencia(...partes: readonly (string | number | null | undefined)[]): string {
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex").slice(0, 40);
}

// ── Proyecto ↔ oportunidad (A3, diseño §2) ──────────────────────────────────

/**
 * La oportunidad ASIGNADA toma el cierre de su proyecto. Proyectos no se toca: el CRM LEE la etapa del
 * proyecto y decide. «Confirmado» (APROBADO) o más adelante → GANADA; perdido en cotización o propuesta → PERDIDA.
 */
const ETAPAS_GANADAS = ["APROBADO", "PRODUCCION", "ARMADO", "DESARME", "CIERRE"];
export function cierreDesdeProyecto(p: { etapa: string; perdidoEl: Date | null; motivoPerdida: string | null }): { destino: "GANADA" | "PERDIDA"; motivo: Motivo | null; nota: string | null } | null {
  if (p.perdidoEl) return { destino: "PERDIDA", motivo: "OTRO", nota: p.motivoPerdida ? `Se perdió en el proyecto: ${p.motivoPerdida}` : "Se perdió en el proyecto." };
  if (ETAPAS_GANADAS.includes(p.etapa)) return { destino: "GANADA", motivo: null, nota: null };
  return null;
}

/**
 * GSG-CRM-018c (V6): el catálogo de pérdida del proyecto (`MOTIVOS_PERDIDA` de `lib/proyectos/gestion-core.ts`; el
 * test comprueba que estén todos) llevado al catálogo del CRM. El proyecto guarda «Motivo — detalle libre».
 */
export const MOTIVO_DEL_PROYECTO: Readonly<Record<string, Motivo>> = {
  Precio: "OTRO",
  "Eligió otra productora": "ELIGIO_OTRO",
  "El cliente canceló el evento": "EVENTO_CANCELADO",
  "Sin presupuesto del cliente": "SIN_PRESUPUESTO",
  "No llegamos con los tiempos": "OTRO",
  "Sin respuesta del cliente": "SIN_RESPUESTA",
  Otro: "OTRO",
};

/**
 * El cierre que cruza de OTRO negocio al ARM: sólo el motivo de catálogo. El detalle libre que escribió el destino
 * (puede traer nombres, teléfonos o montos) queda allá; la nota dice sólo el motivo del catálogo del proyecto.
 */
export function cierreEntreNegocios(p: { etapa: string; perdidoEl: Date | null; motivoPerdida: string | null }): { destino: "GANADA" | "PERDIDA"; motivo: Motivo | null; nota: string | null } | null {
  const c = cierreDesdeProyecto({ ...p, motivoPerdida: null });
  if (!c || c.destino !== "PERDIDA") return c;
  const base = (p.motivoPerdida ?? "").split(" — ")[0].trim();
  const motivo = Object.hasOwn(MOTIVO_DEL_PROYECTO, base) ? MOTIVO_DEL_PROYECTO[base] : null;
  return { destino: "PERDIDA", motivo: motivo ?? "OTRO", nota: motivo ? `Se perdió en el proyecto: ${base}.` : "Se perdió en el proyecto." };
}

/** El brief que viaja al proyecto en «Lead / brief». Texto plano, sin datos de contacto. */
/**
 * GSG-CRM-018: el brief se lee, no se parsea. «2027-08-20» → «20 de agosto de 2027» (día de calendario, en UTC
 * para no correrse un día) y «stand_modular» → «stand modular». Lo que no es un día válido queda como vino.
 */
const DIA_LARGO = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const diaLegible = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? DIA_LARGO.format(new Date(`${iso}T00:00:00Z`)) : iso);
export const tipoDeTrabajoLegible = (t: string): string => t.trim().replace(/_+/g, " ");

export function textoDelBrief(c: CamposBrief, puntaje: Puntaje): string {
  const lineas = CAMPOS_BRIEF.map((k) => `${ETIQUETA_CAMPO[k][0].toUpperCase()}${ETIQUETA_CAMPO[k].slice(1)}: ${c[k]?.toString().trim() || "(falta)"}`);
  return [...lineas, `Puntaje: ${puntaje.puntaje}`, ...puntaje.detalle.map((d) => `· ${d.explicacion}`)].join("\n");
}
