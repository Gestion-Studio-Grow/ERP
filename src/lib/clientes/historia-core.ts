// ============================================================================
// LA HISTORIA DE UNA CLIENTA — el núcleo PURO (sin base, sin React).
// ============================================================================
//
// Pedido del dueño de CH (04/11): «historial tipo historia clínica de cada ficha, que se abra desde
// el turno y desde las historias en general; revisar cada turno realizado, por qué profesional,
// especie de auditoría». Acá vive todo lo que se decide sin la base:
//   · QUÉ VE CADA ROL (`vistaDeHistoria`): son datos de salud, así que se recorta en origen.
//       OWNER         todo: notas, montos y el rastro de la auditoría.
//       PROFESSIONAL  sólo clientas que atendió o que tienen turno con ella (la puerta la cierra el
//                     lector); ve notas y rastro, y la plata SÓLO de sus turnos (la misma que hoy ve
//                     en el cajón del turno, que cobra lo suyo).
//       RECEPTION     fecha, servicio, profesional, box, duración y estado; sin notas, sin plata y
//                     sin rastro.
//   · El ESTADO FINAL del turno en criollo, con quién lo cerró («Cancelado · avisó la clienta»).
//   · El RASTRO de la auditoría de cada turno, frase por frase, con o sin plata según quién mira.
//   · Los filtros de la URL (profesional, servicio, fechas, página) leídos con desconfianza.

import { fmtMoneyARS } from "@/components/ui/format";
import { fmtDateTimeAr, fmtTime } from "@/lib/datetime";
import { separarNota } from "@/lib/reserva-publica-notas";

/** Turnos por página de la historia. */
export const TURNOS_POR_PAGINA = 20;

export type RolDeHistoria = "OWNER" | "RECEPTION" | "PROFESSIONAL";

/** Lo que se audita cada vez que alguien abre una historia (dato de salud: queda quién y cuándo). */
export const ACCION_HISTORIA_VISTA = "historia_vista";

/** Lo que se audita cuando alguien intenta abrir una historia que no puede ver (quién, qué id y por qué). */
export const ACCION_HISTORIA_DENEGADA = "historia_denegada";

/**
 * Por qué no se abrió. «otro negocio»: el id no es de una clienta de este negocio (no existe o es de otro;
 * con RLS no se distingue, y no hace falta). «sin turno con ella»: una profesional sin turno con esa
 * clienta, o sin profesional vinculada. «rol»: un rol que no es dueña, recepción ni profesional.
 * Queda SÓLO en la auditoría: a quien mira se le contesta siempre «no encontramos esa historia».
 */
export type MotivoHistoriaDenegada = "otro negocio" | "sin turno con ella" | "rol";

/** ¿Es uno de los roles que la historia conoce? */
export const esRolDeHistoria = (role: string): role is RolDeHistoria => role === "OWNER" || role === "RECEPTION" || role === "PROFESSIONAL";

export interface VistaDeHistoria {
  /** Notas del turno (del equipo y de la clienta). */
  notas: boolean;
  /** El rastro de la auditoría de cada turno. */
  rastro: boolean;
  /** La plata: de todos los turnos, sólo de los propios, o ninguna. */
  montos: "todos" | "propios" | "ninguno";
  /** Sólo puede abrir clientas que atendió o que tienen turno con ella. */
  soloSusClientas: boolean;
}

/** Qué ve cada rol. Un rol desconocido ve lo mínimo y nada de una clienta ajena (fail-closed). */
export function vistaDeHistoria(role: string): VistaDeHistoria {
  switch (role) {
    case "OWNER":
      return { notas: true, rastro: true, montos: "todos", soloSusClientas: false };
    case "PROFESSIONAL":
      return { notas: true, rastro: true, montos: "propios", soloSusClientas: true };
    case "RECEPTION":
      return { notas: false, rastro: false, montos: "ninguno", soloSusClientas: false };
    default:
      return { notas: false, rastro: false, montos: "ninguno", soloSusClientas: true };
  }
}

/** ¿Ve la plata de ESTE turno? */
export function veMontosDelTurno(v: VistaDeHistoria, turnoProfesionalId: string, miProfesionalId: string | null): boolean {
  if (v.montos === "todos") return true;
  return v.montos === "propios" && miProfesionalId !== null && turnoProfesionalId === miProfesionalId;
}

// ── Filtros de la URL ───────────────────────────────────────────────────────

export interface FiltrosDeHistoria {
  profesional: string | null;
  servicio: string | null;
  /** yyyy-mm-dd, inclusive. */
  desde: string | null;
  /** yyyy-mm-dd, inclusive. */
  hasta: string | null;
  pagina: number;
}

export const SIN_FILTROS_DE_HISTORIA: FiltrosDeHistoria = { profesional: null, servicio: null, desde: null, hasta: null, pagina: 1 };

type Params = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
const ID = /^[A-Za-z0-9_-]{1,40}$/;

function diaValido(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? s : null;
}

/** Los filtros de la URL. Lo que no tiene la forma esperada se ignora (nunca llega a la consulta). */
export function leerFiltrosDeHistoria(p: Params): FiltrosDeHistoria {
  const profesional = uno(p.profesional);
  const servicio = uno(p.servicio);
  let desde = diaValido(uno(p.desde));
  let hasta = diaValido(uno(p.hasta));
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const n = Number.parseInt(uno(p.pagina), 10);
  return {
    profesional: ID.test(profesional) ? profesional : null,
    servicio: ID.test(servicio) ? servicio : null,
    desde,
    hasta,
    pagina: Number.isFinite(n) && n >= 1 && n <= 10_000 ? n : 1,
  };
}

export const hayFiltrosDeHistoria = (f: FiltrosDeHistoria) => !!(f.profesional || f.servicio || f.desde || f.hasta);

/** El día siguiente a un yyyy-mm-dd (para el «hasta» inclusive). */
export function diaSiguienteDe(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** La historia de una clienta (la ruta canónica: la abren los tres roles). */
export const hrefHistoria = (clienteId: string, f: Partial<FiltrosDeHistoria> = {}): string => {
  const q = new URLSearchParams();
  if (f.profesional) q.set("profesional", f.profesional);
  if (f.servicio) q.set("servicio", f.servicio);
  if (f.desde) q.set("desde", f.desde);
  if (f.hasta) q.set("hasta", f.hasta);
  if (f.pagina && f.pagina > 1) q.set("pagina", String(f.pagina));
  const s = q.toString();
  return `/admin/historias/${encodeURIComponent(clienteId)}${s ? `?${s}` : ""}`;
};

// ── Lo leído (filas de la base, ya recortadas por el lector) ────────────────

export interface FilaDeAuditoria {
  actor: string;
  action: string;
  entityId: string | null;
  channel: string | null;
  changes: unknown;
  createdAt: Date;
}

export interface TurnoLeidoDeHistoria {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  /** `null` si quien mira no ve notas (el lector ni la lee). */
  notes: string | null;
  professionalId: string;
  profesional: string;
  servicio: string;
  box: string;
  /** Lo cobrado (cobros vivos o el pago viejo aprobado); `null` si quien mira no ve plata de este turno. */
  cobrado: number | null;
}

export interface Renglon {
  cuando: Date;
  quien: string;
  frase: string;
  detalle: string[];
}

export interface TurnoDeLaHistoria {
  id: string;
  inicio: Date;
  fecha: string;
  hora: string;
  servicio: string;
  profesional: string;
  box: string;
  duracionMin: number;
  estado: { texto: string; tono: "ok" | "alerta" | "neutro"; quien: string | null };
  cobrado: number | null;
  notaDelEquipo: string | null;
  notaDeLaClienta: string | null;
  /** Viejo arriba (como se cuenta lo que pasó); vacío si quien mira no ve el rastro. */
  rastro: Renglon[];
}

// ── Quién ───────────────────────────────────────────────────────────────────

/** El actor guardado, como lo lee la dueña. Igual criterio que la Auditoría (lib/audit-actor). */
export function quienFue(actor: string, nombres: ReadonlyMap<string, string>): string {
  if (actor.startsWith("operator:")) return "GSG";
  if (actor.startsWith("user:")) return nombres.get(actor.slice(5)) ?? "Usuario eliminado";
  if (actor === "system") return "El sistema";
  if (actor === "admin") return "El panel (registro viejo)";
  if (actor.startsWith("cliente")) return "La clienta, desde la web";
  return "Alguien del negocio";
}

/** Los ids de usuario de un lote de filas, para leer sus nombres de una vez. */
export function usuariosDelRastro(filas: readonly Pick<FilaDeAuditoria, "actor">[]): string[] {
  return [...new Set(filas.flatMap((f) => (f.actor.startsWith("user:") ? [f.actor.slice(5)] : [])))];
}

// ── El rastro en criollo ────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const esObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const txt = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const plata = (n: number) => fmtMoneyARS(n, Number.isInteger(n) ? 0 : 2);
const MEDIO: Record<string, string> = {
  EFECTIVO: "en efectivo",
  MP: "por Mercado Pago o transferencia",
  MERCADOPAGO: "por Mercado Pago",
  TRANSFERENCIA: "por transferencia",
  TARJETA: "con tarjeta",
  CUENTA_CORRIENTE: "a cuenta",
};
const medio = (x: unknown) => (txt(x) ? (MEDIO[txt(x)!] ?? null) : null);

function fechaHora(x: unknown): string | null {
  const d = x instanceof Date ? x : typeof x === "string" ? new Date(x) : null;
  return d && !Number.isNaN(d.getTime()) ? fmtDateTimeAr(d) : null;
}
function hora(x: unknown): string | null {
  const d = x instanceof Date ? x : typeof x === "string" ? new Date(x) : null;
  return d && !Number.isNaN(d.getTime()) ? fmtTime(d) : null;
}

/** Lo cobrado en un cierre (`saldoCobrado` es un objeto o una lista, según la versión). */
function saldoCobrado(x: unknown): number | null {
  if (esObj(x)) return num(x.amount);
  if (Array.isArray(x)) {
    const t = x.reduce<number>((s, l) => s + (esObj(l) ? (num(l.amount) ?? 0) : 0), 0);
    return t > 0 ? t : null;
  }
  return null;
}

/**
 * Una fila de la auditoría del turno, dicha en castellano. `conMontos` = falso borra toda cifra
 * (la frase sigue diciendo qué pasó: «Cobró el turno», sin cuánto).
 */
export function fraseDelRastro(f: Pick<FilaDeAuditoria, "action" | "channel" | "changes">, conMontos: boolean): { frase: string; detalle: string[] } {
  const c = esObj(f.changes) ? f.changes : {};
  const $ = (n: number | null, antes = " · ") => (conMontos && n ? `${antes}${plata(n)}` : "");
  const motivo = txt(c.motivo);
  switch (f.action) {
    case "create":
      return { frase: f.channel === "public" ? "Reservó el turno por la web" : "Reservó el turno", detalle: [] };
    case "create_manual":
      return { frase: "Agendó el turno", detalle: [] };
    case "book_from_waitlist":
      return { frase: "Le dio el turno desde la lista de espera", detalle: [] };
    case "reschedule": {
      const de = esObj(c.from) ? c.from : {};
      const a = esObj(c.to) ? c.to : {};
      const desde = fechaHora(de.startsAt);
      const hasta = fechaHora(a.startsAt);
      const detalle: string[] = [];
      if (txt(de.professionalId) && txt(a.professionalId) && de.professionalId !== a.professionalId) detalle.push("Cambió de profesional");
      if (txt(de.boxId) && txt(a.boxId) && de.boxId !== a.boxId) detalle.push("Cambió de box");
      return { frase: desde && hasta ? `Lo movió del ${desde} al ${hasta}` : "Lo cambió de horario", detalle };
    }
    case "resize": {
      const antes = hora(esObj(c.from) ? c.from.endsAt : null);
      const ahora = hora(esObj(c.to) ? c.to.endsAt : null);
      return { frase: antes && ahora ? `Le cambió la duración: terminaba ${antes}, ahora ${ahora}` : "Le cambió la duración", detalle: [] };
    }
    case "update":
      return { frase: "Editó el turno", detalle: [] };
    case "confirm":
      return { frase: "Confirmó el turno", detalle: [] };
    case "deposit_requested":
      return { frase: `Le pidió la seña${$(num(c.monto), " de ")}`, detalle: [] };
    case "confirm_payment":
      return { frase: `Confirmó el pago${$(num(c.amount) ?? num(c.monto))}`, detalle: [] };
    case "collect_payment": {
      if (c.tipo === "senia") return { frase: "Marcó que llegó la seña", detalle: [] };
      const m = medio(c.method);
      return { frase: `Cobró${$(num(c.amount) ?? num(c.monto), " ")}${m ? ` ${m}` : ""}`.replace(/^Cobró$/, "Cobró el turno"), detalle: [] };
    }
    case "complete": {
      const s = saldoCobrado(c.saldoCobrado);
      return { frase: `Lo marcó como realizado${conMontos && s ? ` · cobró ${plata(s)}` : ""}`, detalle: [] };
    }
    case "no_show":
      return { frase: "Marcó que no vino", detalle: [] };
    case "cancel": {
      const q = c.quien === "clienta" ? ["Avisó la clienta"] : c.quien === "negocio" ? ["Lo canceló el negocio"] : [];
      return { frase: f.channel === "public" ? "Lo canceló desde la web" : "Canceló el turno", detalle: q };
    }
    case "undo_cancel":
      return { frase: "Deshizo la cancelación", detalle: [] };
    case "undo_no_show":
      return { frase: "Deshizo el «no vino»", detalle: [] };
    case "void_collection":
      return { frase: `Anuló un cobro${$(num(c.monto) ?? num(c.amount))}`, detalle: motivo ? [`Motivo: «${motivo}»`] : [] };
    case "authorize_void_collection":
      return { frase: `Autorizó anular un cobro${$(num(c.monto))}`, detalle: [] };
    case "write_off_balance":
      return { frase: `Dio de baja el saldo${$(num(c.monto))}`, detalle: motivo ? [`Motivo: «${motivo}»`] : [] };
    case "reminder_manual":
      return { frase: "Le mandó el recordatorio por WhatsApp", detalle: [] };
    default:
      return { frase: "Hizo un cambio en el turno", detalle: [] };
  }
}

// ── El estado final ─────────────────────────────────────────────────────────

const ULTIMA_DE = (filas: readonly FilaDeAuditoria[], action: string) =>
  [...filas].filter((f) => f.action === action).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

/** El estado con el que quedó el turno, en criollo, y quién lo cerró (si la auditoría lo dice). */
export function estadoFinal(status: string, filas: readonly FilaDeAuditoria[], nombres: ReadonlyMap<string, string>): TurnoDeLaHistoria["estado"] {
  const por = (action: string, verbo: string) => {
    const f = ULTIMA_DE(filas, action);
    return f ? `${verbo} ${quienFue(f.actor, nombres)}` : null;
  };
  switch (status) {
    case "COMPLETED":
      return { texto: "Realizado", tono: "ok", quien: por("complete", "Lo cerró") };
    case "NO_SHOW":
      return { texto: "No vino", tono: "alerta", quien: por("no_show", "Lo marcó") };
    case "CANCELLED": {
      const f = ULTIMA_DE(filas, "cancel");
      const c = f && esObj(f.changes) ? f.changes : {};
      const quien = !f
        ? null
        : f.channel === "public"
          ? "Lo canceló la clienta, desde la web"
          : c.quien === "clienta"
            ? `Avisó la clienta; lo anotó ${quienFue(f.actor, nombres)}`
            : `Lo canceló ${quienFue(f.actor, nombres)}${c.quien === "negocio" ? " (el negocio)" : ""}`;
      return { texto: "Cancelado", tono: "neutro", quien };
    }
    case "CONFIRMED":
      return { texto: "Confirmado", tono: "neutro", quien: null };
    case "PENDING":
      return { texto: "Reservado", tono: "neutro", quien: null };
    default:
      return { texto: status, tono: "neutro", quien: null };
  }
}

// ── La línea de tiempo ──────────────────────────────────────────────────────

/**
 * Los turnos leídos, armados para pintar: nuevo arriba (y a igual hora, por id, estable), cada uno
 * con su estado final, su plata y sus notas si quien mira las ve, y su rastro (viejo arriba).
 */
export function armarLineaDeTiempo(
  turnos: readonly TurnoLeidoDeHistoria[],
  auditoria: readonly FilaDeAuditoria[],
  nombres: ReadonlyMap<string, string>,
  vista: VistaDeHistoria,
  miProfesionalId: string | null,
): TurnoDeLaHistoria[] {
  const porTurno = new Map<string, FilaDeAuditoria[]>();
  for (const f of auditoria) {
    if (!f.entityId) continue;
    const arr = porTurno.get(f.entityId) ?? [];
    arr.push(f);
    porTurno.set(f.entityId, arr);
  }
  return [...turnos]
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .map((t) => {
      const filas = (porTurno.get(t.id) ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const conMontos = veMontosDelTurno(vista, t.professionalId, miProfesionalId);
      const nota = vista.notas ? separarNota(t.notes) : { delCliente: null, delEquipo: null };
      return {
        id: t.id,
        inicio: t.startsAt,
        fecha: fmtDateTimeAr(t.startsAt).slice(0, 10),
        hora: fmtTime(t.startsAt),
        servicio: t.servicio,
        profesional: t.profesional,
        box: t.box,
        duracionMin: Math.max(0, Math.round((t.endsAt.getTime() - t.startsAt.getTime()) / 60_000)),
        estado: estadoFinal(t.status, filas, nombres),
        cobrado: conMontos ? t.cobrado : null,
        notaDelEquipo: nota.delEquipo || null,
        notaDeLaClienta: nota.delCliente || null,
        rastro: vista.rastro
          ? filas.map((f) => ({ cuando: f.createdAt, quien: quienFue(f.actor, nombres), ...fraseDelRastro(f, conMontos) }))
          : [],
      };
    });
}

/** «45′» o «1 h 30′»: la duración como se dice en el mostrador. */
export function duracionEnCriollo(min: number): string {
  if (min < 60) return `${min}′`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}′` : `${h} h`;
}
