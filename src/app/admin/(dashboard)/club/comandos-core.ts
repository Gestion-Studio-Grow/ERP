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

import { cancha as canchaDe, crearClubReal, cuenta as cuentaDe, hhmm, pesos, prefijoIds, producto as productoDe, reserva as reservaDe, retomarSecuencia, saldo, secuenciaIds, usuario as usuarioDe, VERSION_ESTADO } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { ponerLuz } from "./agenda-core";
import { anotarEnEsperaDesdeAlta, reservar, type DatosAlta } from "./alta-core";
import { ejecutarBuffet, type AccionBuffet } from "./buffet-core";
import { ejecutarMesa, venderEnMostrador, type AccionMesa, type Carrito, type DesenlaceMesa } from "./buffet-mesa-core";
import { ejecutarCaja, type AccionCaja } from "./caja-core";
import { ejecutarCanchas, ejecutarEspera, ejecutarFijo, type AccionCanchas, type AccionEspera, type AccionFijo, type DesenlaceCanchas } from "./canchas-core";
import { ejecutarCiclo, type AccionCiclo } from "./ciclo-core";
import { ejecutarClientes, type AccionClientes, type DesenlaceClientes } from "./clientes-core";
import { aprobarConCodigo, pedirFiado } from "./credito-core";
import { ejecutar as ejecutarCuenta, type AccionCuenta, type MedioCaja, type MedioCobro } from "./cuenta-core";
import { ejecutarNovedades, type AccionNovedades, type DesenlaceNovedades } from "./novedades-core";
import { ejecutarProveedores, type AccionProveedores, type DesenlaceProveedores } from "./proveedores-core";
import { ejecutarStock, type AccionStock, type DesenlaceStock } from "./stock-core";
import { ejecutarTablero, type AccionTablero, type DesenlaceTablero } from "./tablero-core";
import { ejecutarTienda, type AccionTienda } from "./tienda-core";

/** Lo que se puede cobrar sin internet: lo que no hay que verificar afuera (MP, transferencia, posnet). */
const MEDIOS_SIN_INTERNET: ReadonlySet<MedioCobro> = new Set(["efectivo", "monedero"]);
const sinRed = (medio: MedioCobro) => MEDIOS_SIN_INTERNET.has(medio);

interface Entrada<A extends unknown[], D extends Desenlace = Desenlace> {
  correr: (estado: EstadoClub, args: A, ahora: Ahora, auth: Auth) => D;
  /** Si va sin internet (D4 del diseño; la confirma el dueño). Ante la duda, no. */
  sinInternet: (args: A) => boolean;
}

const entrada = <A extends unknown[], D extends Desenlace = Desenlace>(e: Entrada<A, D>) => e;

/** Lo que el dueño resuelve desde el mostrador con el código que mandó por WhatsApp, y el pedido de fiado. */
export type AccionFiado = { tipo: "pedir"; cuentaId: string } | { tipo: "aprobarCodigo"; novedadId: string; codigo: string };

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
    // Sin internet sólo lo que hace ENTRAR plata (Challenger, 18/10): la falta y cobrarla. Devolver saca plata; mover,
    // extender, cancelar e interrumpir reordenan la agenda de todos: con internet.
    sinInternet: ([, a]) => a.tipo === "falta" || (a.tipo === "cobrarFalta" && sinRed(a.medio)),
  }),
  buffet: entrada<[accion: AccionBuffet]>({
    correr: (e, [a], ahora, auth) => ejecutarBuffet(e, a, ahora, auth),
    sinInternet: ([a]) => (a.tipo === "cobrar" ? sinRed(a.medio) : true),
  }),
  mesa: entrada<[accion: AccionMesa], DesenlaceMesa>({
    correr: (e, [a], ahora, auth) => ejecutarMesa(e, a, ahora, auth),
    // Un descuento lo firma el dueño: D4 no lo nombra.
    sinInternet: ([a]) => a.tipo === "pasarCargo" || !a.descuento,
  }),
  caja: entrada<[accion: AccionCaja], ReturnType<typeof ejecutarCaja>>({
    correr: (e, [a], ahora, auth) => ejecutarCaja(e, a, ahora, auth),
    // Todo con internet: el egreso saca plata y el PIN viaja en claro en el estado (Challenger, 18/10); el cierre y el
    // fondo, también.
    sinInternet: () => false,
  }),
  alta: entrada<[datos: DatosAlta], ReturnType<typeof reservar>>({
    correr: (e, [d], ahora) => reservar(e, d, ahora),
    // Turno presencial: si choca con uno que dio otro equipo, el motor dice que no y va a «Para resolver».
    sinInternet: () => true,
  }),
  // ── las demás pantallas que ya despachaban acciones (F3 del certificador: toda acción de pantalla es un comando) ──
  /** «Anotar en espera» desde el alta que no entra. */
  esperaDesdeAlta: entrada<[datos: Parameters<typeof anotarEnEsperaDesdeAlta>[1]]>({
    correr: (e, [d], ahora) => anotarEnEsperaDesdeAlta(e, d, ahora),
    sinInternet: () => true,
  }),
  espera: entrada<[accion: AccionEspera], ReturnType<typeof ejecutarEspera>>({
    correr: (e, [a], ahora) => ejecutarEspera(e, a, ahora),
    // Darle el turno a uno de la espera es como un alta presencial: si el hueco ya lo dio otro puesto, «Para resolver».
    sinInternet: () => true,
  }),
  fijo: entrada<[accion: AccionFijo]>({
    correr: (e, [a], ahora, auth) => ejecutarFijo(e, a, ahora, auth),
    // Dar de baja un fijo cancela turnos (y puede devolver plata): con internet.
    sinInternet: ([a]) => a.tipo !== "baja",
  }),
  luz: entrada<[canchaId: string, prendida: boolean]>({
    correr: (e, [canchaId, prendida]) => ponerLuz(e, canchaId, prendida),
    sinInternet: () => true,
  }),
  canchas: entrada<[accion: AccionCanchas], DesenlaceCanchas>({
    correr: (e, [a], ahora) => ejecutarCanchas(e, a, ahora),
    // Lluvia, bloqueos y mantenimiento reordenan la agenda de todos: con internet.
    sinInternet: () => false,
  }),
  venta: entrada<[carrito: Carrito, medio: MedioCaja]>({
    correr: (e, [carrito, medio], ahora) => venderEnMostrador(e, carrito, medio, ahora),
    sinInternet: ([, medio]) => sinRed(medio),
  }),
  fiado: entrada<[accion: AccionFiado]>({
    correr: (e, [a], ahora, auth) => (a.tipo === "pedir" ? pedirFiado(e, a.cuentaId, auth, ahora) : aprobarConCodigo(e, a.novedadId, a.codigo, auth, ahora)),
    // El código del dueño se verifica en el puesto (no hace falta red); el pedido viaja al dueño: con internet.
    sinInternet: ([a]) => a.tipo === "aprobarCodigo",
  }),
  clientes: entrada<[accion: AccionClientes], DesenlaceClientes>({
    correr: (e, [a], ahora, auth) => ejecutarClientes(e, a, ahora, auth),
    sinInternet: ([a]) => a.tipo === "cobrarDeuda" && sinRed(a.medio),
  }),
  tienda: entrada<[accion: AccionTienda], ReturnType<typeof ejecutarTienda>>({
    correr: (e, [a], ahora, auth) => ejecutarTienda(e, a, ahora, auth),
    sinInternet: ([a]) => a.tipo === "entregar" && sinRed(a.medio),
  }),
  stock: entrada<[accion: AccionStock], DesenlaceStock>({
    correr: (e, [a], ahora, auth) => ejecutarStock(e, a, ahora, auth),
    sinInternet: () => false,
  }),
  proveedores: entrada<[accion: AccionProveedores], DesenlaceProveedores>({
    correr: (e, [a], ahora, auth) => ejecutarProveedores(e, a, ahora, auth),
    // Pagar saca plata (y lleva PIN tipeado): con internet.
    sinInternet: () => false,
  }),
  novedades: entrada<[accion: AccionNovedades], DesenlaceNovedades>({
    correr: (e, [a], ahora, auth) => ejecutarNovedades(e, a, ahora, auth),
    sinInternet: () => false,
  }),
  tablero: entrada<[accion: AccionTablero], DesenlaceTablero>({
    correr: (e, [a], ahora, auth) => ejecutarTablero(e, a, ahora, auth),
    sinInternet: () => false,
  }),
} as const;

export type NombreDeComando = keyof typeof REGISTRO;
export type ArgsDe<N extends NombreDeComando> = Parameters<(typeof REGISTRO)[N]["correr"]>[1];
/** Lo que devuelve el núcleo de la pantalla (con lo suyo: el id del cliente nuevo, la lluvia, el PIN que se miró…). */
export type ResultadoDe<N extends NombreDeComando> = ReturnType<(typeof REGISTRO)[N]["correr"]>;

export interface Comando<N extends NombreDeComando = NombreDeComando> {
  /** Idempotencia: un id que la base ya aplicó no se aplica dos veces. */
  id: string;
  /** El puesto donde se hizo. */
  equipo: string;
  /** Cómo se lo nombra al puesto en la pantalla («PC», «tablet»). Opcional: un comando viejo no lo trae. */
  puesto?: string;
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
  /**
   * El prefijo de ids del puesto donde se hizo (`prefijoIds` del motor, «k3f9-»): re-aplicado en otro puesto o una hora
   * después, crea los MISMOS ids. Opcional: un comando sin prefijo corre con el que tenga el proceso.
   */
  prefijo?: string;
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

/**
 * Pone el contador de ids del motor EXACTAMENTE en `n` (también para abajo). El motor sólo deja subirlo
 * (`retomarSecuencia`); el único camino que lo baja es `crearClubReal`, que lo pone en 0 (y arma un club en blanco que
 * se tira: ~0,1 ms). Pedido al dueño del motor: un `fijarSecuencia(n)` propio que reemplace este rodeo.
 */
function fijarSecuencia(n: number) {
  if (secuenciaIds() > n) crearClubReal("2000-01-01");
  retomarSecuencia(n);
}

/**
 * Corre `fn` como la primera vez: el azar en la misma semilla y el contador de ids donde estaba (`idsDesde`), así
 * re-aplicar da los MISMOS ids y el mismo código de seña aunque el contador ya haya pasado (otra cosa que se hizo
 * después, o «Volver a aplicar» una hora más tarde). Al terminar, el contador queda en lo más alto que llegó: nunca
 * se repite un id. Los ids no chocan con los de otro puesto porque cada puesto tiene su prefijo (`prefijoIds`).
 */
export function correrDeterminista<T>(azar: number, idsDesde: number, fn: () => T, prefijo?: string): T {
  const antes = secuenciaIds();
  const prefijoAntes = prefijoActual;
  if (prefijo !== undefined) usarPrefijo(prefijo);
  fijarSecuencia(idsDesde);
  try {
    return conAzar(azar, fn);
  } finally {
    retomarSecuencia(antes);
    if (prefijo !== undefined) usarPrefijo(prefijoAntes);
  }
}

/**
 * El prefijo de ids que se sabe puesto (el motor no lo deja leer). Sólo lo cambia `correrDeterminista` con un prefijo,
 * y lo vuelve a dejar como estaba: dos almacenes en el mismo proceso (los tests de dos puestos) no se pisan.
 */
let prefijoActual = "";
function usarPrefijo(p: string) {
  prefijoActual = p;
  prefijoIds(p);
}

export type Corrida = Desenlace & {
  /** (Histórico) el contador no pudo volver a donde estaba: hoy no pasa, re-aplicar siempre da los mismos ids. */
  idsDistintos?: boolean;
};

const NO_ESTA: Desenlace = { ok: false, mensaje: "Esta operación no se reconoce. Recargá la página." };
const OTRA_VERSION: Desenlace = { ok: false, mensaje: "Se hizo con otra versión del sistema. Recargá la página." };

/** Corre un comando sobre el estado (lo MUTA). Nunca tira: si algo no va, lo dice en criollo. */
export function correrComando(estado: EstadoClub, c: Comando): Corrida {
  if (c.version !== VERSION_ESTADO) return OTRA_VERSION;
  if (!Object.hasOwn(REGISTRO, c.nombre)) return NO_ESTA;
  const e = REGISTRO[c.nombre] as unknown as Entrada<unknown[]>;
  try {
    return correrDeterminista(c.azar, c.idsDesde, () => e.correr(estado, c.args as unknown[], c.ahora, c.auth), c.prefijo);
  } catch {
    return { ok: false, mensaje: "No se pudo hacer. Probá de nuevo." };
  }
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

// ── lo que se guarda de un comando y cómo se lo cuenta ───────────────────────────────────────────────────────────

/**
 * El comando listo para quedar en la foto («Para resolver», que viaja a la base y lo ve otro puesto): SIN PIN. El de
 * quien operaba (`auth.pin`) y el que se tipeó en la acción (egreso, cierre, descuento: `args[…].pin`) se sacan; «Volver a
 * aplicar» firma con quien lo vuelve a aplicar y, si la acción pedía un PIN tipeado, el motor lo vuelve a pedir.
 */
export function comandoSinPin<N extends NombreDeComando>(c: Comando<N>): Comando<N> {
  const sinPin = (x: unknown): unknown => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return x;
    const o = { ...(x as Record<string, unknown>) };
    delete o.pin;
    return o;
  };
  const auth: Auth = c.auth?.usuarioId ? { usuarioId: c.auth.usuarioId } : {};
  return { ...c, auth, args: (Array.isArray(c.args) ? c.args.map(sinPin) : c.args) as ArgsDe<N> };
}

const MEDIO: Record<string, string> = { efectivo: "efectivo", mercadopago: "Mercado Pago", transferencia: "transferencia", debito: "débito", monedero: "créditos" };
const medioDe = (m: unknown) => MEDIO[String(m)] ?? String(m ?? "");
/** «Cancha 2» → «C2» (como se la nombra en el mostrador). */
export const canchaCorta = (nombre: string | undefined) => (nombre ?? "").replace(/^cancha\s*/i, "C") || "la cancha";

/** El turno de un comando, como lo dice la recepción: «turno 19:00 C2». */
function elTurno(estado: EstadoClub | null, reservaId: string) {
  const r = estado ? reservaDe(estado, reservaId) : undefined;
  if (!r || !estado) return { titular: "quien jugaba", turno: "", r };
  return { titular: r.titular, turno: ` (turno ${hhmm(r.inicio)} ${canchaCorta(canchaDe(estado, r.canchaId)?.nombre)})`, r };
}

/**
 * Qué se hizo, en una frase de recepción: «Cobro $ 9.000 efectivo a Juan (turno 19:00 C2)». Con `estado` (el de ANTES
 * de correrlo, o el de ahora) pone los nombres y los montos; sin él, lo que dice el comando. Nunca tira.
 */
export function queHizo(c: Pick<Comando, "nombre" | "args">, estado: EstadoClub | null = null): string {
  try {
    const a = c.args as unknown[];
    switch (c.nombre) {
      case "alta": {
        const d = a[0] as Partial<DatosAlta>;
        const cancha = canchaCorta(estado && d.canchaId ? canchaDe(estado, d.canchaId)?.nombre : d.canchaId);
        const tipo = d.tipo === "clase" ? "Clase" : d.tipo === "abierto" ? "Partido abierto" : "Turno";
        return `${tipo} a ${String(d.titular ?? "").trim() || "alguien"} en ${cancha} a las ${hhmm(Number(d.inicio))} (${Number(d.duracion)} min)`;
      }
      case "cuenta": {
        const [reservaId, x] = a as [string, AccionCuenta];
        const { titular, turno, r } = elTurno(estado, reservaId);
        const jug = (idx: number) => r?.jugadores[idx]?.nombre ?? `el jugador ${idx + 1}`;
        switch (x.tipo) {
          case "cobrarTodo": {
            const debe = r ? saldo(r) : 0;
            return `Cobro ${debe > 0 ? `${pesos(debe)} ` : ""}${medioDe(x.medio)} a ${titular}${turno}`;
          }
          case "cobrarCancha":
            return `Cobro ${pesos(x.monto)} ${medioDe(x.medio)} a ${titular}${turno}`;
          case "cobrarSena":
            return `Cobro de la seña${r?.sena.monto ? ` ${pesos(r.sena.monto)}` : ""} ${medioDe(x.medio)} a ${titular}${turno}`;
          case "cobrarJugador":
          case "cobrarParte":
            return `Cobro de la parte de ${jug(x.idx)} ${medioDe(x.medio)}${turno}`;
          case "cargo": {
            const p = estado ? productoDe(estado, x.productoId)?.nombre : undefined;
            return `${x.cant} × ${p ?? "producto"} a ${jug(x.idx)}${x.modo === "cobrar" ? `, cobrado ${medioDe(x.medio)}` : ", a la cuenta"}${turno}`;
          }
          case "abrirCancha":
            return `Abrir la cancha de ${titular}${turno}`;
          case "cerrarCancha":
          case "cerrarYSeguir":
            return `Cerrar la cancha de ${titular}${turno}`;
          case "hacerFijo":
            return `Hacer fijo el turno de ${titular}${turno}`;
          case "sumarJugador":
            return `Sumar a ${x.nombre} al turno de ${titular}${turno}`;
          default:
            return `Cambio en la cuenta de ${titular}${turno}`;
        }
      }
      case "ciclo": {
        const [reservaId, x] = a as [string, AccionCiclo];
        const { titular, turno } = elTurno(estado, reservaId);
        switch (x.tipo) {
          case "mover":
            return `Mover el turno de ${titular} a ${canchaCorta(estado ? canchaDe(estado, x.canchaId)?.nombre : x.canchaId)} ${hhmm(x.inicio)}${turno}`;
          case "extender":
            return `Extender ${x.minutos} min el turno de ${titular}${turno}`;
          case "falta":
            return `Falta de ${titular}${turno}`;
          case "cancelar":
            return `Cancelar el turno de ${titular}${turno}`;
          case "interrumpir":
            return `Cortar el turno de ${titular}${turno}`;
          case "liberarFijo":
            return `Liberar el fijo de ${titular}${turno}`;
          case "devolver":
            return `Devolución ${medioDe(x.medio)} a ${titular}${turno}`;
          case "cobrarFalta":
            return `Cobro de la falta ${medioDe(x.medio)} a ${titular}${turno}`;
        }
        return `Cambio en el turno de ${titular}${turno}`;
      }
      case "buffet": {
        const x = a[0] as AccionBuffet;
        if (x.tipo === "abrir") return `Abrir la cuenta de ${x.titular}`;
        const cta = estado ? cuentaDe(estado, x.cuentaId) : undefined;
        const de = cta ? ` de ${cta.titular}` : "";
        if (x.tipo === "cargar") return `${x.cant} × ${(estado ? productoDe(estado, x.productoId)?.nombre : undefined) ?? "producto"} en la cuenta${de}`;
        if (x.tipo === "cobrar") return `Cobro de la cuenta${de} ${medioDe(x.medio)}`;
        if (x.tipo === "aCuenta") return `Pasar a la cuenta corriente la cuenta${de}`;
        if (x.tipo === "cerrarEnCero") return `Cerrar en cero la cuenta${de}`;
        return `Cambio en la cuenta${de}`;
      }
      case "mesa": {
        const x = a[0] as AccionMesa;
        const de = estado ? cuentaDe(estado, x.cuentaId)?.titular : undefined;
        if (x.tipo === "pasarCargo") return `Pasar un cargo de la cuenta${de ? ` de ${de}` : ""} a la de ${(estado ? cuentaDe(estado, x.aCuentaId)?.titular : undefined) ?? "otro"}`;
        return `${x.descuento ? "Descuento" : "Cargo"} ${pesos(x.monto)} «${x.concepto}» en la cuenta${de ? ` de ${de}` : ""}`;
      }
      case "caja": {
        const x = a[0] as AccionCaja;
        if (x.tipo === "egreso") return `Egreso de caja $ ${x.monto} «${x.concepto}»`;
        if (x.tipo === "cerrar") return "Cierre de caja";
        return `Fondo de caja $ ${x.monto}`;
      }
      case "esperaDesdeAlta": {
        const d = a[0] as { titular?: string; espera?: { fecha: string; desde: number; hasta: number } };
        return `Anotar a ${String(d.titular ?? "").trim() || "alguien"} en la espera${d.espera ? ` (${hhmm(d.espera.desde)} a ${hhmm(d.espera.hasta)})` : ""}`;
      }
      case "espera": {
        const x = a[0] as AccionEspera;
        const quien = x.tipo === "anotar" ? x.titular : (estado?.espera.find((w) => w.id === x.esperaId)?.titular ?? "alguien de la espera");
        if (x.tipo === "anotar") return `Anotar a ${quien} en la espera`;
        if (x.tipo === "asignar") return `Turno a ${quien} (de la espera) en ${canchaCorta(estado ? canchaDe(estado, x.canchaId)?.nombre : x.canchaId)} a las ${hhmm(x.inicio)}`;
        return `Sacar a ${quien} de la espera`;
      }
      case "fijo": {
        const x = a[0] as AccionFijo;
        if (x.tipo === "nuevo") return `Turno fijo de ${x.datos.titular.trim() || "alguien"} a las ${hhmm(x.datos.inicio)}`;
        if (x.tipo === "baja") return `Dar de baja el fijo de ${estado?.fijos.find((f) => f.id === x.fijoId)?.titular ?? "alguien"}`;
        return "Bajar los fijos a la grilla";
      }
      case "luz": {
        const [canchaId, prendida] = a as [string, boolean];
        return `${prendida ? "Prender" : "Apagar"} la luz de ${canchaCorta(estado ? canchaDe(estado, canchaId)?.nombre : canchaId)}`;
      }
      case "canchas": {
        const x = a[0] as AccionCanchas;
        const cancha = "canchaId" in x ? canchaCorta(estado ? canchaDe(estado, x.canchaId)?.nombre : x.canchaId) : "";
        if (x.tipo === "lluvia") return `Plan lluvia de ${hhmm(x.desde)} a ${hhmm(x.hasta)}`;
        if (x.tipo === "bloquear") return `Bloquear ${cancha} de ${hhmm(x.desde)} a ${hhmm(x.hasta)}`;
        if (x.tipo === "quitarBloqueo") return "Quitar un bloqueo";
        if (x.tipo === "mantenimiento") return `${x.activo ? "Poner en mantenimiento" : "Habilitar"} ${cancha}`;
        return `Cambiar el techo de ${cancha}`;
      }
      case "venta": {
        const [carrito, medio] = a as [Carrito, MedioCaja];
        const n = Object.values(carrito ?? {}).reduce((s, x) => s + (x > 0 ? x : 0), 0);
        return `Venta de mostrador (${n} producto${n === 1 ? "" : "s"}) ${medioDe(medio)}`;
      }
      case "fiado": {
        const x = a[0] as AccionFiado;
        if (x.tipo === "pedir") return `Pedir fiado para la cuenta${estado ? ` de ${cuentaDe(estado, x.cuentaId)?.titular ?? ""}` : ""}`.trim();
        return "Aprobar un fiado con el código del dueño";
      }
      case "clientes": {
        const x = a[0] as AccionClientes;
        if (x.tipo === "alta") return `Ficha nueva: ${x.nombre}`;
        if (x.tipo === "cobrarDeuda") return `Cobro de deuda ${medioDe(x.medio)}`;
        return "Cambio en una ficha de cliente";
      }
      case "tienda": {
        const x = a[0] as AccionTienda;
        if (x.tipo === "entregar") return `Entregar un pedido de la tienda, cobrado ${medioDe(x.medio)}`;
        if (x.tipo === "pegar") return "Cargar un pedido de la tienda";
        return "Cambio en un pedido de la tienda";
      }
      case "stock":
        return "Cambio en el stock";
      case "proveedores": {
        const x = a[0] as AccionProveedores;
        if (x.tipo === "pagar") return `Pago a proveedor $ ${x.monto} ${medioDe(x.medio)}`;
        if (x.tipo === "remito") return "Remito de proveedor";
        return "Cambio en un proveedor";
      }
      case "novedades":
        return "Cambio en novedades y difusión";
      case "tablero": {
        const x = a[0] as AccionTablero;
        if (x.tipo === "autorizar") return "Autorizar un fiado";
        if (x.tipo === "otorgar") return "Dar acceso a alguien nuevo";
        return "Rechazar un pedido";
      }
    }
  } catch {
    // un comando raro se cuenta con su nombre
  }
  return `Operación «${String(c.nombre)}»`;
}

/** El nombre corto de quien operaba (el usuario del club; nunca su PIN). */
export function nombreDeQuien(estado: EstadoClub | null, persona: string): string {
  const u = estado ? usuarioDe(estado, persona) : undefined;
  return (u?.nombre ?? "").split(" ")[0];
}

/**
 * El renglón de «Lo que quedó aparte» y de la bandeja: «19:42 · Cobro $ 9.000 efectivo a Juan (turno 19:00 C2) · Lu
 * (tablet)». Quién: el nombre del usuario del club (no su id); el puesto, si el comando lo trae. Nunca muestra un PIN.
 */
export function describirComando(c: Comando, estado: EstadoClub | null = null): string {
  const nombre = nombreDeQuien(estado, c.persona);
  const firma = nombre ? ` · ${nombre}${c.puesto ? ` (${c.puesto})` : ""}` : c.puesto ? ` · ${c.puesto}` : "";
  const hora = c.ahora && Number.isFinite(c.ahora.min) ? `${hhmm(c.ahora.min)} · ` : "";
  return `${hora}${queHizo(c, estado)}${firma}`;
}
