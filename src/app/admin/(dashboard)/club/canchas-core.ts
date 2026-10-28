// ============================================================================
// LAS CANCHAS — mantenimiento, bloqueos, plan lluvia, turnos fijos y lista de espera. PURO.
// ============================================================================
//
// Lo que el club pidió tener en un solo lugar y fuera de la agenda («Mantenimiento y lluvia», REINGENIERIA.md §10):
//   · mantenimiento de una cancha (con motivo), y bloqueos de un horario que NO pisan turnos;
//   · plan lluvia de un toque: lo de la descubierta pasa a una techada libre; si no hay, se suspende (antes de
//     empezar: lo pagado vuelve como crédito o queda para devolver; jugando: sólo el tiempo no jugado). La previa
//     corre el motor sobre una COPIA: lo que se anuncia es lo que va a pasar;
//   · turnos fijos semanales: se crean una vez y se bajan a la grilla día por día (`materializarFijos`, que nunca
//     pisa: avisa el choque);
//   · lista de espera: quién quiere cancha y qué hueco libre le sirve, para darle el turno de un toque.

import {
  NOMBRE_DIA,
  anotarEspera,
  asignarDesdeEspera,
  bloquear,
  cancha as canchaDe,
  configurarMantenimiento,
  configurarTecho,
  crearFijo,
  darDeBajaFijo,
  diaSemana,
  fijoBajadoEl,
  fijoJuegaEl,
  hhmm,
  horarioDe,
  huecosLibres,
  liberarFijo,
  materializarFijos,
  minutosHasta,
  ocupantes,
  pesos,
  planLluvia,
  quitarBloqueo,
  sumarDias,
  validarHueco,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha, Fijo, ResultadoLluvia, TurnoDeLaBaja } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { celularDeLaEspera, textoOfertaEspera } from "./whatsapp-core";

/** Cuántos días para adelante se bajan los fijos a la grilla (los que ve la agenda). */
export const DIAS_A_LA_VISTA = 7;

/** Hasta cuántos días adelante se anota en la lista de espera si la configuración no dice otra cosa. */
const DIAS_DE_ESPERA_DE_FABRICA = 14;

/**
 * Los días en que alguien se puede anotar en la lista de espera (bp-DISENO §3.4, Tanda 2C): de hoy a hoy +
 * `config.diasAdelante` (14, la misma ventana que el calendario de la agenda y el turnero), no sólo la semana a la vista.
 */
export function diasDeLaEspera(estado: EstadoClub, hoy: Fecha): Fecha[] {
  const dias = Number.isInteger(estado.config.diasAdelante) && estado.config.diasAdelante > 0 ? estado.config.diasAdelante : DIAS_DE_ESPERA_DE_FABRICA;
  return Array.from({ length: dias + 1 }, (_, i) => sumarDias(hoy, i));
}

/** Por qué no se anota en la espera para ese día (ya pasó, o fuera de la ventana), o null. */
export function fueraDeLaEspera(estado: EstadoClub, fecha: Fecha, hoy: Fecha): string | null {
  const dias = diasDeLaEspera(estado, hoy);
  if (fecha < hoy) return "Ese día ya pasó.";
  if (fecha > dias[dias.length - 1]) return `La lista de espera llega hasta ${dias.length - 1} días adelante (hasta el ${ddmmDe(dias[dias.length - 1])}).`;
  return null;
}
const ddmmDe = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

// ───────────── mantenimiento y bloqueos ─────────────

export interface VistaCanchas {
  canchas: { id: string; nombre: string; cubierta: boolean; mantenimiento: string | null; turnosHoy: number }[];
  bloqueos: { id: string; texto: string }[];
  descubiertas: number;
  firma: string;
}

export function armarCanchas(estado: EstadoClub, fecha: Fecha): VistaCanchas {
  const vista: Omit<VistaCanchas, "firma"> = {
    canchas: estado.canchas.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      cubierta: c.cubierta,
      mantenimiento: c.estado === "mantenimiento" ? c.motivoMantenimiento || "sin motivo" : null,
      turnosHoy: estado.reservas.filter((r) => r.fecha === fecha && r.canchaId === c.id && ["reservada", "en_cancha"].includes(r.estado)).length,
    })),
    bloqueos: estado.bloqueos
      .filter((b) => b.fecha >= fecha)
      .sort((a, b) => (a.fecha + String(a.desde).padStart(5, "0")).localeCompare(b.fecha + String(b.desde).padStart(5, "0")))
      .map((b) => ({ id: b.id, texto: `${ddmm(b.fecha)} ${hhmm(b.desde)}–${hhmm(b.hasta)} · ${b.canchaId === "*" ? "todo el club" : (canchaDe(estado, b.canchaId)?.nombre ?? "")} · ${b.motivo}` })),
    descubiertas: estado.canchas.filter((c) => !c.cubierta).length,
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

/** Las horas del día para elegir desde/hasta (cada `paso`, de la apertura al cierre). */
export function horasDelDia(estado: EstadoClub, fecha: Fecha): { min: number; texto: string }[] {
  const { abre, cierra } = horarioDe(estado, fecha);
  const out: { min: number; texto: string }[] = [];
  for (let m = abre; m <= cierra; m += estado.config.paso) out.push({ min: m, texto: hhmm(m) });
  return out;
}

/** La previa del plan lluvia: corre el motor sobre una copia y dice qué pasa con cada turno. */
export function previaLluvia(estado: EstadoClub, fecha: Fecha, desde: number, hasta: number, ahora: Ahora, copia: EstadoClub = structuredClone(estado)): { lineas: string[]; resultado: ResultadoLluvia[] } {
  const { resultado } = planLluvia(copia, fecha, desde, hasta, ahora);
  return { resultado, lineas: resultado.map(lineaLluvia) };
}

export function lineaLluvia(x: ResultadoLluvia): string {
  if (x.accion === "movido") return `${x.titular}: pasa a ${x.cancha} (techada), mismo horario.`;
  if (x.accion === "cortado") return `${x.titular}: se corta el partido; se reconocen ${pesos(x.credito ?? 0)} por ${x.noJugados} min sin jugar.`;
  return x.devolverEnMano
    ? `${x.titular}: se suspende; hay que devolverle ${pesos(x.devolverEnMano)} en mano.`
    : `${x.titular}: se suspende${x.credito ? `; ${pesos(x.credito)} vuelven como crédito` : ""}.`;
}

export type AccionCanchas =
  | { tipo: "mantenimiento"; canchaId: string; activo: boolean; motivo: string }
  | { tipo: "techo"; canchaId: string; cubierta: boolean }
  | { tipo: "bloquear"; canchaId: string; fecha: Fecha; desde: number; hasta: number; motivo: string }
  | { tipo: "quitarBloqueo"; bloqueoId: string }
  | { tipo: "lluvia"; fecha: Fecha; desde: number; hasta: number };

/**
 * Qué se deshace (alineado con `DESHACIBLES` del club vanilla, app.mjs:24): ni la lluvia, ni el mantenimiento, ni los
 * bloqueos, ni crear/bajar fijos, ni sacar de la espera. Cada uno tiene su inversa a la vista (habilitar, quitar el
 * bloqueo, dar de baja, volver a anotar); la lluvia, su previa. Anotar en la espera y darle el turno sí.
 * Tanda 3C (bp-DISENO §3.10): DAR DE BAJA un fijo, pausarlo y liberar una fecha SÍ se deshacen (6 s, la foto de antes):
 * vuelven el fijo y sus turnos como estaban, con su plata.
 */
export const SE_DESHACE = {
  mantenimiento: false,
  techo: false,
  bloquear: false,
  quitarBloqueo: false,
  lluvia: false,
  nuevoFijo: false,
  bajarFijos: false,
  bajaFijo: true,
  pausaFijo: true,
  liberarFijo: true,
  anotar: true,
  asignar: true,
  quitar: false,
} as const satisfies Record<AccionCanchas["tipo"] | AccionEspera["tipo"] | "nuevoFijo" | "bajarFijos" | "bajaFijo" | "pausaFijo" | "liberarFijo", boolean>;

/** Lo que devuelve una acción de las canchas; la lluvia, además, lo que pasó con cada turno (para avisarles). */
export type DesenlaceCanchas = Desenlace & { lluvia?: ResultadoLluvia[] };

export function ejecutarCanchas(estado: EstadoClub, a: AccionCanchas, ahora: Ahora): DesenlaceCanchas {
  switch (a.tipo) {
    case "mantenimiento": {
      const res = configurarMantenimiento(estado, a.canchaId, { activo: a.activo, motivo: a.motivo }, ahora);
      const c = canchaDe(estado, a.canchaId)?.nombre ?? "La cancha";
      return res.ok ? { ok: true, mensaje: a.activo ? `${c} en mantenimiento: no se dan turnos ahí.` : `${c} habilitada otra vez.` } : { ok: false, mensaje: res.motivo };
    }
    case "techo": {
      const res = configurarTecho(estado, a.canchaId, a.cubierta, ahora);
      const c = canchaDe(estado, a.canchaId)?.nombre ?? "La cancha";
      return res.ok ? { ok: true, mensaje: `${c}: ${a.cubierta ? "techada" : "descubierta"}.` } : { ok: false, mensaje: res.motivo };
    }
    case "bloquear": {
      if (!a.motivo.trim()) return { ok: false, mensaje: "Poné el motivo del bloqueo (torneo, mantenimiento, evento)." };
      const res = bloquear(estado, { canchaId: a.canchaId, fecha: a.fecha, desde: a.desde, hasta: a.hasta, motivo: a.motivo.trim() }, ahora);
      if (!res.ok) return { ok: false, mensaje: `${res.motivo}${"choques" in res && res.choques?.length ? ` (${res.choques.map((r) => `${r.titular} ${hhmm(r.inicio)}`).join(", ")})` : ""}` };
      return { ok: true, mensaje: `Bloqueado ${a.canchaId === "*" ? "todo el club" : (canchaDe(estado, a.canchaId)?.nombre ?? "")} de ${hhmm(a.desde)} a ${hhmm(a.hasta)}.` };
    }
    case "quitarBloqueo": {
      const res = quitarBloqueo(estado, a.bloqueoId, ahora);
      return res.ok ? { ok: true, mensaje: "Bloqueo quitado." } : { ok: false, mensaje: res.motivo };
    }
    case "lluvia": {
      if (!(a.hasta > a.desde)) return { ok: false, mensaje: "El «hasta» tiene que ser después del «desde»." };
      const { resultado } = planLluvia(estado, a.fecha, a.desde, a.hasta, ahora);
      if (!resultado.length) return { ok: true, mensaje: "Plan lluvia: no hay turnos en la descubierta en ese horario.", lluvia: [] };
      const n = (k: ResultadoLluvia["accion"]) => resultado.filter((x) => x.accion === k).length;
      return { ok: true, mensaje: `Plan lluvia: ${n("movido")} movidos a techada, ${n("cortado")} cortados y ${n("suspendido")} suspendidos. Avisales por WhatsApp.`, lluvia: resultado };
    }
  }
}

// ───────────── turnos fijos ─────────────

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
/** «mar 20/10» */
const fechaCorta = (f: Fecha) => `${DIAS_CORTOS[diaSemana(f)]} ${ddmm(f)}`;
const enPlural = (dia: number) => (dia === 6 || dia === 0 ? `${NOMBRE_DIA[dia].toLowerCase()}s` : NOMBRE_DIA[dia].toLowerCase());

/** Cuántas fechas próximas de un fijo se ofrecen para «desde el …» y «liberar el …». */
export const FECHAS_DEL_FIJO = 8;

export interface VistaFijo {
  id: string;
  titular: string;
  texto: string;
  /** «Pausado hasta el 31/1 · vuelve el 3/2», «Juega hasta el 9/11», «Empieza el 30/10»; null si juega como siempre. */
  estado: string | null;
  /** Las próximas fechas en la grilla (o liberadas, o en pausa). */
  proximas: string;
  /** Las próximas fechas que juega (no liberadas, fuera de la pausa, dentro de su vigencia), para elegir. */
  fechas: { fecha: Fecha; texto: string }[];
  /** El celular de su ficha ("" sin ficha): para avisarle por WhatsApp. */
  celular: string;
}

/** Las próximas `n` fechas en que el fijo juega, desde `hoy` (un turno de hoy que ya empezó no cuenta). PURA. */
export function proximasFechasDelFijo(f: Fijo, ahora: Ahora, n = FECHAS_DEL_FIJO): Fecha[] {
  const out: Fecha[] = [];
  let d = ahora.fecha;
  // Hasta un año y medio para adelante (una pausa larga no deja la lista vacía).
  for (let i = 0; i < 560 && out.length < n; i++, d = sumarDias(d, 1)) if (fijoJuegaEl(f, d) && (d > ahora.fecha || minutosHasta(ahora, d, f.inicio) > 0)) out.push(d);
  return out;
}

/**
 * Otro fijo (no `excluirId`) que juega esa fecha, en esa cancha, se superpone con el hueco y todavía no se bajó a la
 * grilla (lo bajado ya lo ve `validarHueco`). Respeta la pausa, las fechas liberadas y la vigencia del otro
 * (`fijoJuegaEl`): si ese día no juega, no choca. PURA. La usan la vuelta de una pausa, `nuevoFijo` y la previa del
 * «Fijo semanal» (alta-core.ts).
 */
export function otroFijoQuePisa(
  estado: EstadoClub,
  h: { canchaId: string; fecha: Fecha; inicio: number; duracion: number },
  excluirId?: string,
): Fijo | undefined {
  const fin = h.inicio + h.duracion;
  return estado.fijos.find(
    (g) => g.id !== excluirId && g.canchaId === h.canchaId && fijoJuegaEl(g, h.fecha) && g.inicio < fin && h.inicio < g.inicio + g.duracion && !fijoBajadoEl(estado, g, h.fecha),
  );
}

/** Cuántas semanas mira el guardián del fijo nuevo: lo mismo que `proximasFechasDelFijo` (hasta un año y medio). */
export const SEMANAS_DEL_GUARDIAN = 80;

/**
 * EL guardián de todo fijo nuevo (dictamen v5, Falla 2): un fijo es para siempre, así que no puede pisar a otro fijo en
 * ninguna de sus próximas fechas (tampoco al que está en pausa y vuelve más adelante). Lo llaman las tres puertas que
 * crean un fijo — `nuevoFijo`, el alta con «Fijo semanal» (alta-core.ts) y «Hacer fijo» desde la cuenta
 * (cuenta-core.ts) — ANTES de `crearFijo`. Devuelve el mensaje para el mostrador, o `null` si entra. PURA.
 */
export function fijoQuePisaAlNuevo(estado: EstadoClub, h: { canchaId: string; desde: Fecha; inicio: number; duracion: number }): string | null {
  for (let fecha = h.desde, i = 0; i < SEMANAS_DEL_GUARDIAN; i++, fecha = sumarDias(fecha, 7)) {
    const otro = otroFijoQuePisa(estado, { canchaId: h.canchaId, fecha, inicio: h.inicio, duracion: h.duracion });
    if (otro) return `Ese horario ya es del fijo de ${otro.titular} (${enPlural(otro.dia)} ${hhmm(otro.inicio)}${fecha > h.desde ? `; lo juega el ${fechaCorta(fecha)}` : ""}). Elegí otro día, hora o cancha.`;
  }
  return null;
}

/**
 * La vuelta de un fijo pausado mirando la GRILLA, no sólo el calendario: recorre sus fechas después de la pausa y la
 * primera que de verdad juega (ya bajada a la grilla, o con el hueco libre) es «vuelve». Las de antes que no pueden
 * volver porque el hueco ya lo vendió otro (otro puesto, la web) o está bloqueado van en `chocan`, aunque todavía no
 * se hubieran bajado (fuera de la ventana de reserva). Las que el titular liberó o canceló aparte se saltan sin choque.
 */
export function vueltaDelFijo(estado: EstadoClub, f: Fijo, desde: Fecha): { vuelve: Fecha | null; chocan: ChoqueDeLaVuelta[] } {
  const chocan: ChoqueDeLaVuelta[] = [];
  // Mira lo mismo que el guardián del fijo nuevo (80 semanas), no las 8 fechas de la hoja: con el fijo de otro acotado
  // pero largo (más de 8 fechas) la vuelta existe y hay que decirla (dictamen v6, observación 2).
  for (const fecha of proximasFechasDelFijo(f, { fecha: desde, min: 0 }, SEMANAS_DEL_GUARDIAN)) {
    if (estado.reservas.some((r) => r.fijoId === f.id && r.fecha === fecha && r.estado === "reservada")) return { vuelve: fecha, chocan };
    if (fijoBajadoEl(estado, f, fecha)) continue;
    const v = validarHueco(estado, { canchaId: f.canchaId, fecha, inicio: f.inicio, duracion: f.duracion });
    if (!v.ok) {
      // Dictamen v8, C1: si lo que ocupa el hueco es el turno YA BAJADO de otro fijo, el choque es con ese fijo (como
      // el que todavía no se bajó): lleva su `fijoId`, para que la fecha se le libere al pausado y espere a ése.
      // Dictamen v9, obs. 1: si lo de la grilla es un bloqueo o un turno suelto, detrás puede haber otro fijo que juega
      // esa fecha sin bajar: el choque es con él (lleva su `fijoId`), así la fecha se le libera al pausado y no figuran
      // los dos. Obs. 2: la hora es la del turno de la grilla (puede estar movido), no la del fijo.
      const oc = ocupanteDeLaGrilla(estado, f, fecha);
      const deFijo = oc?.fijo ?? otroFijoQuePisa(estado, { canchaId: f.canchaId, fecha, inicio: f.inicio, duracion: f.duracion }, f.id);
      const hora = oc?.fijo ? (oc.inicio ?? oc.fijo.inicio) : deFijo?.inicio ?? 0;
      chocan.push(deFijo ? { fecha, motivo: `se pisa con el fijo de ${deFijo.titular} (${hhmm(hora)})`, fijoId: deFijo.id } : { fecha, motivo: v.motivo ?? "el hueco ya está tomado" });
      continue;
    }
    // Un fijo de otro que juega esa fecha y todavía no se bajó también la ocupa (Falla 1 del dictamen v4).
    const otro = otroFijoQuePisa(estado, { canchaId: f.canchaId, fecha, inicio: f.inicio, duracion: f.duracion }, f.id);
    if (!otro) return { vuelve: fecha, chocan };
    chocan.push({ fecha, motivo: `se pisa con el fijo de ${otro.titular} (${hhmm(otro.inicio)})`, fijoId: otro.id });
  }
  return { vuelve: null, chocan };
}

/**
 * Dictamen v6, observación 1: después de la vuelta, ¿algún otro fijo sigue jugando el mismo hueco? (estado heredado:
 * dos fijos solapados que el guardián de hoy ya no deja crear). Barre las fechas del fijo desde `desde` como
 * `fijoQuePisaAlNuevo`, sin mirar lo bajado a la grilla: si los dos juegan esa fecha, se pisan. PURA.
 */
export function otroFijoQueSigue(estado: EstadoClub, f: Fijo, desde: Fecha): { otro: Fijo; fecha: Fecha } | null {
  for (const fecha of proximasFechasDelFijo(f, { fecha: desde, min: 0 }, SEMANAS_DEL_GUARDIAN)) {
    const otro = estado.fijos.find((g) => g.id !== f.id && g.canchaId === f.canchaId && g.inicio < f.inicio + f.duracion && f.inicio < g.inicio + g.duracion && fijoJuegaEl(g, fecha));
    if (otro) return { otro, fecha };
  }
  return null;
}

/** «el mar 3/11», «el mar 3/11 y el mar 10/11»; más de 4: «6 fechas, del mar 3/11 al mar 8/12». */
function fechasDichas(fechas: Fecha[], y = "y"): string {
  if (fechas.length > 4) return `${fechas.length} fechas, del ${fechaCorta(fechas[0])} al ${fechaCorta(fechas[fechas.length - 1])}`;
  const xs = fechas.map((x) => `el ${fechaCorta(x)}`);
  return xs.length > 1 ? `${xs.slice(0, -1).join(` ${y} `)} ${y} ${xs[xs.length - 1]}` : (xs[0] ?? "");
}

function estadoDelFijo(estado: EstadoClub, f: Fijo, ahora: Ahora): string | null {
  if (f.pausa && f.pausa.hasta >= ahora.fecha) {
    const vuelve = vueltaDelFijo(estado, f, sumarDias(f.pausa.hasta, 1)).vuelve;
    return `${f.pausa.desde > ahora.fecha ? `Se pausa del ${ddmm(f.pausa.desde)}` : "Pausado"} hasta el ${ddmm(f.pausa.hasta)}${vuelve ? ` · vuelve el ${ddmm(vuelve)}` : ""}`;
  }
  if (f.hasta) return `Juega hasta el ${ddmm(f.hasta)}`;
  if (f.desde && f.desde > ahora.fecha) return `Empieza el ${ddmm(f.desde)}`;
  return null;
}

export function armarFijos(estado: EstadoClub, hoy: Fecha | Ahora): { fijos: VistaFijo[]; firma: string } {
  const ahora: Ahora = typeof hoy === "string" ? { fecha: hoy, min: 0 } : hoy;
  const fijos = estado.fijos.map((f) => {
    const fechas = Array.from({ length: DIAS_A_LA_VISTA }, (_, i) => sumarDias(ahora.fecha, i)).filter((d) => diaSemana(d) === f.dia);
    const proximas = fechas
      .map((d) =>
        f.excepciones.includes(d)
          ? `${ddmm(d)} liberado`
          : f.pausa && d >= f.pausa.desde && d <= f.pausa.hasta
            ? `${ddmm(d)} en pausa`
            : !fijoJuegaEl(f, d)
              ? `${ddmm(d)} no juega`
              : estado.reservas.some((r) => r.fijoId === f.id && r.fecha === d && r.estado !== "cancelada")
                ? `${ddmm(d)} en la grilla`
                : `${ddmm(d)} sin bajar`,
      )
      .join(" · ");
    return {
      id: f.id,
      titular: f.titular,
      texto: `${f.titular} · ${NOMBRE_DIA[f.dia].toLowerCase()} ${hhmm(f.inicio)} a ${hhmm(f.inicio + f.duracion)} · ${canchaDe(estado, f.canchaId)?.nombre ?? ""}`,
      estado: estadoDelFijo(estado, f, ahora),
      proximas,
      fechas: proximasFechasDelFijo(f, ahora).map((fecha) => ({ fecha, texto: fechaCorta(fecha) })),
      celular: (f.clienteId && estado.clientes.find((c) => c.id === f.clienteId)?.tel) || "",
    };
  });
  return { fijos, firma: JSON.stringify(fijos) };
}

/** Baja los fijos a la grilla para los próximos días. Idempotente; lo que choca, avisa (nunca pisa). */
export function bajarFijos(estado: EstadoClub, hoy: Fecha): Desenlace {
  const choques: string[] = [];
  const antes = estado.reservas.length;
  for (let i = 0; i < DIAS_A_LA_VISTA; i++) {
    const d = sumarDias(hoy, i);
    for (const c of materializarFijos(estado, d)) choques.push(`${c.fijo.titular} el ${ddmm(d)}: ${c.motivo}`);
  }
  const nuevos = estado.reservas.length - antes;
  const base = nuevos ? `${nuevos} turno${nuevos > 1 ? "s" : ""} fijo${nuevos > 1 ? "s" : ""} a la grilla.` : "Los fijos ya estaban en la grilla.";
  return { ok: choques.length === 0, mensaje: choques.length ? `${base} No entraron: ${choques.join(" · ")}.` : base };
}

/**
 * Crear un fijo: se valida el hueco de la próxima vez que toca (el motor no lo valida al crearlo) y se baja a la
 * grilla de los próximos días en el acto.
 */
export function nuevoFijo(
  estado: EstadoClub,
  datos: { titular: string; clienteId: string | null; canchaId: string; dia: number; inicio: number; duracion: number },
  ahora: Ahora,
): Desenlace {
  const titular = datos.titular.trim();
  if (!titular) return { ok: false, mensaje: "¿A nombre de quién va el turno fijo?" };
  if (!(datos.dia >= 0 && datos.dia <= 6)) return { ok: false, mensaje: "Elegí el día de la semana." };
  let proxima = ahora.fecha;
  for (let i = 0; i < 14 && (diaSemana(proxima) !== datos.dia || minutosHasta(ahora, proxima, datos.inicio) + datos.duracion <= 0); i++) proxima = sumarDias(proxima, 1);
  const v = validarHueco(estado, { canchaId: datos.canchaId, fecha: proxima, inicio: datos.inicio, duracion: datos.duracion });
  if (!v.ok) return { ok: false, mensaje: `El ${ddmm(proxima)} no entra: ${v.motivo}` };
  const pisa = fijoQuePisaAlNuevo(estado, { canchaId: datos.canchaId, desde: proxima, inicio: datos.inicio, duracion: datos.duracion });
  if (pisa) return { ok: false, mensaje: pisa };
  crearFijo(estado, { ...datos, titular });
  const bajada = bajarFijos(estado, ahora.fecha);
  return { ok: true, mensaje: `Turno fijo de ${titular} los ${NOMBRE_DIA[datos.dia].toLowerCase()} a las ${hhmm(datos.inicio)}. ${bajada.mensaje}` };
}

/** Las acciones de los turnos fijos como un solo comando (comandos-core.ts: re-aplicable en otro puesto). */
export type AccionFijo =
  | { tipo: "nuevo"; datos: Parameters<typeof nuevoFijo>[1] }
  | { tipo: "baja"; fijoId: string }
  | { tipo: "bajar" }
  /** Los fijos de UN día más allá de la semana a la vista (el calendario de la agenda, BP-013). */
  | { tipo: "bajarDia"; fecha: Fecha };

export function ejecutarFijo(estado: EstadoClub, a: AccionFijo, ahora: Ahora, auth?: Auth): Desenlace {
  if (a.tipo === "nuevo") return nuevoFijo(estado, a.datos, ahora);
  if (a.tipo === "baja") return bajaFijo(estado, a.fijoId, ahora, auth);
  if (a.tipo === "bajarDia") return bajarFijosDelDia(estado, a.fecha);
  return bajarFijos(estado, ahora.fecha);
}

/** Cuántos fijos de ese día todavía no están en la grilla (para bajarlos al abrir un día lejano del calendario). PURO. */
export function fijosPorBajar(estado: EstadoClub, fecha: Fecha): number {
  return estado.fijos.filter((f) => fijoJuegaEl(f, fecha) && !fijoBajadoEl(estado, f, fecha)).length;
}

/** Baja a la grilla los fijos de un día (idempotente; lo que choca, avisa y no pisa). */
export function bajarFijosDelDia(estado: EstadoClub, fecha: Fecha): Desenlace {
  const antes = estado.reservas.length;
  const choques = materializarFijos(estado, fecha).map((c) => `${c.fijo.titular}: ${c.motivo}`);
  const nuevos = estado.reservas.length - antes;
  const base = nuevos ? `${nuevos} turno${nuevos > 1 ? "s" : ""} fijo${nuevos > 1 ? "s" : ""} del ${ddmm(fecha)} a la grilla.` : `Los fijos del ${ddmm(fecha)} ya estaban en la grilla.`;
  return { ok: choques.length === 0, mensaje: choques.length ? `${base} No entraron: ${choques.join(" · ")}.` : base };
}

// ── dar de baja, pausar, liberar una fecha (Tanda 3C, bp-DISENO §3.10, BP-100…BP-104) ──
//
// La hoja: ¿desde cuándo? [esta semana] [desde el …] [pausar hasta el …] → PREVIA («se liberan 3 turnos · $ 21.000
// vuelven como crédito», turno por turno) → Confirmar → aviso con Deshacer (6 s) y «Avisar a Juan por WhatsApp». Nada
// cambia hasta Confirmar: la previa corre el motor (`darDeBajaFijo`) sobre una COPIA, y lo que dice es lo que pasa.

/** Lo que se pide en la hoja (y viaja en el comando «bajaDeFijo»). */
export type AccionBajaFijo =
  | { tipo: "baja"; fijoId: string; desde: Fecha }
  | { tipo: "pausa"; fijoId: string; desde: Fecha; hasta: Fecha }
  | { tipo: "liberar"; fijoId: string; fecha: Fecha };

/** Un turno que se libera, dicho como en el mostrador: «mar 20/10 20:00 · $ 21.000 vuelven como crédito». */
export function lineaDeLaBaja(t: TurnoDeLaBaja): string {
  const que = t.devuelto > 0 ? `${pesos(t.devuelto)} vuelven como crédito` : t.devolverEnMano > 0 ? `hay que devolverle ${pesos(t.devolverEnMano)} en mano` : t.enSuspenso ? `tarde: la seña de ${pesos(t.pagado)} queda en suspenso` : "sin nada pagado";
  return `${fechaCorta(t.fecha)} ${hhmm(t.inicio)} · ${que}`;
}

/** «3 turnos · $ 21.000 vuelven como crédito · $ 5.000 para devolver en mano». */
function resumenDeLaBaja(turnos: TurnoDeLaBaja[]): string {
  if (!turnos.length) return "No hay turnos suyos en la grilla para liberar";
  const suma = (k: "devuelto" | "devolverEnMano") => turnos.reduce((s, t) => s + t[k], 0);
  const retenido = turnos.reduce((s, t) => s + (t.enSuspenso ? t.pagado : 0), 0);
  return [
    `Se libera${turnos.length > 1 ? `n ${turnos.length} turnos` : " 1 turno"}`,
    suma("devuelto") ? `${pesos(suma("devuelto"))} vuelven como crédito` : null,
    suma("devolverEnMano") ? `${pesos(suma("devolverEnMano"))} para devolver en mano` : null,
    retenido ? `${pesos(retenido)} de seña quedan en suspenso` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Una fecha que tenía que volver a la grilla y choca con un turno vendido mientras tanto (otro puesto o la web). */
export type ChoqueDeLaVuelta = {
  fecha: Fecha;
  motivo: string;
  /** Si choca con otro fijo (todavía sin bajar o ya en la grilla): ése. La fecha se le libera al pausado y espera a ése. */
  fijoId?: string;
};

/** «mar 27/10 20:00 · no vuelve: se pisa con otro turno» (la fecha que la pausa acortada no pudo devolver). */
export function lineaDelChoque(f: Pick<Fijo, "inicio">, c: ChoqueDeLaVuelta): string {
  return `${fechaCorta(c.fecha)} ${hhmm(f.inicio)} · no vuelve: ${c.motivo.replace(/\.$/, "")}`;
}

/** Una fecha que se le había liberado a OTRO fijo por chocar con éste y que ahora vuelve a ese otro. */
export type Recupera = { fijoId: string; titular: string; fecha: Fecha };

type DesenlaceBajaFijo = Desenlace & { turnos?: TurnoDeLaBaja[]; vuelve?: Fecha | null; vuelven?: Fecha[]; chocan?: ChoqueDeLaVuelta[]; quitado?: boolean; recuperan?: Recupera[] };

/**
 * Corre la baja / la pausa / liberar una fecha sobre `estado` (lo MUTA). Lo usan la previa (sobre copia) y el comando.
 * Si salió bien, poda `liberadasPor` (observación 5): lo rechazado no toca nada.
 */
export function ejecutarBajaFijo(estado: EstadoClub, a: AccionBajaFijo, ahora: Ahora, auth?: Auth): DesenlaceBajaFijo {
  const d = correrBajaFijo(estado, a, ahora, auth);
  if (d.ok) podarLiberadasPor(estado, ahora);
  return d;
}

/**
 * Dictamen v6, observación 5: las entradas de `liberadasPor` de fechas que ya pasaron no tienen efecto (la fecha ya se
 * jugó o no); se sacan. Sólo escribe si hay algo que sacar (repetir no cambia la foto).
 */
function podarLiberadasPor(estado: EstadoClub, ahora: Ahora): void {
  for (const g of estado.fijos) {
    if (!g.liberadasPor?.length) continue;
    const quedan = g.liberadasPor.filter((x) => x.fecha >= ahora.fecha);
    if (quedan.length === g.liberadasPor.length) continue;
    if (quedan.length) g.liberadasPor = quedan;
    else delete g.liberadasPor;
  }
}

/** «Juan Fijo recupera el mar 3/11 y el mar 10/11.»; con dos titulares, uno por uno (observación 3: el plural va por titular). */
function textoRecuperan(recuperan: Recupera[]): string {
  if (!recuperan.length) return "";
  const porFijo = new Map<string, Recupera[]>();
  for (const x of recuperan) porFijo.set(x.fijoId, [...(porFijo.get(x.fijoId) ?? []), x]);
  return ` ${[...porFijo.values()].map((xs) => `${xs[0].titular} recupera ${fechasDichas(xs.map((x) => x.fecha))}`).join("; ")}.`;
}

function correrBajaFijo(estado: EstadoClub, a: AccionBajaFijo, ahora: Ahora, auth?: Auth): DesenlaceBajaFijo {
  const f = estado.fijos.find((x) => x.id === a.fijoId);
  if (!f) return { ok: false, mensaje: "Ese turno fijo ya no está (¿lo dio de baja otro puesto?)." };
  const de = `el fijo de ${f.titular} (${enPlural(f.dia)} ${hhmm(f.inicio)})`;
  if (a.tipo === "liberar") {
    if (!fijoJuegaEl(f, a.fecha)) return { ok: false, mensaje: `Ese día ${f.titular} no juega.` };
    if (a.fecha < ahora.fecha) return { ok: false, mensaje: "Ese día ya pasó." };
    const r = estado.reservas.find((x) => x.fijoId === f.id && x.fecha === a.fecha && x.estado === "reservada");
    const pagado = r ? r.pagos.reduce((s, p) => s + p.monto, 0) : 0;
    const res = liberarFijo(estado, f.id, a.fecha, ahora);
    if (!res.ok) return { ok: false, mensaje: res.motivo };
    // Con turno en la grilla, `liberarFijo` devuelve lo de `cancelar` (la plata de ese turno).
    const x = res as { devuelto?: number; devolverEnMano?: number; enSuspenso?: boolean };
    const t: TurnoDeLaBaja = { reservaId: r?.id ?? "", fecha: a.fecha, inicio: f.inicio, canchaId: f.canchaId, pagado, devuelto: x.devuelto ?? 0, devolverEnMano: x.devolverEnMano ?? 0, enSuspenso: !!x.enSuspenso };
    // Observación 4: si esa fecha se le había liberado a otro fijo por chocar con éste, ahora vuelve a ese otro.
    const recuperan = devolverLiberadasPor(estado, f, (fecha) => fecha === a.fecha, ahora);
    return { ok: true, turnos: r ? [t] : [], recuperan, mensaje: `${f.titular} no juega el ${fechaCorta(a.fecha)}: se liberó ese día y los demás siguen.${r && pagado ? ` ${lineaDeLaBaja(t).split(" · ")[1]}.` : ""}${textoRecuperan(recuperan)}` };
  }
  const opciones = { desde: a.desde, pausaHasta: a.tipo === "pausa" ? a.hasta : null, auth: auth ?? null };
  // Dictamen v7, A3b (sólo por comando: la hoja pausa desde hoy): una pausa nueva REEMPLAZA a la anterior, así que si
  // arranca después que ella, las fechas del medio vuelven a jugar. Si alguna ya es de otro fijo (la recuperó al
  // pausarse éste, o la juega desde antes), se pisarían: es precondición del comando y se rechaza sin tocar nada.
  // Dictamen v9, obs. 3: si la fecha del medio la ocupa un turno suelto o un bloqueo, no se rechaza: no vuelve y se dice
  // (lo cerrado en la v3; la grilla nunca pisa). Se junta acá y va en `chocan` del mensaje.
  const delMedio: ChoqueDeLaVuelta[] = [];
  if (a.tipo === "pausa" && f.pausa && a.desde > f.pausa.desde) {
    const sinPausa: Fijo = { ...f, pausa: undefined };
    const primera = f.pausa.desde > ahora.fecha ? f.pausa.desde : ahora.fecha;
    for (let fecha = primera; fecha < a.desde && fecha <= f.pausa.hasta; fecha = sumarDias(fecha, 1)) {
      if (!fijoJuegaEl(sinPausa, fecha)) continue;
      const ocupa = quienOcupaElHueco(estado, f, fecha);
      if (ocupa && !ocupa.fijo && !fijoBajadoEl(estado, f, fecha)) {
        const v = validarHueco(estado, { canchaId: f.canchaId, fecha, inicio: f.inicio, duracion: f.duracion });
        delMedio.push({ fecha, motivo: (!v.ok && v.motivo) || "el hueco ya está tomado" });
      }
      const otro = ocupa?.fijo;
      if (otro)
        return { ok: false, mensaje: `${f.titular} está pausado desde el ${fechaCorta(f.pausa.desde)}. Si la pausa nueva arranca el ${fechaCorta(a.desde)}, volvería a jugar el ${fechaCorta(fecha)}, y ese día el hueco es del fijo de ${otro.titular} (${enPlural(otro.dia)} ${hhmm(otro.inicio)}): se pisarían. Pausalo desde el ${fechaCorta(primera)}.` };
    }
  }
  // Dictamen v5, Falla 1: si al terminar la pausa el hueco es del fijo de otro y no hay ninguna fecha de vuelta, no se
  // le libera nada (cada repetición le sacaba 8 fechas más) ni se cambia la pausa: se avisa y el estado queda igual.
  // Se prueba sobre una copia sólo si hay otro fijo en ese hueco (lo común es que no haya).
  // Dictamen v9, obs. 2: también si en la grilla hay un turno de otro fijo en este hueco (movido desde otro horario).
  const turnoDeOtroFijo = () =>
    estado.reservas.some((r) => r.estado === "reservada" && !!r.fijoId && r.fijoId !== f.id && r.canchaId === f.canchaId && r.fecha >= ahora.fecha && r.inicio < f.inicio + f.duracion && f.inicio < r.inicio + r.duracion);
  if (a.tipo === "pausa" && (estado.fijos.some((g) => g.id !== f.id && seSolapan(f, g)) || turnoDeOtroFijo())) {
    const prueba = structuredClone(estado);
    if (darDeBajaFijo(prueba, f.id, opciones, ahora).ok) {
      const fp = prueba.fijos.find((x) => x.id === f.id)!;
      const g = vueltaDelFijo(prueba, fp, sumarDias(a.hasta, 1));
      const deOtro = g.chocan.find((c) => c.fijoId);
      // Lo que se ofrece está en esta misma hoja (observación 2: «elegí otra hora» no se podía hacer desde acá).
      const salida = "Dalo de baja o liberá sólo las fechas que no viene.";
      if (!g.vuelve && deOtro) {
        const otro = estado.fijos.find((x) => x.id === deOtro.fijoId);
        return { ok: false, mensaje: `El hueco es del fijo de ${otro?.titular ?? "otro"} desde el ${fechaCorta(deOtro.fecha)}: ${f.titular} no tiene a qué volver. ${salida}` };
      }
      // Observación 1: «vuelve» no alcanza si después de esa fecha el otro fijo sigue jugando el mismo hueco (estado
      // heredado: el otro es permanente y sólo liberó una fecha). Se rechaza igual que sin vuelta: nada cambia.
      const sigue = g.vuelve ? otroFijoQueSigue(prueba, fp, g.vuelve) : null;
      if (sigue) {
        const delOtro = `del fijo de ${sigue.otro.titular} (${enPlural(sigue.otro.dia)} ${hhmm(sigue.otro.inicio)})`;
        // Dictamen v7: si el choque es el mismo día de la vuelta, no se dice «volvería el X, pero el X».
        const dicho =
          sigue.fecha === g.vuelve
            ? `${f.titular} no puede volver el ${fechaCorta(sigue.fecha)}: ese día el hueco también es ${delOtro} y se pisarían.`
            : `${f.titular} volvería el ${fechaCorta(g.vuelve!)}, pero el ${fechaCorta(sigue.fecha)} el hueco sigue siendo ${delOtro}: se pisarían.`;
        // …y si el otro fijo es acotado, se ofrece lo que sí funciona: pausar hasta su último día (probado sobre una copia).
        let hastaSuUltimo = "";
        if (sigue.otro.hasta && sigue.otro.hasta > a.hasta) {
          const alt = correrBajaFijo(structuredClone(estado), { ...a, hasta: sigue.otro.hasta }, ahora, auth);
          if (alt.ok) hastaSuUltimo = ` Pausalo hasta el ${fechaCorta(sigue.otro.hasta)} (el último día de ${sigue.otro.titular})${alt.vuelve ? ` y vuelve el ${fechaCorta(alt.vuelve)}` : ""}, dalo de baja o liberá sólo las fechas que no viene.`;
        }
        return { ok: false, mensaje: `${dicho}${hastaSuUltimo || ` ${salida}`}` };
      }
    }
  }
  const res = darDeBajaFijo(estado, f.id, opciones, ahora);
  if (!res.ok) return { ok: false, mensaje: res.motivo };
  const resumen = res.turnos.length ? ` ${resumenDeLaBaja(res.turnos)}.` : "";
  if (a.tipo === "pausa") {
    // «Vuelve solo el …»: la primera fecha después de la pausa que de verdad vuelve a la grilla. Si alguna de las que
    // tenían que volver chocó con un turno vendido mientras tanto (`res.chocan`: otro puesto o la web), no se anuncia
    // ésa — se salta a la siguiente — y el choque se dice con todas las letras, para que el titular no crea que juega.
    // `res.chocan` sólo trae las que la pausa anterior había bajado; `vueltaDelFijo` mira la grilla también fuera de
    // la ventana (una fecha todavía sin bajar que otro ya vendió), así que se juntan sin repetir fecha.
    const grilla = vueltaDelFijo(estado, f, sumarDias(a.hasta, 1));
    // Las de la grilla ganan si dicen con qué fijo choca (C1); el motor sólo dice «se pisa con …».
    const chocan: ChoqueDeLaVuelta[] = (res.chocan ?? []).map((c) => grilla.chocan.find((x) => x.fecha === c.fecha && x.fijoId) ?? c);
    for (const c of [...grilla.chocan, ...delMedio]) if (!chocan.some((x) => x.fecha === c.fecha)) chocan.push(c);
    // La fecha que choca con el fijo de otro se le libera al pausado: si no, al bajar la ventana se la gana él por
    // orden de la lista y el otro (a quien se la prometieron) la pierde sin aviso. Dictamen v8, C1: también si el turno
    // de ese otro fijo YA está en la grilla (antes los dos figuraban jugando esa fecha, y si el otro la soltaba, éste
    // volvía sin aviso aunque se le dijo que no venía). Sólo con fecha de vuelta (choque acotado; sin vuelta ya se cortó
    // arriba) y anotando con quién chocó, para devolvérsela cuando ése se vaya. Un turno suelto o un bloqueo no se anota
    // (lo cerrado en la v3: «no vuelve» y la grilla nunca pisa).
    const nuevas: Fecha[] = [];
    if (grilla.vuelve)
      for (const c of chocan) {
        if (f.excepciones.includes(c.fecha) || !fijoJuegaEl(f, c.fecha)) continue;
        const otroId = c.fijoId ?? ocupanteDeLaGrilla(estado, f, c.fecha)?.fijo?.id;
        if (!otroId) continue;
        f.excepciones.push(c.fecha);
        nuevas.push(c.fecha);
        (f.liberadasPor ??= []).push({ fecha: c.fecha, fijoId: otroId });
      }
    // Repetir la misma pausa dice lo mismo: las que ya se le liberaron por choque (antes de la vuelta) se siguen nombrando.
    for (const x of f.liberadasPor ?? []) {
      const otro = estado.fijos.find((g) => g.id === x.fijoId);
      if (otro && x.fecha > a.hasta && (!grilla.vuelve || x.fecha < grilla.vuelve) && fijoJuegaEl(otro, x.fecha) && !chocan.some((c) => c.fecha === x.fecha))
        chocan.push({ fecha: x.fecha, motivo: `se pisa con el fijo de ${otro.titular} (${hhmm(otro.inicio)})`, fijoId: otro.id });
    }
    chocan.sort((x, y) => x.fecha.localeCompare(y.fecha));
    const vuelve = grilla.vuelve;
    // Observación 4: las fechas que se le habían liberado a otro fijo por chocar con éste y caen en la pausa vuelven a
    // ese otro. Dictamen v8, C4: también las que éste acaba de soltar por choque (`nuevas`): ya no las juega, así que
    // el que lo esperaba no puede seguir esperándolo a él (las recupera, o pasa a esperar al que la juega).
    const recuperan = devolverLiberadasPor(estado, f, (fecha) => (fecha >= a.desde && fecha <= a.hasta) || nuevas.includes(fecha), ahora);
    const noVuelven = chocan.length ? ` No vuelve${chocan.length > 1 ? "n" : ""} ${chocan.length > 4 ? fechasDichas(chocan.map((c) => c.fecha)) : chocan.map((c) => `el ${fechaCorta(c.fecha)}`).join(" ni ")}: ${chocan.length > 1 ? (chocan.every((c) => c.fijoId && c.motivo === chocan[0].motivo) ? chocan[0].motivo.replace(/^se pisa/, "se pisan") : "se pisan con otros turnos") : chocan[0].fijoId ? chocan[0].motivo : `se pisa con otro turno (${chocan[0].motivo.replace(/\.$/, "")})`}.` : "";
    return { ok: true, turnos: res.turnos, vuelve, vuelven: res.vuelven ?? [], chocan, recuperan, mensaje: `Pausado ${de} hasta el ${ddmm(a.hasta)}${vuelve ? `; vuelve solo el ${fechaCorta(vuelve)}` : ""}.${noVuelven}${resumen}${textoRecuperan(recuperan)}` };
  }
  const recuperan = devolverLiberadasPor(estado, f, (fecha) => fecha >= a.desde, ahora);
  return { ok: true, turnos: res.turnos, quitado: res.quitado, recuperan, mensaje: `Dado de baja ${de}${res.quitado ? "" : ` desde el ${fechaCorta(a.desde)}`}.${resumen}${textoRecuperan(recuperan)}` };
}

/**
 * Dictamen v7, Falla 1: ¿quién más ocupa el hueco de `g` esa fecha? Otro fijo que la juega (`fijoJuegaEl`, esté o no
 * bajado a la grilla: si los dos la juegan, se pisan), un turno vivo de la grilla (de un fijo, suelto o vendido en el
 * mostrador) o un bloqueo. `{ fijo }` si es de un fijo que sigue en la lista; `{ fijo: null }` si es de otra cosa;
 * `null` si el hueco está libre. Sin contar a `g`. PURA.
 */
function quienOcupaElHueco(estado: EstadoClub, g: Fijo, fecha: Fecha): { fijo: Fijo | null } | null {
  const otro = estado.fijos.find((h) => h.id !== g.id && seSolapan(g, h) && fijoJuegaEl(h, fecha));
  if (otro) return { fijo: otro };
  return ocupanteDeLaGrilla(estado, g, fecha);
}

/** ¿Dos fijos usan el mismo hueco (misma cancha, horas que se pisan)? PURA. */
function seSolapan(g: Fijo, h: Fijo): boolean {
  return g.canchaId === h.canchaId && g.inicio < h.inicio + h.duracion && h.inicio < g.inicio + g.duracion;
}

/**
 * Lo que ocupa el hueco de `g` esa fecha EN LA GRILLA, sin contarlo a él: un turno vivo (`{ fijo }` si es de un fijo que
 * sigue en la lista; `{ fijo: null }` si es suelto o del mostrador) o un bloqueo (`{ fijo: null }`); `null` si está
 * libre. No mira el horario ni el mantenimiento (eso no es «otro ocupando»). PURA.
 */
function ocupanteDeLaGrilla(estado: EstadoClub, g: Fijo, fecha: Fecha): { fijo: Fijo | null; inicio?: number } | null {
  const fin = g.inicio + g.duracion;
  const pisa = (inicio: number, hasta: number) => inicio < fin && g.inicio < hasta;
  const { reservas, bloqueos } = ocupantes(estado, fecha, g.canchaId);
  const turno = reservas.find((r) => r.fijoId !== g.id && pisa(r.inicio, r.inicio + r.duracion));
  if (turno) return { fijo: (turno.fijoId && estado.fijos.find((h) => h.id === turno.fijoId)) || null, inicio: turno.inicio };
  if (bloqueos.some((b) => pisa(b.desde, b.hasta))) return { fijo: null };
  return null;
}

/**
 * Observación v5-7 (baja) y v6-4 (pausa y liberar una fecha): cuando un fijo deja libres fechas suyas, las que se le
 * habían liberado a OTRO fijo por chocar con éste (`liberadasPor`) y caen en `cubre` vuelven a ese otro, y las de la
 * semana a la vista se bajan a la grilla. Idempotente: lo devuelto sale de `liberadasPor`.
 *
 * Dictamen v7 (Falla 1 y 2): cada fecha la recupera UN solo fijo, y sólo si el hueco de verdad quedó libre.
 *   · Regla de quién recupera: se recorre por fecha y, en la misma fecha, por ANTIGÜEDAD del fijo (el orden de alta,
 *     que es el de `estado.fijos`): el más antiguo la recupera; al siguiente, el hueco ya le figura ocupado.
 *   · Si el hueco lo sigue ocupando otro fijo (heredado, o el que la acaba de recuperar), la entrada se re-apunta a ése
 *     (`fijoId = otro.id`): la fecha sigue liberada y vuelve cuando ése se vaya. No se anuncia.
 *   · Si lo ocupa un turno suelto, una venta del mostrador o un bloqueo, la fecha sigue liberada y la entrada sale (no
 *     hay a quién esperar). No se anuncia.
 *   · En la semana a la vista sólo se anuncia lo que de verdad se bajó a la grilla; si no se pudo bajar, la fecha
 *     vuelve a quedar liberada.
 *
 * Dictamen v8, C4: «la fecha espera a ese fijo» vale sólo mientras ese fijo de verdad la juega. Una entrada que espera
 * a un fijo que esa fecha ya no juega (pausado, dado de baja, con la fecha liberada, o que ya no está) no le da
 * prioridad a nadie: si el hueco se pisa con el de `de` y la fecha cae en `cubre`, entra en la misma ronda y manda la
 * antigüedad.
 */
function devolverLiberadasPor(estado: EstadoClub, de: Fijo, cubre: (fecha: Fecha) => boolean, ahora: Ahora): Recupera[] {
  const out: Recupera[] = [];
  const tope = sumarDias(ahora.fecha, DIAS_A_LA_VISTA);
  const juega = (id: string, fecha: Fecha) => {
    const h = estado.fijos.find((y) => y.id === id);
    return !!h && fijoJuegaEl(h, fecha);
  };
  const esperaA = (g: Fijo, x: { fecha: Fecha; fijoId: string }) => x.fijoId === de.id || (seSolapan(g, de) && !juega(x.fijoId, x.fecha));
  const pendientes = estado.fijos.flatMap((g) => (g.liberadasPor ?? []).filter((x) => cubre(x.fecha) && x.fecha >= ahora.fecha && esperaA(g, x)).map((x) => ({ g, x })));
  // `sort` es estable: en la misma fecha queda el orden de `estado.fijos` (antigüedad).
  pendientes.sort((a, b) => a.x.fecha.localeCompare(b.x.fecha));
  for (const { g, x } of pendientes) {
    const ocupa = quienOcupaElHueco(estado, g, x.fecha);
    if (ocupa?.fijo) {
      const otroId = ocupa.fijo.id;
      g.liberadasPor = g.liberadasPor!.map((y) => (y === x ? { fecha: x.fecha, fijoId: otroId } : y));
      continue;
    }
    g.liberadasPor = g.liberadasPor!.filter((y) => y !== x);
    // Vacío, el campo se va (la foto queda igual a la de un fijo al que nunca se le liberó nada).
    if (!g.liberadasPor.length) delete g.liberadasPor;
    if (ocupa) continue;
    g.excepciones = g.excepciones.filter((fecha) => fecha !== x.fecha);
    if (!fijoJuegaEl(g, x.fecha)) continue;
    if (x.fecha < tope) {
      materializarFijos(estado, x.fecha);
      if (!estado.reservas.some((r) => r.fijoId === g.id && r.fecha === x.fecha && r.estado !== "cancelada")) {
        g.excepciones.push(x.fecha);
        continue;
      }
    }
    out.push({ fijoId: g.id, titular: g.titular, fecha: x.fecha });
  }
  return out;
}

/**
 * Dictamen v8, C4: «Liberar el fijo» desde la grilla (ciclo del turno) también deja de jugar esa fecha, así que lo que
 * esperaba a este fijo esa fecha se devuelve con la misma regla que la hoja. Lo llama `ejecutarCiclo` después de
 * `liberarFijo`; devuelve el texto «Juan Fijo recupera el …» (o "") para sumar al mensaje. MUTA `estado`.
 */
export function devolverAlLiberarDesdeLaGrilla(estado: EstadoClub, fijoId: string, fecha: Fecha, ahora: Ahora): string {
  const f = estado.fijos.find((x) => x.id === fijoId);
  if (!f) return "";
  const recuperan = devolverLiberadasPor(estado, f, (x) => x === fecha, ahora);
  podarLiberadasPor(estado, ahora);
  return textoRecuperan(recuperan);
}

/** Otro fijo que recupera fechas por esta baja / pausa / liberación, con su celular para avisarle (observación 3). */
export type RecuperaElFijo = { fijoId: string; titular: string; celular: string; fechas: Fecha[] };

export type PreviaBajaFijo =
  | { ok: true; resumen: string; lineas: string[]; turnos: number; plata: { credito: number; enMano: number; enSuspenso: number }; vuelve: Fecha | null; quitado: boolean; chocan: ChoqueDeLaVuelta[]; recuperan: RecuperaElFijo[] }
  | { ok: false; mensaje: string };

/** Agrupa por fijo lo que vuelve a otros, con el celular de su ficha ("" sin ficha). */
function recuperanPorFijo(estado: EstadoClub, recuperan: Recupera[]): RecuperaElFijo[] {
  const out: RecuperaElFijo[] = [];
  for (const x of recuperan) {
    let r = out.find((y) => y.fijoId === x.fijoId);
    if (!r) {
      const g = estado.fijos.find((y) => y.id === x.fijoId);
      r = { fijoId: x.fijoId, titular: x.titular, celular: (g?.clienteId && estado.clientes.find((c) => c.id === g.clienteId)?.tel) || "", fechas: [] };
      out.push(r);
    }
    r.fechas.push(x.fecha);
  }
  return out;
}

/** La previa: corre la baja sobre una COPIA del estado (el de verdad no cambia) y cuenta turnos y plata. */
export function previaBajaFijo(estado: EstadoClub, a: AccionBajaFijo, ahora: Ahora, auth?: Auth, copia: EstadoClub = structuredClone(estado)): PreviaBajaFijo {
  const f = estado.fijos.find((x) => x.id === a.fijoId);
  const d = ejecutarBajaFijo(copia, a, ahora, auth);
  if (!d.ok) return { ok: false, mensaje: d.mensaje };
  const turnos = d.turnos ?? [];
  const chocan = d.chocan ?? [];
  const vuelven = d.vuelven ?? [];
  const recuperan = recuperanPorFijo(copia, d.recuperan ?? []);
  const horaDe = (id: string) => hhmm(estado.fijos.find((x) => x.id === id)?.inicio ?? 0);
  const suma = (k: "devuelto" | "devolverEnMano") => turnos.reduce((s, t) => s + t[k], 0);
  return {
    ok: true,
    // Si la pausa acortada devuelve turnos a la grilla, la previa los cuenta («Vuelve 1 turno a la grilla»), no
    // «No hay turnos suyos para liberar».
    resumen: vuelven.length ? [turnos.length ? resumenDeLaBaja(turnos) : null, `Vuelve${vuelven.length > 1 ? `n ${vuelven.length} turnos` : " 1 turno"} a la grilla`].filter(Boolean).join(" · ") : resumenDeLaBaja(turnos),
    // Las fechas que vuelven y las que chocan van como línea propia: lo que la previa dice es lo que pasa.
    lineas: [
      ...turnos.map(lineaDeLaBaja),
      ...vuelven.map((x) => `${fechaCorta(x)} ${hhmm(f?.inicio ?? 0)} · vuelve a la grilla`),
      ...chocan.map((c) => lineaDelChoque({ inicio: f?.inicio ?? 0 }, c)),
      ...recuperan.flatMap((r) => r.fechas.map((x) => `${fechaCorta(x)} ${horaDe(r.fijoId)} · la recupera ${r.titular}`)),
    ],
    chocan,
    recuperan,
    turnos: turnos.length,
    plata: { credito: suma("devuelto"), enMano: suma("devolverEnMano"), enSuspenso: turnos.reduce((s, t) => s + (t.enSuspenso ? t.pagado : 0), 0) },
    vuelve: d.vuelve ?? null,
    quitado: !!d.quitado,
  };
}

/** El WhatsApp para avisarle al del fijo lo que se hizo (con la plata que le quedó). */
export function textoAvisoBaja(estado: EstadoClub, f: Pick<Fijo, "titular" | "dia" | "inicio">, a: AccionBajaFijo, previa: Extract<PreviaBajaFijo, { ok: true }>): string {
  const nombre = f.titular.split(" ")[0] || f.titular;
  const club = estado.config.nombre ?? "el club";
  const turno = `tu turno fijo de los ${enPlural(f.dia)} a las ${hhmm(f.inicio)}`;
  const plata = previa.plata.credito ? ` Te quedan ${pesos(previa.plata.credito)} a favor para tu próximo turno.` : previa.plata.enMano ? ` Tenemos ${pesos(previa.plata.enMano)} para devolverte: pasá cuando quieras.` : "";
  if (a.tipo === "pausa") return `¡Hola ${nombre}! Dejamos en pausa ${turno} hasta el ${ddmm(a.hasta)}${previa.vuelve ? `; te esperamos de vuelta el ${fechaCorta(previa.vuelve)}` : ""}.${previa.chocan.length ? ` ${previa.chocan.length > 4 ? `Las ${fechasDichas(previa.chocan.map((c) => c.fecha))}` : previa.chocan.map((c) => `El ${fechaCorta(c.fecha)}`).join(" y el ")} no: ese horario ya está tomado.` : ""}${plata} ${club}`;
  if (a.tipo === "liberar") return `¡Hola ${nombre}! Liberamos ${turno} del ${fechaCorta(a.fecha)}; las otras semanas siguen igual.${plata} ${club}`;
  return `¡Hola ${nombre}! Dimos de baja ${turno}${previa.quitado ? "" : ` desde el ${fechaCorta(a.desde)}`}.${plata} ¡Gracias por jugar con nosotros! ${club}`;
}

/**
 * Observación 3: el WhatsApp para el OTRO fijo, el que recupera fechas porque éste se dio de baja, se pausó o liberó
 * esa fecha. Sin plata: a él no se le cobra ni se le devuelve nada.
 */
export function textoAvisoRecupera(estado: EstadoClub, r: RecuperaElFijo): string {
  const g = estado.fijos.find((x) => x.id === r.fijoId);
  const nombre = r.titular.split(" ")[0] || r.titular;
  const club = estado.config.nombre ?? "el club";
  const turno = g ? `tu turno fijo de los ${enPlural(g.dia)} a las ${hhmm(g.inicio)}` : "tu turno fijo";
  return `¡Hola ${nombre}! Se liberó el horario y volvés a tener ${turno}${r.fechas.length > 4 ? ": " : " "}${fechasDichas(r.fechas)}. ¡Te esperamos! ${club}`;
}

/**
 * Dar de baja un fijo desde HOY (la acción vieja «baja» del comando «fijo», que algún puesto puede tener todavía en su
 * cola): lo mismo que «Dar de baja · esta semana» de la hoja nueva (`ejecutarBajaFijo`).
 */
export function bajaFijo(estado: EstadoClub, fijoId: string, ahora: Ahora, auth?: Auth): Desenlace {
  return ejecutarBajaFijo(estado, { tipo: "baja", fijoId, desde: ahora.fecha }, ahora, auth);
}

// ───────────── lista de espera ─────────────

export interface VistaEspera {
  id: string;
  /** El nombre de quien espera. */
  titular: string;
  texto: string;
  /** Su celular (el anotado o el de su ficha), "" si no hay: para ofrecerle el hueco por WhatsApp. */
  celular: string;
  /** Los huecos libres que le sirven ahora (cancha y hora), con la oferta por WhatsApp lista, para darle el turno de un toque. */
  huecos: { canchaId: string; inicio: number; texto: string; oferta: string }[];
}

export function armarEspera(estado: EstadoClub, ahora: Ahora): { espera: VistaEspera[]; firma: string } {
  const espera = estado.espera
    .filter((e) => e.fecha >= ahora.fecha)
    .map((e) => {
      const huecos: Omit<VistaEspera["huecos"][number], "oferta">[] = [];
      for (const c of estado.canchas) {
        if (e.soloCubierta && !c.cubierta) continue;
        for (const m of huecosLibres(estado, e.fecha, c.id, e.duracion)) {
          if (m < e.desde || m > e.hasta || minutosHasta(ahora, e.fecha, m) < 0) continue;
          huecos.push({ canchaId: c.id, inicio: m, texto: `${c.nombre} ${hhmm(m)}` });
        }
      }
      huecos.sort((a, b) => a.inicio - b.inicio);
      return {
        id: e.id,
        titular: e.titular,
        celular: celularDeLaEspera(estado, e),
        texto: `${e.titular} · ${e.fecha === ahora.fecha ? "hoy" : ddmm(e.fecha)} entre ${hhmm(e.desde)} y ${hhmm(e.hasta)} · ${e.duracion} min${e.soloCubierta ? " · sólo techada" : ""}`,
        // La oferta se arma sólo para los que se muestran.
        huecos: huecos.slice(0, 6).map((h) => ({ ...h, oferta: textoOfertaEspera(estado, e, h.canchaId, h.inicio, ahora.fecha) })),
      };
    });
  return { espera, firma: JSON.stringify(espera) };
}

export type AccionEspera =
  | { tipo: "anotar"; titular: string; clienteId: string | null; fecha: Fecha; desde: number; hasta: number; duracion: number; soloCubierta: boolean; tel?: string }
  | { tipo: "asignar"; esperaId: string; canchaId: string; inicio: number }
  | { tipo: "quitar"; esperaId: string };

export function ejecutarEspera(estado: EstadoClub, a: AccionEspera, ahora: Ahora): Desenlace & { reservaId?: string } {
  switch (a.tipo) {
    case "anotar": {
      if (!a.titular.trim()) return { ok: false, mensaje: "¿Quién espera?" };
      if (!(a.hasta >= a.desde)) return { ok: false, mensaje: "El «hasta» no puede ser antes del «desde»." };
      const fuera = fueraDeLaEspera(estado, a.fecha, ahora.fecha);
      if (fuera) return { ok: false, mensaje: fuera };
      anotarEspera(estado, { titular: a.titular.trim(), clienteId: a.clienteId, tel: a.tel?.trim() ?? "", fecha: a.fecha, desde: a.desde, hasta: a.hasta, duracion: a.duracion, soloCubierta: a.soloCubierta }, ahora);
      return { ok: true, mensaje: `${a.titular.trim()} anotado en la lista de espera.` };
    }
    case "asignar": {
      const res = asignarDesdeEspera(estado, a.esperaId, { canchaId: a.canchaId, inicio: a.inicio }, ahora);
      if (!res.ok) return { ok: false, mensaje: res.motivo };
      return { ok: true, reservaId: res.reserva.id, mensaje: `Turno para ${res.reserva.titular} en ${canchaDe(estado, a.canchaId)?.nombre ?? ""} a las ${hhmm(a.inicio)}. Salió de la lista de espera.` };
    }
    case "quitar": {
      // DEUDA (BP-3/BP-4): el motor no tiene una función para sacar a alguien de la lista de espera (sólo
      // `asignarDesdeEspera` lo saca al darle turno); se filtra `estado.espera` acá. Cuando el dominio se porte a TS,
      // va al motor con su test. No se deshace (como en vanilla): la inversa es volver a anotarlo.
      const antes = estado.espera.length;
      estado.espera = estado.espera.filter((e) => e.id !== a.esperaId);
      return estado.espera.length < antes ? { ok: true, mensaje: "Quitado de la lista de espera." } : { ok: false, mensaje: "Ya no estaba en la lista de espera." };
    }
  }
}
