// ============================================================================
// «CERRAR LO PENDIENTE» — lo que se decide sin DOM ni base. PURO, client-safe.
// ============================================================================
//
// La queja del dueño de CH: «Pasados sin cerrar» apilaba un formulario enorme por turno. Acá la
// bandeja es un renglón por turno con UNA decisión (vino · debe · no vino) y un lote para cerrar
// muchos de un saque. Este módulo decide, con reloj fijo y sin pantalla (cerrar-core.test.ts):
//   · cómo se agrupan (por día, del más nuevo al más viejo; adentro, por hora) y la cuenta por
//     profesional de cada día;
//   · la línea de estado («15 sin cerrar · $142.000 por cobrar · 3 con seña · 1 de Vero…»);
//   · qué teclas lleva cada renglón según lo que puede quien mira y el veredicto del servidor;
//   · «las que ya pagaron todo» (saldo ≤ 0: se cierran sin cobrar nada);
//   · la selección del lote, su total y el texto de la confirmación («¿Cerrar 8 turnos y cobrar
//     $94.000 en efectivo?»);
//   · las líneas (`PedidoDeCierre`) que viajan a `cerrarTurnosEnLote` (src/lib/turnos/cierre-lote-actions.ts).
//
// Contrato con 1-A: los tipos (`TurnoSinCerrar`, `Permisos`, `PedidoDeCierre`) y el formato del
// lote (`formDataDelLote`) salen de src/lib/turnos/cierre-lote.ts: una sola fuente.
//
// No decide nada de plata: la LEE del renglón (`saldo`, `cobrado`, calculados con las reglas de
// src/lib/turnos/cobros.ts) y el servidor vuelve a validar todo al cerrar.

import { fmtTime } from "@/lib/datetime";
import { METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import { TOPE_DEL_LOTE, formDataDelLote, type PedidoDeCierre, type Permisos, type TurnoSinCerrar } from "@/lib/turnos/cierre-lote";
import { diaMas, fechaLarga, pesos } from "../agenda-core";

export { TOPE_DEL_LOTE };

/** Lo que la bandeja lee de un turno (un `TurnoSinCerrar` del loader sirve tal cual). */
export type TurnoPendiente = Pick<
  TurnoSinCerrar,
  | "id"
  | "clienteId"
  | "inicio"
  | "dia"
  | "clienta"
  | "telefono"
  | "servicio"
  | "profesional"
  | "profesionalId"
  | "estado"
  | "precio"
  | "cobrado"
  | "saldo"
  | "veredicto"
>;

/**
 * Lo que la bandeja mira de los permisos (el loader trae más campos) y de la caja: con la caja de
 * HOY cerrada no se puede asentar un cobro, así que las líneas con saldo sólo ofrecen dejarlo.
 */
export type PermisosDeLaBandeja = Pick<Permisos, "cobrar" | "terminar"> & { cajaDeHoyCerrada?: boolean };

export const MOTIVO_CAJA_CERRADA = "La caja de hoy ya está cerrada: cerralo dejando el saldo y cobralo mañana.";

// ── Quién cobra qué ──────────────────────────────────────────────────────────

/** ¿Quien mira puede cobrar ESTE turno, hoy? (capacidad + veredicto del servidor + caja abierta). */
export function cobraEste(t: Pick<TurnoPendiente, "veredicto">, p: PermisosDeLaBandeja): boolean {
  return p.cobrar && t.veredicto.ok && !p.cajaDeHoyCerrada;
}

/** ¿Ya no falta nada? (saldo ≤ 0: lo cubrió la seña o un pago anterior). */
export function yaPago(t: Pick<TurnoPendiente, "saldo">): boolean {
  return t.saldo <= 0;
}

/**
 * Las teclas del renglón (principio 1: una intención = una tecla; lo demás a «⋯»).
 *   · pagado → [✓ Vino] (cierra sin cobro);
 *   · con saldo y quien mira cobra → [✓ Vino] (despliega los medios) · [Debe] · [✗ No vino];
 *   · con saldo y no lo puede cobrar (la profesional que cobra aparte, o la caja de hoy ya
 *     cerrada) → [Terminar y dejar el saldo], el motivo a la vista y «No vino» en «⋯».
 */
export type TeclasDelRenglon =
  | { tipo: "ninguna" }
  | { tipo: "pagado" }
  | { tipo: "cobrar" }
  | { tipo: "cobra-aparte"; motivo: string };

export function teclasDelRenglon(t: TurnoPendiente, p: PermisosDeLaBandeja): TeclasDelRenglon {
  if (!p.terminar) return { tipo: "ninguna" };
  if (yaPago(t)) return { tipo: "pagado" };
  if (cobraEste(t, p)) return { tipo: "cobrar" };
  const motivo = !t.veredicto.ok ? t.veredicto.motivo : p.cajaDeHoyCerrada && p.cobrar ? MOTIVO_CAJA_CERRADA : "No podés cobrar este turno.";
  return { tipo: "cobra-aparte", motivo };
}

// ── Días ─────────────────────────────────────────────────────────────────────

/** El día del turno en la zona del negocio («2026-10-19»; lo calcula el servidor). */
export function diaDelTurno(t: Pick<TurnoPendiente, "dia">): string {
  return t.dia;
}

/** «10:00» en la zona del negocio. */
export function horaDelTurno(t: Pick<TurnoPendiente, "inicio">): string {
  return fmtTime(t.inicio);
}

/** Cómo se titula el bloque del día: «Ayer» o «Sábado 19 de octubre». */
export function tituloDelDia(dia: string, hoy: string): string {
  if (dia === hoy) return "Hoy";
  if (dia === diaMas(hoy, -1)) return "Ayer";
  return fechaLarga(dia);
}

export type CuentaDeProfesional = { profesionalId: string; nombre: string; cuenta: number };

export type DiaDeLaBandeja = {
  dia: string;
  turnos: TurnoPendiente[];
  /** Σ de lo que falta cobrar ese día. */
  porCobrar: number;
  /** Cuántos tiene cada profesional ese día (por nombre). */
  porProfesional: CuentaDeProfesional[];
};

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");

function contarPorProfesional(turnos: readonly TurnoPendiente[]): CuentaDeProfesional[] {
  const m = new Map<string, CuentaDeProfesional>();
  for (const t of turnos) {
    const c = m.get(t.profesionalId) ?? { profesionalId: t.profesionalId, nombre: t.profesional, cuenta: 0 };
    c.cuenta += 1;
    m.set(t.profesionalId, c);
  }
  return [...m.values()].sort(porNombre);
}

/** Agrupa por día: el día más nuevo arriba (ayer primero); adentro, por hora. */
export function agruparPorDia(turnos: readonly TurnoPendiente[]): DiaDeLaBandeja[] {
  const m = new Map<string, TurnoPendiente[]>();
  for (const t of turnos) {
    const d = diaDelTurno(t);
    const arr = m.get(d) ?? [];
    arr.push(t);
    m.set(d, arr);
  }
  return [...m.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dia, lista]) => {
      const ordenados = [...lista].sort((x, y) => new Date(x.inicio).getTime() - new Date(y.inicio).getTime());
      return {
        dia,
        turnos: ordenados,
        porCobrar: suma(ordenados.map((t) => Math.max(0, t.saldo))),
        porProfesional: contarPorProfesional(ordenados),
      };
    });
}

// ── Filtro por profesional y buscador ────────────────────────────────────────

export type ProfesionalDeLaBandeja = { id: string; nombre: string; cuenta: number; cobraAparte: boolean };

/** Las opciones del filtro: cada profesional con su cuenta y si cobra aparte (para quien mira). */
export function profesionalesDeLaBandeja(turnos: readonly TurnoPendiente[], p: PermisosDeLaBandeja): ProfesionalDeLaBandeja[] {
  const m = new Map<string, ProfesionalDeLaBandeja>();
  for (const t of turnos) {
    const x = m.get(t.profesionalId) ?? { id: t.profesionalId, nombre: t.profesional, cuenta: 0, cobraAparte: false };
    x.cuenta += 1;
    if (p.cobrar && !t.veredicto.ok) x.cobraAparte = true;
    m.set(t.profesionalId, x);
  }
  return [...m.values()].sort(porNombre);
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtra por profesional («» = todas) y por lo que se busque (clienta, servicio o teléfono). */
export function filtrarTurnos(
  turnos: readonly TurnoPendiente[],
  f: { profesionalId?: string | null; buscar?: string | null },
): TurnoPendiente[] {
  const q = sinTildes((f.buscar ?? "").trim());
  const digitos = q.replace(/\D/g, "");
  return turnos.filter((t) => {
    if (f.profesionalId && t.profesionalId !== f.profesionalId) return false;
    if (!q) return true;
    if (sinTildes(t.clienta).includes(q) || sinTildes(t.servicio).includes(q)) return true;
    return digitos.length >= 3 && t.telefono.replace(/\D/g, "").includes(digitos);
  });
}

// ── La línea de estado ───────────────────────────────────────────────────────

export type LineaDeLaBandeja = {
  sinCerrar: number;
  /** Σ de saldos > 0 (lo que falta cobrar, sea quien sea que lo cobre). */
  porCobrar: number;
  /** Turnos que ya tienen plata adentro (la seña o un pago anterior). */
  conSenia: number;
  /** Las profesionales que cobran aparte, con cuántos turnos (sólo si quien mira cobra). */
  cobranAparte: { nombre: string; cuenta: number }[];
  /** Cuántos se cierran con «Cerrar las que ya pagaron todo». */
  yaPagaron: number;
};

export function lineaDeLaBandeja(turnos: readonly TurnoPendiente[], p: PermisosDeLaBandeja): LineaDeLaBandeja {
  const aparte = new Map<string, { nombre: string; cuenta: number }>();
  for (const t of turnos) {
    if (!p.cobrar || t.veredicto.ok) continue;
    const a = aparte.get(t.profesionalId) ?? { nombre: t.profesional, cuenta: 0 };
    a.cuenta += 1;
    aparte.set(t.profesionalId, a);
  }
  return {
    sinCerrar: turnos.length,
    porCobrar: suma(turnos.map((t) => Math.max(0, t.saldo))),
    conSenia: turnos.filter((t) => t.cobrado > 0).length,
    cobranAparte: [...aparte.values()].sort(porNombre),
    yaPagaron: lasQueYaPagaron(turnos, p).length,
  };
}

/** Los datos de la línea en palabras («15 sin cerrar», «$142.000 por cobrar», …). Sin ceros de relleno. */
export function textosDeLaLinea(l: LineaDeLaBandeja): string[] {
  const textos = [`${l.sinCerrar} sin cerrar`];
  if (l.porCobrar > 0) textos.push(`${pesos(l.porCobrar)} por cobrar`);
  if (l.conSenia > 0) textos.push(`${l.conSenia} con seña`);
  for (const a of l.cobranAparte) textos.push(`${a.cuenta} de ${a.nombre} (cobra aparte)`);
  return textos;
}

// ── «Cerrar las que ya pagaron todo» ─────────────────────────────────────────

/** Los que no deben nada (saldo ≤ 0): se cierran sin ningún cobro nuevo. */
export function lasQueYaPagaron(turnos: readonly TurnoPendiente[], p: PermisosDeLaBandeja): TurnoPendiente[] {
  if (!p.terminar) return [];
  return turnos.filter(yaPago);
}

// ── El detalle de plata de un renglón ────────────────────────────────────────

/** «$32.000 · seña $5.000 · falta $27.000» / «$6.000 · pagado ✓» / «$8.000 · falta $8.000». */
export function detalleDePlata(t: Pick<TurnoPendiente, "precio" | "cobrado" | "saldo">): string {
  const partes = [pesos(t.precio)];
  if (t.saldo <= 0) {
    partes.push("pagado ✓");
    return partes.join(" · ");
  }
  if (t.cobrado > 0) partes.push(`seña ${pesos(t.cobrado)}`);
  partes.push(`falta ${pesos(t.saldo)}`);
  return partes.join(" · ");
}

// ── Selección y lote ─────────────────────────────────────────────────────────

/** Marca o desmarca un turno (devuelve un conjunto nuevo: sirve como estado de React). */
export function alternar(sel: ReadonlySet<string>, id: string): Set<string> {
  const n = new Set(sel);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}

/** Marca todos los de una lista (o los desmarca si ya estaban todos marcados). */
export function alternarTodos(sel: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const n = new Set(sel);
  const todos = ids.length > 0 && ids.every((id) => n.has(id));
  for (const id of ids) {
    if (todos) n.delete(id);
    else n.add(id);
  }
  return n;
}

/** Se pueden marcar los que quien mira puede cerrar. */
export function seleccionable(_t: TurnoPendiente, p: PermisosDeLaBandeja): boolean {
  return p.terminar;
}

export type ResumenDelLote = {
  cantidad: number;
  /** Σ de saldos que se cobran con el medio del lote. */
  aCobrar: number;
  /** Cuántos llevan cobro. */
  conCobro: number;
  /** Cuántos ya estaban pagos (se cierran sin cobro). */
  yaPagos: number;
  /** Cuántos se cierran dejando el saldo (la profesional que cobra aparte). */
  dejanSaldo: number;
};

export function resumenDelLote(turnos: readonly TurnoPendiente[], sel: ReadonlySet<string>, p: PermisosDeLaBandeja): ResumenDelLote {
  const marcados = turnos.filter((t) => sel.has(t.id) && seleccionable(t, p));
  let aCobrar = 0;
  let conCobro = 0;
  let yaPagos = 0;
  let dejanSaldo = 0;
  for (const t of marcados) {
    if (yaPago(t)) yaPagos += 1;
    else if (cobraEste(t, p)) {
      conCobro += 1;
      aCobrar += t.saldo;
    } else dejanSaldo += 1;
  }
  return { cantidad: marcados.length, aCobrar: redondear(aCobrar), conCobro, yaPagos, dejanSaldo };
}

/** «en efectivo», «por Mercado Pago», «por transferencia». */
export function medioEnPalabras(m: MetodoDePago): string {
  return m === "EFECTIVO" ? "en efectivo" : `por ${m === "TRANSFERENCIA" ? "transferencia" : METODO_LABEL[m]}`;
}

const turnosEnPalabras = (n: number) => `${n} ${n === 1 ? "turno" : "turnos"}`;

/**
 * La pregunta antes de cerrar el lote (mueve plata: se confirma). «¿Cerrar 8 turnos y cobrar
 * $94.000 en efectivo?»; si no hay nada que cobrar, «¿Cerrar 4 turnos? No se cobra nada: ya
 * estaban pagos.»
 */
export function textoDeConfirmacion(r: ResumenDelLote, medio: MetodoDePago | null): string {
  if (r.aCobrar > 0 && medio) return `¿Cerrar ${turnosEnPalabras(r.cantidad)} y cobrar ${pesos(r.aCobrar)} ${medioEnPalabras(medio)}?`;
  return `¿Cerrar ${turnosEnPalabras(r.cantidad)}? No se cobra nada.`;
}

/** La letra chica de la confirmación: qué pasa con los que no llevan cobro. «» si no hay. */
export function detalleDeConfirmacion(r: ResumenDelLote): string {
  const partes: string[] = [];
  if (r.yaPagos > 0) partes.push(r.yaPagos === 1 ? "1 ya estaba pago" : `${r.yaPagos} ya estaban pagos`);
  if (r.dejanSaldo > 0) partes.push(r.dejanSaldo === 1 ? "1 queda con su saldo (cobra aparte)" : `${r.dejanSaldo} quedan con su saldo (cobran aparte)`);
  return partes.join(" · ");
}

/** ¿El lote necesita que se elija un medio? (sí, si algún marcado lleva cobro). */
export function loteNecesitaMedio(r: ResumenDelLote): boolean {
  return r.conCobro > 0;
}

// ── Lo que viaja al servidor ─────────────────────────────────────────────────

export type DestinoSenia = "retener" | "devolver";

/** El pedido de «vino» de un turno: sin saldo, sin medio; con saldo, el medio o dejar el saldo. */
export function itemDeVino(t: TurnoPendiente, p: PermisosDeLaBandeja, medio: MetodoDePago | null): PedidoDeCierre | null {
  if (yaPago(t)) return { id: t.id, accion: "vino" };
  if (!cobraEste(t, p)) return { id: t.id, accion: "debe" };
  if (!medio) return null;
  return { id: t.id, accion: "vino", method: medio };
}

/** Los pedidos del lote marcado (los que necesitan medio y no lo tienen quedan afuera). */
export function itemsDelLote(
  turnos: readonly TurnoPendiente[],
  sel: ReadonlySet<string>,
  p: PermisosDeLaBandeja,
  medio: MetodoDePago | null,
): PedidoDeCierre[] {
  const items: PedidoDeCierre[] = [];
  for (const t of turnos) {
    if (!sel.has(t.id) || !seleccionable(t, p)) continue;
    const i = itemDeVino(t, p, medio);
    if (i) items.push(i);
  }
  return items;
}

/** El formulario de `cerrarTurnosEnLote` (el formato vive en cierre-lote.ts). */
export const formularioDeLote = formDataDelLote;

/** La bandeja manda de a tandas (≤ `TOPE_DEL_LOTE`) para mostrar el progreso línea por línea. */
export const TANDA = 5;

export function partirEnTandas<T>(items: readonly T[], tamano = TANDA): T[][] {
  const n = Math.max(1, Math.floor(tamano));
  const tandas: T[][] = [];
  for (let i = 0; i < items.length; i += n) tandas.push(items.slice(i, i + n));
  return tandas;
}

/** El aviso al terminar el lote: «8 cerradas · 1 no se pudo: la caja del viernes ya está cerrada». */
export function avisoDelLote(resultados: readonly { ok: boolean; error?: string }[]): { texto: string; tono: "ok" | "error" } {
  const ok = resultados.filter((r) => r.ok).length;
  const fallidos = resultados.filter((r) => !r.ok);
  const cerradas = ok === 1 ? "1 cerrada" : `${ok} cerradas`;
  if (fallidos.length === 0) return { texto: cerradas, tono: "ok" };
  const primero = fallidos[0].error ? `: ${primerLetraMinuscula(fallidos[0].error)}` : "";
  const noSe = fallidos.length === 1 ? `1 no se pudo${primero}` : `${fallidos.length} no se pudieron (están en rojo)`;
  return { texto: ok > 0 ? `${cerradas} · ${noSe}` : noSe.charAt(0).toUpperCase() + noSe.slice(1), tono: "error" };
}

/** ¿El error es de caja cerrada? Ahí el aviso lo nombra (las teclas [Cobrarlo hoy] [Queda debiendo] van igual). */
export function esDeCajaCerrada(error: string | undefined): boolean {
  return !!error && /caja/i.test(error) && /cerrad/i.test(error);
}

/**
 * Las teclas de una línea que falló (CH-006): con saldo, [Cobrarlo hoy] (vuelve a abrir los medios:
 * el cobro entra en la caja de hoy) si quien mira lo puede cobrar hoy, y [Queda debiendo]. Sin
 * saldo no hay nada que elegir: el motivo dice qué hacer.
 */
export function teclasDeLaFalla(t: Pick<TurnoPendiente, "saldo" | "veredicto">, p: PermisosDeLaBandeja): { cobrarHoy: boolean; debe: boolean } {
  const conSaldo = t.saldo > 0 && p.terminar;
  return { cobrarHoy: conSaldo && cobraEste(t, p), debe: conSaldo };
}

// ── Vacío ────────────────────────────────────────────────────────────────────

export const VACIO = {
  titulo: "Listo, no quedó nada sin cerrar",
  accion: { etiqueta: "Ir a cerrar la caja", href: "/admin/caja/cierre" },
} as const;

// ── Auxiliares ───────────────────────────────────────────────────────────────

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function suma(ns: readonly number[]): number {
  return redondear(ns.reduce((a, b) => a + b, 0));
}

function primerLetraMinuscula(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
