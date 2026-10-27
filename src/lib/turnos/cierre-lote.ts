// ============================================================================
// CERRAR LO PENDIENTE EN LOTE — la regla, PURA (sin DB, sin sesión, client-safe).
// ============================================================================
//
// La queja del dueño de CH: un sábado con 15 turnos pasados sin cerrar costaba 60-90 toques,
// porque cada Reservado había que confirmarlo antes de poder terminarlo y no había acción en lote.
// La bandeja «Cerrar lo pendiente» (/admin/turnos/cerrar) los cierra de a muchos; esto decide, por
// cada línea, QUÉ se va a hacer con ella antes de tocar la base:
//
//   · «vino»    → completar. Sin saldo: sin cobro. Con saldo y quien mira cobra ESTE turno: con el
//                 medio elegido (obligatorio: ningún medio preelegido, B7). Con saldo y quien mira
//                 NO cobra este turno (la profesional que cobra aparte): queda debiendo — y si el
//                 formulario fuerza un medio igual, se rechaza (CH-007).
//   · «debe»    → completar dejando el saldo a cobrar (cuenta a cobrar derivada, no un estado).
//   · «no-vino» → faltazo; si entró plata, hay que decir qué pasa con la seña (retener/devolver).
//   · cualquier otra cosa → rechazada CON EL MOTIVO, sin frenar a las demás.
//
// Nunca es un lote transaccional: cada línea se ejecuta en SU transacción (cierre-lote-actions.ts)
// y una que falla queda en rojo con el motivo mientras las demás pasan (CH-006).
//
// Lo que el servidor ejecuta después (`completeAppointment`, `cerrarTurnoSinPrestar`) vuelve a
// validar todo adentro de su transacción: este plan es el filtro rápido y el que arma el motivo
// en criollo, no la única guarda.

import { roleHasCapability, type Role } from "@/lib/capabilities";
import {
  esMetodoDePago,
  estadoCobroTurno,
  mensajeNoVino,
  puedeCompletarse,
  puedeMarcarseNoVino,
  seniaDelServicio,
  type MetodoDePago,
} from "./cobros";
import { desglosarCobros } from "./anulacion";
import { planSeniaAlCerrar, type DestinoDeLaSenia } from "./practica";

/** Hasta cuántos turnos se cierran de una vez (un sábado entero entra holgado). */
export const TOPE_DEL_LOTE = 50;

// ── Permisos de quien mira ─────────────────────────────────────────────────────

/**
 * Qué puede hacer quien mira, calculado en el servidor con sus capacidades. La pantalla dibuja
 * sólo lo que el servidor después acepta (principio 3 del diseño). Es un superconjunto del
 * `Permisos` de la agenda (`agenda-core.ts`): mismos tres campos + `perdonar`.
 */
export type Permisos = {
  /** agenda:manage — confirmar, cancelar, reprogramar. */
  gestionar: boolean;
  /** agenda:collect — cobrar (además, el veredicto de cada turno). */
  cobrar: boolean;
  /** agenda:complete — terminar y marcar que no vino. */
  terminar: boolean;
  /** agenda:forgive — dar de baja el saldo de un turno (sólo la dueña, D5). */
  perdonar: boolean;
};

export function permisosDeRol(role: Role): Permisos {
  return {
    gestionar: roleHasCapability(role, "agenda:manage"),
    cobrar: roleHasCapability(role, "agenda:collect"),
    terminar: roleHasCapability(role, "agenda:complete"),
    perdonar: roleHasCapability(role, "agenda:forgive"),
  };
}

/** ¿Quien mira puede cobrar ESTE turno? (`puedeCobrarEsteTurno`, src/lib/turnos/cobro-mostrador.ts). */
export type Veredicto = { ok: true } | { ok: false; motivo: string };

// ── Lo que pide la pantalla ────────────────────────────────────────────────────

export type AccionDeCierre = "vino" | "debe" | "no-vino";
const ACCIONES: readonly AccionDeCierre[] = ["vino", "debe", "no-vino"];

/** Una línea del lote tal como la manda la bandeja. */
export type PedidoDeCierre = {
  id: string;
  accion: AccionDeCierre;
  /** Medio del cobro del saldo («vino» con saldo y quien mira cobra). */
  method?: string | null;
  /** Qué pasa con la seña en un «no vino» con plata: «retener» | «devolver». */
  senia?: string | null;
};

/** El nombre del campo de la FormData que lleva el lote (JSON de `PedidoDeCierre[]`). */
export const CAMPO_DEL_LOTE = "items";

/** Arma la FormData de `cerrarTurnosEnLote` (la usa la bandeja; así el formato vive en un solo lugar). */
export function formDataDelLote(pedidos: readonly PedidoDeCierre[]): FormData {
  const fd = new FormData();
  fd.set(CAMPO_DEL_LOTE, JSON.stringify(pedidos));
  return fd;
}

export type LecturaDelLote = { ok: true; pedidos: PedidoDeCierre[] } | { ok: false; error: string };

/** Lee y valida la forma del lote que llegó del formulario. No mira la base. */
export function leerLote(raw: unknown): LecturaDelLote {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: false, error: "No llegó ningún turno para cerrar." };
  let datos: unknown;
  try {
    datos = JSON.parse(raw);
  } catch {
    return { ok: false, error: "El lote llegó roto. Recargá la página y volvé a marcar los turnos." };
  }
  if (!Array.isArray(datos) || datos.length === 0) return { ok: false, error: "No llegó ningún turno para cerrar." };
  if (datos.length > TOPE_DEL_LOTE) {
    return { ok: false, error: `Se cierran hasta ${TOPE_DEL_LOTE} turnos por vez. Marcá menos y repetí.` };
  }
  const pedidos: PedidoDeCierre[] = [];
  for (const d of datos) {
    if (!d || typeof d !== "object") return { ok: false, error: "El lote llegó roto. Recargá la página y volvé a marcar los turnos." };
    const o = d as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const accion = o.accion as AccionDeCierre;
    if (!id || !ACCIONES.includes(accion)) {
      return { ok: false, error: "El lote llegó roto. Recargá la página y volvé a marcar los turnos." };
    }
    pedidos.push({
      id,
      accion,
      method: typeof o.method === "string" && o.method ? o.method : null,
      senia: typeof o.senia === "string" && o.senia ? o.senia : null,
    });
  }
  return { ok: true, pedidos };
}

// ── El turno, tal como lo leyó el servidor ─────────────────────────────────────

/** Lo mínimo del turno que el plan necesita (lo lee el servidor con `tenantId`). */
export type TurnoParaCerrar = {
  id: string;
  status: string;
  startsAt: Date;
  professionalId: string;
  /** Precio − Σ cobros (`estadoCobroTurno`). */
  saldo: number;
  /** Lo que entró (la pregunta por la seña en un «no vino»). */
  cobrado: number;
};

// ── La fila de la base y sus dos proyecciones ──────────────────────────────────

/** Lo mínimo que se lee de un turno (sin-cerrar.server.ts), ya con sus cobros. */
export type FilaDeTurno = {
  id: string;
  clientId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  priceAtBooking: number | null;
  professionalId: string;
  client: { name: string; phone: string };
  service: { name: string; price: number; depositAmount: number | null };
  /** `cobraEnMostrador` undefined = columna sin migrar: rige el default (el mostrador cobra). */
  professional: { name: string; cobraEnMostrador?: boolean };
  box: { name: string } | null;
  payment: { status: string; amount: number } | null;
  collections: readonly { id?: string; amount: number; method: string; note?: string | null }[];
};

/** La plata del turno con las MISMAS reglas que la agenda y las acciones (src/lib/turnos). */
export function plataDeLaFila(f: FilaDeTurno): { precio: number; saldo: number; cobradoBruto: number; cobradoReal: number; senia: number } {
  const precio = f.priceAtBooking ?? f.service.price;
  const cobros = f.collections.map((c) => ({ amount: c.amount, method: c.method, note: c.note ?? null }));
  const estado = estadoCobroTurno({ precio, cobros, pagoLegado: f.payment });
  return {
    precio: estado.precio,
    saldo: estado.saldo,
    // Lo que mira `cerrarTurnoSinPrestar` para preguntar por la seña (misma cuenta).
    cobradoBruto: estado.cobrado,
    // Plata que entró de verdad (una condonación no es plata), como la agenda.
    cobradoReal: cobros.length > 0 ? desglosarCobros(cobros).cobrado : estado.cobrado,
    senia: seniaDelServicio({ depositAmount: f.service.depositAmount, precio }),
  };
}

export function turnoParaCerrar(f: FilaDeTurno): TurnoParaCerrar {
  const p = plataDeLaFila(f);
  return { id: f.id, status: f.status, startsAt: f.startsAt, professionalId: f.professionalId, saldo: p.saldo, cobrado: p.cobradoBruto };
}

/** Un turno pasado sin cerrar, tal como cruza al navegador (la bandeja «Cerrar lo pendiente»). */
export type TurnoSinCerrar = {
  id: string;
  clienteId: string;
  /** ISO del inicio y del fin. */
  inicio: string;
  fin: string;
  /** Día del turno en la zona del negocio (YYYY-MM-DD), para agrupar. */
  dia: string;
  estado: "PENDING" | "CONFIRMED";
  clienta: string;
  telefono: string;
  servicio: string;
  profesional: string;
  profesionalId: string;
  box: string;
  precio: number;
  /** Plata que entró de verdad (seña y parciales; sin condonaciones). */
  cobrado: number;
  saldo: number;
  /** La seña del catálogo (0 = el servicio no pide seña). */
  senia: number;
  cobros: { amount: number; method: string; note: string | null }[];
  /** ¿Quien mira puede cobrar ESTE turno? Si no, sólo «Terminar y dejar el saldo» (Vero). */
  veredicto: Veredicto;
};

export function turnoSinCerrar(f: FilaDeTurno, veredicto: Veredicto, dia: string): TurnoSinCerrar {
  const p = plataDeLaFila(f);
  return {
    id: f.id,
    clienteId: f.clientId,
    inicio: f.startsAt.toISOString(),
    fin: f.endsAt.toISOString(),
    dia,
    estado: f.status === "CONFIRMED" ? "CONFIRMED" : "PENDING",
    clienta: f.client.name,
    telefono: f.client.phone,
    servicio: f.service.name,
    profesional: f.professional.name,
    profesionalId: f.professionalId,
    box: f.box?.name ?? "",
    precio: p.precio,
    cobrado: p.cobradoReal,
    saldo: p.saldo,
    senia: p.senia,
    cobros: f.collections.map((c) => ({ amount: c.amount, method: c.method, note: c.note ?? null })),
    veredicto,
  };
}

/** Lo que devuelve `turnosSinCerrar()`. */
export type BandejaSinCerrar = {
  /** Del más reciente al más viejo; sin tope de días (un pasado de hace 4 meses también aparece). */
  turnos: TurnoSinCerrar[];
  permisos: Permisos;
  /** Quedaron más de los que se trajeron (tope de la pantalla): cerrá estos y volvé a cargar. */
  hayMas: boolean;
  /** La caja de HOY ya se cerró: un cobro no se puede asentar (las líneas con saldo, a «Debe»). */
  cajaDeHoyCerrada: boolean;
};

// ── El plan ────────────────────────────────────────────────────────────────────

export type DecisionDeCierre =
  /** Completar sin cobro nuevo (saldo $0). `vino`: era Reservado (se completa sin Confirmar). */
  | { tipo: "completar-sin-cobro"; vino: boolean }
  /** Completar cobrando el saldo con ese medio, en la misma transacción. */
  | { tipo: "completar-y-cobrar"; method: MetodoDePago; monto: number; vino: boolean }
  /** Completar dejando el saldo a cobrar. */
  | { tipo: "dejar-saldo"; saldo: number; vino: boolean }
  /** Faltazo; `senia`: qué pasa con la plata que entró (null si no entró nada). */
  | { tipo: "no-vino"; senia: DestinoDeLaSenia | null }
  /** No se toca; el motivo es lo que se lee en la línea roja. */
  | { tipo: "rechazado"; motivo: string };

export type LineaDelPlan = { id: string; decision: DecisionDeCierre };

export type ContextoDelPlan = {
  ahora: Date;
  permisos: Permisos;
  /** Veredicto de cobro por id de turno. Sin veredicto para un turno: no se le cobra. */
  veredictos: ReadonlyMap<string, Veredicto> | Readonly<Record<string, Veredicto>>;
  /** Si quien mira es una PROFESIONAL: su `professionalId` (sólo cierra los suyos). */
  profesionalPropio?: string | null;
};

export const MOTIVO = {
  noExiste: "Ese turno ya no existe. Recargá la agenda.",
  repetido: "Ese turno está dos veces en el lote: se cerró una sola vez.",
  sinPermiso: "Cerrar turnos lo hace la recepción, la dueña o la profesional del turno.",
  deOtraProfesional: "Ese turno es de otra profesional: sólo podés cerrar los tuyos.",
  yaCerrado: "Ese turno ya está cerrado (terminado, cancelado o como faltazo). Recargá la agenda.",
  noOcurrio: "Este turno todavía no ocurrió: se cierra recién a partir de su horario.",
  faltaMedio: "Elegí con qué medio pagó (o marcalo como «Debe»).",
  sinVeredicto: "No se pudo verificar quién cobra este turno. Recargá la agenda.",
} as const;

function veredictoDe(ctx: ContextoDelPlan, id: string): Veredicto {
  const v = ctx.veredictos instanceof Map ? ctx.veredictos.get(id) : (ctx.veredictos as Record<string, Veredicto>)[id];
  return v ?? { ok: false, motivo: MOTIVO.sinVeredicto };
}

/** La decisión para UNA línea. */
export function decidirLinea(pedido: PedidoDeCierre, turno: TurnoParaCerrar | null, ctx: ContextoDelPlan): DecisionDeCierre {
  const rechazo = (motivo: string): DecisionDeCierre => ({ tipo: "rechazado", motivo });
  if (!turno || turno.id !== pedido.id) return rechazo(MOTIVO.noExiste);
  if (!ctx.permisos.terminar) return rechazo(MOTIVO.sinPermiso);
  if (ctx.profesionalPropio !== undefined && ctx.profesionalPropio !== null && turno.professionalId !== ctx.profesionalPropio) {
    return rechazo(MOTIVO.deOtraProfesional);
  }

  if (pedido.accion === "no-vino") {
    const puede = puedeMarcarseNoVino({ status: turno.status, startsAt: turno.startsAt, ahora: ctx.ahora });
    if (!puede.ok) return rechazo(puede.motivo === "no-vigente" ? MOTIVO.yaCerrado : mensajeNoVino(puede.motivo));
    const senia = planSeniaAlCerrar({ cobrado: turno.cobrado, destino: pedido.senia });
    if (!senia.ok) return rechazo(senia.error);
    // Devolver es plata que sale: el mismo veredicto que cobrar (lo vuelve a mirar el servidor).
    if (senia.destino === "devolver") {
      if (!ctx.permisos.cobrar) return rechazo("Devolver una seña lo hace quien cobra los turnos.");
      const v = veredictoDe(ctx, turno.id);
      if (!v.ok) return rechazo(v.motivo);
    }
    return { tipo: "no-vino", senia: senia.destino };
  }

  // «vino» y «debe»: completar. La hora manda; un Reservado pasado se completa sin Confirmar.
  if (turno.status !== "PENDING" && turno.status !== "CONFIRMED") return rechazo(MOTIVO.yaCerrado);
  const puede = puedeCompletarse({ status: turno.status, startsAt: turno.startsAt, ahora: ctx.ahora, vino: true });
  if (!puede.ok) return rechazo(puede.motivo === "no-ocurrio" ? MOTIVO.noOcurrio : MOTIVO.yaCerrado);
  const vino = turno.status === "PENDING";

  if (turno.saldo <= 0) return { tipo: "completar-sin-cobro", vino };
  if (pedido.accion === "debe") return { tipo: "dejar-saldo", saldo: turno.saldo, vino };

  const v = veredictoDe(ctx, turno.id);
  const cobraEste = ctx.permisos.cobrar && v.ok;
  if (!cobraEste) {
    // Un medio forzado sobre un turno que quien mira no cobra se rechaza (no se «convierte» en debe):
    // el formulario está pidiendo algo que la pantalla no ofreció.
    if (pedido.method) return rechazo(v.ok ? "Cobrar lo hace quien cobra los turnos." : v.motivo);
    return { tipo: "dejar-saldo", saldo: turno.saldo, vino };
  }
  if (!esMetodoDePago(pedido.method)) return rechazo(MOTIVO.faltaMedio);
  return { tipo: "completar-y-cobrar", method: pedido.method, monto: turno.saldo, vino };
}

export type PlanDelLote = { ok: true; lineas: LineaDelPlan[] } | { ok: false; error: string };

/**
 * El plan del lote: una decisión por línea, en el orden en que llegaron. `items` trae cada pedido
 * con el turno que leyó el servidor (null si no existe o es de otro negocio). Tope de
 * `TOPE_DEL_LOTE`; un id repetido se cierra una sola vez.
 */
export function planCierreEnLote(
  items: readonly { pedido: PedidoDeCierre; turno: TurnoParaCerrar | null }[],
  ctx: ContextoDelPlan,
): PlanDelLote {
  if (items.length === 0) return { ok: false, error: "No llegó ningún turno para cerrar." };
  if (items.length > TOPE_DEL_LOTE) {
    return { ok: false, error: `Se cierran hasta ${TOPE_DEL_LOTE} turnos por vez. Marcá menos y repetí.` };
  }
  const vistos = new Set<string>();
  const lineas = items.map(({ pedido, turno }): LineaDelPlan => {
    if (vistos.has(pedido.id)) return { id: pedido.id, decision: { tipo: "rechazado", motivo: MOTIVO.repetido } };
    vistos.add(pedido.id);
    return { id: pedido.id, decision: decidirLinea(pedido, turno, ctx) };
  });
  return { ok: true, lineas };
}

/**
 * Los campos de la Server Action que ejecuta una decisión (sin el id de turno ya puesto). Una sola
 * fuente para el lote y para quien quiera ejecutar una línea suelta: `completeAppointment` lee
 * `vino`, `method` y `saldo`; `cerrarTurnoSinPrestar` lee `accion` y `senia`.
 */
export function camposDeLaDecision(
  id: string,
  d: Exclude<DecisionDeCierre, { tipo: "rechazado" }>,
): { accion: "completar" | "no-vino"; campos: Record<string, string> } {
  const base: Record<string, string> = { appointmentId: id };
  switch (d.tipo) {
    case "completar-sin-cobro":
      return { accion: "completar", campos: { ...base, ...(d.vino ? { vino: "on" } : {}) } };
    case "completar-y-cobrar":
      return { accion: "completar", campos: { ...base, method: d.method, ...(d.vino ? { vino: "on" } : {}) } };
    case "dejar-saldo":
      return { accion: "completar", campos: { ...base, saldo: "a-cobrar", ...(d.vino ? { vino: "on" } : {}) } };
    case "no-vino":
      return { accion: "no-vino", campos: { ...base, accion: "no-vino", ...(d.senia ? { senia: d.senia } : {}) } };
  }
}

/** Lo que devuelve `cerrarTurnosEnLote`: una línea por turno, en el orden del lote. */
export type ResultadoDeLinea = { id: string; ok: boolean; error?: string; aviso?: string };
export type ResultadoDelLote = { resultados: ResultadoDeLinea[]; error?: string };
