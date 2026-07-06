// Router de intenciones para el COMERCIO CONVERSACIONAL por WhatsApp — PROTOTIPO
// (sector Agencia, producto/palanca #2).
//
// Es el CEREBRO determinista que convierte un mensaje entrante de un cliente
// ("hola, querría un turno para corte el viernes a las 3 de la tarde") en una
// INTENCIÓN ESTRUCTURADA cableable al ERP (reservar / reprogramar / cancelar /
// precio / pagar / facturar / hablar-con-humano) + las entidades que hagan falta
// (servicio, fecha, hora). Es lógica PURA: sin LLM (determinista, barato,
// explicable y testeable — mismo criterio que el Panel del Dueño y ADR-026), sin
// red, sin DB, sin dependencia del proveedor de WhatsApp (Meta/Twilio/360dialog).
//
// Arquitectura de tres capas (esta es SOLO la del medio):
//   1. Adaptador de proveedor (webhook WA → texto normalizado)   ← otra sesión
//   2. **Router de intención (este módulo)**  → { kind, entities, suggestedAction }
//   3. Dispatcher al ERP (mapea suggestedAction a las Server Actions que YA existen:
//      createAppointment / rescheduleAppointment / cancelAppointment / servicios /
//      plugin Mercado Pago / plugin ARCA)                         ← otra sesión
//
// El diseño en capas es a propósito: el router se construye y testea HOY sin esperar
// al proveedor ni tocar el Core; cuando llegue el adaptador, se enchufa sin cambiarlo.

import { round2 } from "@/lib/round";

export type WaIntentKind =
  | "BOOK" // reservar / sacar turno
  | "RESCHEDULE" // reprogramar / cambiar un turno
  | "CANCEL" // cancelar un turno
  | "PRICE" // cuánto sale / lista de precios
  | "HOURS" // horarios / dónde están / si abren
  | "PAY" // quiere pagar / pedir link de pago
  | "INVOICE" // pide factura / comprobante
  | "HUMAN" // quiere hablar con una persona (handoff)
  | "GREETING" // saludo suelto (hola / buenas)
  | "AFFIRM" // confirmación corta (sí / dale / ok) en un flujo
  | "DENY" // negación corta (no) en un flujo
  | "UNKNOWN"; // no se pudo clasificar → menú / handoff

// Servicio del tenant contra el que se intenta matchear la mención ("corte",
// "color", "manicura"). `aliases` cubre sinónimos/errores comunes. Lo provee el
// dispatcher desde el catálogo del tenant — el router no conoce ningún catálogo.
export type WaServiceRef = {
  name: string;
  aliases?: string[];
};

export type WaServiceMatch = {
  name: string;
  // el token/frase del mensaje que disparó el match (para trazar/depurar).
  matchedOn: string;
};

export type WaEntities = {
  // servicio detectado del catálogo del tenant, o null si no se mencionó / no matcheó.
  service: WaServiceMatch | null;
  // fecha resuelta a ISO (YYYY-MM-DD) relativa a `now`, o null.
  date: string | null;
  // hora en formato 24h "HH:MM", o null.
  time: string | null;
  // menciones crudas que originaron date/time (trazabilidad, y para re-preguntar).
  raw: { dateMention?: string; timeMention?: string };
};

export type WaIntent = {
  kind: WaIntentKind;
  // heurística 0..1 de cuán segura es la clasificación (para decidir si el bot
  // actúa solo o pide confirmación / escala a humano).
  confidence: number;
  entities: WaEntities;
  // clave de acción sugerida para el dispatcher (capa 3). null si no hay acción
  // directa (ej. AFFIRM/DENY dependen del contexto del flujo, lo resuelve el router
  // de conversación, no este parser).
  suggestedAction: string | null;
};

export type ParseWaOptions = {
  // "ahora" inyectado para resolver fechas relativas ("mañana", "el viernes").
  // Inyectado (no `new Date()` interno) para que el parser sea PURO y testeable.
  now: Date;
  // catálogo de servicios del tenant para matchear menciones. Opcional: sin él,
  // el router clasifica la intención igual, solo que `entities.service` queda null.
  services?: WaServiceRef[];
  // umbral por debajo del cual conviene pedir confirmación / escalar (no lo aplica
  // el parser; lo expone para el router de conversación). Default 0.5.
  lowConfidence?: number;
  // Heurística de hora comercial. Si true (default), una hora "pelada" sin franja
  // (ej. "a las 4") se asume de la TARDE en contexto de reserva (1–8 → 13–20 h),
  // porque un turno "a las 3" casi nunca es a las 3 de la madrugada. Ponerlo en
  // false para un parseo literal (4 → 04:00). Ver tests de ambos modos.
  assumeBusinessHours?: boolean;
};

// --- Normalización ------------------------------------------------------------

// Minúsculas, sin acentos ni ñ, sin puntuación, espacios colapsados. La ñ se
// colapsa a n a propósito: los diccionarios de este módulo trabajan en forma
// despojada ("manana", "sena"), así que "mañana" y "manana" matchean igual.
export function normalizeWa(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s:/-]/gu, " ") // conservar : / - para horas y fechas
    .replace(/\s+/g, " ")
    .trim();
}

// --- Diccionarios de intención ------------------------------------------------

// Cada regla: frases-señal (ya normalizadas) y un peso. Las frases multi-palabra
// pesan más porque son menos ambiguas ("sacar turno" > "turno"). El orden del array
// define prioridad ante empate de score.
type IntentRule = { kind: WaIntentKind; phrases: string[]; weight: number };

const INTENT_RULES: IntentRule[] = [
  {
    kind: "RESCHEDULE",
    weight: 3,
    phrases: [
      "reprogramar",
      "reprogramo",
      "cambiar el turno",
      "cambiar mi turno",
      "cambiar de horario",
      "mover el turno",
      "correr el turno",
      "pasar el turno",
      "otro dia",
      "otro horario",
    ],
  },
  {
    kind: "CANCEL",
    weight: 3,
    phrases: ["cancelar", "cancelo", "anular", "dar de baja", "no voy a poder ir", "no puedo ir"],
  },
  {
    kind: "BOOK",
    weight: 2,
    phrases: [
      "sacar turno",
      "sacar un turno",
      "reservar",
      "reserva",
      "agendar",
      "quiero un turno",
      "querria un turno",
      "queria un turno",
      "necesito un turno",
      "turno para",
      "pedir turno",
      "disponibilidad",
      "hay lugar",
      "tenes lugar",
      "tienen lugar",
      "atienden",
    ],
  },
  {
    kind: "PRICE",
    weight: 2,
    phrases: [
      "cuanto sale",
      "cuanto cuesta",
      "cuanto esta",
      "que precio",
      "precios",
      "precio de",
      "lista de precios",
      "tarifa",
      "valor de",
    ],
  },
  {
    kind: "PAY",
    weight: 3,
    phrases: [
      "pagar",
      "abonar",
      "link de pago",
      "medio de pago",
      "sena",
      "senar",
      "transferencia",
      "mercado pago",
      "mercadopago",
      "como pago",
    ],
  },
  {
    kind: "INVOICE",
    weight: 3,
    phrases: ["factura", "facturar", "comprobante", "recibo", "me hacen factura", "necesito factura"],
  },
  {
    kind: "HOURS",
    weight: 2,
    phrases: [
      "horario",
      "horarios",
      "a que hora",
      "hasta que hora",
      "estan abiertos",
      "estan abierto",
      "abren",
      "cierran",
      "donde estan",
      "direccion",
      "ubicacion",
      "como llego",
    ],
  },
  {
    kind: "HUMAN",
    weight: 3,
    phrases: [
      "hablar con alguien",
      "hablar con una persona",
      "con un humano",
      "una persona",
      "atencion al cliente",
      "reclamo",
      "no me sirve el bot",
    ],
  },
  {
    kind: "GREETING",
    weight: 1,
    phrases: ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "que tal"],
  },
];

// Confirmación/negación cortas: SOLO se consideran si el mensaje es breve, para no
// clasificar "no puedo el viernes" como DENY ni "si tienen turno el lunes?" como AFFIRM.
const AFFIRM_WORDS = new Set(["si", "sii", "dale", "ok", "oka", "okey", "listo", "confirmo", "perfecto", "va", "sip", "claro"]);
const DENY_WORDS = new Set(["no", "nop", "nel", "negativo", "para nada"]);

// Intenciones "de contenido": si alguna matchea, tiene prioridad sobre GREETING /
// AFFIRM / DENY aunque el saludo también aparezca ("hola quiero un turno" → BOOK).
const CONTENT_KINDS = new Set<WaIntentKind>([
  "BOOK",
  "RESCHEDULE",
  "CANCEL",
  "PRICE",
  "PAY",
  "INVOICE",
  "HOURS",
  "HUMAN",
]);

const SUGGESTED_ACTION: Record<WaIntentKind, string | null> = {
  BOOK: "getAvailableSlots+createAppointment",
  RESCHEDULE: "rescheduleAppointment",
  CANCEL: "cancelAppointment",
  PRICE: "listServices",
  HOURS: "tenantInfo",
  PAY: "mercadopago:createPreference",
  INVOICE: "arca:emitInvoice",
  HUMAN: "handoff",
  GREETING: "menu",
  AFFIRM: null, // depende del contexto del flujo (lo resuelve el router de conversación)
  DENY: null,
  UNKNOWN: "handoff", // ante la duda, a una persona: nunca dejar al cliente sin respuesta
};

// score de saturación: a partir de acá la confianza se satura en ~1. Calibrado para
// que un match multi-palabra fuerte (peso 3) llegue alto y uno flojo quede medio.
const CONFIDENCE_SATURATION = 5;

// --- Extracción de entidades: servicio ----------------------------------------

function matchService(norm: string, services: WaServiceRef[]): WaServiceMatch | null {
  // Se matchea por la mención más larga que aparezca (más específica gana): entre
  // "color" y "color y corte" preferimos la frase larga si está en el catálogo.
  let best: { match: WaServiceMatch; len: number } | null = null;
  for (const svc of services) {
    const candidates = [svc.name, ...(svc.aliases ?? [])];
    for (const c of candidates) {
      const nc = normalizeWa(c);
      if (nc.length === 0) continue;
      if (wordIncludes(norm, nc) && (best === null || nc.length > best.len)) {
        best = { match: { name: svc.name, matchedOn: nc }, len: nc.length };
      }
    }
  }
  return best?.match ?? null;
}

// "includes" con límites de palabra: evita que "corte" matchee dentro de "cortesia"
// o que "ojo" matchee "reloj". Trabaja sobre texto ya normalizado.
function wordIncludes(haystack: string, needle: string): boolean {
  if (needle.includes(" ")) {
    // frase: buscar rodeada de límites de palabra.
    return new RegExp(`(?:^|\\s)${escapeRe(needle)}(?:\\s|$)`).test(haystack);
  }
  return new RegExp(`(?:^|\\s)${escapeRe(needle)}(?:\\s|$)`).test(haystack);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Extracción de entidades: fecha -------------------------------------------

const DOW: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

// Resuelve una fecha relativa/absoluta desde el texto normalizado, contra `now`.
// Cubre los casos frecuentes de un turno por WhatsApp; deja fuera fechas raras
// (rangos, "en dos semanas") a propósito — mejor devolver null y que el bot
// re-pregunte que adivinar mal.
function extractDate(norm: string, now: Date): { date: string; mention: string } | null {
  // hoy / mañana / pasado mañana
  if (/\bpasado manana\b/.test(norm)) return { date: toISODate(addDays(now, 2)), mention: "pasado mañana" };
  if (/\bmanana\b/.test(norm)) return { date: toISODate(addDays(now, 1)), mention: "mañana" };
  if (/\bhoy\b/.test(norm)) return { date: toISODate(now), mention: "hoy" };

  // día de la semana ("el viernes", "viernes") → próxima ocurrencia >= hoy.
  for (const [name, dow] of Object.entries(DOW)) {
    if (new RegExp(`\\b${name}\\b`).test(norm)) {
      const today = now.getDay();
      let delta = (dow - today + 7) % 7; // 0 = hoy mismo
      // "el viernes" dicho un viernes suele referir al de la próxima semana; si
      // querían hoy dirían "hoy". Empujamos a la semana siguiente cuando cae en 0.
      if (delta === 0) delta = 7;
      return { date: toISODate(addDays(now, delta)), mention: name };
    }
  }

  // fecha numérica dd/mm (año opcional). Resuelve al año de `now` salvo que ya pasó,
  // en cuyo caso al siguiente (turno a futuro).
  const m = norm.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let year = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : now.getFullYear();
      let candidate = new Date(year, month - 1, day);
      if (!m[3] && candidate.getTime() < startOfDay(now).getTime()) {
        year += 1;
        candidate = new Date(year, month - 1, day);
      }
      // validar que no se desbordó (ej 31/02 → marzo): el mes debe coincidir.
      if (candidate.getMonth() === month - 1) {
        return { date: toISODate(candidate), mention: m[0] };
      }
    }
  }

  return null;
}

function startOfDay(d: Date): Date {
  const r = new Date(d.getTime());
  r.setHours(0, 0, 0, 0);
  return r;
}

// --- Extracción de entidades: hora --------------------------------------------

// Resuelve una hora a "HH:MM" 24h. Cubre "a las 15", "15hs", "15:30", "3 de la
// tarde", "9 de la mañana", "y media", "mediodía"/"medianoche". Devuelve null si
// no hay una hora clara. `assumeBusinessHours` (ver ParseWaOptions) desambigua las
// horas peladas hacia la tarde en contexto de reserva.
function extractTime(norm: string, assumeBusinessHours: boolean): { time: string; mention: string } | null {
  // mediodía / medianoche (ya normalizados sin acento).
  if (/\bmediodia\b/.test(norm)) return { time: "12:00", mention: "mediodia" };
  if (/\bmedianoche\b/.test(norm)) return { time: "00:00", mention: "medianoche" };

  // "HH:MM" explícito.
  const hm = norm.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hm) {
    const h = Number(hm[1]);
    const min = Number(hm[2]);
    if (h <= 23 && min <= 59) return { time: fmtTime(h, min), mention: hm[0] };
  }

  // "a las 3", "3 hs", "3hs", "las 15", "3 de la tarde/mañana/noche", "3 y media".
  const m = norm.match(
    /\b(?:a\s+las?\s+|las?\s+)?(\d{1,2})\s*(?:hs?|horas?)?\s*(y media|y cuarto)?\s*(?:de la\s+(manana|tarde|noche))?\b/,
  );
  if (m && (m[0].includes("hs") || m[0].includes("hora") || /a\s+las|las\s/.test(m[0]) || m[3])) {
    let h = Number(m[1]);
    let min = 0;
    if (m[2] === "y media") min = 30;
    else if (m[2] === "y cuarto") min = 15;
    const daypart = m[3];
    if (daypart) {
      // franja horaria explícita: el cliente ya desambiguó.
      if (daypart === "tarde" && h < 12) h += 12;
      else if (daypart === "noche") h = h === 12 ? 0 : h < 12 ? h + 12 : h; // "12 de la noche" = medianoche
      else if (daypart === "manana" && h === 12) h = 0; // "12 de la mañana" = medianoche
    } else if (assumeBusinessHours && h >= 1 && h <= 8) {
      // Sin franja: en contexto de turnos, "a las 3/4/…/8" casi siempre es la
      // tarde (13–20 h). Empujamos 1–8 → PM; 9–12 se dejan como AM (mañana/mediodía).
      h += 12;
    }
    if (h <= 23 && min <= 59) return { time: fmtTime(h, min), mention: m[0].trim() };
  }

  return null;
}

function fmtTime(h: number, min: number): string {
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// --- Parser principal ---------------------------------------------------------

export function parseWaMessage(text: string, opts: ParseWaOptions): WaIntent {
  const norm = normalizeWa(text);
  const tokens = norm.length ? norm.split(" ") : [];

  // 1) score por intención de contenido/saludo.
  const scores = new Map<WaIntentKind, number>();
  let matchedContent = false;
  for (const rule of INTENT_RULES) {
    let s = 0;
    for (const phrase of rule.phrases) {
      if (wordIncludes(norm, phrase)) {
        // frase multi-palabra suma un extra por especificidad.
        s += rule.weight * (phrase.includes(" ") ? 1.5 : 1);
      }
    }
    if (s > 0) {
      scores.set(rule.kind, (scores.get(rule.kind) ?? 0) + s);
      if (CONTENT_KINDS.has(rule.kind)) matchedContent = true;
    }
  }

  // 2) elegir la intención de mayor score respetando prioridad del array ante empate.
  let kind: WaIntentKind = "UNKNOWN";
  let best = 0;
  for (const rule of INTENT_RULES) {
    const s = scores.get(rule.kind) ?? 0;
    // GREETING solo gana si NO hubo intención de contenido.
    if (rule.kind === "GREETING" && matchedContent) continue;
    if (s > best) {
      best = s;
      kind = rule.kind;
    }
  }

  // 3) confirmación/negación cortas — solo si no hubo contenido y el mensaje es breve.
  if (!matchedContent && tokens.length > 0 && tokens.length <= 3) {
    const isAffirm = tokens.some((t) => AFFIRM_WORDS.has(t));
    const isDeny = tokens.some((t) => DENY_WORDS.has(t));
    // "no" pesa más que un "dale" si aparecieran juntos (raro): negación explícita.
    if (isDeny) {
      kind = "DENY";
      best = Math.max(best, 3);
    } else if (isAffirm && kind !== "GREETING") {
      kind = "AFFIRM";
      best = Math.max(best, 3);
    } else if (isAffirm && kind === "GREETING") {
      // "hola" + "dale" es raro; si solo hubo saludo, dejamos GREETING.
    }
  }

  // 4) entidades (siempre se intentan: un BOOK y un RESCHEDULE necesitan fecha/hora).
  const date = extractDate(norm, opts.now);
  const time = extractTime(norm, opts.assumeBusinessHours ?? true);
  const service = opts.services?.length ? matchService(norm, opts.services) : null;

  const entities: WaEntities = {
    service,
    date: date?.date ?? null,
    time: time?.time ?? null,
    raw: {
      ...(date ? { dateMention: date.mention } : {}),
      ...(time ? { timeMention: time.mention } : {}),
    },
  };

  // 5) confianza: score saturado, con un pequeño empujón si además hay entidades
  // coherentes con la intención (un BOOK con fecha+hora+servicio es muy confiable).
  let confidence = Math.min(1, best / CONFIDENCE_SATURATION);
  if ((kind === "BOOK" || kind === "RESCHEDULE") && (entities.date || entities.time || entities.service)) {
    const signals = [entities.date, entities.time, entities.service].filter(Boolean).length;
    confidence = Math.min(1, confidence + signals * 0.12);
  }
  if (kind === "UNKNOWN") confidence = 0;

  return {
    kind,
    confidence: round2(confidence),
    entities,
    suggestedAction: SUGGESTED_ACTION[kind],
  };
}
