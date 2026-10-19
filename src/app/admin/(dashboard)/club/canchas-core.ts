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
  cancelar,
  anotarEspera,
  asignarDesdeEspera,
  bloquear,
  cancha as canchaDe,
  configurarMantenimiento,
  configurarTecho,
  crearFijo,
  diaSemana,
  hhmm,
  horarioDe,
  huecosLibres,
  materializarFijos,
  minutosHasta,
  pesos,
  planLluvia,
  quitarBloqueo,
  sumarDias,
  validarHueco,
} from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Fecha, ResultadoLluvia } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { celularDeLaEspera, textoOfertaEspera } from "./whatsapp-core";

/** Cuántos días para adelante se bajan los fijos a la grilla (los que ve la agenda). */
export const DIAS_A_LA_VISTA = 7;

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
 * bloqueos, ni crear/bajar/dar de baja fijos, ni sacar de la espera. Cada uno tiene su inversa a la vista (habilitar,
 * quitar el bloqueo, dar de baja, volver a anotar); la lluvia, su previa. Anotar en la espera y darle el turno sí.
 */
export const SE_DESHACE = {
  mantenimiento: false,
  techo: false,
  bloquear: false,
  quitarBloqueo: false,
  lluvia: false,
  nuevoFijo: false,
  bajarFijos: false,
  bajaFijo: false,
  anotar: true,
  asignar: true,
  quitar: false,
} as const satisfies Record<AccionCanchas["tipo"] | AccionEspera["tipo"] | "nuevoFijo" | "bajarFijos" | "bajaFijo", boolean>;

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

export interface VistaFijo {
  id: string;
  texto: string;
  /** Las próximas fechas en la grilla (o liberadas). */
  proximas: string;
}

export function armarFijos(estado: EstadoClub, hoy: Fecha): { fijos: VistaFijo[]; firma: string } {
  const fijos = estado.fijos.map((f) => {
    const fechas = Array.from({ length: DIAS_A_LA_VISTA }, (_, i) => sumarDias(hoy, i)).filter((d) => diaSemana(d) === f.dia);
    const proximas = fechas
      .map((d) => (f.excepciones.includes(d) ? `${ddmm(d)} liberado` : estado.reservas.some((r) => r.fijoId === f.id && r.fecha === d && r.estado !== "cancelada") ? `${ddmm(d)} en la grilla` : `${ddmm(d)} sin bajar`))
      .join(" · ");
    return {
      id: f.id,
      texto: `${f.titular} · ${NOMBRE_DIA[f.dia].toLowerCase()} ${hhmm(f.inicio)} a ${hhmm(f.inicio + f.duracion)} · ${canchaDe(estado, f.canchaId)?.nombre ?? ""}`,
      proximas,
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

/**
 * Dar de baja un fijo (la inversa explícita de crearlo, que no se deshace): sus turnos que todavía no se jugaron se
 * cancelan como «cancela el club» (lo pagado vuelve siempre, con la regla de `cancelar` del motor) y el fijo sale de
 * la lista.
 * DEUDA (BP-3/BP-4): el motor no tiene una función para dar de baja un fijo; se filtra `estado.fijos` acá. Cuando el
 * dominio se porte a TS, va al motor con su test.
 */
export function bajaFijo(estado: EstadoClub, fijoId: string, ahora: Ahora): Desenlace {
  const f = estado.fijos.find((x) => x.id === fijoId);
  if (!f) return { ok: false, mensaje: "Ese turno fijo ya no está." };
  let canceladas = 0;
  for (const r of estado.reservas) {
    if (r.fijoId !== fijoId || r.estado !== "reservada" || r.fecha < ahora.fecha) continue;
    if (cancelar(estado, r.id, { porClub: true, motivo: "Baja del turno fijo" }, ahora).ok) canceladas++;
  }
  estado.fijos = estado.fijos.filter((x) => x.id !== fijoId);
  return { ok: true, mensaje: `Turno fijo de ${f.titular} dado de baja${canceladas ? ` (${canceladas} turno${canceladas > 1 ? "s" : ""} de la semana liberado${canceladas > 1 ? "s" : ""})` : ""}.` };
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
