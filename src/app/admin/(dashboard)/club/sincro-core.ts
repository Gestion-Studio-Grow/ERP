// ============================================================================
// DOS PUESTOS A LA VEZ — la cola de lo hecho, la reaplicación sobre la base, la idempotencia y la cinta (Tanda 1B).
// ============================================================================
//
// La PC y la tablet trabajan cada una sobre su copia del club. Antes, el que subía segundo recibía «conflicto», recargaba
// lo del otro y LO SUYO QUEDABA APARTE entero (almacen.ts, «Lo que quedó aparte»). Ahora (bp-DISENO.md §3.3):
//
//   1. Toda acción de pantalla entra a la COLA del puesto (`Pendiente`): el comando con nombre (comandos-core.ts; desde
//      el cierre de la cert de la Tanda 1 lo despachan todas las pantallas de operación, y Configuración desde la
//      vuelta 2: «config», «abrirClub», «golive») o, si algo todavía despacha una función, la función misma (sirve
//      mientras la pestaña esté abierta). Corre al
//      instante, como siempre, con la semilla del azar y el contador de ids anotados (`correrDeterminista`).
//   2. Cuando la base avanzó (el latido de versión cada 15 s, o un «conflicto» al subir), el almacén baja la foto de la
//      base, la pone en lugar de la suya y RE-APLICA la cola encima, en orden (`rebasar`). Lo que el motor acepta queda,
//      con los mismos ids y el mismo código de seña; lo que rechaza (el mismo hueco ya lo dio el otro puesto) NO se
//      fuerza: va a `estado.sincro.paraResolver` con el nombre de quién lo dio. Lo del otro puesto nunca se pisa.
//   3. Idempotencia: la foto lleva los ids de los últimos 500 comandos aplicados (`aplicados`). Un pendiente que ya está
//      ahí (subió justo antes de un corte) se saltea: un solo turno, un solo cobro.
//   4. La cinta: la foto lleva también lo último que hizo cada puesto (`recientes`, con quién y dónde), así el otro
//      puesto dice «Caro (PC) dio un turno a las 21:00» al enterarse.
//
// MODELO (la foto, sin migración): `estado.sincro = { aplicados: string[] ≤500, recientes: Reciente[] ≤40,
// paraResolver: ItemParaResolver[] ≤50, resueltos: string[] ≤500 }` (`resueltos`: los ítems «para resolver» que alguien
// sacó a mano —descartó o volvió a aplicar—; aparte de `aplicados`, que rota con cada comando: N3 de la cert).
// La cola (`pendientes`) NO va en la foto: es del puesto (memoria, espejada en el equipo en `<clave>:cola:<equipo>` para sobrevivir a recargar la pestaña: almacen.ts). Nada de lo que va a la foto ni al
// equipo lleva un PIN ni el código del dueño (`comandoSinPin`).
//
// Puro salvo `correrPendiente` / `rebasar`, que MUTAN el estado que reciben (como todo el motor). No lee reloj ni red.
//
// — Elaborado por GSG

import { cancha as canchaDe, hhmm, horarioDe, reserva as reservaDe, validarHueco } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha, Reserva } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import type { DatosAlta } from "./alta-core";
import { canchaCorta, comandoSinPin, correrComando, correrDeterminista, describirComando, nombreDeQuien, queHizo, type Comando, type NombreDeComando } from "./comandos-core";

/** Cuántos ids de comandos aplicados guarda la foto (idempotencia). */
export const TOPE_APLICADOS = 500;
/** Cuánto de lo último que hizo cada puesto guarda la foto (la cinta «Caro (PC) dio un turno…»). */
export const TOPE_RECIENTES = 40;
/** Cuántos ítems «para resolver» guarda la foto (los más viejos se caen: ya nadie los va a resolver). */
export const TOPE_PARA_RESOLVER = 50;
/**
 * Cuántos ítems «para resolver» resueltos a mano (descartados o vueltos a aplicar) recuerda la foto. Va aparte de
 * `aplicados` (que se llena con CADA comando): para que se caiga uno de acá hacen falta 500 resoluciones a mano, no 500
 * comandos, entre que un puesto manda un ítem a «para resolver» y la base se lo confirma.
 */
export const TOPE_RESUELTOS = 500;
/** Si la base vuelve a avanzar mientras se re-aplica, se repite hasta esta cantidad de vueltas; después, a la cola. */
export const TOPE_VUELTAS = 5;

/** Lo último que hizo un puesto (para la cinta del otro). Sin PIN, sin montos que no se vean en la pantalla. */
export interface Reciente {
  id: string;
  /** El id del puesto (el prefijo de sus ids). */
  equipo: string;
  /** Cómo se lo nombra: «PC», «tablet». */
  puesto: string;
  /** Quién operaba (el nombre corto del usuario del club). */
  persona: string;
  /** Qué hizo, en criollo (`queHizo`). */
  texto: string;
  /** Cuándo (ms del puesto). */
  cuando: number;
  /** Los turnos que creó (para «ese hueco lo acaba de dar Caro»). */
  reservas?: string[];
  /** Si dio un turno: el de la cinta, «dio un turno a las 21:00 en C2». */
  turno?: { canchaId: string; fecha: Fecha; inicio: number; titular: string };
}

/** Lo que el motor no aceptó al re-aplicar: se ve en la bandeja de quien lo hizo y en Configuración (dueño). */
export interface ItemParaResolver {
  id: string;
  /** «19:42 · Cobro $ 9.000 efectivo a Juan (turno 19:00 C2) · Lu (tablet)» (`describirComando`). */
  texto: string;
  /** Por qué no entró: «Ese hueco lo acaba de dar Caro (PC) a Juan» o lo que dijo el motor. */
  motivo: string;
  cuando: number;
  equipo: string;
  puesto: string;
  persona: string;
  /** El comando sin PIN, para «Volver a aplicar» desde cualquier puesto. null: una acción sin nombre (sólo se describe). */
  comando: Comando | null;
  /** Si era un turno: el hueco que pedía (para ofrecer alternativas de un toque). */
  hueco?: { canchaId: string; fecha: Fecha; inicio: number; duracion: number; titular: string };
}

export interface SincroDelClub {
  aplicados: string[];
  recientes: Reciente[];
  paraResolver: ItemParaResolver[];
  /** Los ids de los ítems «para resolver» que alguien sacó a mano (no resucitan aunque se caigan de `aplicados`). */
  resueltos: string[];
}

type ConSincro = EstadoClub & { sincro?: Partial<SincroDelClub> };

const VACIO: Readonly<SincroDelClub> = Object.freeze({ aplicados: [], recientes: [], paraResolver: [], resueltos: [] }) as SincroDelClub;

const esLista = <T>(x: unknown): x is T[] => Array.isArray(x);

/** `estado.sincro` para LEER (no lo crea): con listas vacías si la foto es de antes de los dos puestos. */
export function leerSincro(estado: EstadoClub): Readonly<SincroDelClub> {
  const s = (estado as ConSincro).sincro;
  if (!s || typeof s !== "object") return VACIO;
  return {
    aplicados: esLista<string>(s.aplicados) ? s.aplicados : VACIO.aplicados,
    recientes: esLista<Reciente>(s.recientes) ? s.recientes : VACIO.recientes,
    paraResolver: esLista<ItemParaResolver>(s.paraResolver) ? s.paraResolver : VACIO.paraResolver,
    resueltos: esLista<string>(s.resueltos) ? s.resueltos : VACIO.resueltos,
  };
}

/** `estado.sincro` para ESCRIBIR: lo crea (o lo sanea) en el estado. */
export function sincroDe(estado: EstadoClub): SincroDelClub {
  const e = estado as ConSincro;
  const s = e.sincro && typeof e.sincro === "object" ? e.sincro : {};
  const limpio: SincroDelClub = {
    aplicados: esLista<string>(s.aplicados) ? s.aplicados.filter((x) => typeof x === "string") : [],
    recientes: esLista<Reciente>(s.recientes) ? s.recientes.filter((x) => x && typeof x.id === "string") : [],
    paraResolver: esLista<ItemParaResolver>(s.paraResolver) ? s.paraResolver.filter((x) => x && typeof x.id === "string") : [],
    resueltos: esLista<string>(s.resueltos) ? s.resueltos.filter((x) => typeof x === "string") : [],
  };
  e.sincro = limpio;
  return limpio;
}

/** Lo de la base ya aplicado (para saltear lo que subió justo antes de un corte). */
export const aplicadosDe = (estado: EstadoClub): ReadonlySet<string> => new Set(leerSincro(estado).aplicados);

// ── la cola del puesto ─────────────────────────────────────────────────────────────────────────────────────────────

/** Una acción de este puesto que todavía no confirmó la base. Vive en la memoria del puesto, no en la foto. */
export interface Pendiente {
  id: string;
  /** El comando con nombre (re-aplicable en cualquier puesto, también después de recargar). */
  comando?: Comando;
  /** La función de la pantalla (si todavía no despacha un comando): re-aplicable mientras la pestaña esté abierta. */
  correr?: (estado: EstadoClub, ahora: Ahora, auth: Auth) => Desenlace;
  ahora: Ahora;
  /** El auth de quien operaba, CON su PIN: sólo en memoria (nunca a la foto). */
  auth: Auth;
  azar: number;
  idsDesde: number;
  equipo: string;
  puesto: string;
  /** El id del usuario del club que operaba. */
  persona: string;
  /** Qué se hizo, en criollo, descripto ANTES de correrlo (los montos de ese momento). */
  texto: string;
  /** Promete algo a alguien (un turno): sube ya, y el WhatsApp espera el ok de la base. */
  promete: boolean;
  /** El `cambios` del almacén con el que quedó en el estado (lo confirma un guardado de ese texto o uno posterior). */
  cambios: number;
  cuando: number;
  /** El prefijo de ids del puesto (`Comando.prefijo`): re-aplicado da los mismos ids. */
  prefijo?: string;
  /** La primera vez el motor ya dijo que no (pudo haber cambiado algo antes): si al re-aplicar vuelve a decir que no, no es un choque. */
  fallo?: boolean;
  /** «Volver a aplicar» y «Descartar»: si al re-aplicar ya no corresponde (lo resolvió otro puesto), se calla. */
  siFalla?: "callar";
}

/** Corre un pendiente sobre el estado (lo MUTA): el comando, o la función con el mismo azar y los mismos ids. */
export function correrPendiente(estado: EstadoClub, p: Pendiente): Desenlace {
  if (p.correr) {
    const correr = p.correr;
    try {
      return correrDeterminista(p.azar, p.idsDesde, () => correr(estado, p.ahora, p.auth), p.prefijo);
    } catch {
      return { ok: false, mensaje: "No se pudo hacer. Probá de nuevo." };
    }
  }
  if (p.comando) return correrComando(estado, { ...p.comando, ahora: p.ahora, auth: p.auth, azar: p.azar, idsDesde: p.idsDesde, prefijo: p.prefijo });
  return { ok: false, mensaje: "Esta operación no se reconoce. Recargá la página." };
}

/** Lo que dejó una corrida: los turnos que creó (por cuántos había antes). */
export function turnosNuevos(estado: EstadoClub, antes: number): Reserva[] {
  return estado.reservas.length > antes ? estado.reservas.slice(antes) : [];
}

/** Anota en la foto que el pendiente se aplicó (idempotencia) y lo deja en «recientes» (la cinta del otro puesto). */
export function anotarAplicado(estado: EstadoClub, p: Pendiente, nuevos: readonly Reserva[], ahoraMs: number, { reciente = true }: { reciente?: boolean } = {}): void {
  const s = sincroDe(estado);
  if (!s.aplicados.includes(p.id)) s.aplicados.push(p.id);
  if (s.aplicados.length > TOPE_APLICADOS) s.aplicados.splice(0, s.aplicados.length - TOPE_APLICADOS);
  if (!reciente) return;
  const t = nuevos[0];
  const r: Reciente = {
    id: p.id,
    equipo: p.equipo,
    puesto: p.puesto,
    persona: nombreDeQuien(estado, p.persona),
    texto: p.texto,
    cuando: ahoraMs,
    ...(nuevos.length ? { reservas: nuevos.map((x) => x.id) } : {}),
    ...(t ? { turno: { canchaId: t.canchaId, fecha: t.fecha, inicio: t.inicio, titular: t.titular } } : {}),
  };
  s.recientes = [...s.recientes.filter((x) => x.id !== p.id), r].slice(-TOPE_RECIENTES);
}

/** El comando de un pendiente para la foto (sin PIN), con quién y dónde. */
function comandoParaLaFoto(p: Pendiente): Comando | null {
  if (!p.comando) return null;
  return comandoSinPin({ ...p.comando, id: p.id, equipo: p.equipo, puesto: p.puesto, persona: p.persona, ahora: p.ahora, auth: p.auth, azar: p.azar, idsDesde: p.idsDesde, ...(p.prefijo !== undefined ? { prefijo: p.prefijo } : {}) });
}

/** El hueco que pedía un pendiente que da un turno (el comando «alta»), o null. */
export function huecoDe(p: Pick<Pendiente, "comando">): ItemParaResolver["hueco"] | null {
  const c = p.comando;
  if (!c || c.nombre !== "alta") return null;
  const d = (c.args as unknown[])[0] as Partial<DatosAlta> | undefined;
  if (!d?.canchaId || !d.fecha || !Number.isFinite(d.inicio) || !Number.isFinite(d.duracion)) return null;
  return { canchaId: d.canchaId, fecha: d.fecha, inicio: d.inicio!, duracion: d.duracion!, titular: String(d.titular ?? "").trim() };
}

/**
 * Por qué no entró, en criollo. Si era un turno y el hueco ya lo tiene otro: «Ese hueco lo acaba de dar Caro (PC) a
 * Juan» (quién y dónde salen de `recientes`; si no se sabe, «otro puesto»). Si no, lo que dijo el motor.
 */
export function motivoDelRechazo(estado: EstadoClub, p: Pendiente, motivoDelMotor: string): string {
  const h = huecoDe(p);
  if (h) {
    const otro = estado.reservas.find(
      (r) => r.fecha === h.fecha && r.canchaId === h.canchaId && (r.estado === "reservada" || r.estado === "en_cancha") && r.inicio < h.inicio + h.duracion && h.inicio < r.inicio + r.duracion,
    );
    if (otro) {
      const quien = leerSincro(estado).recientes.find((x) => x.reservas?.includes(otro.id));
      const por = quien && quien.equipo !== p.equipo ? `${quien.persona || "otro puesto"}${quien.puesto ? ` (${quien.puesto})` : ""}` : "otro puesto";
      return `Ese hueco lo acaba de dar ${por} a ${otro.titular}`;
    }
  }
  return motivoDelMotor.trim() || "El sistema no lo aceptó sobre lo último guardado.";
}

/** El renglón «para resolver» de un pendiente que el motor rechazó al re-aplicar. */
export function itemParaResolver(estado: EstadoClub, p: Pendiente, motivoDelMotor: string, ahoraMs: number): ItemParaResolver {
  const comando = comandoParaLaFoto(p);
  const h = huecoDe(p);
  const quien = nombreDeQuien(estado, p.persona);
  const texto = comando
    ? describirComando(comando, estado)
    : `${hhmm(p.ahora.min)} · ${p.texto}${quien ? ` · ${quien}${p.puesto ? ` (${p.puesto})` : ""}` : ""}`;
  return {
    id: p.id,
    texto,
    motivo: motivoDelRechazo(estado, p, motivoDelMotor),
    cuando: ahoraMs,
    equipo: p.equipo,
    puesto: p.puesto,
    persona: quien,
    comando,
    ...(h ? { hueco: h } : {}),
  };
}

/** Deja un ítem «para resolver» en la foto (el más nuevo al final; tope de 50). */
export function anotarParaResolver(estado: EstadoClub, item: ItemParaResolver): void {
  const s = sincroDe(estado);
  s.paraResolver = [...s.paraResolver.filter((x) => x.id !== item.id), item].slice(-TOPE_PARA_RESOLVER);
}

/**
 * Saca un ítem «para resolver» (se volvió a aplicar o se descartó). true si estaba. Queda anotado en `resueltos`: así
 * `volverAAnotar` no lo resucita aunque su id ya se haya caído de `aplicados` (N3).
 */
export function sacarParaResolver(estado: EstadoClub, id: string): boolean {
  const s = sincroDe(estado);
  const antes = s.paraResolver.length;
  s.paraResolver = s.paraResolver.filter((x) => x.id !== id);
  const estaba = s.paraResolver.length !== antes;
  if (estaba && !s.resueltos.includes(id)) {
    s.resueltos.push(id);
    if (s.resueltos.length > TOPE_RESUELTOS) s.resueltos.splice(0, s.resueltos.length - TOPE_RESUELTOS);
  }
  return estaba;
}

export interface Rebase {
  /** Entraron sobre lo de la base (siguen en la cola hasta que la base confirme la foto nueva). */
  aplicados: Pendiente[];
  /** El motor dijo que no: van a «para resolver» (ya anotados en la foto). */
  rechazados: { pendiente: Pendiente; item: ItemParaResolver }[];
  /** Ya estaban en la base (subieron antes): confirmados, no se aplican dos veces. */
  salteados: Pendiente[];
  /** Ya habían fallado la primera vez, o ya no correspondían (lo resolvió otro puesto): se sacan sin «para resolver». */
  callados: Pendiente[];
}

/**
 * `estado = base ⊕ cola`. Re-aplica cada pendiente EN ORDEN sobre lo que trajo la base (que MUTA): lo que entra queda
 * anotado (`aplicados`, `recientes`); lo que no, va a «para resolver» con el motivo. Nada se fuerza ni se pisa.
 */
export function rebasar(estado: EstadoClub, cola: readonly Pendiente[], ahoraMs: number): Rebase {
  const r: Rebase = { aplicados: [], rechazados: [], salteados: [], callados: [] };
  const ya = aplicadosDe(estado);
  for (const p of cola) {
    if (ya.has(p.id)) {
      r.salteados.push(p);
      continue;
    }
    const antes = estado.reservas.length;
    const d = correrPendiente(estado, p);
    if (d.ok) {
      anotarAplicado(estado, p, turnosNuevos(estado, antes), ahoraMs, { reciente: p.siFalla !== "callar" });
      r.aplicados.push(p);
    } else if (p.fallo || p.siFalla === "callar") {
      // Lo que ya había fallado la primera vez vuelve a dar lo mismo (y lo que cambió antes de fallar, también): se anota
      // para no repetirlo. «Volver a aplicar» o «Descartar» que ya no corresponden se callan: el ítem sigue donde estaba.
      if (p.fallo) anotarAplicado(estado, p, [], ahoraMs, { reciente: false });
      r.callados.push(p);
    } else {
      const item = itemParaResolver(estado, p, d.mensaje, ahoraMs);
      anotarParaResolver(estado, item);
      // Su id también va a `aplicados`: «la base ya lo tiene» (en «para resolver»). Así, si la subida de esta foto choca
      // otra vez, el puesto sabe si el ítem ya llegó (`volverAAnotar`) y no lo duplica ni lo resucita.
      anotarAplicado(estado, p, [], ahoraMs, { reciente: false });
      r.rechazados.push({ pendiente: p, item });
    }
  }
  return r;
}

/**
 * Lo que este puesto mandó a «para resolver» y la base todavía no confirmó se vuelve a anotar sobre CADA foto nueva de
 * la base (F1 del certificador: si la base avanzaba entre el rebase y la subida, el ítem se perdía al reemplazar la foto).
 * Lo que la base ya tiene (su id está en `aplicados`: llegó, y quizás otro puesto ya lo resolvió o lo descartó) no se
 * toca. MUTA el estado. Devuelve cuántos anotó y cuáles ya estaban en la base (ésos dejan de esperar).
 */
export function volverAAnotar(estado: EstadoClub, items: readonly ItemParaResolver[]): { anotados: number; yaEnLaBase: string[] } {
  // La base ya lo tiene: llegó (`aplicados`) o alguien ya lo resolvió a mano (`resueltos`, que no rota con cada comando).
  const ya = new Set([...leerSincro(estado).aplicados, ...leerSincro(estado).resueltos]);
  const out = { anotados: 0, yaEnLaBase: [] as string[] };
  for (const item of items) {
    if (ya.has(item.id)) {
      out.yaEnLaBase.push(item.id);
      continue;
    }
    anotarParaResolver(estado, item);
    const s = sincroDe(estado);
    s.aplicados.push(item.id);
    if (s.aplicados.length > TOPE_APLICADOS) s.aplicados.splice(0, s.aplicados.length - TOPE_APLICADOS);
    out.anotados++;
  }
  return out;
}

// ── la cinta ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Lo que hizo OTRO puesto y este todavía no vio (para la cinta). `vistos`: los ids que ya se mostraron o se sabían. */
export function novedadesDeOtros(estado: EstadoClub, equipoPropio: string, vistos: ReadonlySet<string>): Reciente[] {
  return leerSincro(estado).recientes.filter((r) => r.equipo !== equipoPropio && !vistos.has(r.id));
}

/** La cinta azul: «Caro (PC) dio un turno a las 21:00 en C2» (y «y 2 cosas más»). null si no hay nada nuevo. */
export function textoDeLaCinta(estado: EstadoClub, novedades: readonly Reciente[]): string | null {
  const u = novedades.at(-1);
  if (!u) return null;
  const quien = `${u.persona || "Otro puesto"}${u.puesto ? ` (${u.puesto})` : ""}`;
  const que = u.turno ? `dio un turno a las ${hhmm(u.turno.inicio)} en ${canchaCorta(canchaDe(estado, u.turno.canchaId)?.nombre)}` : `cargó: ${u.texto.charAt(0).toLowerCase()}${u.texto.slice(1)}`;
  const mas = novedades.length > 1 ? ` · y ${novedades.length - 1} cosa${novedades.length > 2 ? "s" : ""} más` : "";
  return `${quien} ${que}${mas}`;
}

// ── el alta como comando (desde ClubDemo, sin tocar AltaDeTurno) ────────────────────────────────────────────────────

/**
 * El comando «alta» que equivale a lo que acaba de hacer la pantalla de «Dar un turno» (AltaDeTurno despacha una
 * función): se arma con el turno que quedó y, si se dio de alta la ficha del titular, con su teléfono (así, re-aplicado
 * en la base, la ficha se vuelve a crear con el mismo id). Con el mismo azar y el mismo contador da el mismo turno y el
 * mismo código BP; la seña va como se decidió (`conSena`). null si no se creó un turno.
 */
export function altaEquivalente(estado: EstadoClub, antes: { reservas: number; clientes: number }): { nombre: "alta"; args: [DatosAlta] } | null {
  const r = turnosNuevos(estado, antes.reservas)[0];
  if (!r) return null;
  const fichaNueva = estado.clientes.length > antes.clientes ? estado.clientes.slice(antes.clientes).find((c) => c.id === r.clienteId) : undefined;
  const datos: DatosAlta & { conSena?: boolean } = {
    canchaId: r.canchaId,
    fecha: r.fecha,
    inicio: r.inicio,
    duracion: r.duracion,
    tipo: r.tipo as DatosAlta["tipo"],
    titular: r.titular,
    clienteId: fichaNueva ? null : (r.clienteId ?? null),
    otros: r.jugadores
      .slice(1)
      .map((j) => j.nombre)
      .join(", "),
    tel: fichaNueva ? fichaNueva.tel : "",
    origen: r.origen as DatosAlta["origen"],
    conSena: r.sena.monto > 0,
  };
  return { nombre: "alta", args: [datos] };
}

/** Una alternativa de un toque para el turno que chocó: «Cancha 4 · 21:00», «Cancha 2 · 22:30», «60 min acá». */
export interface Alternativa {
  canchaId: string;
  inicio: number;
  duracion: number;
  texto: string;
}

/**
 * Hasta 3 alternativas para un hueco que ya no está (como el aviso del alta, BP-010): otra cancha a la misma hora, el
 * próximo hueco en la misma cancha, y menos minutos acá. Sólo lo que el motor acepta AHORA (`validarHueco`).
 */
export function alternativasDelHueco(estado: EstadoClub, h: NonNullable<ItemParaResolver["hueco"]>): Alternativa[] {
  const out: Alternativa[] = [];
  const nombre = (id: string) => canchaDe(estado, id)?.nombre ?? "La cancha";
  const libre = (canchaId: string, inicio: number, duracion: number) => validarHueco(estado, { canchaId, fecha: h.fecha, inicio, duracion }).ok;
  const otra = estado.canchas.find((c) => c.id !== h.canchaId && c.estado !== "mantenimiento" && libre(c.id, h.inicio, h.duracion));
  if (otra) out.push({ canchaId: otra.id, inicio: h.inicio, duracion: h.duracion, texto: `${nombre(otra.id)} · ${hhmm(h.inicio)}` });
  const { cierra } = horarioDe(estado, h.fecha);
  const paso = estado.config.paso || 30;
  for (let m = h.inicio + paso; m + h.duracion <= cierra; m += paso) {
    if (!libre(h.canchaId, m, h.duracion)) continue;
    out.push({ canchaId: h.canchaId, inicio: m, duracion: h.duracion, texto: `${nombre(h.canchaId)} · ${hhmm(m)}` });
    break;
  }
  for (let d = h.duracion - paso; d >= 60; d -= paso) {
    if (!libre(h.canchaId, h.inicio, d)) continue;
    out.push({ canchaId: h.canchaId, inicio: h.inicio, duracion: d, texto: `${d} min acá` });
    break;
  }
  return out.slice(0, 3);
}

/** El comando con el hueco cambiado (una alternativa): mismos ids, mismo azar, mismo código de seña. */
export function conOtroHueco(c: Comando, a: Pick<Alternativa, "canchaId" | "inicio" | "duracion">): Comando {
  if (c.nombre !== "alta") return c;
  const d = (c.args as unknown[])[0] as DatosAlta;
  return { ...c, args: [{ ...d, canchaId: a.canchaId, inicio: a.inicio, duracion: a.duracion }] } as Comando;
}

/** El texto de un pendiente o de un comando, antes de correrlo. */
export function textoDe(nombre: NombreDeComando, args: unknown, estado: EstadoClub): string {
  return queHizo({ nombre, args } as Pick<Comando, "nombre" | "args">, estado);
}

/** ¿El turno de un pendiente sigue en el estado? (después de un rebase, para el WhatsApp del alta). */
export const sigueElTurno = (estado: EstadoClub, reservaId: string) => !!reservaDe(estado, reservaId);

/**
 * Lo que PROMETE algo a alguien sube ya (≤ 2 s, sin los 30 s): es el bloqueo optimista del hueco (la primera foto que la
 * base acepta se queda con él). Dar, mover o extender un turno, hacerlo fijo, abrir o cerrar la cancha con plata y cobrar.
 * Lo demás (cargos, buffet) se agrupa.
 */
export function prometeAlgo(nombre: string, args: unknown): boolean {
  const a = Array.isArray(args) ? args : [];
  const tipo = (x: unknown) => String((x as { tipo?: unknown } | undefined)?.tipo ?? "");
  switch (nombre) {
    case "alta":
      return true;
    case "ciclo":
      return ["mover", "extender", "cobrarFalta", "devolver"].includes(tipo(a[1]));
    case "cuenta":
      return tipo(a[1]) === "hacerFijo" || tipo(a[1]).startsWith("cobrar");
    case "buffet":
      return tipo(a[0]) === "cobrar";
    // Darle el turno a uno de la espera o crear un fijo toma un hueco (como el alta); la lluvia y los bloqueos mueven la
    // agenda de todos; vender, entregar, cobrar una deuda y pagar mueven plata.
    case "espera":
      return tipo(a[0]) === "asignar";
    case "fijo":
      return tipo(a[0]) === "nuevo" || tipo(a[0]) === "baja";
    case "canchas":
      return ["lluvia", "bloquear", "mantenimiento"].includes(tipo(a[0]));
    case "venta":
      return true;
    case "tienda":
      return tipo(a[0]) === "entregar";
    case "clientes":
      return tipo(a[0]) === "cobrarDeuda";
    case "proveedores":
      return tipo(a[0]) === "pagar";
    case "caja":
      return tipo(a[0]) !== "fondo";
    // Configuración: lo de usuarios y PIN (alta y PIN nuevo muestran un PIN una sola vez: cuanto antes llega, menos chance
    // de tener que re-aplicarlo), abrir el club y la limpieza.
    case "config":
      return ["pinInicial", "alta", "pinNuevo", "sacarAcceso", "cambiarMiPin"].includes(tipo(a[0]));
    case "abrirClub":
    case "golive":
      return true;
    // Tanda 2: «Abrir» cobrando la deuda de antes y «Cerrar la de X y abrir» / «la mesa sigue · dividido» toman la cancha
    // y mueven plata: suben ya (como el alta y el cobro). Pasar la venta a una cuenta, «que se cierre sola al aprobar» y
    // posponer una alerta no prometen nada ni mueven la caja: se agrupan.
    case "abrirConDeuda":
    case "cierre":
      return true;
    case "ventaACuenta":
    case "plata":
    case "bandeja":
      return false;
    default:
      return false;
  }
}
