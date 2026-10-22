// ============================================================================
// PADEL-CLASES — reglas puras del turnero y la agenda de un profe de pádel.
// ============================================================================
//
// Sin Prisma, sin red, sin reloj propio: la fecha de "ahora" se inyecta, así las pruebas
// fijan el día. La lectura de la base y las escrituras viven en datos.server.ts y
// acciones.ts; acá sólo lo que se puede decidir con los datos en la mano.
//
// La máquina de estados es corta a propósito: el profe la usa entre clase y clase, con
// menos de diez minutos y el celular en la mano.
//
//   PEDIDA ──confirmar──▶ CONFIRMADA ──dar──▶ DADA
//     │  │                   ├─ausente─▶ AUSENTE
//     │  └─rechazar─▶ RECHAZADA └─cancelar─▶ CANCELADA   (PEDIDA también se cancela)
//     └──vencer (sistema: pasó la hora y nadie la confirmó)──▶ SIN_RESPUESTA
//
//   Pago:  PENDIENTE ──alumno sube comprobante──▶ EN_REVISION ──profe valida──▶ PAGADO
//             │                                     └──no es válido──▶ PENDIENTE
//             └──"cobré en efectivo" (un toque)──▶ PAGADO
//          PAGADO ──la clase se cancela o se rechaza──▶ ACREDITADO (saldo a favor) ──«Le devolví»──▶ DEVUELTO
//
// Los estados viven como texto en la base (`estado`, `pagoEstado`, `pagoMedio` son String): sumar
// uno no pide migración. El saldo a favor no es una columna: se deriva de las clases (saldoAFavor).

import { generateSlots, hasOverlap, type Interval } from "@/lib/booking-slots";
import { businessWallTimeToUtc, dayOfWeekForDate } from "@/lib/datetime";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";

// ── Estados ─────────────────────────────────────────────────────────────────

export const ESTADOS_CLASE = ["PEDIDA", "CONFIRMADA", "DADA", "AUSENTE", "RECHAZADA", "CANCELADA", "SIN_RESPUESTA"] as const;
export type EstadoClase = (typeof ESTADOS_CLASE)[number];

export const ESTADOS_PAGO = ["PENDIENTE", "EN_REVISION", "PAGADO", "ACREDITADO", "DEVUELTO"] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

export const MEDIOS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "SALDO_A_FAVOR"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export const TIPOS_CLASE = ["INDIVIDUAL", "GRUPAL"] as const;
export type TipoClase = (typeof TIPOS_CLASE)[number];

/** Las clases que ocupan la franja: una RECHAZADA, CANCELADA o SIN_RESPUESTA la libera. */
export const ESTADOS_QUE_OCUPAN: readonly EstadoClase[] = ["PEDIDA", "CONFIRMADA", "DADA"];

export const esEstadoClase = (v: unknown): v is EstadoClase => ESTADOS_CLASE.includes(v as EstadoClase);
export const esEstadoPago = (v: unknown): v is EstadoPago => ESTADOS_PAGO.includes(v as EstadoPago);
export const esTipoClase = (v: unknown): v is TipoClase => TIPOS_CLASE.includes(v as TipoClase);

/** Cómo se lo dice el panel al profe. */
export const ESTADO_LABEL: Record<EstadoClase, string> = {
  PEDIDA: "Por confirmar",
  CONFIRMADA: "Confirmada",
  DADA: "Dada",
  AUSENTE: "No vino",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
  SIN_RESPUESTA: "Sin respuesta",
};

/** Cómo se lo dice el link al alumno: en criollo y diciendo qué falta. */
export const ESTADO_PARA_ALUMNO: Record<EstadoClase, string> = {
  PEDIDA: "Pedida · falta que el profe la confirme",
  CONFIRMADA: "Confirmada",
  DADA: "Dada",
  AUSENTE: "Quedó como ausente",
  RECHAZADA: "El profe no puede en ese horario",
  CANCELADA: "Cancelada",
  SIN_RESPUESTA: "El profe no llegó a confirmarte",
};

export const PAGO_LABEL: Record<EstadoPago, string> = {
  PENDIENTE: "Sin pagar",
  EN_REVISION: "Comprobante por revisar",
  PAGADO: "Pagada",
  ACREDITADO: "Quedó a favor",
  DEVUELTO: "Devuelta",
};

export const MEDIO_LABEL: Record<MedioPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  SALDO_A_FAVOR: "Saldo a favor",
};

export type EventoClase = "confirmar" | "rechazar" | "dar" | "ausente" | "cancelar" | "vencer";
/** «sistema» = lo hace la app sola (vencer un pedido que nadie contestó). */
export type Quien = "profe" | "alumno" | "sistema";

const TRANSICIONES_CLASE: Record<EventoClase, { desde: readonly EstadoClase[]; hacia: EstadoClase; quien: readonly Quien[] }> = {
  confirmar: { desde: ["PEDIDA"], hacia: "CONFIRMADA", quien: ["profe"] },
  rechazar: { desde: ["PEDIDA"], hacia: "RECHAZADA", quien: ["profe"] },
  dar: { desde: ["CONFIRMADA", "PEDIDA"], hacia: "DADA", quien: ["profe"] },
  ausente: { desde: ["CONFIRMADA"], hacia: "AUSENTE", quien: ["profe"] },
  cancelar: { desde: ["PEDIDA", "CONFIRMADA"], hacia: "CANCELADA", quien: ["profe", "alumno"] },
  vencer: { desde: ["PEDIDA"], hacia: "SIN_RESPUESTA", quien: ["sistema"] },
};

/** El estado al que pasa la clase, o null si ese evento no corre desde ahí o para esa persona. */
export function transicionClase(estado: string, evento: EventoClase, quien: Quien): EstadoClase | null {
  const t = TRANSICIONES_CLASE[evento];
  if (!t || !esEstadoClase(estado)) return null;
  return t.desde.includes(estado) && t.quien.includes(quien) ? t.hacia : null;
}

export type EventoPago = "subir" | "validar" | "noValido" | "efectivo" | "acreditar" | "devolver";

/** Estados de pago en los que la plata ya entró (o ya se resolvió): nunca son deuda. */
const PAGO_RESUELTO: readonly EstadoPago[] = ["PAGADO", "ACREDITADO", "DEVUELTO"];

/**
 * El estado de pago al que pasa la clase, o null si no corre. Se cobra una clase viva (pedida,
 * confirmada o dada): una rechazada o cancelada no se cobra. El comprobante lo sube el alumno
 * de una clase confirmada o dada: una PEDIDA nunca es pagable (el profe todavía no dijo que sí).
 *
 * `acreditar`: la clase pagada se canceló o se rechazó → la plata queda a favor del alumno.
 * `devolver`: el profe le devolvió esa plata («Le devolví») → sale del saldo.
 */
export function transicionPago(pago: string, estadoClase: string, evento: EventoPago, quien: Quien): EstadoPago | null {
  if (!esEstadoPago(pago) || !esEstadoClase(estadoClase)) return null;
  if (evento === "acreditar") return pago === "PAGADO" && (estadoClase === "CANCELADA" || estadoClase === "RECHAZADA") ? "ACREDITADO" : null;
  if (evento === "devolver") return quien === "profe" && pago === "ACREDITADO" ? "DEVUELTO" : null;
  if (!ESTADOS_QUE_OCUPAN.includes(estadoClase)) return null;
  switch (evento) {
    case "subir":
      return quien === "alumno" && estadoClase !== "PEDIDA" && !PAGO_RESUELTO.includes(pago) ? "EN_REVISION" : null;
    case "validar":
      return quien === "profe" && pago === "EN_REVISION" ? "PAGADO" : null;
    case "noValido":
      return quien === "profe" && pago === "EN_REVISION" ? "PENDIENTE" : null;
    case "efectivo":
      return quien === "profe" && !PAGO_RESUELTO.includes(pago) ? "PAGADO" : null;
  }
}

// ── Plata: una sola regla de deuda y el saldo a favor ──────────────────────
//
// La usan el panel del profe y el link del alumno: los dos ven el MISMO número.

export interface ClaseConPago {
  estado: string;
  pagoEstado: string;
  pagoMedio?: string | null;
  precio: number;
}

/** Deuda = clase DADA, con precio, que nadie pagó todavía. Una PEDIDA o CONFIRMADA no es deuda. */
export const esDeuda = (c: ClaseConPago): boolean =>
  c.estado === "DADA" && Number(c.precio) > 0 && !PAGO_RESUELTO.includes(c.pagoEstado as EstadoPago);

/**
 * Lo que el alumno puede pagar ya: la deuda, más una CONFIRMADA sin pagar (adelanta el pago).
 * PEDIDA nunca: el profe todavía no confirmó, y si vence no existió.
 */
export const esPagable = (c: ClaseConPago): boolean =>
  esDeuda(c) || (c.estado === "CONFIRMADA" && c.pagoEstado === "PENDIENTE" && Number(c.precio) > 0);

/** Lo que debe el alumno: la suma de sus deudas. */
export const totalDeuda = (clases: readonly ClaseConPago[]): number =>
  redondear(clases.filter(esDeuda).reduce((s, c) => s + Number(c.precio), 0));

/**
 * Saldo a favor = lo acreditado (clases pagadas que se cancelaron) − lo ya usado (clases pagadas
 * con «Saldo a favor»). Lo devuelto en mano (DEVUELTO) ya no cuenta. Nunca negativo.
 */
export function saldoAFavor(clases: readonly ClaseConPago[]): number {
  let s = 0;
  for (const c of clases) {
    if (c.pagoEstado === "ACREDITADO") s += Number(c.precio);
    else if (c.pagoEstado === "PAGADO" && c.pagoMedio === "SALDO_A_FAVOR") s -= Number(c.precio);
  }
  return Math.max(0, redondear(s));
}

/** ¿El saldo alcanza para pagar entera esta clase? Un saldo parcial no se aplica (queda para después). */
export const saldoCubre = (saldo: number, precio: number): boolean => Number(precio) > 0 && saldo >= Number(precio);

/**
 * Qué le pasa al pago cuando la clase se cancela o se rechaza, o null si no cambia nada:
 *  · pagada en efectivo/transferencia → ACREDITADO (la plata queda a favor, no se pierde);
 *  · pagada CON saldo a favor → vuelve a PENDIENTE sin medio (el saldo que usó le vuelve solo, sin
 *    contarlo dos veces);
 *  · sin pagar o con el comprobante por revisar → igual (no entró plata validada).
 */
export function pagoAlCancelar(c: { pagoEstado: string; pagoMedio?: string | null }): { pagoEstado: EstadoPago; pagoMedio?: null } | null {
  if (c.pagoEstado !== "PAGADO") return null;
  if (c.pagoMedio === "SALDO_A_FAVOR") return { pagoEstado: "PENDIENTE", pagoMedio: null };
  return { pagoEstado: "ACREDITADO" };
}

// ── Franjas libres ──────────────────────────────────────────────────────────

export interface Franja {
  /** 0 = domingo … 6 = sábado; null en una excepción de un día. */
  diaSemana: number | null;
  /** "YYYY-MM-DD" en una excepción de un día; null en una franja semanal. */
  fecha: string | null;
  desde: string;
  hasta: string;
  /** DA = da clases · NO = bloqueo (lluvia, viaje, torneo). */
  tipo: "DA" | "NO";
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export const horaValida = (h: string): boolean => HORA.test(h);
export const fechaValida = (f: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(new Date(`${f}T12:00:00Z`).getTime());

/**
 * Las ventanas en las que el profe da clases ese día y los bloqueos de ese día, en UTC.
 * Las franjas semanales del día + las franjas extra de esa fecha; los bloqueos de esa fecha
 * restan (se tratan como ocupados).
 */
export function ventanasDelDia(fecha: string, franjas: readonly Franja[]): { ventanas: Interval[]; bloqueos: Interval[] } {
  const dia = dayOfWeekForDate(fecha);
  const aIntervalo = (f: Franja): Interval | null => {
    if (!horaValida(f.desde) || !horaValida(f.hasta) || f.hasta <= f.desde) return null;
    return { startsAt: businessWallTimeToUtc(fecha, f.desde), endsAt: businessWallTimeToUtc(fecha, f.hasta) };
  };
  const delDia = franjas.filter((f) => (f.fecha ? f.fecha === fecha : f.diaSemana === dia));
  const ventanas = delDia.filter((f) => f.tipo === "DA").map(aIntervalo).filter((x): x is Interval => !!x);
  const bloqueos = delDia.filter((f) => f.tipo === "NO").map(aIntervalo).filter((x): x is Interval => !!x);
  return { ventanas, bloqueos };
}

/**
 * Los inicios libres (ISO) de ese día: dentro de las ventanas, de a una clase por vez, sin
 * pisar una clase viva ni un bloqueo, y no antes de `ahora + anticipación`.
 */
export function franjasLibres(p: {
  fecha: string;
  franjas: readonly Franja[];
  ocupadas: readonly Interval[];
  duracionMin: number;
  anticipacionMin: number;
  ahora: Date;
}): string[] {
  const { ventanas, bloqueos } = ventanasDelDia(p.fecha, p.franjas);
  const limite = p.ahora.getTime() + Math.max(0, p.anticipacionMin) * 60_000;
  const busy = [...p.ocupadas, ...bloqueos];
  const out = new Set<string>();
  for (const v of ventanas) {
    for (const iso of generateSlots({ dayStart: v.startsAt, dayEnd: v.endsAt, durationMin: p.duracionMin, stepMin: p.duracionMin, busy })) {
      if (new Date(iso).getTime() >= limite) out.add(iso);
    }
  }
  return [...out].sort();
}

/** ¿Ese horario está dentro de lo que el profe ofrece y libre? (re-chequeo del servidor). */
export function horarioDisponible(p: Parameters<typeof franjasLibres>[0] & { empiezaEn: Date }): boolean {
  return franjasLibres(p).includes(p.empiezaEn.toISOString());
}

/** ¿Choca con alguna clase viva? Bordes estrictos: 10:00–11:00 y 11:00–12:00 no chocan. */
export const hayChoque = (empiezaEn: Date, terminaEn: Date, ocupadas: readonly Interval[]): boolean =>
  hasOverlap(empiezaEn, terminaEn, [...ocupadas]);

// ── Reglas de pedido y cancelación ──────────────────────────────────────────

/** Tope de pedidos sin confirmar por teléfono: frena al que aprieta veinte veces. */
export const puedePedir = (pendientesDelTelefono: number, max: number): boolean => pendientesDelTelefono < Math.max(1, max);

/** La misma hora, siete días después. Argentina no tiene horario de verano: son 7 × 24 h exactas. */
export const proximaSemana = (d: Date): Date => new Date(d.getTime() + 7 * 86_400_000);

/** El alumno cancela solo hasta `anticipacionMin` antes; después, que le escriba al profe. */
export function puedeCancelarAlumno(estado: string, empiezaEn: Date, ahora: Date, anticipacionMin: number): boolean {
  if (!transicionClase(estado, "cancelar", "alumno")) return false;
  return empiezaEn.getTime() - ahora.getTime() >= anticipacionMin * 60_000;
}

/**
 * ¿La clase que pide repetir nace confirmada? Sí si el alumno ya tomó al menos una clase
 * (es conocido) y la franja está dentro de lo que el profe ofrece. Si no, queda PEDIDA.
 */
export const repetidaNaceConfirmada = (clasesDadas: number): boolean => clasesDadas > 0;

export function precioDe(config: { precioIndividual: number; precioGrupal: number }, tipo: TipoClase, personas: number): number {
  const p = Math.min(4, Math.max(1, Math.trunc(personas) || 1));
  return tipo === "GRUPAL" ? redondear(config.precioGrupal * p) : redondear(config.precioIndividual);
}

export const redondear = redondearAlCentavo;

export const pesos = (n: number): string =>
  `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// ── Teléfono y WhatsApp ─────────────────────────────────────────────────────

/** El celular del alumno como clave: 10 dígitos (área + número). Vacío si no sirve. */
export function telefonoAlumno(raw: string | null | undefined): string {
  const t = normalizarTelefono(raw);
  return t.length === 10 ? t : "";
}

/** Link wa.me a un celular argentino con el texto pre-armado. Null si el número no sirve. */
export function linkWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  const t = telefonoAlumno(telefono);
  return t ? `https://wa.me/549${t}?text=${encodeURIComponent(texto)}` : null;
}

// ── Mensajes ────────────────────────────────────────────────────────────────

export const CLAVES_PLANTILLA = ["pedidoAlProfe", "confirmada", "rechazada", "proxima", "pagoOk", "pagoNo", "recordatorio", "linkAlumno"] as const;
export type ClavePlantilla = (typeof CLAVES_PLANTILLA)[number];

export const PLANTILLAS_DEFAULT: Record<ClavePlantilla, string> = {
  pedidoAlProfe: "Hola {profe}! Soy {nombre}. Te pedí clase el {dia} a las {hora} desde tu turnero.",
  confirmada:
    "Hola {nombre}! Te confirmo la clase del {dia} a las {hora}. Sale {precio}: podés pasarlo al alias {alias} y mandarme el comprobante desde tu link: {link}",
  rechazada: "Hola {nombre}! El {dia} a las {hora} no puedo. Fijate otro horario acá: {turnero}",
  proxima: "Hola {nombre}! Te agendé la próxima clase: {dia} a las {hora}. Si no podés, cancelala desde tu link: {link}",
  pagoOk: "Gracias {nombre}! Recibí el pago de la clase del {dia}.",
  pagoNo: "Hola {nombre}! No pude validar el comprobante de la clase del {dia}. ¿Me lo mandás de nuevo desde tu link? {link}",
  recordatorio: "Hola {nombre}! Te recuerdo la clase del {dia} a las {hora}. Nos vemos en la cancha.",
  linkAlumno: "Hola {nombre}! Este es tu link para ver tus clases, repetir la de la semana que viene y mandar el comprobante: {link}",
};

/**
 * «Clase confirmada» de fábrica según lo que el profe cargó: sin precio no dice «Sale $ 0» y sin
 * alias no promete uno. Sólo reemplaza el texto de fábrica: si el profe editó el suyo, va el suyo.
 */
export function plantillaConfirmada(plantilla: string, datos: { hayPrecio: boolean; hayAlias: boolean }): string {
  if (plantilla !== PLANTILLAS_DEFAULT.confirmada) return plantilla;
  const { hayPrecio, hayAlias } = datos;
  if (hayPrecio && hayAlias) return plantilla;
  const inicio = "Hola {nombre}! Te confirmo la clase del {dia} a las {hora}.";
  if (hayPrecio) return `${inicio} Sale {precio}. Cuando me pagues, mandame el comprobante desde tu link: {link}`;
  if (hayAlias) return `${inicio} Podés pagarla al alias {alias} y mandarme el comprobante desde tu link: {link}`;
  return `${inicio} Desde tu link ves tus clases y me mandás el comprobante: {link}`;
}

export const PLANTILLA_LABEL: Record<ClavePlantilla, string> = {
  pedidoAlProfe: "Lo que te manda el alumno al pedir",
  confirmada: "Clase confirmada",
  rechazada: "Ese horario no puedo",
  proxima: "Te agendé la próxima",
  pagoOk: "Pago recibido",
  pagoNo: "Comprobante no válido",
  recordatorio: "Recordatorio",
  linkAlumno: "Tu link",
};

/** Reemplaza {variables}. Una variable sin dato se borra: nunca queda "{llave}" a la vista. */
export function armarMensaje(plantilla: string, vars: Record<string, string | number | null | undefined>): string {
  return plantilla
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = vars[k];
      return v == null ? "" : String(v);
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const ZONA = "America/Argentina/Buenos_Aires";

/** "jueves 23/10" en la hora del negocio. */
export function diaHumano(d: Date): string {
  const dia = d.toLocaleDateString("es-AR", { weekday: "long", timeZone: ZONA });
  const fecha = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: ZONA });
  return `${dia} ${fecha}`;
}

/** "18:00" en la hora del negocio. */
export const horaHumana = (d: Date): string =>
  d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA });

/** "jue 23" para los chips de día del turnero. */
export function diaCorto(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00.000Z`);
  const dia = d.toLocaleDateString("es-AR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${dia} ${d.getUTCDate()}`;
}

// ── Validaciones de entrada ─────────────────────────────────────────────────

/** Largo máximo del data URL del comprobante (~300 KB de imagen), como las fotos del taller. */
export const MAX_COMPROBANTE = 400_000;

export const comprobanteValido = (d: unknown): d is string =>
  typeof d === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d) && d.length <= MAX_COMPROBANTE;

/** Mismo formato que los links del taller: 20+ caracteres base64url. */
export const tokenValido = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(t);

/** Nombre del alumno: 2 a 60 caracteres visibles, sin saltos de línea. */
export function nombreValido(raw: unknown): string | null {
  const n = String(raw ?? "").replace(/\s+/g, " ").trim();
  return n.length >= 2 && n.length <= 60 ? n : null;
}
