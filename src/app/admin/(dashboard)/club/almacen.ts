// ============================================================================
// EL ALMACÉN DEL CLUB — el estado del motor, quién lo escucha, el reloj, quién opera y dónde se guarda.
// ============================================================================
//
// El motor del club MUTA su estado (src/lib/club/motor.mjs: cada operación cambia el objeto que
// recibe). Copiarlo entero para cada acción, como pediría un `useReducer` inmutable, cuesta lo que
// pesa una jornada (≈240 KB en la demo) en cada toque. Por eso el estado vive UNA vez acá, fuera de
// React, y lo que cambia es un número de versión:
//
//   · `ejecutar(accion)` corre la operación del motor sobre el estado, deja el aviso (y la foto de antes, para
//     «Deshacer» la última acción), sube la versión y avisa; `aplicar` es lo mismo sin aviso (tests);
//   · cada pantalla se suscribe con `useSyncExternalStore` y SELECCIONA lo suyo (la grilla, la
//     cuenta de un turno), y React sólo la vuelve a pintar si lo seleccionado cambió (ver
//     usar-almacen.ts). Tocar la cuenta de un turno no repinta la agenda si la grilla no cambió.
//   · Lo que NO es el estado del club va por canales aparte, para no despertar a las pantallas: quién opera
//     (`suscribirOperador`) y cómo va el guardado y la jornada (`suscribirGuardado`).
//
// DOS RELOJES (`reloj`):
//   · "demo" (el de siempre, el default): la jornada de ejemplo a las 19:10, quieta. Es lo que abre /admin/club.
//   · "real": la hora de este equipo (`relojReal`, reloj-del-club.ts: la madrugada cuenta en el día que abrió), con
//     un LATIDO cada 15 s (`arrancar`) que sólo avisa si cambió el minuto o el día. Al cambiar de día baja los
//     turnos fijos de la semana nueva (`materializarFijos` a 6 días, como el club vanilla). Una sola pestaña por
//     equipo tiene la jornada (Web Lock `gsg-club:<negocio>:jornada`, el `bp-jornada` del vanilla con el negocio
//     adentro): si otra ya la tiene, ésta queda en SÓLO LECTURA hasta que se toca «Usar acá» (`usarAca`).
//
// GUARDADO (guardado-del-club.ts). El almacén habla con un `GuardadoDelClub` asíncrono y con versión. Por defecto es
// el de este equipo (localStorage, con la clave por negocio y persona: `gsg-club:<negocio>:<usuario>:v1` en la demo,
// por negocio en la jornada real); con otro enchufado (la base, BP-3), el de este equipo queda de ESPEJO. Reglas:
//   · se agrupa (1,5 s después de la primera acción, y cuando el navegador está libre); al salir (`guardarYa`, en
//     `pagehide` / `visibilitychange`) se escribe en el acto. Un guardado asíncrono puede no llegar al cerrar: el
//     espejo se escribe SINCRÓNICO en ese momento;
//   · un guardado a la vez y siempre con el texto de AHORA: lo que se toca mientras uno está en camino sale en el
//     siguiente, así nunca se pierde la última acción;
//   · `conflicto` (otra pantalla guardó una versión más nueva): se avisa y se recarga lo guardado. Nunca se pisa una
//     versión más nueva con una vieja (el guardado lo garantiza con `versionEsperada`);
//   · `error`: se reintenta con espera creciente (1, 2, 4… hasta 30 s), con la cinta en «Sin guardar —
//     reintentando». Si el que falla es el de este equipo (falta lugar), primero se recorta el registro viejo a 60
//     entradas y se vuelve a probar en el acto, como el vanilla (`guardarJornada`, que lo hace SÓLO cuando falla).
//
// PERFORMANCE (docs/producto/PERFORMANCE-TERMINALES.md, ronda 3 y «Ola 0»). Con un estado grande (un mes de jornada,
// ~4 millones de caracteres) copiar el estado entero cuesta ~300 ms en una PC lenta. Hay UN texto del estado por
// versión (`textoDelEstado`):
//   · se arma con `JSON.stringify` directo (~4 veces más barato que copiar y después pasar a texto, y da el MISMO
//     texto que `serializarEstado`: almacen.test.ts lo compara carácter por carácter);
//   · se arma cuando el navegador está libre después de cada acción (`requestIdleCallback`), así la foto de
//     «Deshacer» de la acción siguiente ya está hecha y no se paga en el toque;
//   · lo usan la foto de «Deshacer», el guardado y la copia para las previas (`copia()`, ciclo-core/canchas-core).
// En el toque no se suma nada por el guardado: no se llama al guardado ni se avisa a la cinta (lo «pendiente» no es
// un estado visible; la cinta sólo cambia si falla o vuelve a andar).
//
// La demo es DEL DÍA: si lo guardado es de otro día, arranca una demo nueva (los turnos de ayer no
// le sirven a nadie). «Volver a la demo» la rearma desde cero. La jornada real no es del día: sigue de un día al otro.
//
// Corre sólo en el navegador: el motor guarda su contador de ids a nivel de módulo.

import { VERSION_ESTADO, crearClubReal, generarDemo, hidratarEstado, materializarFijos, secuenciaIds, sumarDias } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha, FotoEstado, Usuario } from "@/lib/club/motor.mjs";
import type { Role } from "@/lib/capabilities";
import { crearGuardadoLocal, esGuardadoLocal, separarVersion, type AlmacenamientoLocal, type GuardadoDelClub, type GuardadoLocal, type MarcaDelEspejo, type ResultadoDelGuardado } from "./guardado-del-club";
import { fechaLocal, mismoAhora, relojReal } from "./reloj-del-club";

export type { AlmacenamientoLocal, GuardadoDelClub, ResultadoDelGuardado } from "./guardado-del-club";

/** Baja los turnos fijos a la semana que muestra la agenda (del día siguiente a 6 días, como el club vanilla). */
function bajarFijos(e: EstadoClub, hoy: Fecha) {
  for (let d = 1; d < 7; d++) materializarFijos(e, sumarDias(hoy, d));
}

/** La demo del día con los turnos fijos ya bajados a la semana que muestra la agenda (como el club vanilla). */
function demoDelDia(hoy: Fecha): EstadoClub {
  const e = generarDemo(hoy, MINUTO_DEMO);
  bajarFijos(e, hoy);
  return e;
}

/** El reloj de la demo: la jornada del club a las 19:10, con turnos en juego y mesas abiertas. */
export const MINUTO_DEMO = 19 * 60 + 10;

/** Cada cuánto late el reloj real (como el vanilla: 15 s). */
export const LATIDO_MS = 15_000;

/** Cuántas entradas del registro quedan si falta lugar para guardar (como el vanilla). */
export const REGISTRO_SI_FALTA_LUGAR = 60;

/** La clave del guardado de la demo en este equipo. Sin negocio o sin persona no hay clave «de todos». */
export function claveDeLaDemo(negocio: string, usuario: string): string {
  if (!negocio.trim() || !usuario.trim()) throw new Error("La demo del club necesita el negocio y la persona para guardar.");
  return `gsg-club:${negocio}:${usuario}:v1`;
}

/**
 * La clave de la jornada real en este equipo: es del NEGOCIO (en la recepción la usan todos los del club, como el
 * `bp-jornada-v1` del vanilla), nunca de todos los negocios.
 */
export function claveDeLaJornada(negocio: string): string {
  if (!negocio.trim()) throw new Error("La jornada del club necesita el negocio para guardar.");
  return `gsg-club:${negocio}:jornada:v1`;
}

/** El Web Lock de la jornada (el `bp-jornada` del vanilla, con el negocio adentro). */
export function candadoDeLaJornada(negocio: string): string {
  if (!negocio.trim()) throw new Error("La jornada del club necesita el negocio.");
  return `gsg-club:${negocio}:jornada`;
}

/** Lo que se guarda: el sobre v1 del motor más el día de la demo y cuándo se guardó. */
export interface FotoDeLaDemo extends FotoEstado {
  hoy: Fecha;
  guardado: number;
}

/** Abre un texto guardado: el estado (si `hidratarEstado` lo acepta) y el día de la demo. Nunca tira. */
function abrirTexto(texto: string): { ok: true; estado: EstadoClub; hoy: Fecha | null } | { ok: false } {
  try {
    const foto = JSON.parse(texto) as Partial<FotoDeLaDemo>;
    const h = hidratarEstado(foto);
    return h.ok ? { ok: true, estado: h.estado, hoy: typeof foto?.hoy === "string" ? foto.hoy : null } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Lo guardado de la demo de HOY, o null (no hay, es de otro día, o no se pudo leer). Nunca tira. */
export function leerDemo(almacenamiento: AlmacenamientoLocal | null, clave: string, hoy: Fecha): EstadoClub | null {
  if (!almacenamiento) return null;
  let crudo: string | null;
  try {
    crudo = almacenamiento.getItem(clave);
  } catch {
    return null;
  }
  if (!crudo) return null;
  const f = abrirTexto(separarVersion(crudo).texto);
  return f.ok && f.hoy === hoy ? f.estado : null;
}

/**
 * El estado como texto: el sobre v1 del motor (`{ v, estado, secuencia }`, lo mismo que `JSON.stringify` de
 * `serializarEstado`) sin copiarlo antes. Puede tirar si el estado no es JSON (no pasa: se guarda así).
 */
export function textoDelEstado(estado: EstadoClub): string {
  return JSON.stringify({ v: VERSION_ESTADO, estado, secuencia: secuenciaIds() });
}

/** Lo que se guarda, a partir del texto del estado: el mismo sobre con el día de la demo y cuándo se guardó. */
export function textoDeLaDemo(textoEstado: string, hoy: Fecha, ahoraMs: number): string {
  // `{ ...foto, hoy, guardado }` pasado a texto es la foto con dos claves más al final: se agregan sin volver a
  // recorrer el estado.
  return `${textoEstado.slice(0, -1)},"hoy":${JSON.stringify(hoy)},"guardado":${JSON.stringify(ahoraMs)}}`;
}

/** El rol del ERP de quien mira (la sesión ya lo autenticó). */
export type RolDelPanel = Role;

/** Quién opera el motor: el usuario del club y lo que el motor le pide para lo sensible (su PIN). */
export interface Operador {
  usuario: Usuario;
  auth: Auth;
}

/**
 * Quién opera el motor en la demo. En el ERP la identidad la da el LOGIN, no el PIN de 2 dígitos del piloto (que
 * no se porta: FORMATO-RESPALDO.md). Pero el motor pide un usuario del club (y su PIN para lo sensible: egreso,
 * cierre de caja), así que la demo opera con el usuario de ejemplo de ese rol: un dueño para OWNER y recepción
 * para el resto. Es SÓLO de la demo: en la jornada real nadie opera hasta que el bloqueo/PIN de la sesión del club
 * llama a `cambiarOperador`.
 */
export function operadorDeLaDemo(estado: EstadoClub, rol: RolDelPanel): Operador | null {
  const buscado = rol === "OWNER" ? "duenio" : "recepcion";
  const u = estado.usuarios.find((x) => x.activo !== false && x.rol === buscado && x.pin) ?? null;
  return u ? { usuario: u, auth: { usuarioId: u.id, pin: u.pin } } : null;
}

/** Cuánto dura «Deshacer» (como el aviso del club vanilla: 6 s). */
export const DESHACER_MS = 6000;

/**
 * ¿Todavía se puede deshacer? Sólo dentro de los 6 s del aviso: después, lo hecho queda (un cobro de hace 20 minutos
 * no puede desaparecer de la caja con un toque). Además se olvida al cerrar la cuenta o cambiar de solapa
 * (`olvidarDeshacer`). Pura: el reloj se inyecta.
 */
export function deshacerVigente(desdeMs: number | null, ahoraMs: number): boolean {
  return desdeMs !== null && ahoraMs >= desdeMs && ahoraMs - desdeMs < DESHACER_MS;
}

/** Espera antes del reintento n (1, 2, 4, 8, 16 y después 30 s). */
export function esperaDelReintento(intento: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, intento - 1));
}

/** Lo que pasó con la última acción: el aviso, y si se puede deshacer. */
export interface AvisoDelClub {
  /** Sube con cada aviso (para que el lector de pantalla lo vuelva a anunciar aunque el texto se repita). */
  id: number;
  ok: boolean;
  mensaje: string;
  deshacer: boolean;
}

/** Lo que devuelve una acción de la pantalla (cuenta-core, buffet-core, caja-core…). */
export interface Desenlace {
  ok: boolean;
  mensaje: string;
}

/**
 * La jornada en esta pestaña:
 *   · "demo": la demo (siempre se puede operar);
 *   · "abriendo": la jornada real se está abriendo (candado + lo guardado): todavía sólo se mira;
 *   · "propia": esta pestaña tiene la jornada;
 *   · "sin-bloqueo": el navegador no tiene Web Locks: se opera igual, avisando que se use una sola pestaña;
 *   · "otra-pestania": otra pestaña de este equipo tiene la jornada: SÓLO LECTURA hasta «Usar acá»;
 *   · "ilegible": lo guardado no se pudo leer ni apartar: SÓLO LECTURA, para no pisarlo.
 */
export type JornadaDelClub = "demo" | "abriendo" | "propia" | "sin-bloqueo" | "otra-pestania" | "ilegible";

/** Cómo va el guardado y la jornada (un objeto nuevo sólo cuando algo cambia: sirve de snapshot). */
export interface EstadoDelGuardado {
  jornada: JornadaDelClub;
  /** "guardado": anda · "reintentando": falló y se reintenta · "sin-almacenamiento": no hay dónde guardar. */
  guardado: "guardado" | "reintentando" | "sin-almacenamiento";
  /** ¿El guardado es el de este equipo? (si no, este equipo es el espejo). */
  enEsteEquipo: boolean;
}

/** Los Web Locks del navegador (lo que se usa de `navigator.locks`; se reemplaza en los tests). */
export interface CerrojosDelNavegador {
  request(nombre: string, opciones: { ifAvailable?: boolean; steal?: boolean }, alTomar: (lock: unknown) => unknown): Promise<unknown>;
}

/** Temporizadores (se reemplazan en los tests). Cada uno devuelve con qué cancelarlo. */
export interface Temporizador {
  despues(fn: () => void, ms: number): () => void;
  cada(fn: () => void, ms: number): () => void;
}

export interface Almacen {
  /** El estado vivo. Se LEE para armar vistas; se cambia sólo con `aplicar`/`ejecutar`. */
  estado(): EstadoClub;
  /** El momento del club: fijo en la demo; en la jornada real lo mueve el latido (un objeto nuevo por minuto). */
  ahora(): Ahora;
  version(): number;
  suscribir(alCambiar: () => void): () => void;
  /** "demo" o "real" (el reloj con el que se armó). */
  modo(): "demo" | "real";
  /**
   * Prende lo que corre solo (el latido; en la jornada real, tomar la jornada y abrir lo guardado). Se llama en un
   * efecto; devuelve con qué apagarlo (escribe lo pendiente). Llamarlo dos veces seguidas (StrictMode) no pide
   * otro candado.
   */
  arrancar(): () => void;
  /** Un latido ya (al volver a la pestaña). En la demo no hace nada. */
  latir(): void;
  /** Corre una operación del motor sobre el estado y avisa a los suscriptos. En sólo lectura, tira. */
  aplicar<R>(accion: (estado: EstadoClub, ahora: Ahora) => R): R;
  /** Tira lo tocado y arma la demo de cero (en la jornada real no: dice que no). */
  volverALaDemo(): void;
  /** Escribe ya lo pendiente (al salir de la página). Sincrónico en este equipo. */
  guardarYa(): void;
  /** ¿Hay algo hecho que todavía no se guardó? (no avisa: no es un estado visible). */
  pendienteDeGuardar(): boolean;
  estadoDelGuardado(): EstadoDelGuardado;
  suscribirGuardado(alCambiar: () => void): () => void;
  /** ¿Se puede operar? No en «abriendo», «otra-pestania» ni «ilegible». */
  soloLectura(): boolean;
  /** Otra pestaña tiene la jornada: la toma esta (la otra queda sólo para mirar) y abre lo último guardado. */
  usarAca(): void;
  /**
   * Una copia del estado para simular sin tocarlo (las previas de cancelar, la falta, la lluvia): sale del texto
   * del estado de esta versión (`JSON.parse`), que suele estar ya armado. Cada llamada da una copia nueva.
   */
  copia(): EstadoClub;
  /**
   * Una simulación sobre una copia (`copia()`), guardada por `clave` hasta el próximo cambio del estado o del reloj:
   * las previas se calculan una vez por estado y por opción, no en cada render (copiar un estado grande cuesta).
   */
  simular<T>(clave: string, fn: (copia: EstadoClub) => T): T;
  /** ¿Lo que se ve viene de lo guardado en este equipo (y no de una demo recién armada)? */
  retomada(): boolean;
  /** Quién opera (null: nadie todavía, p. ej. la jornada real antes del PIN). El mismo objeto mientras no cambie. */
  operador(): Operador | null;
  /** Cambia quién opera (lo llama el bloqueo/PIN de la sesión del club). null = nadie. Apaga «Deshacer». */
  cambiarOperador(usuario: Usuario | null, auth?: Auth): void;
  /** Avisa sólo cuando cambia quién opera: no despierta a las pantallas del estado (la agenda no se repinta). */
  suscribirOperador(alCambiar: () => void): () => void;
  /** Lo que el motor recibe como `auth` en cada acción: el del operador ({} si no hay). */
  auth(): Auth;
  /** El rol del ERP de quien mira (algunas decisiones son de un dueño: perdonar una falta). */
  rol(): RolDelPanel;
  /**
   * Corre una acción de la pantalla, deja el aviso y, si salió bien y es `deshacible`, guarda la foto de antes para
   * «Deshacer» (sólo la ÚLTIMA acción, como el club vanilla con PREVIO/UNDO). En sólo lectura no corre: lo dice.
   */
  ejecutar(accion: (estado: EstadoClub, ahora: Ahora, auth: Auth) => Desenlace, opciones?: { deshacible?: boolean }): Desenlace;
  /** Deja un aviso sin tocar el estado (un control previo de la pantalla que dijo que no). No anula «Deshacer». */
  informar(d: Desenlace): void;
  /** Vuelve el estado a como estaba antes de la última acción deshacible (si no venció: `deshacerVigente`). */
  deshacer(): void;
  /** ¿Hay algo para deshacer todavía? */
  puedeDeshacer(): boolean;
  /** Se cerró la cuenta o se cambió de solapa: lo hecho queda. */
  olvidarDeshacer(): void;
  aviso(): AvisoDelClub | null;
}

export interface OpcionesAlmacen {
  /** "demo" (default: la jornada de ejemplo a las 19:10) o "real" (la hora de este equipo, con latido y candado). */
  reloj?: "demo" | "real";
  /** El día de la demo (default: hoy en este equipo). En la jornada real lo da el reloj. */
  hoy?: Fecha;
  /** La clave en este equipo: `claveDeLaDemo` o `claveDeLaJornada`. */
  clave: string;
  /** localStorage (default: el del navegador, si deja). null = no hay (incógnito, tests): la demo vive en memoria. */
  almacenamiento?: AlmacenamientoLocal | null;
  /** Dónde se guarda (default: este equipo). Con otro, este equipo queda de espejo. */
  guardado?: GuardadoDelClub;
  /** El Web Lock de la jornada real (`candadoDeLaJornada`). Sin él, la jornada real no se bloquea. */
  candado?: string | null;
  /** `navigator.locks` (default: el del navegador, si hay). null = no hay. */
  cerrojos?: CerrojosDelNavegador | null;
  /** El rol del ERP de quien mira: decide con qué usuario del club opera la demo. */
  rol?: RolDelPanel;
  /** Cuánto se espera para agrupar el guardado (después, se escribe cuando el navegador está libre). 0 = guardar en el acto. */
  demoraGuardadoMs?: number;
  /** Para correr algo cuando el navegador está libre (`requestIdleCallback`); sin él, no se adelanta nada. */
  enReposo?: ((fn: () => void) => void) | null;
  /** La hora de este equipo, en ms (default `Date.now`): el reloj real, «Deshacer» y el sello del guardado. */
  relojMs?: () => number;
  /** Para vencer «Deshacer» a los 6 s (se reemplaza en los tests). */
  programar?: (fn: () => void, ms: number) => unknown;
  /** El latido y los reintentos del guardado (se reemplaza en los tests). */
  temporizador?: Temporizador;
  latidoMs?: number;
}

/** setTimeout que no retiene el proceso (en Node, para los tests); en el navegador es el de siempre. */
function programarSinRetener(fn: () => void, ms: number): unknown {
  const t = setTimeout(fn, ms) as unknown as { unref?: () => void };
  t.unref?.();
  return t;
}

const TEMPORIZADOR: Temporizador = {
  despues(fn, ms) {
    const t = programarSinRetener(fn, ms) as ReturnType<typeof setTimeout>;
    return () => clearTimeout(t);
  },
  cada(fn, ms) {
    const t = setInterval(fn, ms) as unknown as { unref?: () => void };
    t.unref?.();
    return () => clearInterval(t as unknown as ReturnType<typeof setInterval>);
  },
};

/** `requestIdleCallback` del navegador (con un tope de espera), o null (Node, Safari viejo). */
function reposoDelNavegador(): ((fn: () => void) => void) | null {
  const w = typeof window !== "undefined" ? (window as Window & { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }) : null;
  return w?.requestIdleCallback ? (fn) => void w.requestIdleCallback!(fn, { timeout: 1000 }) : null;
}

/** localStorage si el navegador lo deja (en incógnito o sin lugar puede tirar). */
function almacenamientoDelNavegador(): AlmacenamientoLocal | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** `navigator.locks` si el navegador lo tiene (Safari < 15.4 y navegadores viejos no). */
function cerrojosDelNavegador(): CerrojosDelNavegador | null {
  const n = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: CerrojosDelNavegador }) : null;
  return n?.locks && typeof n.locks.request === "function" ? n.locks : null;
}

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

const MENSAJE_SOLO_LECTURA: Record<"abriendo" | "otra-pestania" | "ilegible", string> = {
  abriendo: "Un momento: se está abriendo la jornada.",
  "otra-pestania": "Esta pestaña es sólo para mirar: la jornada está abierta en otra. Tocá «Usar acá» para seguir en esta.",
  ilegible: "No se guarda nada: lo guardado en este equipo no se pudo leer. Avisá a soporte antes de seguir.",
};

export function crearAlmacen(opciones: OpcionesAlmacen): Almacen {
  const {
    reloj = "demo",
    clave,
    demoraGuardadoMs = 1500,
    relojMs = Date.now,
    programar = programarSinRetener,
    rol = "RECEPTION",
    enReposo = reposoDelNavegador(),
    temporizador = TEMPORIZADOR,
    latidoMs = LATIDO_MS,
    candado = null,
  } = opciones;
  const real = reloj === "real";
  const cerrojos = opciones.cerrojos === undefined ? cerrojosDelNavegador() : opciones.cerrojos;
  const almacenamiento = opciones.almacenamiento === undefined ? almacenamientoDelNavegador() : opciones.almacenamiento;
  // El de este equipo: el que vino (si es local) o uno sobre localStorage. Es el guardado (default) o su espejo.
  const espejo: GuardadoLocal | null = esGuardadoLocal(opciones.guardado) ? opciones.guardado : almacenamiento ? crearGuardadoLocal(almacenamiento, clave) : null;
  const guardado: GuardadoDelClub | null = opciones.guardado ?? espejo;
  const primarioLocal = guardado !== null && guardado === espejo;

  // ── lo que se abre al crear (sincrónico: lo de este equipo) ──
  const hoyDemo = opciones.hoy ?? fechaLocal(new Date(relojMs()));
  const inicial = espejo?.leerYa() ?? null;
  const abierto = inicial ? abrirTexto(inicial.texto) : null;
  let estado: EstadoClub;
  let retomo = false;
  let avisoInicial: string | null = null;
  let ilegible = false;
  // La versión de lo guardado de la que viene lo que se ve (la confirmó el guardado, o se leyó).
  let versionGuardada = inicial?.version ?? 0;
  // Lo que quedó en el espejo sin confirmar por el otro guardado (sólo con un guardado que no es el de este equipo).
  let marcaEspejo: (MarcaDelEspejo & { cambios: number }) | null = null;
  let sucioAlAbrir = false;
  if (real) {
    if (abierto?.ok) {
      estado = abierto.estado;
      retomo = true;
    } else {
      if (inicial) {
        // Como el vanilla: lo que no se pudo leer se aparta (no se borra) y se arranca en blanco. Si ni eso se puede,
        // no se guarda nada: arrancar en blanco y guardar pisaría la jornada.
        ilegible = !espejo!.apartar(inicial.texto, relojMs());
        avisoInicial = ilegible
          ? "Lo guardado en este equipo no se pudo leer y no hay lugar para apartarlo: no se guarda nada para no pisarlo. Avisá a soporte."
          : "Lo guardado en este equipo no se pudo leer: arrancó en blanco (lo guardado quedó apartado en este equipo, no se borró).";
      }
      estado = crearClubReal(fechaLocal(new Date(relojMs())));
      sucioAlAbrir = true;
    }
  } else if (abierto?.ok && abierto.hoy === hoyDemo) {
    estado = abierto.estado;
    retomo = true;
  } else {
    estado = demoDelDia(hoyDemo);
  }
  let ahora: Ahora = real ? relojReal(estado, new Date(relojMs())) : { fecha: hoyDemo, min: MINUTO_DEMO };
  if (real) {
    const antes = estado.reservas.length;
    bajarFijos(estado, ahora.fecha);
    if (estado.reservas.length !== antes) sucioAlAbrir = true;
  }
  if (!primarioLocal && espejo && inicial) {
    const m = espejo.marca();
    if (m) {
      marcaEspejo = { ...m, cambios: 0 };
      sucioAlAbrir = true;
    }
  }

  let version = 0;
  const oyentes = new Set<() => void>();
  const oyentesOperador = new Set<() => void>();
  const oyentesGuardado = new Set<() => void>();
  let pendiente: ReturnType<typeof setTimeout> | null = null;
  // El texto del estado, armado a lo sumo una vez por cambio (`cambios` sube sólo si el estado pudo cambiar).
  let cambios = 0;
  // El `cambios` del último texto que el guardado confirmó (-1: lo de ahora todavía no se guardó nunca).
  let cambiosGuardados = sucioAlAbrir ? -1 : 0;
  let enVuelo: { esperada: number } | null = null;
  // Se está trayendo lo guardado por un conflicto: no se escribe (lo de acá se va a reemplazar).
  let recargando = false;
  let otraVez = false;
  let cancelarReintento: (() => void) | null = null;
  let intentos = 0;
  let texto: { cambios: number; valor: string } | null = null;
  let simulaciones: { cambios: number; ahora: Ahora; valores: Map<string, unknown> } = { cambios: -1, ahora, valores: new Map() };
  let meta: EstadoDelGuardado = {
    jornada: real ? (ilegible ? "ilegible" : "abriendo") : "demo",
    guardado: guardado ? "guardado" : "sin-almacenamiento",
    enEsteEquipo: primarioLocal || guardado === null,
  };

  const textoActual = (): string => {
    if (texto?.cambios !== cambios) texto = { cambios, valor: textoDelEstado(estado) };
    return texto.valor;
  };
  const textoParaGuardar = () => textoDeLaDemo(textoActual(), real ? ahora.fecha : hoyDemo, relojMs());
  // Después de cada cambio, el texto nuevo se arma cuando el navegador está libre (si no, a demanda).
  const adelantarTexto = () => {
    const pedido = cambios;
    enReposo?.(() => {
      if (pedido !== cambios) return;
      try {
        textoActual();
      } catch {
        // si no se pudo, se arma a demanda (y ahí se avisa)
      }
    });
  };

  // El texto del estado recién abierto también se adelanta: la primera acción deshacible no lo arma en el toque.
  adelantarTexto();

  const avisar = () => {
    version++;
    for (const o of oyentes) o();
  };
  const ponerMeta = (cambio: Partial<EstadoDelGuardado>) => {
    const nuevo = { ...meta, ...cambio };
    if (nuevo.jornada === meta.jornada && nuevo.guardado === meta.guardado) return;
    meta = nuevo;
    for (const o of oyentesGuardado) o();
  };
  const puedeOperar = () => meta.jornada === "demo" || meta.jornada === "propia" || meta.jornada === "sin-bloqueo";

  // ── guardado ──
  /** Falta lugar en este equipo: se recorta el registro viejo (como el vanilla). true si había algo que recortar. */
  const recortarRegistro = (): boolean => {
    if (estado.log.length <= REGISTRO_SI_FALTA_LUGAR) return false;
    estado.log.length = REGISTRO_SI_FALTA_LUGAR;
    cambios++;
    return true;
  };
  const alResultado = (r: ResultadoDelGuardado, c: number) => {
    if (r.ok) {
      versionGuardada = Math.max(versionGuardada, r.version);
      cambiosGuardados = Math.max(cambiosGuardados, c);
      intentos = 0;
      cancelarReintento?.();
      cancelarReintento = null;
      // Lo del espejo ya está allá (si lo confirmado incluye lo que se espejó).
      if (marcaEspejo && c >= marcaEspejo.cambios) {
        espejo?.alDia();
        marcaEspejo = null;
      }
      ponerMeta({ guardado: "guardado" });
      return;
    }
    if (r.motivo === "conflicto") {
      void sincronizar("conflicto");
      return;
    }
    intentos++;
    ponerMeta({ guardado: "reintentando" });
    espejarSiHaceFalta();
    cancelarReintento?.();
    cancelarReintento = temporizador.despues(() => {
      cancelarReintento = null;
      escribir();
    }, esperaDelReintento(intentos));
  };
  /** Con un guardado que no es el de este equipo: deja la copia sincrónica de lo que falta confirmar. */
  const espejarSiHaceFalta = () => {
    if (primarioLocal || !espejo || cambiosGuardados === cambios) return;
    const marca = { base: versionGuardada, hasta: enVuelo ? enVuelo.esperada + 1 : versionGuardada };
    let t: string;
    try {
      t = textoParaGuardar();
    } catch {
      return;
    }
    let ok = espejo.espejar(t, marca);
    if (!ok && recortarRegistro()) {
      try {
        ok = espejo.espejar(textoParaGuardar(), marca);
      } catch {
        ok = false;
      }
    }
    if (ok) marcaEspejo = { ...marca, cambios };
  };
  const escribirLocal = (local: GuardadoLocal) => {
    let c = cambios;
    let r: ResultadoDelGuardado;
    try {
      r = local.guardarYa(textoParaGuardar(), versionGuardada);
      if (!r.ok && r.motivo === "error" && recortarRegistro()) {
        c = cambios;
        r = local.guardarYa(textoParaGuardar(), versionGuardada);
      }
    } catch {
      r = { ok: false, motivo: "error" };
    }
    alResultado(r, c);
  };
  const escribir = () => {
    pendiente = null;
    // Sin dónde guardar (incógnito), en sólo lectura o sin nada nuevo: ni se arma el texto.
    if (!guardado || !puedeOperar() || recargando || cambiosGuardados === cambios) return;
    if (primarioLocal) return escribirLocal(espejo!);
    // Un guardado a la vez: lo que se tocó mientras tanto sale en el siguiente, con el texto de ese momento.
    if (enVuelo) {
      otraVez = true;
      return;
    }
    let t: string;
    try {
      t = textoParaGuardar();
    } catch {
      return;
    }
    const c = cambios;
    const esperada = versionGuardada;
    enVuelo = { esperada };
    let promesa: Promise<ResultadoDelGuardado>;
    try {
      promesa = guardado.guardar(t, esperada);
    } catch {
      promesa = Promise.resolve({ ok: false, motivo: "error" });
    }
    void promesa
      .catch((): ResultadoDelGuardado => ({ ok: false, motivo: "error" }))
      .then((r) => {
        enVuelo = null;
        alResultado(r, c);
        const seguir = otraVez;
        otraVez = false;
        if (r.ok && cambiosGuardados !== cambios) {
          if (seguir) escribir();
          else programarGuardado();
        }
      });
  };
  const programarGuardado = () => {
    if (!guardado) return;
    // Si se está reintentando, el reintento ya lleva lo último.
    if (cancelarReintento !== null) return;
    if (demoraGuardadoMs <= 0) return escribir();
    if (pendiente !== null) return;
    // Se agrupa: un rato después de la primera acción, y cuando el navegador está libre (la escritura de un
    // estado grande es una tarea larga: que no le gane a un toque). Al salir se escribe en el acto (`guardarYa`).
    const marca: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (pendiente !== marca) return;
      if (enReposo) enReposo(() => pendiente === marca && escribir());
      else escribir();
    }, demoraGuardadoMs);
    pendiente = marca;
  };
  /** El estado pudo cambiar: el texto armado ya no vale; se avisa, se guarda y se adelanta el texto nuevo. */
  const cambio = () => {
    cambios++;
    avisar();
    programarGuardado();
    adelantarTexto();
  };

  let aviso: AvisoDelClub | null = avisoInicial ? { id: 1, ok: false, mensaje: avisoInicial, deshacer: false } : null;
  /** La foto de antes de la última acción deshacible: el texto del estado (ver `textoActual`). */
  let fotoPrevia: string | null = null;
  let fotoDesde: number | null = null;
  let mensajePrevio = "";
  let idAviso = aviso ? 1 : 0;
  /** Suelta la foto de «Deshacer» y apaga el botón del aviso. */
  const soltarFoto = () => {
    const habia = fotoPrevia !== null;
    fotoPrevia = null;
    fotoDesde = null;
    if (habia && aviso?.deshacer) {
      aviso = { ...aviso, deshacer: false };
      avisar();
    }
  };

  /** Lo que se ve pasa a ser `nuevo` (lo guardado allá): sin «Deshacer», con el reloj y los fijos al día. */
  const reemplazar = (nuevo: EstadoClub) => {
    estado = nuevo;
    fotoPrevia = null;
    fotoDesde = null;
    if (real) {
      ahora = relojReal(estado, new Date(relojMs()));
      bajarFijos(estado, ahora.fecha);
    }
  };

  /**
   * Trae lo guardado allá y decide quién gana (al abrir, al tomar la jornada con «Usar acá» y ante un conflicto):
   * misma versión → lo de acá; el espejo con algo sin confirmar que viene de esa versión → lo de acá (es más nuevo);
   * si no, lo de allá (y si acá había algo sin guardar, se avisa).
   */
  const sincronizar = async (motivo: "abrir" | "usarAca" | "conflicto"): Promise<void> => {
    if (!guardado) return;
    let r: { texto: string; version: number } | null;
    if (motivo === "conflicto") recargando = true;
    try {
      r = primarioLocal ? espejo!.leerYa() : await guardado.leer();
    } catch {
      recargando = false;
      // No se pudo leer: se sigue con lo de acá; el guardado lo reintenta (y si había algo más nuevo, dirá conflicto).
      intentos++;
      ponerMeta({ guardado: "reintentando" });
      cancelarReintento?.();
      cancelarReintento = temporizador.despues(() => {
        cancelarReintento = null;
        if (motivo === "conflicto") void sincronizar("conflicto");
        else escribir();
      }, esperaDelReintento(intentos));
      return;
    }
    recargando = false;
    const sinGuardar = cambiosGuardados !== cambios;
    if (!r) {
      // Allá no hay nada: lo de acá se guarda (la jornada en blanco, o lo del espejo).
      versionGuardada = 0;
      if (real && cambiosGuardados === cambios) cambiosGuardados = -1;
      programarGuardado();
      return;
    }
    if (motivo !== "conflicto" && r.version === versionGuardada) {
      if (sinGuardar) programarGuardado();
      return;
    }
    if (motivo !== "conflicto" && marcaEspejo && r.version >= marcaEspejo.base && r.version <= marcaEspejo.hasta) {
      versionGuardada = r.version;
      cambiosGuardados = -1;
      programarGuardado();
      return;
    }
    const abiertoAlla = abrirTexto(r.texto);
    versionGuardada = r.version;
    const perdido = motivo === "conflicto" || (marcaEspejo !== null && sinGuardar);
    marcaEspejo = null;
    if (!primarioLocal) espejo?.alDia();
    if (!abiertoAlla.ok) {
      // Lo de allá no se puede leer: se aparta en este equipo y se sigue con lo de acá (se guarda encima).
      if (real) {
        const apartado = espejo?.apartar(r.texto, relojMs()) ?? false;
        if (!apartado) ponerMeta({ jornada: "ilegible" });
      }
      cambiosGuardados = -1;
      programarGuardado();
      return;
    }
    if (!real && abiertoAlla.hoy !== hoyDemo) {
      // La demo de otro día no sirve: sigue la de hoy, que se guarda encima.
      if (motivo === "conflicto") cambiosGuardados = -1;
      programarGuardado();
      return;
    }
    reemplazar(abiertoAlla.estado);
    retomo = true;
    cambios++;
    cambiosGuardados = cambios;
    if (perdido) {
      aviso = {
        id: ++idAviso,
        ok: false,
        mensaje: "Otra pantalla guardó cambios más nuevos: se cargó lo último guardado. Revisá lo último que hiciste.",
        deshacer: false,
      };
    }
    // Si al bajar los fijos cambió algo, se guarda.
    avisar();
    adelantarTexto();
    intentos = 0;
    ponerMeta({ guardado: "guardado" });
  };

  // ── el candado de la jornada (Web Locks) ──
  let activo = false;
  let pararLatido: (() => void) | null = null;
  let candadoPedido = false;
  let soltarCandado: (() => void) | null = null;
  let cancelarSoltar: (() => void) | null = null;
  const abrirSinBloqueo = () => {
    void sincronizar("abrir").finally(() => {
      if (meta.jornada === "abriendo") ponerMeta({ jornada: "sin-bloqueo" });
    });
  };
  const tomarJornada = (robar: boolean) => {
    if (!candado || !cerrojos) return abrirSinBloqueo();
    candadoPedido = true;
    let obtuvo = false;
    let pedido: Promise<unknown>;
    try {
      pedido = cerrojos.request(candado, robar ? { steal: true } : { ifAvailable: true }, (lock) => {
        if (!lock) {
          candadoPedido = false;
          ponerMeta({ jornada: "otra-pestania" });
          return null;
        }
        if (!activo) {
          // Llegó cuando la pantalla ya se había ido: se suelta en el acto.
          candadoPedido = false;
          return null;
        }
        obtuvo = true;
        // El candado queda tomado mientras esta pestaña lo tenga (hasta `soltarCandado` o que otra lo robe).
        return new Promise<void>((liberar) => {
          soltarCandado = () => {
            soltarCandado = null;
            candadoPedido = false;
            liberar();
          };
          void sincronizar(robar ? "usarAca" : "abrir").finally(() => {
            if (soltarCandado) ponerMeta({ jornada: "propia" });
          });
        });
      });
    } catch (e) {
      pedido = Promise.reject(e);
    }
    pedido.catch(() => {
      if (obtuvo) {
        // Otra pestaña tocó «Usar acá»: ésta queda sólo para mirar y no escribe más.
        if (soltarCandado) {
          soltarCandado = null;
          candadoPedido = false;
          if (pendiente !== null) clearTimeout(pendiente);
          pendiente = null;
          ponerMeta({ jornada: "otra-pestania" });
        }
        return;
      }
      // El navegador no deja usar el candado (p. ej. fuera de https): se sigue sin bloqueo, como el vanilla.
      candadoPedido = false;
      abrirSinBloqueo();
    });
  };

  // ── el latido (reloj real) ──
  const latir = () => {
    if (!real) return;
    const t = relojReal(estado, new Date(relojMs()));
    if (mismoAhora(t, ahora)) return;
    const diaViejo = ahora.fecha;
    ahora = t;
    if (t.fecha === diaViejo) return avisar();
    // Cambió el día: la agenda pasa al nuevo y se bajan los fijos de la semana que viene (si esta pestaña opera).
    aviso = { id: ++idAviso, ok: true, mensaje: `Cambió el día: la agenda pasó al ${ddmm(t.fecha)}.`, deshacer: fotoPrevia !== null && deshacerVigente(fotoDesde, relojMs()) };
    if (puedeOperar()) {
      const antes = estado.reservas.length;
      bajarFijos(estado, t.fecha);
      if (estado.reservas.length !== antes) return cambio();
    }
    avisar();
  };

  // ── quién opera ──
  let operadorElegido: Operador | null | undefined;
  let operadorDemo: { estado: EstadoClub; valor: Operador | null } | null = null;
  const operadorActual = (): Operador | null => {
    if (operadorElegido !== undefined) return operadorElegido;
    if (real) return null;
    if (operadorDemo?.estado !== estado) {
      const nuevo = operadorDeLaDemo(estado, rol);
      const previo = operadorDemo?.valor ?? null;
      // Mismo usuario (p. ej. después de «Deshacer»): el mismo objeto, así nadie se repinta.
      const igual = previo !== null && nuevo !== null && previo.usuario.id === nuevo.usuario.id && previo.auth.pin === nuevo.auth.pin;
      operadorDemo = { estado, valor: igual ? previo : nuevo };
    }
    return operadorDemo.valor;
  };

  const guardarYa = () => {
    if (pendiente !== null) clearTimeout(pendiente);
    pendiente = null;
    if (!guardado || !puedeOperar() || recargando || cambiosGuardados === cambios) return;
    if (primarioLocal) return escribirLocal(espejo!);
    // Con otro guardado: se lanza (puede no llegar si la página se cierra) y la copia de este equipo se escribe ya.
    escribir();
    espejarSiHaceFalta();
  };

  const negarSoloLectura = (): Desenlace => {
    const mensaje = MENSAJE_SOLO_LECTURA[meta.jornada as keyof typeof MENSAJE_SOLO_LECTURA] ?? MENSAJE_SOLO_LECTURA.abriendo;
    aviso = { id: ++idAviso, ok: false, mensaje, deshacer: false };
    avisar();
    return { ok: false, mensaje };
  };

  return {
    estado: () => estado,
    ahora: () => ahora,
    version: () => version,
    modo: () => (real ? "real" : "demo"),
    retomada: () => retomo,
    suscribir(alCambiar) {
      oyentes.add(alCambiar);
      return () => {
        oyentes.delete(alCambiar);
      };
    },
    arrancar() {
      cancelarSoltar?.();
      cancelarSoltar = null;
      const detener = () => {
        if (!activo) return;
        activo = false;
        pararLatido?.();
        pararLatido = null;
        guardarYa();
        // El candado se suelta un instante después: si React vuelve a montar enseguida (StrictMode), se reusa.
        cancelarSoltar = temporizador.despues(() => {
          cancelarSoltar = null;
          if (activo || !soltarCandado) return;
          soltarCandado();
          // Sin candado ya no es «propia»: si se vuelve a arrancar, se pide de nuevo.
          ponerMeta({ jornada: "abriendo" });
        }, 0);
      };
      if (activo) return detener;
      activo = true;
      if (real) {
        pararLatido = temporizador.cada(latir, latidoMs);
        latir();
        if (!candadoPedido && meta.jornada === "abriendo") tomarJornada(false);
      } else if (guardado && !primarioLocal) {
        void sincronizar("abrir");
      }
      return detener;
    },
    latir,
    aplicar(accion) {
      if (!puedeOperar()) {
        negarSoloLectura();
        throw new Error(MENSAJE_SOLO_LECTURA[meta.jornada as keyof typeof MENSAJE_SOLO_LECTURA] ?? "Sólo lectura.");
      }
      // Aunque el motor diga que no, puede haber cambiado algo antes (cobrar todo cobra de a una
      // parte y avisa si quedó un resto): se avisa siempre y las vistas deciden si cambiaron.
      try {
        return accion(estado, ahora);
      } finally {
        cambio();
      }
    },
    operador: operadorActual,
    cambiarOperador(usuario, auth) {
      const nuevo: Operador | null = usuario ? { usuario, auth: auth ?? { usuarioId: usuario.id } } : null;
      const previo = operadorActual();
      const mismo =
        previo === null ? nuevo === null : nuevo !== null && previo.usuario.id === nuevo.usuario.id && previo.auth.usuarioId === nuevo.auth.usuarioId && previo.auth.pin === nuevo.auth.pin;
      // El mismo operador: el mismo objeto y nadie se entera.
      operadorElegido = mismo ? previo : nuevo;
      if (mismo) return;
      // Lo que hizo el anterior no lo deshace el que entra.
      soltarFoto();
      for (const o of oyentesOperador) o();
    },
    suscribirOperador(alCambiar) {
      oyentesOperador.add(alCambiar);
      return () => {
        oyentesOperador.delete(alCambiar);
      };
    },
    auth: () => operadorActual()?.auth ?? {},
    rol: () => rol,
    aviso: () => aviso,
    estadoDelGuardado: () => meta,
    suscribirGuardado(alCambiar) {
      oyentesGuardado.add(alCambiar);
      return () => {
        oyentesGuardado.delete(alCambiar);
      };
    },
    pendienteDeGuardar: () => guardado !== null && cambiosGuardados !== cambios,
    soloLectura: () => !puedeOperar(),
    usarAca() {
      if (meta.jornada !== "otra-pestania") return;
      ponerMeta({ jornada: "abriendo" });
      tomarJornada(true);
    },
    ejecutar(accion, { deshacible = false } = {}) {
      if (!puedeOperar()) return negarSoloLectura();
      // La foto de antes: casi siempre ya está armada (se adelanta en reposo después de cada cambio).
      let foto: string | null = null;
      if (deshacible) {
        try {
          foto = textoActual();
        } catch {
          foto = null;
        }
      }
      let d: Desenlace;
      try {
        d = accion(estado, ahora, operadorActual()?.auth ?? {});
      } catch {
        // El motor no tira por una regla; si algo tiró igual, no se rompe la pantalla.
        d = { ok: false, mensaje: "No se pudo hacer. Probá de nuevo." };
      }
      // Sólo se deshace la ÚLTIMA acción. Si ésta no se puede deshacer, o falló (el motor puede haber cobrado una
      // parte antes de decir que no), lo de antes ya no se deshace: volver a una foto vieja pisaría lo que pasó.
      fotoPrevia = d.ok && foto ? foto : null;
      fotoDesde = fotoPrevia ? relojMs() : null;
      if (fotoPrevia) {
        mensajePrevio = d.mensaje;
        const esta = fotoPrevia;
        // A los 6 s se apaga solo (si nadie hizo otra cosa antes).
        programar(() => {
          if (fotoPrevia === esta) soltarFoto();
        }, DESHACER_MS);
      }
      aviso = { id: ++idAviso, ok: d.ok, mensaje: d.mensaje, deshacer: d.ok && fotoPrevia !== null };
      cambio();
      return d;
    },
    informar(d) {
      aviso = { id: ++idAviso, ok: d.ok, mensaje: d.mensaje, deshacer: fotoPrevia !== null && deshacerVigente(fotoDesde, relojMs()) };
      avisar();
    },
    puedeDeshacer: () => fotoPrevia !== null && deshacerVigente(fotoDesde, relojMs()),
    olvidarDeshacer: () => soltarFoto(),
    deshacer() {
      if (!fotoPrevia) return;
      if (!deshacerVigente(fotoDesde, relojMs())) return soltarFoto();
      if (!puedeOperar()) return void negarSoloLectura();
      let h: ReturnType<typeof hidratarEstado>;
      try {
        h = hidratarEstado(JSON.parse(fotoPrevia));
      } catch {
        h = { ok: false, motivo: "no se pudo leer" };
      }
      fotoPrevia = null;
      fotoDesde = null;
      if (!h.ok) {
        aviso = { id: ++idAviso, ok: false, mensaje: "No se pudo deshacer.", deshacer: false };
      } else {
        estado = h.estado;
        aviso = { id: ++idAviso, ok: true, mensaje: `Listo, se deshizo: ${mensajePrevio}`, deshacer: false };
      }
      cambio();
    },
    volverALaDemo() {
      if (real) {
        aviso = { id: ++idAviso, ok: false, mensaje: "En la jornada real no se vuelve a la demo: lo cargado queda.", deshacer: false };
        return avisar();
      }
      if (pendiente !== null) clearTimeout(pendiente);
      pendiente = null;
      estado = demoDelDia(hoyDemo);
      retomo = false;
      fotoPrevia = null;
      fotoDesde = null;
      aviso = { id: ++idAviso, ok: true, mensaje: "Listo: volviste a la demo de hoy, como recién abierta.", deshacer: false };
      cambios++;
      if (primarioLocal) {
        // Se borra lo de este equipo (la demo recién abierta no se guarda hasta que se toque algo).
        espejo!.borrar();
        versionGuardada = 0;
        cambiosGuardados = cambios;
      }
      avisar();
      adelantarTexto();
      programarGuardado();
    },
    guardarYa,
    copia() {
      return (JSON.parse(textoActual()) as FotoEstado).estado;
    },
    simular(claveSim, fn) {
      if (simulaciones.cambios !== cambios || simulaciones.ahora !== ahora) simulaciones = { cambios, ahora, valores: new Map() };
      if (simulaciones.valores.has(claveSim)) return simulaciones.valores.get(claveSim) as ReturnType<typeof fn>;
      const valor = fn((JSON.parse(textoActual()) as FotoEstado).estado);
      // Pocas por estado (las opciones de un formulario): con más, se tira la más vieja.
      if (simulaciones.valores.size >= 16) simulaciones.valores.delete(simulaciones.valores.keys().next().value!);
      simulaciones.valores.set(claveSim, valor);
      return valor;
    },
  };
}
