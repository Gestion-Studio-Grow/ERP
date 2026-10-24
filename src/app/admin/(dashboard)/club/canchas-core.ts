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

function estadoDelFijo(f: Fijo, ahora: Ahora): string | null {
  if (f.pausa && f.pausa.hasta >= ahora.fecha) {
    const vuelve = proximasFechasDelFijo(f, { fecha: sumarDias(f.pausa.hasta, 1), min: 0 }, 1)[0];
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
      estado: estadoDelFijo(f, ahora),
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

/** Corre la baja / la pausa / liberar una fecha sobre `estado` (lo MUTA). Lo usan la previa (sobre copia) y el comando. */
export function ejecutarBajaFijo(estado: EstadoClub, a: AccionBajaFijo, ahora: Ahora, auth?: Auth): Desenlace & { turnos?: TurnoDeLaBaja[]; vuelve?: Fecha | null; quitado?: boolean } {
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
    return { ok: true, turnos: r ? [t] : [], mensaje: `${f.titular} no juega el ${fechaCorta(a.fecha)}: se liberó ese día y los demás siguen.${r && pagado ? ` ${lineaDeLaBaja(t).split(" · ")[1]}.` : ""}` };
  }
  const res = darDeBajaFijo(estado, f.id, { desde: a.desde, pausaHasta: a.tipo === "pausa" ? a.hasta : null, auth: auth ?? null }, ahora);
  if (!res.ok) return { ok: false, mensaje: res.motivo };
  const resumen = res.turnos.length ? ` ${resumenDeLaBaja(res.turnos)}.` : "";
  if (a.tipo === "pausa") {
    const vuelve = proximasFechasDelFijo({ ...f, pausa: { desde: a.desde, hasta: a.hasta } }, { fecha: sumarDias(a.hasta, 1), min: 0 }, 1)[0] ?? null;
    return { ok: true, turnos: res.turnos, vuelve, mensaje: `Pausado ${de} hasta el ${ddmm(a.hasta)}${vuelve ? `; vuelve solo el ${fechaCorta(vuelve)}` : ""}.${resumen}` };
  }
  return { ok: true, turnos: res.turnos, quitado: res.quitado, mensaje: `Dado de baja ${de}${res.quitado ? "" : ` desde el ${fechaCorta(a.desde)}`}.${resumen}` };
}

export type PreviaBajaFijo =
  | { ok: true; resumen: string; lineas: string[]; turnos: number; plata: { credito: number; enMano: number; enSuspenso: number }; vuelve: Fecha | null; quitado: boolean }
  | { ok: false; mensaje: string };

/** La previa: corre la baja sobre una COPIA del estado (el de verdad no cambia) y cuenta turnos y plata. */
export function previaBajaFijo(estado: EstadoClub, a: AccionBajaFijo, ahora: Ahora, auth?: Auth, copia: EstadoClub = structuredClone(estado)): PreviaBajaFijo {
  const d = ejecutarBajaFijo(copia, a, ahora, auth);
  if (!d.ok) return { ok: false, mensaje: d.mensaje };
  const turnos = d.turnos ?? [];
  const suma = (k: "devuelto" | "devolverEnMano") => turnos.reduce((s, t) => s + t[k], 0);
  return {
    ok: true,
    resumen: resumenDeLaBaja(turnos),
    lineas: turnos.map(lineaDeLaBaja),
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
  if (a.tipo === "pausa") return `¡Hola ${nombre}! Dejamos en pausa ${turno} hasta el ${ddmm(a.hasta)}${previa.vuelve ? `; te esperamos de vuelta el ${fechaCorta(previa.vuelve)}` : ""}.${plata} ${club}`;
  if (a.tipo === "liberar") return `¡Hola ${nombre}! Liberamos ${turno} del ${fechaCorta(a.fecha)}; las otras semanas siguen igual.${plata} ${club}`;
  return `¡Hola ${nombre}! Dimos de baja ${turno}${previa.quitado ? "" : ` desde el ${fechaCorta(a.desde)}`}.${plata} ¡Gracias por jugar con nosotros! ${club}`;
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
