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
//     └──vencer (sistema: pasó la hora y nadie la confirmó)──▶ SIN_RESPUESTA ──dar (el alumno vino igual)──▶ DADA
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

// POR_PARTICIPANTE (T4): una grupal con participantes no se cobra entera a uno: cada persona tiene su
// parte en PadelParticipante («1 de 3 pagaron»). La clase en sí nunca es deuda ni se cobra de una.
export const ESTADOS_PAGO = ["PENDIENTE", "EN_REVISION", "PAGADO", "ACREDITADO", "DEVUELTO", "POR_PARTICIPANTE"] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

// PAQUETE (T4): la clase se pagó con una clase del paquete del alumno. Como «Saldo a favor», no es
// plata que entra ese día (entró cuando se vendió el paquete): no lleva `pagoValidadoEl`.
export const MEDIOS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO", "SALDO_A_FAVOR", "PAQUETE"] as const;
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
  POR_PARTICIPANTE: "Se cobra por persona",
};

export const MEDIO_LABEL: Record<MedioPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  SALDO_A_FAVOR: "Saldo a favor",
  PAQUETE: "Paquete",
};

export type EventoClase = "confirmar" | "rechazar" | "dar" | "ausente" | "cancelar" | "vencer";
/** «sistema» = lo hace la app sola (vencer un pedido que nadie contestó). */
export type Quien = "profe" | "alumno" | "sistema";

const TRANSICIONES_CLASE: Record<EventoClase, { desde: readonly EstadoClase[]; hacia: EstadoClase; quien: readonly Quien[] }> = {
  confirmar: { desde: ["PEDIDA"], hacia: "CONFIRMADA", quien: ["profe"] },
  rechazar: { desde: ["PEDIDA"], hacia: "RECHAZADA", quien: ["profe"] },
  // O-3: un pedido que venció sin respuesta (SIN_RESPUESTA) se puede igual dar: el alumno vino y
  // el profe lo cobra. Confirmar o cancelar un pedido vencido, no (la hora ya pasó).
  dar: { desde: ["CONFIRMADA", "PEDIDA", "SIN_RESPUESTA"], hacia: "DADA", quien: ["profe"] },
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

/**
 * Estados de pago en los que la plata ya entró (o ya se resolvió): nunca son deuda. POR_PARTICIPANTE
 * (T4) tampoco: la deuda de una grupal con participantes es de cada persona (PadelParticipante).
 */
const PAGO_RESUELTO: readonly EstadoPago[] = ["PAGADO", "ACREDITADO", "DEVUELTO", "POR_PARTICIPANTE"];

/** Lo mismo para los filtros de la base (`pagoEstado: { notIn: PAGOS_SIN_DEUDA }`). */
export const PAGOS_SIN_DEUDA: readonly string[] = PAGO_RESUELTO;

/**
 * El estado de pago al que pasa la clase, o null si no corre. Se cobra una clase confirmada o dada
 * (O-2: una pedida todavía no; una rechazada o cancelada, nunca). El comprobante lo sube el alumno
 * de una clase confirmada o dada: una PEDIDA nunca es pagable (el profe todavía no dijo que sí).
 *
 * `acreditar`: la clase pagada se canceló o se rechazó, o el alumno no vino y el profe dijo «no se
 * cobra» (`motivoCancel` = MOTIVO_AUSENTE_NO_SE_COBRA, O-3b) → la plata queda a favor del alumno. Es
 * la MISMA regla que aplican las acciones con `pagoAlCancelar` / `pagoAlNoVino` (que además cubren la
 * pagada con saldo a favor: ahí el saldo vuelve solo, sin acreditar dos veces).
 * `devolver`: el profe le devolvió esa plata («Le devolví») → sale del saldo.
 */
export function transicionPago(pago: string, estadoClase: string, evento: EventoPago, quien: Quien, motivoCancel?: string | null): EstadoPago | null {
  if (!esEstadoPago(pago) || !esEstadoClase(estadoClase)) return null;
  if (evento === "acreditar") {
    const sinClase = estadoClase === "CANCELADA" || estadoClase === "RECHAZADA" || (estadoClase === "AUSENTE" && motivoCancel === MOTIVO_AUSENTE_NO_SE_COBRA);
    return pago === "PAGADO" && sinClase ? "ACREDITADO" : null;
  }
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
      // O-2 (CERT T2+T3): una PEDIDA no se cobra. El profe todavía no dijo que sí; si la rechaza, la
      // plata quedaría a favor de una clase que nunca existió. Primero se confirma (o se da).
      return quien === "profe" && estadoClase !== "PEDIDA" && !PAGO_RESUELTO.includes(pago) ? "PAGADO" : null;
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
  /** Texto libre. En una AUSENTE dice si «No vino» se cobra (ver MOTIVO_AUSENTE_SE_COBRA). */
  motivoCancel?: string | null;
  /**
   * T4 · pago parcial: lo que ya entró de esta clase (columna `pagado`). Sin la migración no viene
   * (undefined = 0): la deuda es el precio entero, como siempre.
   */
  pagado?: number | { toString(): string } | null;
}

/** Lo que falta pagar de la clase: precio − lo ya pagado (pago parcial, T4). Nunca negativo. */
export const restoDeLaClase = (c: { precio: number | { toString(): string }; pagado?: number | { toString(): string } | null }): number =>
  Math.max(0, redondearAlCentavo(Number(c.precio) - Number(c.pagado ?? 0)));

// «No vino → se cobra igual / no se cobra» (M-045). Sin columna nueva: va como texto en
// `motivoCancel` (es String libre en la base). TODO(T4): reemplazar por `PadelClase.seCobra Boolean`
// (la migración puede llenarla desde este texto). Provisional hasta T4.
export const MOTIVO_AUSENTE_SE_COBRA = "AUSENTE_SE_COBRA";
export const MOTIVO_AUSENTE_NO_SE_COBRA = "AUSENTE_NO_SE_COBRA";
// «Avisó que no viene, fuera de término» con la regla «tardía se cobra» (T4; hoy el default es que no).
// TODO(T4): ídem, `seCobra`. Provisional hasta T4.
export const MOTIVO_TARDIA_SE_COBRA = "TARDIA_SE_COBRA";

/** La clase se cobra aunque no esté «dada»: el alumno no vino y el profe dijo «se cobra igual». */
export const ausenteQueSeCobra = (c: { estado: string; motivoCancel?: string | null }): boolean =>
  c.estado === "AUSENTE" && c.motivoCancel === MOTIVO_AUSENTE_SE_COBRA;

/**
 * T4 · M-125: con la regla «tardía se cobra», el alumno que avisó fuera de término que no va deja la
 * clase CANCELADA (la franja se libera) pero la debe igual: «Cancelada tarde · debe $ 25.000».
 */
export const tardiaQueSeCobra = (c: { estado: string; motivoCancel?: string | null }): boolean =>
  c.estado === "CANCELADA" && c.motivoCancel === MOTIVO_TARDIA_SE_COBRA;

/** Lo que ya se le puede reclamar al alumno: la clase dada, la ausente o la tardía que se cobran igual. */
const cuentaParaCobrar = (c: ClaseConPago): boolean => c.estado === "DADA" || ausenteQueSeCobra(c) || tardiaQueSeCobra(c);

/** «Cancelada tarde · debe $ 25.000» (M-125), o null si no es una tardía que se cobra o ya no debe nada. */
export function etiquetaTardia(c: ClaseConPago): string | null {
  if (!tardiaQueSeCobra(c)) return null;
  return esDeuda(c) ? `Cancelada tarde · debe ${pesos(restoDeLaClase(c))}` : "Cancelada tarde";
}

/**
 * Deuda = clase DADA (o AUSENTE que «se cobra igual», M-045), con precio, que nadie pagó todavía.
 * Una PEDIDA o CONFIRMADA no es deuda.
 * O-5: lo que tiene el comprobante EN_REVISION tampoco: el alumno ya pagó y espera que el profe lo
 * valide. Se muestra aparte, «en revisión» (esEnRevision).
 */
export const esDeuda = (c: ClaseConPago): boolean =>
  cuentaParaCobrar(c) && restoDeLaClase(c) > 0 && c.pagoEstado !== "EN_REVISION" && !PAGO_RESUELTO.includes(c.pagoEstado as EstadoPago);

/** Comprobante mandado que el profe todavía no validó, de una clase viva con precio. No es deuda. */
export const esEnRevision = (c: ClaseConPago): boolean =>
  c.pagoEstado === "EN_REVISION" && (cuentaParaCobrar(c) || c.estado === "CONFIRMADA") && Number(c.precio) > 0;

/**
 * Lo que el alumno puede pagar ya: la deuda, más una CONFIRMADA sin pagar (adelanta el pago).
 * PEDIDA nunca: el profe todavía no confirmó, y si vence no existió.
 */
export const esPagable = (c: ClaseConPago): boolean =>
  esDeuda(c) || (c.estado === "CONFIRMADA" && c.pagoEstado === "PENDIENTE" && Number(c.precio) > 0);

/** ¿El alumno puede mandar el comprobante de esta clase? Lo pagable, o lo que ya mandó (manda otro). */
export const puedeSubirComprobante = (c: ClaseConPago): boolean => esPagable(c) || esEnRevision(c);

/**
 * ¿El profe puede marcarla cobrada («Cobré», «Cobrar todo»)? Una clase viva sin pagar (también con
 * el comprobante por revisar: le pagó en mano) o una AUSENTE que se cobra igual.
 */
export const puedeCobrarProfe = (c: ClaseConPago): boolean =>
  transicionPago(c.pagoEstado, c.estado, "efectivo", "profe") !== null ||
  ((ausenteQueSeCobra(c) || tardiaQueSeCobra(c)) && !PAGO_RESUELTO.includes(c.pagoEstado as EstadoPago));

/** Lo que debe el alumno: la suma de sus deudas (de cada una, lo que falta: pago parcial, T4). */
export const totalDeuda = (clases: readonly ClaseConPago[]): number =>
  redondear(clases.filter(esDeuda).reduce((s, c) => s + restoDeLaClase(c), 0));

/** Lo que mandó y espera validación: se muestra aparte de «Debés». */
export const totalEnRevision = (clases: readonly ClaseConPago[]): number =>
  redondear(clases.filter(esEnRevision).reduce((s, c) => s + Number(c.precio), 0));

/**
 * El estado con el que se MUESTRA una clase: un pedido cuya hora ya pasó se ve como SIN_RESPUESTA
 * aunque la base todavía no lo haya vencido (el vencimiento en la base va frenado: O-6).
 */
export const estadoEnPantalla = (estado: EstadoClase, empiezaEn: Date, ahora: Date): EstadoClase =>
  estado === "PEDIDA" && empiezaEn.getTime() < ahora.getTime() ? "SIN_RESPUESTA" : estado;

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
export function pagoAlCancelar(c: { pagoEstado: string; pagoMedio?: string | null; pagado?: number | { toString(): string } | null }): { pagoEstado: EstadoPago; pagoMedio?: null; precio?: number } | null {
  // T4 · pago parcial: lo que ya entró de una clase sin terminar de pagar queda a favor (y la clase
  // cancelada pasa a valer eso: el saldo a favor se deriva del precio de las ACREDITADO).
  const parcial = Number(c.pagado ?? 0);
  if (c.pagoEstado === "PENDIENTE" && parcial > 0) return { pagoEstado: "ACREDITADO", precio: redondearAlCentavo(parcial) };
  if (c.pagoEstado !== "PAGADO") return null;
  if (c.pagoMedio === "SALDO_A_FAVOR") return { pagoEstado: "PENDIENTE", pagoMedio: null };
  return { pagoEstado: "ACREDITADO" };
}

/** El texto de un aviso con el link del alumno apuntando al token vigente (O-12: el link se renovó). */
export const conLinkVigente = (texto: string, token: string): string => texto.replace(/\/alumno\/[A-Za-z0-9_-]+/g, `/alumno/${token}`);

/**
 * «No vino» sobre una clase YA pagada (O-3 de la CERT T2+T3): con «no se cobra», la plata queda a
 * favor del alumno igual que al cancelar una pagada (pagoAlCancelar); con «se cobra igual», el pago
 * se queda donde está. Sin pagar, nada cambia (no se cobra → no es deuda; se cobra → es deuda).
 */
export function pagoAlNoVino(c: { pagoEstado: string; pagoMedio?: string | null; pagado?: number | { toString(): string } | null }, seCobra: boolean): { pagoEstado: EstadoPago; pagoMedio?: null; pagoNota?: string; precio?: number } | null {
  if (seCobra) return null;
  // O-3c: comprobante todavía por revisar de una clase que no se cobra → «no aplica». Deja de esperar
  // en la Bandeja (vuelve a PENDIENTE, que en una ausente que no se cobra no es deuda) y queda la nota.
  // La imagen se conserva: si el alumno ya transfirió, el profe tiene con qué devolvérselo.
  if (c.pagoEstado === "EN_REVISION") return { pagoEstado: "PENDIENTE", pagoNota: COMPROBANTE_NO_APLICA };
  return pagoAlCancelar(c);
}

/**
 * El motivo de un pedido de cambio que se rechazó solo porque el profe confirmó OTRO de los cambios
 * pedidos para la misma clase (O-5/O-5c). Lo lee el alumno en su link: no fue que el profe «no
 * puede ese horario», fue que ya quedó el otro.
 */
export const MOTIVO_OTRO_CAMBIO_CONFIRMADO = "Ya confirmaste otro horario para esa clase";

/** La nota que queda en un comprobante por revisar de una clase que el profe no cobra (O-3c). */
export const COMPROBANTE_NO_APLICA = "No hace falta: esa clase no se cobra. Si ya transferiste, hablalo con tu profe.";

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
  /** T4: el club donde da ese tramo (null = sin club; undefined = la base todavía no lo tiene). */
  clubId?: string | null;
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

export const CLAVES_PLANTILLA = [
  "pedidoAlProfe", "confirmada", "rechazada", "proxima", "pagoOk", "pagoNo", "recordatorio", "linkAlumno",
  "movida", "suspendida", "recordatorioDeuda", "linkPedido",
  // T4: la semana del turno fijo (M-117), «ofrecele renovar» (M-118) y la parte de cada uno en una grupal (M-120).
  "semana", "renovarPaquete", "parteGrupal",
] as const;
export type ClavePlantilla = (typeof CLAVES_PLANTILLA)[number];

export const PLANTILLAS_DEFAULT: Record<ClavePlantilla, string> = {
  pedidoAlProfe: "Hola {profe}! Soy {nombre}. Te pedí clase el {dia} a las {hora} desde tu turnero.",
  confirmada:
    "Hola {nombre}! Te confirmo la clase del {dia} a las {hora}. Sale {precio}: podés pasarlo al alias {alias} y mandarme el comprobante desde tu link: {link}",
  rechazada: "Hola {nombre}! El {dia} a las {hora} no puedo. Fijate otro horario acá: {turnero}",
  proxima: "Hola {nombre}! Te agendé la próxima clase: {dia} a las {hora}. Si no podés, cancelala desde tu link: {link}",
  pagoOk: "Gracias {nombre}! Recibí el pago de la clase del {dia}.",
  pagoNo: "Hola {nombre}! No pude validar el comprobante de la clase del {dia}. ¿Me lo mandás de nuevo desde tu link? {link}",
  // A·E21: el recordatorio lleva el link (cancelar, cambiar o pagar sin escribirle al profe).
  recordatorio: "Hola {nombre}! Te recuerdo la clase del {dia} a las {hora}. Si no podés venir, cancelala o cambiala desde tu link: {link}",
  linkAlumno: "Hola {nombre}! Este es tu link para ver tus clases, repetir la de la semana que viene y mandar el comprobante: {link}",
  // M-032: un solo WhatsApp por cambio («Te pasé…»), nunca un «no puedo» + un «te agendé».
  movida: "Hola {nombre}! Te pasé la clase del {diaAnterior} {horaAnterior} al {dia} {hora}. La ves en tu link: {link}",
  // M-036: lluvia o club cerrado.
  suspendida: "Hola {nombre}! Se suspende por {motivo} la clase del {dia} a las {hora}. Elegí otro horario acá: {turnero}",
  recordatorioDeuda: "Hola {nombre}! Te paso lo que quedó pendiente: {detalle}. Total {total}. Podés pasarlo al alias {alias} y mandarme el comprobante desde tu link: {link}",
  linkPedido: "Hola {nombre}! Me pediste tu link desde el turnero. Acá lo tenés: {link}",
  semana: "Hola {nombre}! Esta semana tenés clase {detalle}. Si no podés alguna, avisame desde tu link: {link}",
  renovarPaquete: "Hola {nombre}! Usaste la última clase de tu {paquete}. ¿Lo renovamos? Sale {precio}: podés pasarlo al alias {alias}.",
  parteGrupal: "Hola {nombre}! Te confirmo la clase grupal del {dia} a las {hora}. Tu parte es {precio}: podés pasarla al alias {alias} y mandarme el comprobante desde tu link: {link}",
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
  movida: "Te pasé la clase",
  suspendida: "Se suspende (lluvia, club cerrado)",
  recordatorioDeuda: "Lo que te deben",
  linkPedido: "El link que te pidió el alumno",
  semana: "Tu semana (turno fijo)",
  renovarPaquete: "Ofrecele renovar el paquete",
  parteGrupal: "Tu parte de la grupal",
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

// ════════════════════════════════════════════════════════════════════════════
// Tanda 2A — reglas puras del motor nuevo (mover, suspender, cobrar, avisar).
// ════════════════════════════════════════════════════════════════════════════

/** Los medios con que el profe marca «Cobré». «Saldo a favor» no: ese lo aplica la app sola. */
export const MEDIOS_COBRO = ["EFECTIVO", "TRANSFERENCIA", "MERCADO_PAGO"] as const;
export type MedioCobro = (typeof MEDIOS_COBRO)[number];
export const esMedioCobro = (v: unknown): v is MedioCobro => MEDIOS_COBRO.includes(v as MedioCobro);

/** Por qué el profe cancela (los chips de la hoja «Cancelar»). */
export const MOTIVOS_CANCEL = ["LLUVIA", "ENFERMEDAD", "CLUB_CERRADO", "ALUMNO_AVISO", "OTRO"] as const;
export type MotivoCancel = (typeof MOTIVOS_CANCEL)[number];
export const esMotivoCancel = (v: unknown): v is MotivoCancel => MOTIVOS_CANCEL.includes(v as MotivoCancel);

/** Lo que queda escrito en la clase (`motivoCancel`) y ve el profe. */
export const MOTIVO_CANCEL_LABEL: Record<MotivoCancel, string> = {
  LLUVIA: "Lluvia",
  ENFERMEDAD: "El profe se enfermó",
  CLUB_CERRADO: "Club cerrado",
  ALUMNO_AVISO: "El alumno avisó",
  OTRO: "La canceló el profe",
};

/** Cómo se dice en el WhatsApp «Se suspende por {motivo}…». */
const MOTIVO_EN_MENSAJE: Partial<Record<MotivoCancel, string>> = { LLUVIA: "lluvia", CLUB_CERRADO: "el club cerrado" };

/** Lluvia o club cerrado → «Se suspende…» (no es que el profe no pueda); el resto → «No puedo…». */
export function plantillaDeCancelacion(motivo: MotivoCancel): { clave: "suspendida" | "rechazada"; motivo: string } {
  const m = MOTIVO_EN_MENSAJE[motivo];
  return m ? { clave: "suspendida", motivo: m } : { clave: "rechazada", motivo: "" };
}

/** Por qué el profe devuelve un comprobante (chips de la bandeja). */
export const MOTIVOS_COMPROBANTE = ["MONTO", "NO_SE_VE", "OTRA_CUENTA", "OTRO"] as const;
export type MotivoComprobante = (typeof MOTIVOS_COMPROBANTE)[number];
export const esMotivoComprobante = (v: unknown): v is MotivoComprobante => MOTIVOS_COMPROBANTE.includes(v as MotivoComprobante);
/** Lo que ve el alumno en su link (`pagoNota`) y va en el WhatsApp. */
export const MOTIVO_COMPROBANTE_LABEL: Record<MotivoComprobante, string> = {
  MONTO: "El monto no coincide con el de la clase.",
  NO_SE_VE: "No se ve bien el comprobante.",
  OTRA_CUENTA: "La transferencia fue a otra cuenta.",
  OTRO: "No pude validar el comprobante.",
};

/** Duraciones que ofrece «Editar clase». */
export const DURACIONES = [60, 90, 120] as const;
export const duracionValida = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 30 && n <= 180;

/** "YYYY-MM-DD" + n días de calendario. */
export const sumarDias = (fecha: string, n: number): string =>
  new Date(new Date(`${fecha}T12:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** El lunes de la semana de esa fecha (Semana arranca siempre en lunes). */
export function semanaDesdeLunes(fecha: string): string {
  const dia = dayOfWeekForDate(fecha); // 0 = domingo
  return sumarDias(fecha, dia === 0 ? -6 : 1 - dia);
}

/** Los días de `desde` a `hasta` inclusive (como mucho `max`); vacío si están al revés. */
export function diasEntre(desde: string, hasta: string, max = 62): string[] {
  if (!fechaValida(desde) || !fechaValida(hasta) || hasta < desde) return [];
  const out: string[] = [];
  for (let f = desde; f <= hasta && out.length < max; f = sumarDias(f, 1)) out.push(f);
  return out;
}

/**
 * Los huecos del día para el PROFE: lo libre dentro de su grilla, sin anticipación mínima (la
 * anticipación es para el alumno; el profe agenda cuando quiere). Lo que ya empezó no es hueco.
 */
export function huecosDelDia(p: Omit<Parameters<typeof franjasLibres>[0], "anticipacionMin">): string[] {
  return franjasLibres({ ...p, anticipacionMin: 0 });
}

/** Las `n` horas libres más cercanas a `objetivo`, en orden de hora (para «¿Le ofrecés otro?»). */
export function masCercanas(libres: readonly string[], objetivo: Date, n = 3): string[] {
  const t = objetivo.getTime();
  return [...new Set(libres)]
    .filter((iso) => new Date(iso).getTime() !== t)
    .sort((a, b) => Math.abs(new Date(a).getTime() - t) - Math.abs(new Date(b).getTime() - t) || a.localeCompare(b))
    .slice(0, Math.max(0, n))
    .sort();
}

/**
 * «Se suspende → Moverlas» (M-037): a cada clase afectada, en orden de hora, el primer hueco libre
 * que viene después de ella (cada hueco se usa una sola vez). Sin hueco → `propuesta: null` (se
 * cancela o se mueve a mano).
 */
export function proponerMovidas(
  afectadas: readonly { id: string; empiezaEn: Date }[],
  libres: readonly string[],
): { claseId: string; desde: string; propuesta: string | null }[] {
  const disponibles = [...new Set(libres)].sort();
  const usadas = new Set<string>();
  return [...afectadas]
    .sort((a, b) => a.empiezaEn.getTime() - b.empiezaEn.getTime())
    .map((c) => {
      const propuesta = disponibles.find((iso) => !usadas.has(iso) && new Date(iso).getTime() > c.empiezaEn.getTime()) ?? null;
      if (propuesta) usadas.add(propuesta);
      return { claseId: c.id, desde: c.empiezaEn.toISOString(), propuesta };
    });
}

/** "jue 23/10 20:00" para ofrecer horarios en un WhatsApp corto. */
export function diaHoraCorta(d: Date): string {
  const dia = d.toLocaleDateString("es-AR", { weekday: "short", timeZone: ZONA }).replace(".", "");
  const fecha = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: ZONA });
  return `${dia} ${fecha} ${horaHumana(d)}`;
}

/** El turnero abierto en esa hora («Tocá y lo pedís»). */
export const linkTurneroEnHora = (turnero: string, iso: string): string => `${turnero}?hora=${encodeURIComponent(iso)}`;

/**
 * «¿Te sirve jue 23/10 20:00 o vie 24/10 19:00?» con el link del turnero en cada hora (M-043).
 * Sin alternativas → "" (el mensaje ya trae el turnero).
 */
export function textoAlternativas(isos: readonly string[], turnero: string): string {
  const validas = isos.filter((i) => !Number.isNaN(new Date(i).getTime())).slice(0, 3);
  if (!validas.length) return "";
  const horas = validas.map((i) => diaHoraCorta(new Date(i)));
  const pregunta = horas.length === 1 ? horas[0] : `${horas.slice(0, -1).join(", ")} o ${horas[horas.length - 1]}`;
  const links = validas.map((i, k) => `${horas[k]}: ${linkTurneroEnHora(turnero, i)}`).join(" · ");
  return `¿Te sirve ${pregunta}? Tocá el que quieras y lo pedís: ${links}`;
}

/** El detalle de lo que debe, para «Recordarle» (M-074): «jue 16/10 18:00 ($ 25.000), …». */
export function detalleDeuda(clases: readonly (ClaseConPago & { empiezaEn: Date })[]): { detalle: string; total: number; cantidad: number } {
  const deudas = clases.filter(esDeuda).sort((a, b) => a.empiezaEn.getTime() - b.empiezaEn.getTime());
  return {
    detalle: deudas.map((c) => `${diaHoraCorta(c.empiezaEn)} (${pesos(restoDeLaClase(c))})`).join(", "),
    total: totalDeuda(deudas),
    cantidad: deudas.length,
  };
}

/** Mensaje libre del alumno a la bandeja: 2 a 500 caracteres, sin caracteres de control. */
export function textoMensajeValido(raw: unknown): string | null {
  const t = String(raw ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim();
  return t.length >= 2 && t.length <= 500 ? t : null;
}

// ── .ics («Agregar al calendario»), sin dependencias ──────────────────────

// RFC 5545 §3.3.11: `\\`, `;`, `,` y el salto de línea se escapan con barra. (O-1 de la CERT T2+T3:
// el `"\;"` de antes en JS es `";"` pelado, así que el punto y coma no se escapaba.)
export const escaparIcs = (t: string): string => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** "20261023T190000" en la hora de pared de Buenos Aires (UTC−3 todo el año: Argentina no tiene horario de verano). */
function paredBsAs(d: Date): string {
  const p = new Date(d.getTime() - 3 * 3_600_000).toISOString(); // pared = UTC − 3 h
  return `${p.slice(0, 4)}${p.slice(5, 7)}${p.slice(8, 10)}T${p.slice(11, 13)}${p.slice(14, 16)}${p.slice(17, 19)}`;
}
const utcIcs = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Un evento de calendario (RFC 5545) con TZID America/Argentina/Buenos_Aires y su VTIMEZONE fijo
 * (−03:00, sin horario de verano). Líneas con CRLF, como pide la norma.
 */
export function armarIcs(p: { uid: string; empiezaEn: Date; terminaEn: Date; titulo: string; descripcion?: string; lugar?: string; ahora?: Date }): string {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gestion Studio Grow//Clases de padel//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${ZONA}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:-03",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${p.uid.replace(/[^A-Za-z0-9@._-]/g, "")}`,
    `DTSTAMP:${utcIcs(p.ahora ?? new Date())}`,
    `DTSTART;TZID=${ZONA}:${paredBsAs(p.empiezaEn)}`,
    `DTEND;TZID=${ZONA}:${paredBsAs(p.terminaEn)}`,
    `SUMMARY:${escaparIcs(p.titulo)}`,
    ...(p.descripcion ? [`DESCRIPTION:${escaparIcs(p.descripcion)}`] : []),
    ...(p.lugar ? [`LOCATION:${escaparIcs(p.lugar)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lineas.join("\r\n") + "\r\n";
}

// ════════════════════════════════════════════════════════════════════════════
// Tanda 4 — el modelo: clubes, turnos fijos, paquetes, grupales, traslados, plata con el club.
// Todo puro: las acciones (acciones-modelo.ts) y las lecturas (datos-modelo.server.ts) lo usan.
// ════════════════════════════════════════════════════════════════════════════

// ── Clubes y lo que se le paga al club ──────────────────────────────────────

/** Cómo le cobra el club al profe la cancha. Texto en la base, con esta lista blanca. */
export const MODOS_COBRO_CLUB = ["por-hora", "por-clase", "mensual"] as const;
export type ModoCobroClub = (typeof MODOS_COBRO_CLUB)[number];
export const esModoCobroClub = (v: unknown): v is ModoCobroClub => MODOS_COBRO_CLUB.includes(v as ModoCobroClub);
export const MODO_COBRO_CLUB_LABEL: Record<ModoCobroClub, string> = {
  "por-hora": "Por hora de cancha",
  "por-clase": "Por clase",
  mensual: "Abono mensual",
};

/** Lo que el profe sabe de un club para la plata y los traslados. */
export interface ClubBase {
  id: string;
  nombre: string;
  trasladoMin: number;
  costoCancha: number | null;
  modoCobroClub: string | null;
}

/**
 * Lo que le cuesta al profe UNA clase en ese club (se congela en `PadelClase.costoCancha` al agendar):
 * por hora → costo × duración / 60; por clase → el costo; abono mensual → 0 (ya está pago en el mes).
 * null = no se sabe (sin club, sin costo cargado o sin modo).
 */
export function costoDeLaClase(club: Pick<ClubBase, "costoCancha" | "modoCobroClub"> | null | undefined, duracionMin: number): number | null {
  if (!club || club.costoCancha == null || !esModoCobroClub(club.modoCobroClub)) return null;
  const costo = Number(club.costoCancha);
  if (!(costo >= 0)) return null;
  if (club.modoCobroClub === "mensual") return 0;
  if (club.modoCobroClub === "por-clase") return redondearAlCentavo(costo);
  return redondearAlCentavo((costo * Math.max(0, duracionMin)) / 60);
}

/**
 * El margen de una clase: lo que cobra el profe menos lo que paga de cancha. En una grupal con
 * participantes, lo que cobra es la suma de las partes. `costoConocido` = el costo estaba cargado
 * (si no, el margen es el ingreso entero y la pantalla tiene que decir «sin costo de cancha»).
 */
export function margenDeLaClase(c: { precio: number | { toString(): string }; costoCancha?: number | { toString(): string } | null; participantes?: readonly { precio: number | { toString(): string } }[] }): {
  ingreso: number;
  costo: number;
  margen: number;
  costoConocido: boolean;
} {
  const ingreso = c.participantes?.length ? redondearAlCentavo(c.participantes.reduce((s, p) => s + Number(p.precio), 0)) : redondearAlCentavo(Number(c.precio));
  const costoConocido = c.costoCancha != null;
  const costo = costoConocido ? redondearAlCentavo(Number(c.costoCancha)) : 0;
  return { ingreso, costo, margen: redondearAlCentavo(ingreso - costo), costoConocido };
}

/** Las clases que usaron la cancha (se le pagan al club): las dadas y las que el alumno faltó. */
export const ESTADOS_QUE_USAN_CANCHA: readonly EstadoClase[] = ["DADA", "AUSENTE"];

/** Cuántos meses calendario (en la hora del negocio) toca el período [desde, hasta). */
function mesesDelPeriodo(desde: Date, hasta: Date): number {
  const mes = (d: Date) => {
    const p = new Date(d.getTime() - 3 * 3_600_000); // pared de Buenos Aires (UTC−3, sin horario de verano)
    return p.getUTCFullYear() * 12 + p.getUTCMonth();
  };
  if (hasta.getTime() <= desde.getTime()) return 0;
  return mes(new Date(hasta.getTime() - 1)) - mes(desde) + 1;
}

/**
 * «Cuenta con el club»: lo que el profe le debe a ESE club en el período [desde, hasta).
 *  · por hora / por clase: la suma del costo congelado de cada clase que usó la cancha (si una no lo
 *    tiene, se calcula con el costo de hoy del club);
 *  · abono mensual: el abono × los meses que toca el período (no depende de cuántas clases dio).
 * `sinCosto`: el club no tiene costo o modo cargado (el total es 0 y la pantalla lo dice).
 */
export function cuentaConElClub(
  club: ClubBase,
  clases: readonly { clubId: string | null; estado: string; empiezaEn: Date; terminaEn: Date; costoCancha?: number | { toString(): string } | null }[],
  periodo: { desde: Date; hasta: Date },
): { clubId: string; nombre: string; modo: ModoCobroClub | null; clases: number; horas: number; total: number; sinCosto: boolean } {
  const usadas = clases.filter(
    (c) => c.clubId === club.id && ESTADOS_QUE_USAN_CANCHA.includes(c.estado as EstadoClase) && c.empiezaEn >= periodo.desde && c.empiezaEn < periodo.hasta,
  );
  const minutos = usadas.reduce((s, c) => s + Math.max(0, (c.terminaEn.getTime() - c.empiezaEn.getTime()) / 60_000), 0);
  const modo = esModoCobroClub(club.modoCobroClub) ? club.modoCobroClub : null;
  const sinCosto = club.costoCancha == null || !modo;
  let total = 0;
  if (!sinCosto) {
    if (modo === "mensual") total = Number(club.costoCancha) * mesesDelPeriodo(periodo.desde, periodo.hasta);
    else {
      total = usadas.reduce((s, c) => {
        const congelado = c.costoCancha != null ? Number(c.costoCancha) : costoDeLaClase(club, (c.terminaEn.getTime() - c.empiezaEn.getTime()) / 60_000) ?? 0;
        return s + congelado;
      }, 0);
    }
  }
  return { clubId: club.id, nombre: club.nombre, modo, clases: usadas.length, horas: redondearAlCentavo(minutos / 60), total: redondearAlCentavo(total), sinCosto };
}

// ── Traslados entre clubes ──────────────────────────────────────────────────

/**
 * Cuánto tarda el profe en ir de un club a otro: lo que dice el club de destino o, si no dice, el
 * de fábrica del profe. Mismo club, o una de las dos sin club: 0 (no hay viaje que saber).
 */
export function trasladoEntre(origen: Pick<ClubBase, "id" | "trasladoMin"> | null | undefined, destino: Pick<ClubBase, "id" | "trasladoMin"> | null | undefined, porDefecto = 0): number {
  if (!origen || !destino || origen.id === destino.id) return 0;
  return Math.max(0, destino.trasladoMin > 0 ? destino.trasladoMin : porDefecto);
}

/**
 * ¿Llega de la clase anterior (en su club) a la siguiente (en el suyo)? Termina + traslado ≤ empieza.
 * `faltanMin` > 0 = los minutos que le faltan.
 */
export function llegaATiempo(
  anterior: { terminaEn: Date; club: Pick<ClubBase, "id" | "trasladoMin"> | null },
  siguiente: { empiezaEn: Date; club: Pick<ClubBase, "id" | "trasladoMin"> | null },
  trasladoPorDefecto = 0,
): { llega: boolean; trasladoMin: number; faltanMin: number } {
  const trasladoMin = trasladoEntre(anterior.club, siguiente.club, trasladoPorDefecto);
  const llegaEn = anterior.terminaEn.getTime() + trasladoMin * 60_000;
  const faltanMin = Math.max(0, Math.ceil((llegaEn - siguiente.empiezaEn.getTime()) / 60_000));
  return { llega: faltanMin === 0, trasladoMin, faltanMin };
}

/**
 * M-123: ¿la clase nueva (en su club) choca por traslado con alguna del mismo día en otro club? La
 * primera que no llega, con el texto para el profe: «No llegás: Club Sur queda a 30 min».
 */
export function choqueDeTraslado(
  nueva: { empiezaEn: Date; terminaEn: Date; club: ClubBase | null },
  vecinas: readonly { id?: string; empiezaEn: Date; terminaEn: Date; club: ClubBase | null }[],
  trasladoPorDefecto = 0,
): { claseId: string | null; mensaje: string; faltanMin: number } | null {
  const orden = [...vecinas].sort((a, b) => a.empiezaEn.getTime() - b.empiezaEn.getTime());
  for (const v of orden) {
    if (v.terminaEn.getTime() <= nueva.empiezaEn.getTime()) {
      const r = llegaATiempo(v, nueva, trasladoPorDefecto);
      if (!r.llega) return { claseId: v.id ?? null, mensaje: `No llegás: ${nueva.club?.nombre ?? "el club"} queda a ${r.trasladoMin} min`, faltanMin: r.faltanMin };
    } else if (v.empiezaEn.getTime() >= nueva.terminaEn.getTime()) {
      const r = llegaATiempo(nueva, v, trasladoPorDefecto);
      if (!r.llega) return { claseId: v.id ?? null, mensaje: `No llegás a la de las ${horaHumana(v.empiezaEn)}: ${v.club?.nombre ?? "el club"} queda a ${r.trasladoMin} min`, faltanMin: r.faltanMin };
    }
  }
  return null;
}

// ── Turnos fijos (series) ───────────────────────────────────────────────────

export interface SerieBase {
  id: string;
  diaSemana: number;
  hora: string;
  duracionMin: number;
  /** "YYYY-MM-DD" */
  desde: string;
  hasta: string | null;
  pausadaDesde: string | null;
  pausadaHasta: string | null;
  activa: boolean;
}

export interface Ocurrencia {
  serieId: string;
  /** La fecha (AR) de esa semana: la clave para no generar dos veces. */
  fecha: string;
  empiezaEn: Date;
  terminaEn: Date;
}

/** La clave de una ocurrencia ya generada (`PadelClase.serieId` + `serieFecha`). */
export const claveOcurrencia = (serieId: string, fecha: string): string => `${serieId}|${fecha}`;

/** ¿La fecha cae en la pausa de la serie? Sin `pausadaHasta` no hay pausa; sin `pausadaDesde`, arranca ya. */
export function serieEnPausa(s: Pick<SerieBase, "pausadaDesde" | "pausadaHasta">, fecha: string): boolean {
  if (!s.pausadaHasta) return false;
  return fecha <= s.pausadaHasta && (!s.pausadaDesde || fecha >= s.pausadaDesde);
}

/**
 * Las clases de una serie entre `desde` y `hasta` (inclusive, "YYYY-MM-DD"): el día de la semana de la
 * serie, dentro de su vigencia, sin la pausa de la serie ni las `pausas` extra. Una serie inactiva o
 * con la hora mal cargada no da nada.
 */
export function expandirSerie(serie: SerieBase, desde: string, hasta: string, pausas: readonly { desde: string; hasta: string }[] = []): Ocurrencia[] {
  if (!serie.activa || !horaValida(serie.hora) || !fechaValida(desde) || !fechaValida(hasta)) return [];
  const ini = serie.desde > desde ? serie.desde : desde;
  const fin = serie.hasta && serie.hasta < hasta ? serie.hasta : hasta;
  const out: Ocurrencia[] = [];
  for (const fecha of diasEntre(ini, fin, 400)) {
    if (dayOfWeekForDate(fecha) !== serie.diaSemana) continue;
    if (serieEnPausa(serie, fecha) || pausas.some((p) => fecha >= p.desde && fecha <= p.hasta)) continue;
    const empiezaEn = businessWallTimeToUtc(fecha, serie.hora);
    out.push({ serieId: serie.id, fecha, empiezaEn, terminaEn: new Date(empiezaEn.getTime() + Math.max(1, serie.duracionMin) * 60_000) });
  }
  return out;
}

/**
 * M-116: lo que las series activas tienen reservado en [desde, hasta] y todavía NO es una clase (si ya
 * se generó, la clase misma ocupa o —cancelada esa semana— libera). Va como ocupado al turnero.
 */
export function reservasDeSeries(series: readonly SerieBase[], desde: string, hasta: string, generadas: ReadonlySet<string> = new Set()): Interval[] {
  return series.flatMap((s) =>
    expandirSerie(s, desde, hasta)
      .filter((o) => !generadas.has(claveOcurrencia(o.serieId, o.fecha)))
      .map((o) => ({ startsAt: o.empiezaEn, endsAt: o.terminaEn })),
  );
}

/** Las franjas libres de un día descontando además lo que reservan los turnos fijos (M-116). */
export function franjasLibresConSeries(p: Parameters<typeof franjasLibres>[0] & { series: readonly SerieBase[]; generadas?: ReadonlySet<string> }): string[] {
  const reservadas = reservasDeSeries(p.series, p.fecha, p.fecha, p.generadas);
  return franjasLibres({ ...p, ocupadas: [...p.ocupadas, ...reservadas] });
}

/** generarSemana (M-117): las ocurrencias de la semana que todavía no son clase. */
export function ocurrenciasAGenerar(series: readonly SerieBase[], desde: string, hasta: string, generadas: ReadonlySet<string>): Ocurrencia[] {
  return series
    .flatMap((s) => expandirSerie(s, desde, hasta))
    .filter((o) => !generadas.has(claveOcurrencia(o.serieId, o.fecha)))
    .sort((a, b) => a.empiezaEn.getTime() - b.empiezaEn.getTime());
}

/** "mar 19" (o "mar 19:30") para listar la semana en un WhatsApp corto. */
export function diaYHoraCorta(d: Date): string {
  const dia = d.toLocaleDateString("es-AR", { weekday: "short", timeZone: ZONA }).replace(".", "");
  const h = horaHumana(d);
  return `${dia} ${h.endsWith(":00") ? String(Number(h.slice(0, 2))) : h}`;
}

/** «mar 19 y jue 19» (M-117): las clases de la semana de un alumno, en una línea. */
export function textoSemana(clases: readonly { empiezaEn: Date }[]): string {
  const t = [...clases].sort((a, b) => a.empiezaEn.getTime() - b.empiezaEn.getTime()).map((c) => diaYHoraCorta(c.empiezaEn));
  return t.length <= 1 ? (t[0] ?? "") : `${t.slice(0, -1).join(", ")} y ${t[t.length - 1]}`;
}

// ── Paquetes ────────────────────────────────────────────────────────────────

export interface PaqueteVendido {
  clasesTotal: number;
  clasesUsadas: number;
  venceEl: Date;
  extendidoHasta?: Date | null;
}

/** Hasta cuándo sirve: la extensión, si la hubo. */
export const venceDelPaquete = (p: Pick<PaqueteVendido, "venceEl" | "extendidoHasta">): Date => p.extendidoHasta ?? p.venceEl;

/** Cuántas le quedan, si venció y si le sirve todavía. */
export function estadoPaquete(p: PaqueteVendido, ahora: Date): { quedan: number; vencido: boolean; vigente: boolean; ultima: boolean } {
  const quedan = Math.max(0, p.clasesTotal - p.clasesUsadas);
  const vencido = venceDelPaquete(p).getTime() < ahora.getTime();
  return { quedan, vencido, vigente: quedan > 0 && !vencido, ultima: quedan === 1 && !vencido };
}

/**
 * Dar una clase con el paquete (M-118/M-119): usa una. Vencido o sin clases → no descuenta (la
 * clase se cobra como siempre). Al usar la última → `ofrecerRenovar`.
 */
export function descontarPaquete(p: PaqueteVendido, ahora: Date): { ok: true; clasesUsadas: number; quedan: number; ofrecerRenovar: boolean } | { ok: false; motivo: "vencido" | "sin-clases" } {
  const e = estadoPaquete(p, ahora);
  if (e.quedan === 0) return { ok: false, motivo: "sin-clases" };
  if (e.vencido) return { ok: false, motivo: "vencido" };
  const quedan = e.quedan - 1;
  return { ok: true, clasesUsadas: p.clasesUsadas + 1, quedan, ofrecerRenovar: quedan === 0 };
}

/**
 * El precio de una clase con paquete: lo que vale UNA clase del paquete (para la plata y el margen),
 * pagada con «Paquete». Sin paquete vigente → el precio de lista, sin pagar.
 */
export function precioConPaquete(
  precioLista: number,
  paquete: (PaqueteVendido & { precio: number | { toString(): string } }) | null | undefined,
  ahora: Date,
): { precio: number; conPaquete: boolean } {
  if (!paquete || !estadoPaquete(paquete, ahora).vigente || !(paquete.clasesTotal > 0)) return { precio: redondearAlCentavo(precioLista), conPaquete: false };
  return { precio: redondearAlCentavo(Number(paquete.precio) / paquete.clasesTotal), conPaquete: true };
}

/** «4 de 4 · vence 22/11» / «1 clase vencida» (ficha y link del alumno). */
export function textoPaquete(p: PaqueteVendido, ahora: Date): string {
  const e = estadoPaquete(p, ahora);
  const vence = venceDelPaquete(p).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: ZONA });
  if (e.vencido && e.quedan > 0) return `${e.quedan} clase${e.quedan === 1 ? "" : "s"} vencida${e.quedan === 1 ? "" : "s"}`;
  if (e.quedan === 0) return "Sin clases";
  return `${e.quedan} de ${p.clasesTotal} · vence ${vence}`;
}

/** Validación de un paquete del profe: nombre, clases (1–50), precio (> 0) y vencimiento (1–365 días). */
export function paqueteValido(p: { nombre: unknown; clases: unknown; precio: unknown; venceDias: unknown }): { nombre: string; clases: number; precio: number; venceDias: number } | string {
  const nombre = String(p.nombre ?? "").replace(/\s+/g, " ").trim();
  if (nombre.length < 2 || nombre.length > 40) return "Poné un nombre corto, por ejemplo «Pack 4».";
  const clases = Number(p.clases);
  if (!Number.isInteger(clases) || clases < 1 || clases > 50) return "¿Cuántas clases trae? Entre 1 y 50.";
  const precio = Number(p.precio);
  if (!Number.isFinite(precio) || precio <= 0 || precio > 100_000_000) return "Poné el precio del paquete.";
  const venceDias = Number(p.venceDias);
  if (!Number.isInteger(venceDias) || venceDias < 1 || venceDias > 365) return "¿En cuántos días vence? Entre 1 y 365.";
  return { nombre, clases, precio: redondearAlCentavo(precio), venceDias };
}

// ── Grupales con participantes ─────────────────────────────────────────────

/** M-120: cada persona con su parte (el mismo precio por persona). */
export function repartirGrupal<P extends object>(precioPersona: number, participantes: readonly P[]): { participantes: (P & { precio: number })[]; total: number } {
  const precio = redondearAlCentavo(Math.max(0, precioPersona));
  return { participantes: participantes.map((p) => ({ ...p, precio })), total: redondearAlCentavo(precio * participantes.length) };
}

export interface ParticipanteBase {
  id?: string;
  alumnoId?: string | null;
  nombre?: string | null;
  precio: number | { toString(): string };
  pagoEstado: string;
}

/** Un lugar está tomado si tiene alumno o al menos un nombre; «lugar libre» (sin nada) no. */
export const lugarTomado = (p: Pick<ParticipanteBase, "alumnoId" | "nombre">): boolean => Boolean(p.alumnoId || (p.nombre && p.nombre.trim()));

/** M-122: cuántos lugares quedan en una grupal abierta (cupo − tomados). Sin cupo → 0. */
export const lugaresLibres = (cupo: number | null | undefined, participantes: readonly Pick<ParticipanteBase, "alumnoId" | "nombre">[]): number =>
  Math.max(0, (cupo ?? 0) - participantes.filter(lugarTomado).length);

const PAGO_PARTICIPANTE_RESUELTO = ["PAGADO", "ACREDITADO", "DEVUELTO"];

/** ¿Este participante debe su parte? (con precio, sin pagar y sin comprobante esperando). */
export const participanteDebe = (p: ParticipanteBase): boolean =>
  Number(p.precio) > 0 && p.pagoEstado !== "EN_REVISION" && !PAGO_PARTICIPANTE_RESUELTO.includes(p.pagoEstado);

/** M-121: «1 de 3 pagaron», quién debe y cuánto (cada uno SU parte, nunca el total a uno solo). */
export function resumenCobroGrupal<P extends ParticipanteBase>(participantes: readonly P[]): { pagaron: number; total: number; texto: string; deben: P[]; totalDeuda: number } {
  const conLugar = participantes.filter(lugarTomado);
  const pagaron = conLugar.filter((p) => p.pagoEstado === "PAGADO").length;
  const deben = conLugar.filter(participanteDebe);
  return {
    pagaron,
    total: conLugar.length,
    texto: `${pagaron} de ${conLugar.length} pagaron`,
    deben,
    totalDeuda: redondearAlCentavo(deben.reduce((s, p) => s + Number(p.precio), 0)),
  };
}

// ── Reglas del profe (PadelConfig, T4) ─────────────────────────────────────

/** Las reglas nuevas, con sus valores de fábrica (los mismos que la columna; sin la migración, éstos). */
export interface ReglasPadel {
  ausenteSeCobra: boolean;
  tardiaSeCobra: boolean;
  confirmarConocidos: boolean;
  cierreAutoHoras: number;
  recordatorioHora: string | null;
  trasladoMinDefault: number;
}

export const REGLAS_DE_FABRICA: ReglasPadel = {
  ausenteSeCobra: false,
  tardiaSeCobra: false,
  confirmarConocidos: true,
  cierreAutoHoras: 0,
  recordatorioHora: null,
  trasladoMinDefault: 0,
};

/** ¿La clase que pide un alumno conocido nace confirmada? Sólo si el profe no pidió confirmar a todos (M-142). */
export const naceConfirmada = (clasesDadas: number, confirmarConocidos = true): boolean => confirmarConocidos && repetidaNaceConfirmada(clasesDadas);

/**
 * Pago parcial (M-124): suma `monto` a lo ya pagado. Si completa la clase → PAGADO. Un monto que pasa
 * lo que falta no entra (el profe lo corrige). Devuelve el error en criollo o el nuevo estado.
 */
export function aplicarPagoParcial(
  c: { precio: number | { toString(): string }; pagado?: number | { toString(): string } | null },
  monto: number,
): { pagado: number; resto: number; completa: boolean } | { error: string } {
  const m = redondearAlCentavo(Number(monto));
  if (!Number.isFinite(m) || m <= 0) return { error: "Poné cuánto te pagó." };
  const resto = restoDeLaClase(c);
  if (resto <= 0) return { error: "Esa clase ya está paga." };
  if (m > resto) return { error: `Es más de lo que falta: debe ${pesos(resto)}.` };
  const pagado = redondearAlCentavo(Number(c.pagado ?? 0) + m);
  return { pagado, resto: redondearAlCentavo(resto - m), completa: redondearAlCentavo(resto - m) === 0 };
}

/** «debe $ 5.000» de una clase con pago parcial (M-124), o null si no debe nada. */
export function textoResto(c: ClaseConPago): string | null {
  const r = restoDeLaClase(c);
  return esDeuda(c) && r > 0 ? `debe ${pesos(r)}` : null;
}

/** Validación de un club del profe. */
export function clubValido(p: { nombre: unknown; direccion?: unknown; mapsUrl?: unknown; trasladoMin?: unknown; costoCancha?: unknown; modoCobroClub?: unknown; techada?: unknown }):
  | { nombre: string; direccion: string | null; mapsUrl: string | null; trasladoMin: number; costoCancha: number | null; modoCobroClub: ModoCobroClub | null; techada: boolean }
  | string {
  const nombre = String(p.nombre ?? "").replace(/\s+/g, " ").trim();
  if (nombre.length < 2 || nombre.length > 60) return "Poné el nombre del club.";
  const direccion = String(p.direccion ?? "").replace(/\s+/g, " ").trim().slice(0, 160) || null;
  const mapsRaw = String(p.mapsUrl ?? "").trim();
  if (mapsRaw && !/^https:\/\/[^\s]{4,400}$/.test(mapsRaw)) return "El link de Maps tiene que empezar con https://";
  const trasladoMin = p.trasladoMin == null || p.trasladoMin === "" ? 0 : Number(p.trasladoMin);
  if (!Number.isInteger(trasladoMin) || trasladoMin < 0 || trasladoMin > 240) return "El traslado va en minutos, de 0 a 240.";
  const costoRaw = p.costoCancha;
  const costoCancha = costoRaw == null || costoRaw === "" ? null : Number(costoRaw);
  if (costoCancha !== null && (!Number.isFinite(costoCancha) || costoCancha < 0 || costoCancha > 100_000_000)) return "Poné lo que te cobra el club (o dejalo vacío).";
  const modo = p.modoCobroClub == null || p.modoCobroClub === "" ? null : p.modoCobroClub;
  if (modo !== null && !esModoCobroClub(modo)) return "Elegí cómo te cobra el club: por hora, por clase o mensual.";
  if (costoCancha !== null && modo === null) return "Elegí cómo te cobra el club: por hora, por clase o mensual.";
  return { nombre, direccion, mapsUrl: mapsRaw || null, trasladoMin, costoCancha: costoCancha === null ? null : redondearAlCentavo(costoCancha), modoCobroClub: modo, techada: p.techada === true };
}
