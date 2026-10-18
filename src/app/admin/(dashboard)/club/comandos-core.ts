// ============================================================================
// COMANDOS DEL CLUB — lo que se hizo en el mostrador, con nombre, para re-aplicarlo (modo sin internet, F0.a).
// ============================================================================
//
// Hoy `almacen.ejecutar` recibe una función suelta: queda la foto, no QUÉ se hizo. Sin internet hace falta lo segundo:
// si al volver la base avanzó desde otro equipo, lo de este equipo se re-aplica ENCIMA, una operación por vez, y lo que
// el motor rechace va a «Para resolver ahora». Lo del otro equipo nunca se pisa.
// Diseño completo: docs/producto/MODO-SIN-INTERNET-CLUB.md.
//
// Un comando es JSON puro: nombre de una LISTA BLANCA + argumentos + todo lo que el motor necesita para dar lo mismo
// la segunda vez (la hora, la semilla del azar, por dónde iba el contador de ids). Un nombre que no está en la lista
// no se ejecuta, venga de donde venga.
//
// Puro: no lee el reloj ni la red ni el almacenamiento. Muta el estado que recibe, como todo el motor.

import { retomarSecuencia, secuenciaIds, VERSION_ESTADO } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { reservar, type DatosAlta } from "./alta-core";
import { ejecutarBuffet, type AccionBuffet } from "./buffet-core";
import { ejecutarMesa, type AccionMesa } from "./buffet-mesa-core";
import { ejecutarCaja, type AccionCaja } from "./caja-core";
import { ejecutarCiclo, type AccionCiclo } from "./ciclo-core";
import { ejecutar as ejecutarCuenta, type AccionCuenta, type MedioCobro } from "./cuenta-core";

/** Lo que se puede cobrar sin internet: lo que no hay que verificar afuera (MP, transferencia, posnet). */
const MEDIOS_SIN_INTERNET: ReadonlySet<MedioCobro> = new Set(["efectivo", "monedero"]);
const sinRed = (medio: MedioCobro) => MEDIOS_SIN_INTERNET.has(medio);

interface Entrada<A extends unknown[]> {
  correr: (estado: EstadoClub, args: A, ahora: Ahora, auth: Auth) => Desenlace;
  /** Si va sin internet (D4 del diseño; la confirma el dueño). Ante la duda, no. */
  sinInternet: (args: A) => boolean;
}

const entrada = <A extends unknown[]>(e: Entrada<A>) => e;

/**
 * La lista blanca. Cada núcleo de pantalla que ya despacha acciones `{ tipo, … }` entra como UN comando: migrar una
 * pantalla es cambiar el closure por `almacen.comando("cuenta", [reservaId, accion])`.
 */
export const REGISTRO = {
  cuenta: entrada<[reservaId: string, accion: AccionCuenta]>({
    correr: (e, [reservaId, a], ahora, auth) => ejecutarCuenta(e, reservaId, a, ahora, auth),
    sinInternet: ([, a]) => ("medio" in a && (a.tipo !== "cargo" || a.modo === "cobrar") ? sinRed(a.medio) : true),
  }),
  ciclo: entrada<[reservaId: string, accion: AccionCiclo]>({
    correr: (e, [reservaId, a], ahora, auth) => ejecutarCiclo(e, reservaId, a, ahora, auth),
    // D4 sólo nombra la falta; mover, extender, cancelar e interrumpir reordenan la agenda de todos: con internet.
    sinInternet: ([, a]) => a.tipo === "falta" || ((a.tipo === "cobrarFalta" || a.tipo === "devolver") && sinRed(a.medio)),
  }),
  buffet: entrada<[accion: AccionBuffet]>({
    correr: (e, [a], ahora, auth) => ejecutarBuffet(e, a, ahora, auth),
    sinInternet: ([a]) => (a.tipo === "cobrar" ? sinRed(a.medio) : true),
  }),
  mesa: entrada<[accion: AccionMesa]>({
    correr: (e, [a], ahora, auth) => ejecutarMesa(e, a, ahora, auth),
    // Un descuento lo firma el dueño: D4 no lo nombra.
    sinInternet: ([a]) => a.tipo === "pasarCargo" || !a.descuento,
  }),
  caja: entrada<[accion: AccionCaja]>({
    correr: (e, [a], ahora, auth) => ejecutarCaja(e, a, ahora, auth),
    // El egreso chico con PIN sí; el cierre y el fondo, con internet.
    sinInternet: ([a]) => a.tipo === "egreso",
  }),
  alta: entrada<[datos: DatosAlta]>({
    correr: (e, [d], ahora) => reservar(e, d, ahora),
    // Turno presencial: si choca con uno que dio otro equipo, el motor dice que no y va a «Para resolver».
    sinInternet: () => true,
  }),
} as const;

export type NombreDeComando = keyof typeof REGISTRO;
export type ArgsDe<N extends NombreDeComando> = Parameters<(typeof REGISTRO)[N]["correr"]>[1];

export interface Comando<N extends NombreDeComando = NombreDeComando> {
  /** Idempotencia: un id que la base ya aplicó no se aplica dos veces. */
  id: string;
  /** El puesto donde se hizo. */
  equipo: string;
  /** Quién operaba con su PIN (para «Para resolver ahora»: quién lo hizo). */
  persona: string;
  /** La versión de la base sobre la que se hizo. */
  versionBase: number;
  /** VERSION_ESTADO del motor: otra versión → recargar la página, no aplicar. */
  version: number;
  nombre: N;
  args: ArgsDe<N>;
  ahora: Ahora;
  auth: Auth;
  /** Semilla del azar del motor (referencia de la seña, código del pedido): la segunda vez da lo mismo. */
  azar: number;
  /** Por dónde iba el contador de ids del motor antes de correrlo. */
  idsDesde: number;
}

/** Generador chico y conocido (mulberry32): de la misma semilla, la misma serie. */
function serie(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Corre `fn` con `Math.random` fijado en la semilla. El motor llama a `nuevaRefPago` y `nuevoCodigoPedido` sin pasarles
 * el azar; hasta que el vanilla lo acepte por parámetro (pedido F0.b), ésta es la única forma de que re-aplicar dé la
 * misma referencia. Sincrónico y restaurado en `finally`: nada más corre en el medio.
 */
function conAzar<T>(semilla: number, fn: () => T): T {
  const original = Math.random;
  Math.random = serie(semilla);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

export type Corrida = Desenlace & {
  /** El contador de ids no estaba donde estaba la primera vez: los ids que creó éste salieron distintos. */
  idsDistintos?: boolean;
};

const NO_ESTA: Desenlace = { ok: false, mensaje: "Esta operación no se reconoce. Recargá la página." };
const OTRA_VERSION: Desenlace = { ok: false, mensaje: "Se hizo con otra versión del sistema. Recargá la página." };

/** Corre un comando sobre el estado (lo MUTA). Nunca tira: si algo no va, lo dice en criollo. */
export function correrComando(estado: EstadoClub, c: Comando): Corrida {
  if (c.version !== VERSION_ESTADO) return OTRA_VERSION;
  if (!Object.hasOwn(REGISTRO, c.nombre)) return NO_ESTA;
  const e = REGISTRO[c.nombre] as unknown as Entrada<unknown[]>;
  // El contador sólo sube: si no llegó a donde estaba la primera vez, retomarlo ahí da los mismos ids.
  retomarSecuencia(c.idsDesde);
  const idsDistintos = secuenciaIds() !== c.idsDesde;
  let d: Desenlace;
  try {
    d = conAzar(c.azar, () => e.correr(estado, c.args as unknown[], c.ahora, c.auth));
  } catch {
    d = { ok: false, mensaje: "No se pudo hacer. Probá de nuevo." };
  }
  return idsDistintos ? { ...d, idsDistintos } : d;
}

/** Si el comando puede ir sin internet. Un nombre que no está, no. */
export function vaSinInternet(nombre: string, args: unknown): boolean {
  if (!Object.hasOwn(REGISTRO, nombre)) return false;
  const e = REGISTRO[nombre as NombreDeComando] as unknown as Entrada<unknown[]>;
  try {
    return Array.isArray(args) && e.sinInternet(args);
  } catch {
    return false;
  }
}

export interface Rechazo {
  comando: Comando;
  motivo: string;
}

export interface Rebase {
  aplicados: Comando[];
  /** El motor dijo que no sobre lo que hay en la base: van a «Para resolver ahora». */
  rechazados: Rechazo[];
  /** Ya estaban en la base (subieron antes de enterarnos): no se aplican dos veces. */
  salteados: Comando[];
  /** Algún comando aplicado creó ids distintos de los de la primera vez (ver `Corrida.idsDistintos`). */
  idsDistintos: boolean;
}

/**
 * `estado = estadoDeLaBase ⊕ pendientes`. Re-aplica cada pendiente EN ORDEN sobre lo que trajo la base (que MUTA).
 * Lo que el motor rechaza no se fuerza; lo que dependía de un rechazado lo rechaza el motor a su turno (el id no
 * existe), con su propio motivo.
 */
export function rebasar(estado: EstadoClub, pendientes: readonly Comando[], yaAplicados: ReadonlySet<string>): Rebase {
  const r: Rebase = { aplicados: [], rechazados: [], salteados: [], idsDistintos: false };
  for (const c of pendientes) {
    if (yaAplicados.has(c.id)) {
      r.salteados.push(c);
      continue;
    }
    const d = correrComando(estado, c);
    if (d.idsDistintos) r.idsDistintos = true;
    if (d.ok) r.aplicados.push(c);
    else r.rechazados.push({ comando: c, motivo: d.mensaje });
  }
  return r;
}
