// ============================================================================
// LA AGENDA DEL DÍA («Renglón») — lo que se decide sin DOM ni base. PURO, client-safe.
// ============================================================================
//
// La recepcionista de CH trabaja parada, con el teléfono en una mano: abre la agenda para saber
// QUIÉN SIGUE y QUÉ LE FALTA a cada turno. Esta agenda es el libro de turnos del salón: un renglón
// por turno, la hora en el folio, la clienta y el servicio en el medio, la plata en su columna y
// UNA tecla, la del paso que sigue (Confirmar · Cobrar la seña · Terminar · Cobrar el saldo). Lo
// demás (reprogramar, cancelar, no vino, anular un cobro) vive en el cajón del turno.
//
// Acá se decide, con reloj fijo y sin pantalla (agenda-core.test.ts):
//   · el renglón de cada turno (la plata con las MISMAS reglas que la fila de siempre:
//     `estadoCobroTurno`, `cobroSugerido`, `esCuentaACobrar`, `desglosarCobros`);
//   · la tecla del paso que sigue, según el estado, la hora y lo que la persona PUEDE hacer (las
//     capacidades y el veredicto de cobro los calcula el servidor con la misma función que aplica
//     al cobrar: la pantalla nunca ofrece algo que después se rechaza);
//   · la marca de estado (forma + palabra) y la línea de estado de la pantalla;
//   · dónde va la raya de «ahora» (el riesgo de esta pantalla: una línea con la hora que parte el
//     día entre lo que pasó y lo que viene, como la cinta que marca la página en el libro).
//
// No decide nada de plata: sólo la LEE con las funciones de src/lib/turnos. Nada de Prisma.

import { estadoCobroTurno, cobroSugerido, esCuentaACobrar, seniaDelServicio, type PagoLegado } from "@/lib/turnos/cobros";
import { desglosarCobros } from "@/lib/turnos/anulacion";
import type { CierreSinPrestar, DestinoDeLaSenia } from "@/lib/turnos/practica";
import type { TipoMarca } from "@/components/ui/Marca";
import { dateStrInBusinessTz, fmtShortDate, fmtTime } from "@/lib/datetime";

export type EstadoDelTurno = "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

export type CobroDelTurno = { id?: string; amount: number; method: string; note?: string | null; createdAt?: string };

export type Veredicto = { ok: true } | { ok: false; motivo: string };

/** Un turno tal como cruza al navegador: sólo lo que la agenda muestra (ni un campo de más). */
export type TurnoDelDia = {
  id: string;
  clienteId: string;
  /** ISO del inicio y del fin. */
  inicio: string;
  fin: string;
  estado: EstadoDelTurno;
  clienta: string;
  telefono: string;
  servicio: string;
  profesional: string;
  profesionalId: string;
  /** El servicio (para reprogramar: las franjas libres son por servicio). */
  servicioId: string;
  box: string;
  notas: string | null;
  /** Precio congelado al reservar (o el del servicio si el turno es anterior a eso). */
  precio: number;
  /** Plata que entró de verdad (sin las condonaciones). */
  cobrado: number;
  /** Saldo dado de baja (no es plata que entró). */
  condonado: number;
  saldo: number;
  senia: number;
  sugerido: { tipo: "senia" | "saldo"; monto: number };
  cuentaACobrar: boolean;
  cobros: CobroDelTurno[];
  /** Cuándo se le mandó el recordatorio (a mano o por el sistema), si se mandó. */
  avisadaEl: string | null;
  /** ¿Quien mira puede cobrar ESTE turno? (la regla del servidor, `puedeCobrarEsteTurno`). */
  veredicto: Veredicto;
  /**
   * Cuándo se le pidió la seña por WhatsApp (la marca «seña pedida», `seniasPedidas`: AuditLog, sin
   * migración). Ausente o null: no se pidió (o la agenda no la leyó).
   */
  seniaPedidaEl?: string | null;
};

/** Lo mínimo que la agenda lee de un turno crudo (el loader de siempre, ya con sus cobros). */
export type TurnoCrudo = {
  id: string;
  clientId: string;
  startsAt: Date | string;
  endsAt: Date | string;
  status: string;
  notes: string | null;
  priceAtBooking: number | null;
  reminderSentAt?: Date | string | null;
  professionalId: string;
  serviceId: string;
  client: { name: string; phone: string };
  service: { name: string; price: number; depositAmount?: number | null };
  professional: { name: string };
  box: { name: string } | null;
  payment: { status?: string; amount?: number } | null;
  collections?: readonly { id?: string; amount: number; method: string; note?: string | null; createdAt?: Date | string }[];
};

const ESTADOS: readonly EstadoDelTurno[] = ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"];
const iso = (d: Date | string) => (typeof d === "string" ? new Date(d).toISOString() : d.toISOString());

/**
 * El renglón de un turno. La plata sale de las MISMAS funciones que la fila de siempre
 * (AppointmentRow): precio congelado, cobrado real y condonado por separado, saldo derivado.
 */
export function turnoDelDia(a: TurnoCrudo, veredicto: Veredicto): TurnoDelDia {
  const precio = a.priceAtBooking ?? a.service.price;
  const cobros = (a.collections ?? []).map((c) => ({
    id: c.id,
    amount: c.amount,
    method: c.method,
    note: c.note ?? null,
    createdAt: c.createdAt ? iso(c.createdAt) : undefined,
  }));
  const pagoLegado: PagoLegado =
    a.payment && a.payment.amount != null && a.payment.status ? { status: a.payment.status, amount: a.payment.amount } : null;
  const plata = estadoCobroTurno({ precio, cobros, pagoLegado });
  const desglose = desglosarCobros(cobros);
  const estado = (ESTADOS as readonly string[]).includes(a.status) ? (a.status as EstadoDelTurno) : "PENDING";
  return {
    id: a.id,
    clienteId: a.clientId,
    inicio: iso(a.startsAt),
    fin: iso(a.endsAt),
    estado,
    clienta: a.client.name,
    telefono: a.client.phone,
    servicio: a.service.name,
    profesional: a.professional.name,
    profesionalId: a.professionalId,
    servicioId: a.serviceId,
    box: a.box?.name ?? "",
    notas: a.notes,
    precio,
    // Con cobros propios, lo que entró es el desglose (una condonación no es plata); sin cobros,
    // manda el pago viejo, como en la fila de siempre.
    cobrado: cobros.length > 0 ? desglose.cobrado : plata.cobrado,
    condonado: desglose.condonado,
    saldo: plata.saldo,
    senia: seniaDelServicio({ depositAmount: a.service.depositAmount, precio }),
    sugerido: cobroSugerido({ status: estado, precio, depositAmount: a.service.depositAmount, cobros, pagoLegado }),
    cuentaACobrar: esCuentaACobrar({ status: estado, saldo: plata.saldo }),
    cobros,
    avisadaEl: a.reminderSentAt ? iso(a.reminderSentAt) : null,
    veredicto,
  };
}

/**
 * La seña que falta de un Reservado que todavía no llegó (CH-021/022): la que propone el cobro
 * (`cobroSugerido`: con seña en el catálogo y sin nada cobrado). 0 si no corresponde. Es lo que cobra
 * «Llegó la seña» y lo que pide «Recordar la seña».
 */
export function seniaQueFalta(t: Pick<TurnoDelDia, "estado" | "inicio" | "sugerido">, ahora: Date): number {
  if (t.estado !== "PENDING" || yaEmpezo(t, ahora)) return 0;
  return t.sugerido.tipo === "senia" && t.sugerido.monto > 0 ? t.sugerido.monto : 0;
}

/**
 * «seña pedida 14:03» (hoy) · «seña pedida el 20/10»: la marca del renglón y del cajón, sólo mientras
 * la seña siga faltando. `null` si no hay nada que decir.
 */
export function textoSeniaPedida(t: Pick<TurnoDelDia, "estado" | "inicio" | "sugerido" | "seniaPedidaEl">, ahora: Date): string | null {
  if (!t.seniaPedidaEl || seniaQueFalta(t, ahora) <= 0) return null;
  const cuando = new Date(t.seniaPedidaEl);
  if (Number.isNaN(cuando.getTime())) return null;
  return dateStrInBusinessTz(cuando) === dateStrInBusinessTz(ahora) ? `seña pedida ${fmtTime(cuando)}` : `seña pedida el ${fmtShortDate(cuando).slice(0, 5)}`;
}

/** Qué puede hacer quien mira (lo calcula el servidor con sus capacidades). */
export type Permisos = {
  /** agenda:manage — confirmar, cancelar, reprogramar, dar de baja un saldo. */
  gestionar: boolean;
  /** agenda:collect — cobrar (además, el veredicto de cada turno). */
  cobrar: boolean;
  /** agenda:complete — terminar y marcar que no vino. */
  terminar: boolean;
  /**
   * agenda:forgive — dar de baja un saldo (no es plata que entra: es plata que se deja de cobrar).
   * Sólo la dueña (D5 del diseño: la recepción tiene tope $0). Lo calcula el servidor.
   */
  perdonar: boolean;
};

export type Paso =
  | { tipo: "confirmar" }
  | { tipo: "cobrar-senia"; monto: number }
  | { tipo: "terminar"; saldo: number; conCobro: boolean }
  /**
   * Cobrar el saldo. Con `vino`, el turno es un Reservado al que ya se le pasó la hora: cobrar es
   * cerrarlo como «vino» y cobrar en la misma acción (`completeAppointment` con `vino=on`), sin
   * pasar antes por «Confirmar». Sin `vino`, es un terminado que quedó debiendo.
   */
  | { tipo: "cobrar"; monto: number; vino?: true }
  /** Un Reservado pasado que se cierra sin cobrar acá: no falta nada, o la profesional cobra aparte. */
  | { tipo: "vino"; saldo: number }
  | { tipo: "ninguno" };

/** ¿Ya empezó? Mismo borde que el servidor para dejar terminar un turno (`puedeCompletarse`). */
export function yaEmpezo(t: Pick<TurnoDelDia, "inicio">, ahora: Date): boolean {
  return new Date(t.inicio).getTime() <= ahora.getTime();
}

function cobraEste(t: TurnoDelDia, p: Permisos): boolean {
  return p.cobrar && t.veredicto.ok;
}

/**
 * La tecla del renglón: el paso que sigue, uno solo.
 *   · Reservado al que ya se le pasó la hora → Cobrar $X (o «Vino ✓» si no falta nada o quien
 *     mira no cobra ese turno): la clienta vino y nadie tocó «Confirmar». Pedirle a la recepción
 *     que confirme algo que ya pasó para recién después poder cobrarlo era la queja de CH.
 *   · Reservado que todavía no llegó → Confirmar (quien gestiona la agenda).
 *   · Confirmado que todavía no empezó → Cobrar la seña, si la tiene y no entró nada.
 *   · Confirmado que ya empezó → Terminar (con el cobro del saldo si falta y quien mira cobra).
 *   · Terminado con saldo → Cobrar el saldo.
 *   · Lo demás (no vino, terminado y cobrado, sin permiso) → ninguna: el renglón abre el cajón.
 */
export function pasoDelTurno(t: TurnoDelDia, p: Permisos, ahora: Date): Paso {
  switch (t.estado) {
    case "PENDING":
      if (yaEmpezo(t, ahora) && p.terminar) {
        return t.saldo > 0 && cobraEste(t, p) ? { tipo: "cobrar", monto: t.saldo, vino: true } : { tipo: "vino", saldo: t.saldo };
      }
      return p.gestionar ? { tipo: "confirmar" } : { tipo: "ninguno" };
    case "CONFIRMED":
      if (yaEmpezo(t, ahora)) {
        if (!p.terminar) return { tipo: "ninguno" };
        return { tipo: "terminar", saldo: t.saldo, conCobro: t.saldo > 0 && cobraEste(t, p) };
      }
      if (t.sugerido.tipo === "senia" && t.sugerido.monto > 0 && cobraEste(t, p)) {
        return { tipo: "cobrar-senia", monto: t.sugerido.monto };
      }
      return { tipo: "ninguno" };
    case "COMPLETED":
      return t.cuentaACobrar && cobraEste(t, p) ? { tipo: "cobrar", monto: t.saldo } : { tipo: "ninguno" };
    default:
      return { tipo: "ninguno" };
  }
}

/** La palabra de la tecla («Cobrar $22.000» la arma la pantalla con la pieza de plata). */
export function verboDelPaso(p: Paso): string | null {
  switch (p.tipo) {
    case "confirmar":
      return "Confirmar";
    case "cobrar-senia":
      return "Cobrar la seña";
    case "terminar":
      return p.conCobro ? "Terminar y cobrar" : "Terminar";
    case "cobrar":
      return "Cobrar";
    case "vino":
      return "Vino";
    default:
      return null;
  }
}

/**
 * ¿La tecla cierra el turno? (terminar, o el «vino» de un Reservado pasado, con o sin cobro).
 * Esas van por `completeAppointment`; las demás de plata, por `registrarCobroTurno`.
 */
export function cierraElTurno(p: Paso): boolean {
  return p.tipo === "terminar" || p.tipo === "vino" || (p.tipo === "cobrar" && p.vino === true);
}

// ── Cancelar o «no vino»: quién cancela y qué pasa con la seña ───────────────

export type { CierreSinPrestar, DestinoDeLaSenia };
export type QuienCancela = "clienta" | "negocio";

/** Con cuánta anticipación tiene que avisar la clienta para que se le devuelva la seña (D2). */
export const HORAS_PARA_DEVOLVER = 24;

/**
 * Lo que se le PROPONE a la recepción hacer con la seña (D2 del diseño, *provisional a confirmar*
 * por la dueña): cancela el negocio → se devuelve; la clienta avisa con 24 h o más → se devuelve;
 * con menos de 24 h, o no vino → se la queda el negocio. Es una propuesta: la recepción la ve
 * marcada y la puede cambiar. Sin plata cobrada no hay nada que proponer.
 */
export function propuestaDeSenia(input: {
  accion: CierreSinPrestar;
  quien: QuienCancela | null;
  inicio: string;
  ahora: Date;
  cobrado: number;
}): DestinoDeLaSenia | null {
  if (input.cobrado <= 0) return null;
  if (input.accion === "no-vino") return "retener";
  if (input.quien === null) return null;
  if (input.quien === "negocio") return "devolver";
  const horas = (new Date(input.inicio).getTime() - input.ahora.getTime()) / 3_600_000;
  return horas >= HORAS_PARA_DEVOLVER ? "devolver" : "retener";
}

/**
 * La consecuencia, escrita antes de confirmar: qué pasa con el turno y qué pasa con la plata.
 * «Queda cancelado y las 16:00 quedan libres para otra clienta. La seña de $5.000 se le devuelve:
 * se anula el cobro en la caja.» Mientras falte elegir algo, dice qué falta.
 */
export function consecuenciaDelCierre(input: {
  accion: CierreSinPrestar;
  hora: string;
  cobrado: number;
  destino: DestinoDeLaSenia | null;
}): string {
  const turno =
    input.accion === "cancelar"
      ? `Queda cancelado y las ${input.hora} quedan libres para otra clienta.`
      : "Queda como faltazo en su ficha.";
  if (input.cobrado <= 0) return turno;
  const plata = pesos(input.cobrado);
  if (input.destino === "devolver") return `${turno} Los ${plata} que pagó se le devuelven: se anula el cobro en la caja.`;
  if (input.destino === "retener") return `${turno} Los ${plata} que pagó se los queda el negocio: la caja no cambia.`;
  return `${turno} Falta elegir qué pasa con los ${plata} que pagó.`;
}

export type MarcaDelTurno = { tipo: TipoMarca; texto: string };

/**
 * La marca de estado: forma + palabra. «En su horario» sale del reloj (el turno confirmado cuyo
 * horario está corriendo), no de un estado que el sistema no tiene: no hay «llegó» ni «en
 * atención» guardados, y no se inventan.
 */
export function marcaDelTurno(t: TurnoDelDia, ahora: Date): MarcaDelTurno {
  const ya = yaEmpezo(t, ahora);
  const termino = new Date(t.fin).getTime() <= ahora.getTime();
  switch (t.estado) {
    case "PENDING":
      return ya ? { tipo: "atencion", texto: "Reservado, ya pasó la hora" } : { tipo: "pendiente", texto: "Reservado, sin confirmar" };
    case "CONFIRMED":
      if (!ya) return { tipo: "hecho", texto: "Confirmado" };
      return termino ? { tipo: "atencion", texto: "Sin cerrar" } : { tipo: "medias", texto: "En su horario" };
    case "COMPLETED":
      if (t.cuentaACobrar) return { tipo: "atencion", texto: "Terminado, falta cobrar" };
      return { tipo: "hecho", texto: t.cobrado > 0 ? "Terminado y cobrado" : "Terminado" };
    case "NO_SHOW":
      return { tipo: "anulado", texto: "No vino" };
    default:
      return { tipo: "anulado", texto: "Cancelado" };
  }
}

/** ¿El renglón ya se resolvió? (terminado sin nada que cobrar, o no vino): se lee tachado. */
export function estaResuelto(t: TurnoDelDia): boolean {
  return (t.estado === "COMPLETED" && !t.cuentaACobrar) || t.estado === "NO_SHOW";
}

export type FiltroAgenda = "todos" | "sin-confirmar" | "por-cobrar" | "sin-cerrar";

export const FILTROS_AGENDA: readonly { id: FiltroAgenda; etiqueta: string }[] = [
  { id: "todos", etiqueta: "Todos" },
  { id: "sin-confirmar", etiqueta: "Sin confirmar" },
  { id: "por-cobrar", etiqueta: "Por cobrar" },
  { id: "sin-cerrar", etiqueta: "Sin cerrar" },
];

export function leerFiltroAgenda(raw: string | null | undefined): FiltroAgenda {
  return FILTROS_AGENDA.some((f) => f.id === raw) ? (raw as FiltroAgenda) : "todos";
}

/** ¿El turno entra en el filtro? «Por cobrar» = terminado con saldo, o seña sin cobrar de uno vivo. */
export function entraEnFiltro(t: TurnoDelDia, f: FiltroAgenda, ahora: Date): boolean {
  switch (f) {
    case "sin-confirmar":
      return t.estado === "PENDING";
    case "por-cobrar":
      return t.cuentaACobrar || ((t.estado === "PENDING" || t.estado === "CONFIRMED") && t.sugerido.tipo === "senia" && t.sugerido.monto > 0);
    case "sin-cerrar":
      return (t.estado === "PENDING" || t.estado === "CONFIRMED") && yaEmpezo(t, ahora);
    default:
      return true;
  }
}

export type LineaDeLaAgenda = {
  turnos: number;
  sinConfirmar: number;
  porCobrar: number;
  sinCerrar: number;
  /** La profesional con más turnos ese día (si hay más de una profesional con turnos). */
  masCargada: { nombre: string; turnos: number } | null;
};

/** La línea de estado de la agenda: «9 turnos · 3 sin confirmar · 1 por cobrar · Carla con 5». */
export function lineaDeLaAgenda(turnos: readonly TurnoDelDia[], ahora: Date): LineaDeLaAgenda {
  const vivos = turnos.filter((t) => t.estado !== "CANCELLED");
  const porProfesional = new Map<string, number>();
  for (const t of vivos) porProfesional.set(t.profesional, (porProfesional.get(t.profesional) ?? 0) + 1);
  let masCargada: LineaDeLaAgenda["masCargada"] = null;
  if (porProfesional.size > 1) {
    for (const [nombre, n] of porProfesional) {
      if (!masCargada || n > masCargada.turnos || (n === masCargada.turnos && nombre.localeCompare(masCargada.nombre, "es") < 0)) {
        masCargada = { nombre, turnos: n };
      }
    }
  }
  return {
    turnos: vivos.length,
    sinConfirmar: vivos.filter((t) => entraEnFiltro(t, "sin-confirmar", ahora)).length,
    porCobrar: vivos.filter((t) => entraEnFiltro(t, "por-cobrar", ahora)).length,
    sinCerrar: vivos.filter((t) => entraEnFiltro(t, "sin-cerrar", ahora)).length,
    masCargada,
  };
}

/**
 * Dónde va la raya de «ahora»: el índice del primer turno que todavía no empezó (la raya va
 * ANTES de él). Sólo el día de hoy; `null` si el día no es hoy, si todavía no empezó ninguno
 * (la raya arriba de todo no dice nada) o si ya empezaron todos (la raya iría al pie: se dice
 * en la línea de estado, no con una raya sola).
 */
export function lugarDeLaRaya(turnos: readonly Pick<TurnoDelDia, "inicio">[], esHoy: boolean, ahora: Date): number | null {
  if (!esHoy || turnos.length === 0) return null;
  const i = turnos.findIndex((t) => new Date(t.inicio).getTime() > ahora.getTime());
  if (i <= 0) return null;
  return i;
}

// ── Plata dentro de una tecla ────────────────────────────────────────────────

const PESOS_0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
const PESOS_2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/**
 * «$13.000» / «$7.500,50» para el texto de una tecla («Cobrar $13.000»). Adentro de una tecla la
 * pieza de plata no va: su `$` liviano y sus centavos claros se pierden sobre el acento.
 */
export function pesos(n: number): string {
  const entero = Math.round(n * 100) % 100 === 0;
  return `${n < 0 ? "−" : ""}$${(entero ? PESOS_0 : PESOS_2).format(Math.abs(n))}`;
}

// ── Fechas del libro ─────────────────────────────────────────────────────────

const DIA_LARGO = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const DIA_CORTO = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "numeric" });

const alMediodia = (dia: string) => new Date(`${dia}T12:00:00.000Z`);

/** «Jueves 24 de septiembre» (con mayúscula, sin coma: «24 De Septiembre» era un defecto). */
export function fechaLarga(dia: string): string {
  const partes = DIA_LARGO.formatToParts(alMediodia(dia));
  const de = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const semana = de("weekday");
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${de("day")} de ${de("month")}`;
}

/** «vie 25» (para las teclas de día). */
export function fechaCorta(dia: string): string {
  return DIA_CORTO.format(alMediodia(dia)).replace(".", "").replace(",", "");
}

/** Suma días a una fecha de calendario (anclada al mediodía UTC: nunca cruza la medianoche). */
export function diaMas(dia: string, n: number): string {
  const d = alMediodia(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Cómo se nombra el día que se mira, respecto de hoy («Hoy», «Mañana», «Ayer» o la fecha). */
export function nombreRelativo(dia: string, hoy: string): "Hoy" | "Mañana" | "Ayer" | null {
  if (dia === hoy) return "Hoy";
  if (dia === diaMas(hoy, 1)) return "Mañana";
  if (dia === diaMas(hoy, -1)) return "Ayer";
  return null;
}

/** Duración en minutos entre dos ISO (redondeada). */
export function minutosEntre(inicio: string, fin: string): number {
  return Math.max(0, Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000));
}
