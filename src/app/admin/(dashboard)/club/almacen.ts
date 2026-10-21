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

import {
  VERSION_ESTADO,
  archivarDiasCerrados as archivarEnElMotor,
  crearClubReal,
  diaParaArchivar,
  generarDemo,
  hidratarEstado,
  horarioDe,
  huellaAnexo,
  paqueteParaArchivar,
  verificarPaqueteArchivo,
  materializarFijos,
  secuenciaIds,
  solicitarAcceso,
  sumarDias,
  verificarFirma,
} from "@/lib/club/motor.mjs";
import type { Ahora, AnexoJornada, Auth, ConteosArchivo, EstadoClub, Fecha, FotoEstado, Usuario } from "@/lib/club/motor.mjs";
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
/** Cuántas copias de «lo que quedó aparte» (choques con otra pantalla) se guardan en el equipo: cada una es el club entero. */
export const TOPE_APARTES = 3;

/** Cada cuánto late el reloj real (como el vanilla: 15 s). */
export const LATIDO_MS = 15_000;

/** Cuántas entradas del registro quedan si falta lugar para guardar (como el vanilla). */
export const REGISTRO_SI_FALTA_LUGAR = 60;

/**
 * Desde cuántos caracteres lo guardado «se está llenando» (el `AVISO_LLENO` del vanilla: 2.500.000, la mitad de los
 * ~5 millones que guarda el navegador). También cuenta como lleno que el guardado de este equipo haya fallado.
 */
export const AVISO_LLENO = 2_500_000;

/** `suscribirGuardado` avisa por `bytes` sólo al cruzar esta cuadrícula (64 KB), o al archivar o restaurar. */
export const CUADRICULA_DE_BYTES = 64 * 1024;

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
 * Quién opera el motor en la demo. En el ERP la identidad la da el LOGIN, no el PIN del piloto (que
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

/** El nombre de quien pide acceso desde la pantalla bloqueada: hasta 60 letras. */
export const LARGO_NOMBRE_ACCESO = 60;
/** Cuántos pedidos de acceso pueden esperar al dueño a la vez (sin PIN no se llena el estado de pedidos). */
export const TOPE_PEDIDOS_DE_ACCESO = 10;

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
 *   · "ilegible": lo guardado no se pudo leer ni apartar: SÓLO LECTURA, para no pisarlo;
 *   · "sin-base": la jornada real se abre contra un guardado que no es el de este equipo (la base), no contesta y en
 *     este equipo no hay copia: no se sabe si ya existe un club guardado, así que NO se arranca uno vacío (se
 *     pisaría): SÓLO LECTURA mientras se reintenta leer.
 */
export type JornadaDelClub = "demo" | "abriendo" | "propia" | "sin-bloqueo" | "otra-pestania" | "ilegible" | "sin-base";

/** Cómo va el guardado y la jornada (un objeto nuevo sólo cuando algo cambia: sirve de snapshot). */
export interface EstadoDelGuardado {
  jornada: JornadaDelClub;
  /** "guardado": anda · "reintentando": falló y se reintenta · "sin-almacenamiento": no hay dónde guardar. */
  guardado: "guardado" | "reintentando" | "sin-almacenamiento";
  /** ¿El guardado es el de este equipo? (si no, este equipo es el espejo). */
  enEsteEquipo: boolean;
  /**
   * Largo (caracteres) de lo último que se guardó (o se abrió). No cuesta nada: es el texto que ya se armó.
   * `suscribirGuardado` avisa por él sólo si cruza la cuadrícula de 64 KB (`CUADRICULA_DE_BYTES`), si cambia `lleno`,
   * o al archivar o restaurar: no en cada guardado.
   */
  bytes: number;
  /** ¿Se está llenando? (`bytes` > `AVISO_LLENO`, o el guardado de este equipo falló): un dueño tiene que archivar. */
  lleno: boolean;
}

/** Qué archivar: hasta qué día (default `diaParaArchivar`), a nombre de quién y con qué PIN (default: el operador). */
export interface PedidoDeArchivo {
  hasta?: Fecha;
  por?: string | null;
  auth?: Auth;
}

/**
 * Lo que devuelve archivar (o prepararlo, si no había nada). `bytes*` = largo del texto del estado. Si falla, `causa`:
 *   · "otro": el archivo elegido es de otro club u otro archivado · "danado": incompleto, alterado o JSON roto ·
 *   · "cambio": cambió algo de esos días desde que se descargó (hay que preparar y descargar de nuevo) ·
 *   · "permiso" / "estado": no lo puede hacer quien lo pide / ahora no se puede operar · "guardado": la base no
 *     guardó el anexo · "repetido": ya se confirmó o se está confirmando (doble clic): la pantalla lo IGNORA.
 */
export type ResultadoDelArchivo =
  | { ok: false; motivo: string; causa: "otro" | "danado" | "cambio" | "permiso" | "estado" | "guardado" | "repetido" }
  | { ok: true; vacio: boolean; hasta: Fecha; conteos: ConteosArchivo; anexo: AnexoJornada; bytesAntes: number; bytesDespues: number };

/**
 * El archivo listo para confirmar (paso 1 de 2). La pantalla descarga UN solo archivo, `textoDelArchivo`
 * (`breakpoint-respaldo-y-archivo-AAAA-MM-DD.json`: el respaldo completo de AHORA + el anexo de los días que salen, con
 * sus huellas, `paqueteParaArchivar` del motor), y para confirmar el dueño lo vuelve a ELEGIR:
 *   · sin `guardarAnexo` (el guardado de este equipo): `confirmar({ archivoElegido })` con el texto del archivo elegido.
 *     El almacén recalcula el archivado sobre el estado de ahora y lo compara con el archivo
 *     (`verificarPaqueteArchivo`): recién si coincide, achica. Así se prueba que la descarga llegó entera.
 *   · con `guardarAnexo` (la base, BP-3): no hace falta el archivo; se guarda el anexo en el servidor antes de achicar.
 *     `textoDelArchivo` igual se ofrece para que el dueño se quede con su copia.
 * `bytesDespues` es la estimación (el real vuelve en `confirmar`). Se confirma UNA vez.
 */
export type ArchivoPreparado = Extract<ResultadoDelArchivo, { ok: true }> & {
  vacio: false;
  textoDelArchivo: string;
  /** Huella del anexo de este paso (la que lleva el archivo). */
  huella: string;
  /** ¿El guardado guarda el anexo aparte? Si no, `confirmar` pide `archivoElegido`. */
  guardaAnexo: boolean;
  confirmar(opciones?: { archivoElegido?: string }): Promise<ResultadoDelArchivo>;
};

/** Lo que devuelve `restaurar`. `copia` es la clave donde quedó lo de antes. */
export type ResultadoDeRestaurar =
  | { ok: false; motivo: string; causa: "permiso" | "estado" | "danado" | "sin-lugar" }
  | { ok: true; copia: string; bytesAntes: number; bytesDespues: number; operador: Operador | null };

/** Los Web Locks del navegador (lo que se usa de `navigator.locks`; se reemplaza en los tests). */
export interface CerrojosDelNavegador {
  request(nombre: string, opciones: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal }, alTomar: (lock: unknown) => unknown): Promise<unknown>;
}

/**
 * El canal entre las pestañas de este equipo (BroadcastChannel, con el nombre del candado): «Usar acá» le pide la
 * jornada a la que la tiene, que escribe lo pendiente y recién ahí suelta el candado (se reemplaza en los tests).
 */
export interface CanalDeLaJornada {
  enviar(mensaje: unknown): void;
  escuchar(alRecibir: (mensaje: unknown) => void): () => void;
  cerrar?(): void;
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
  /** Sólo la demo: corre el reloj ±minutos dentro del horario del día (los −30′/+30′ de la barra, como el club de hoy). */
  correrRelojDemo(minutos: number): void;
  /** Lo que quedó aparte en este equipo por un choque con otra pantalla (para bajarlo como respaldo), lo más nuevo primero. */
  apartes(): { cuando: number; texto: string }[];
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
   * La consola del PRIMER arranque: corre `accion` SÓLO en la jornada real, con el club sin configurar
   * (`config.configurado === false`) y sin nadie operando (con operador, se usa `ejecutar`). La acción no recibe
   * `auth` (nadie tiene PIN todavía): sirve para lo que el motor deja hacer sin él (`definirPinInicial`,
   * `terminarConfiguracion`). Deja el aviso y guarda como `ejecutar`, sin «Deshacer». Configurado: no corre, «El
   * club ya está configurado: entrá con tu PIN». `ejecutar`/`aplicar` siguen cortados sin operador, siempre.
   */
  arranque(accion: (estado: EstadoClub, ahora: Ahora) => Desenlace): Desenlace;
  /**
   * Restaura un respaldo (el texto descargado o la foto ya leída; para el archivo «respaldo-y-archivo», la pantalla
   * pasa lo que da `respaldoDesdeArchivo` del motor). Sólo un dueño con PIN (como archivar). Valida con
   * `hidratarEstado`; guarda ANTES una copia de lo de ahora en `<clave>:antes-de-restaurar:<ms>` (sin lugar, no
   * restaura); reemplaza el estado, apaga «Deshacer», revisa al operador (si ya no existe o cambió su PIN, queda sin
   * operador) y guarda en el acto.
   */
  restaurar(respaldo: string | unknown, opciones?: { auth?: Auth }): ResultadoDeRestaurar;
  /**
   * «Empezar otra jornada en blanco» (sólo la jornada real, un dueño con PIN). Guarda ANTES una copia de la de ahora en
   * `<clave>:antes-de-blanco:<ms>` (sin lugar, no hace nada); deja el club de `crearClubReal` SIN configurar, apaga
   * «Deshacer», queda sin operador (sale la consola de arranque) y guarda en el acto. Devuelve lo mismo que `restaurar`.
   */
  empezarEnBlanco(opciones?: { auth?: Auth }): ResultadoDeRestaurar;
  /**
   * Paso 1 del archivado de días cerrados: valida (rol OWNER del ERP + PIN de un dueño del club, porque el motor no lo
   * valida), corre el motor (puro: no toca el estado) y devuelve lo que hay que descargar y `confirmar`. Si no había
   * nada, `vacio: true` y no hay nada que confirmar.
   */
  prepararArchivo(pedido?: PedidoDeArchivo): ResultadoDelArchivo | ArchivoPreparado;
  /**
   * Los dos pasos de una vez (`prepararArchivo` + `confirmar`). Sólo achica si el anexo quedó a salvo: guardado
   * aparte (`guardarAnexo`) o, sin eso, con el `archivoElegido` verificado. Apaga «Deshacer».
   */
  archivarDiasCerrados(pedido?: PedidoDeArchivo & { archivoElegido?: string }): Promise<ResultadoDelArchivo>;
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
  /**
   * «¿Sos nuevo/a? Pedí acceso» desde la pantalla bloqueada (el `pedirAcceso` del club de hoy): lo ÚNICO que se escribe
   * sin nadie que haya entrado con su PIN. Corre sólo `solicitarAcceso` del motor (un pedido pendiente con el nombre,
   * que un dueño otorga o rechaza en el Tablero); no da acceso a nada. Con tope de pedidos esperando y sin «Deshacer».
   */
  pedirAcceso(nombre: string): Desenlace;
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
  /** Abre el canal entre pestañas (default: BroadcastChannel, si hay). null = no hay: «Usar acá» roba el candado. */
  canal?: ((nombre: string) => CanalDeLaJornada | null) | null;
  /** Cuánto se espera a que la otra pestaña ceda la jornada antes de robarla (default 3 s). */
  esperaPostaMs?: number;
  /** Al robar la jornada, cuánto se espera antes de leer lo guardado: lo que la otra escribe al perderla (default 1 s). */
  graciaRoboMs?: number;
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

/** BroadcastChannel con el nombre del candado, o null (navegador viejo). En Node no retiene el proceso. */
function canalDelNavegador(nombre: string): CanalDeLaJornada | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    const b = new BroadcastChannel(nombre);
    (b as unknown as { unref?: () => void }).unref?.();
    return {
      enviar: (m) => b.postMessage(m),
      escuchar(alRecibir) {
        const h = (e: MessageEvent) => alRecibir(e.data);
        b.addEventListener("message", h);
        return () => b.removeEventListener("message", h);
      },
      cerrar: () => b.close(),
    };
  } catch {
    return null;
  }
}

/** Lo que manda «Usar acá» por el canal. */
const PEDIDO_DE_POSTA = "gsg-club:ceder-la-jornada";

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

const MENSAJE_SOLO_LECTURA: Record<"abriendo" | "otra-pestania" | "ilegible" | "sin-base", string> = {
  abriendo: "Un momento: se está abriendo la jornada.",
  "otra-pestania": "Esta pestaña es sólo para mirar: la jornada está abierta en otra. Tocá «Usar acá» para seguir en esta.",
  ilegible: "No se guarda nada: lo guardado en este equipo no se pudo leer. Avisá a soporte antes de seguir.",
  "sin-base": "No hay conexión con la base: estamos reintentando. Hasta que conteste no se puede operar, para no arrancar un club vacío encima del guardado.",
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
    esperaPostaMs = 3000,
    graciaRoboMs = 1000,
  } = opciones;
  const crearCanal = opciones.canal === undefined ? canalDelNavegador : opciones.canal;
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
  // Termina cuando el guardado en camino llegó y se procesó (para esperar antes de ceder la jornada).
  let promesaEnVuelo: Promise<void> | null = null;
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
    bytes: inicial?.texto.length ?? 0,
    lleno: (inicial?.texto.length ?? 0) > AVISO_LLENO,
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
  /** La lista de lo apartado por un choque con otra pantalla (las últimas `TOPE_APARTES`, por cuándo). */
  const CLAVE_APARTES = `${clave}:aparte`;
  const leerApartes = (): number[] => {
    try {
      const l = JSON.parse(almacenamiento?.getItem(CLAVE_APARTES) ?? "[]") as unknown;
      return Array.isArray(l) ? l.filter((x): x is number => Number.isFinite(x)) : [];
    } catch {
      return [];
    }
  };
  /**
   * Copia lo de acá (antes de reemplazarlo por lo de la base) en `<clave>:aparte:<ms>`. Tope: las últimas
   * `TOPE_APARTES` copias, y los viejos se borran ANTES de escribir (para no comerle lugar al guardado del equipo); si
   * igual no entra, se borran todos los viejos y se prueba una vez más. false si no hubo lugar.
   */
  const apartarLoDeAca = (): boolean => {
    if (!almacenamiento) return false;
    const cuando = relojMs();
    let texto: string;
    try {
      texto = textoParaGuardar();
    } catch {
      return false;
    }
    const borrar = (ms: number[]) => ms.forEach((m) => {
      try {
        almacenamiento.removeItem(`${CLAVE_APARTES}:${m}`);
      } catch {
        // nada que borrar
      }
    });
    let lista = leerApartes();
    borrar(lista.slice(0, Math.max(0, lista.length - (TOPE_APARTES - 1))));
    lista = lista.slice(-(TOPE_APARTES - 1));
    for (const intento of [0, 1]) {
      try {
        almacenamiento.setItem(`${CLAVE_APARTES}:${cuando}`, texto);
        almacenamiento.setItem(CLAVE_APARTES, JSON.stringify([...lista, cuando]));
        return true;
      } catch {
        if (intento === 1) break;
        borrar(lista);
        lista = [];
      }
    }
    try {
      almacenamiento.setItem(CLAVE_APARTES, JSON.stringify(lista));
    } catch {
      // sin lugar ni para la lista
    }
    return false;
  };
  const ponerMeta = (cambio: Partial<EstadoDelGuardado>, forzar = false) => {
    const nuevo = { ...meta, ...cambio };
    if (!forzar && nuevo.jornada === meta.jornada && nuevo.guardado === meta.guardado && nuevo.lleno === meta.lleno) {
      // Sólo cambió el tamaño: cada guardado lo cambia un poco y la cinta no lo muestra, así que se anota sin avisar
      // mientras no cruce la cuadrícula de 64 KB (Configuración lo lee al pintarse). Archivar y restaurar avisan siempre.
      if (Math.floor(nuevo.bytes / CUADRICULA_DE_BYTES) === Math.floor(meta.bytes / CUADRICULA_DE_BYTES)) {
        meta.bytes = nuevo.bytes;
        return;
      }
    }
    meta = nuevo;
    for (const o of oyentesGuardado) o();
  };
  /** ¿Esta pestaña tiene la jornada? (y por lo tanto escribe). */
  const tieneLaJornada = () => meta.jornada === "demo" || meta.jornada === "propia" || meta.jornada === "sin-bloqueo";
  // Se está pasando la jornada a otra pestaña: se escribe lo pendiente, pero ya no se opera.
  let cediendo = false;
  const puedeOperar = () => tieneLaJornada() && !cediendo;

  // ── guardado ──
  /** Falta lugar en este equipo: se recorta el registro viejo (como el vanilla). true si había algo que recortar. */
  const recortarRegistro = (): boolean => {
    if (estado.log.length <= REGISTRO_SI_FALTA_LUGAR) return false;
    estado.log.length = REGISTRO_SI_FALTA_LUGAR;
    cambios++;
    return true;
  };
  const alResultado = (r: ResultadoDelGuardado, c: number, largo?: number) => {
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
      ponerMeta(largo === undefined ? { guardado: "guardado" } : { guardado: "guardado", bytes: largo, lleno: largo > AVISO_LLENO });
      return;
    }
    if (r.motivo === "conflicto") {
      void sincronizar("conflicto");
      return;
    }
    intentos++;
    // Si el que falla es el de este equipo, es que no hay lugar: se está llenando (como el vanilla).
    ponerMeta(primarioLocal ? { guardado: "reintentando", lleno: true } : { guardado: "reintentando" });
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
    let largo: number | undefined;
    try {
      let t = textoParaGuardar();
      r = local.guardarYa(t, versionGuardada);
      if (!r.ok && r.motivo === "error" && recortarRegistro()) {
        c = cambios;
        t = textoParaGuardar();
        r = local.guardarYa(t, versionGuardada);
      }
      largo = t.length;
    } catch {
      r = { ok: false, motivo: "error" };
    }
    alResultado(r, c, largo);
  };
  const escribir = () => {
    pendiente = null;
    // Sin dónde guardar (incógnito), en sólo lectura o sin nada nuevo: ni se arma el texto.
    if (!guardado || !tieneLaJornada() || recargando || cambiosGuardados === cambios) return;
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
    promesaEnVuelo = promesa
      .catch((): ResultadoDelGuardado => ({ ok: false, motivo: "error" }))
      .then((r) => {
        enVuelo = null;
        alResultado(r, c, t.length);
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
  const sincronizar = async (motivo: "abrir" | "usarAca" | "conflicto", vigente: () => boolean = () => true): Promise<void> => {
    if (!guardado) return;
    let r: { texto: string; version: number } | null;
    if (motivo === "conflicto") recargando = true;
    try {
      r = primarioLocal ? espejo!.leerYa() : await guardado.leer();
    } catch {
      recargando = false;
      // Se perdió el candado (otra pestaña tomó la jornada) o la pantalla se fue: no se sigue (no pisar «otra-pestania»).
      if (!vigente()) return;
      intentos++;
      if (real && !primarioLocal && !abierto?.ok && (motivo === "abrir" || motivo === "usarAca")) {
        // (Al abrir o al tomar la jornada la pantalla está en sólo lectura: no hay nada del usuario sin guardar; lo
        // «sucio» es sólo el club en blanco que se armó para mostrar algo, y ése es justo el que no se debe guardar.)
        // La base no contesta y en este equipo no hay copia: no se sabe si existe un club guardado. No se arranca uno
        // vacío (guardarlo lo pisaría): sólo lectura y se reintenta LEER. Lo que espera (`.finally` del que abrió)
        // sigue esperando hasta que la base conteste o la pantalla se vaya.
        ponerMeta({ jornada: "sin-base", guardado: "reintentando" });
        await new Promise<void>((listo) => {
          cancelarReintento?.();
          cancelarReintento = temporizador.despues(() => {
            cancelarReintento = null;
            listo();
          }, esperaDelReintento(intentos));
        });
        if (!activo || !vigente()) return;
        return sincronizar(motivo, vigente);
      }
      // No se pudo leer: se sigue con lo de acá; el guardado lo reintenta (y si había algo más nuevo, dirá conflicto).
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
    if (meta.jornada === "sin-base") ponerMeta({ jornada: "abriendo", guardado: "guardado" });
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
    // Lo de acá que no llegó a guardarse no se tira: queda aparte en este equipo (Configuración → «Lo que quedó aparte»
    // lo baja como respaldo para restaurarlo o revisarlo).
    const aparte = perdido && real ? apartarLoDeAca() : false;
    reemplazar(abiertoAlla.estado);
    retomo = true;
    cambios++;
    cambiosGuardados = cambios;
    if (perdido) {
      aviso = {
        id: ++idAviso,
        ok: false,
        mensaje: aparte
          ? rol === "OWNER"
            ? "Otra pantalla guardó cambios más nuevos: se cargó lo último guardado. Lo tuyo que no llegó quedó aparte en este equipo (Configuración → «Lo que quedó aparte»). Revisá lo último que hiciste."
            : "Otra pantalla guardó cambios más nuevos: se cargó lo último guardado. Lo tuyo que no llegó quedó aparte en este equipo: lo baja un dueño entrando con su usuario del ERP acá (Configuración → «Lo que quedó aparte»). Revisá lo último que hiciste."
          : "Otra pantalla guardó cambios más nuevos: se cargó lo último guardado. Revisá lo último que hiciste.",
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
  /**
   * Escribe lo pendiente y espera a que llegue (con tope de vueltas): antes de pasar la jornada a otra pestaña. La
   * escritura lleva chequeo de versión, así que nunca pisa lo que la otra haya guardado.
   */
  const vaciarGuardado = async () => {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      if (!guardado || recargando || cambiosGuardados === cambios) return;
      guardarYa();
      if (primarioLocal || !promesaEnVuelo) return;
      await promesaEnVuelo;
      // Si falló, lo pendiente quedó en el espejo de este equipo (`espejarSiHaceFalta`): no se insiste.
      if (cancelarReintento !== null) return;
    }
  };
  /** Esta pestaña deja la jornada: lo pendiente se escribe primero, después queda sólo para mirar. */
  const dejarLaJornada = async (soltar: (() => void) | null) => {
    cediendo = true;
    try {
      await vaciarGuardado();
    } finally {
      cediendo = false;
      if (pendiente !== null) clearTimeout(pendiente);
      pendiente = null;
      cancelarReintento?.();
      cancelarReintento = null;
      ponerMeta({ jornada: "otra-pestania" });
      soltar?.();
    }
  };
  /**
   * Pide el candado: "abrir" (si está libre; si no, «otra-pestania»), "pedir" (espera a que la otra pestaña lo suelte,
   * después de escribir lo suyo) o "robar" (la otra no contestó: se roba y se espera `graciaRoboMs` antes de leer, el
   * rato en que la otra escribe lo pendiente al perderla).
   */
  const tomarJornada = (modo: "abrir" | "pedir" | "robar", signal?: AbortSignal, alTomar?: () => void) => {
    if (!candado || !cerrojos) return abrirSinBloqueo();
    candadoPedido = true;
    let obtuvo = false;
    let pedido: Promise<unknown>;
    const opcionesDelPedido = modo === "abrir" ? { ifAvailable: true } : modo === "robar" ? { steal: true } : { signal };
    try {
      pedido = cerrojos.request(candado, opcionesDelPedido, (lock) => {
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
        alTomar?.();
        // El candado queda tomado mientras esta pestaña lo tenga (hasta `soltarCandado` o que otra lo robe).
        return new Promise<void>((liberar) => {
          const mio = () => {
            if (soltarCandado === mio) soltarCandado = null;
            candadoPedido = false;
            liberar();
          };
          soltarCandado = mio;
          const vigente = () => activo && soltarCandado === mio;
          const abrir = () => {
            if (!vigente()) return;
            void sincronizar(modo === "abrir" ? "abrir" : "usarAca", vigente).finally(() => {
              if (vigente()) ponerMeta({ jornada: "propia" });
            });
          };
          if (modo === "robar") temporizador.despues(abrir, graciaRoboMs);
          else abrir();
        });
      });
    } catch (e) {
      pedido = Promise.reject(e);
    }
    pedido.catch(() => {
      if (obtuvo) {
        // Otra pestaña robó la jornada (no contestó la posta a tiempo): lo pendiente se escribe igual (con chequeo de
        // versión) y ésta queda sólo para mirar.
        if (soltarCandado) {
          soltarCandado = null;
          candadoPedido = false;
          void dejarLaJornada(null);
        }
        return;
      }
      // Se dejó de esperar la posta para robarla: no es un error.
      if (signal?.aborted) return;
      // El navegador no deja usar el candado (p. ej. fuera de https): se sigue sin bloqueo, como el vanilla.
      candadoPedido = false;
      abrirSinBloqueo();
    });
  };
  // ── la posta entre pestañas (BroadcastChannel) ──
  let canalActual: CanalDeLaJornada | null = null;
  let dejarDeEscuchar: (() => void) | null = null;
  const abrirCanal = () => {
    if (canalActual || !candado || !crearCanal) return;
    canalActual = crearCanal(candado);
    dejarDeEscuchar =
      canalActual?.escuchar((m) => {
        // Otra pestaña tocó «Usar acá»: si ésta tiene la jornada, escribe lo pendiente y recién ahí suelta el candado.
        if ((m as { tipo?: unknown } | null)?.tipo !== PEDIDO_DE_POSTA || !soltarCandado || cediendo) return;
        void dejarLaJornada(soltarCandado);
      }) ?? null;
  };
  const cerrarCanal = () => {
    dejarDeEscuchar?.();
    dejarDeEscuchar = null;
    canalActual?.cerrar?.();
    canalActual = null;
  };
  /** «Usar acá»: pide la posta por el canal y espera el candado; si la otra no contesta a tiempo, lo roba. */
  const pedirLaPosta = () => {
    if (!candado || !cerrojos) return abrirSinBloqueo();
    const canal = canalActual;
    if (!canal || typeof AbortController === "undefined") return tomarJornada("robar");
    const corte = new AbortController();
    let llego = false;
    const cancelarEspera = temporizador.despues(() => {
      if (llego) return;
      corte.abort();
      tomarJornada("robar");
    }, esperaPostaMs);
    tomarJornada("pedir", corte.signal, () => {
      llego = true;
      cancelarEspera();
    });
    canal.enviar({ tipo: PEDIDO_DE_POSTA });
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
    if (!guardado || !tieneLaJornada() || recargando || cambiosGuardados === cambios) return;
    if (primarioLocal) return escribirLocal(espejo!);
    // Con otro guardado: se lanza (puede no llegar si la página se cierra) y la copia de este equipo se escribe ya.
    escribir();
    espejarSiHaceFalta();
  };

  // ── archivar los días cerrados ──
  /** El motor no valida quién archiva: lo hace el almacén, como el vanilla (PIN de un dueño del club) + rol OWNER. */
  const quienArchiva = (auth: Auth | undefined): { ok: true; usuario: Usuario } | { ok: false; motivo: string } => {
    if (rol !== "OWNER") return { ok: false, motivo: "Archivar lo hace un dueño." };
    const a = auth ?? operadorActual()?.auth ?? {};
    // Firma, no sólo entra: el PIN viejo de un dueño (el de 2 del piloto) no archiva ni restaura (SEC-5).
    const v = verificarFirma(estado, a.usuarioId ?? "", a.pin ?? "");
    if (!v.ok) return { ok: false, motivo: v.motivo };
    if (v.usuario.rol !== "duenio") return { ok: false, motivo: "Archivar lo hace un dueño." };
    return { ok: true, usuario: v.usuario };
  };
  const kb = (n: number) => `${Math.ceil(n / 1024).toLocaleString("es-AR")} KB`;
  /** El archivado preparado que espera su confirmación (uno solo: preparar otro lo reemplaza). */
  let archivoPendiente: { huella: string; enCurso: boolean } | null = null;
  const prepararArchivo = (pedido: PedidoDeArchivo = {}): ResultadoDelArchivo | ArchivoPreparado => {
    if (!puedeOperar() || recargando) return { ok: false, causa: "estado", motivo: MENSAJE_SOLO_LECTURA[meta.jornada as keyof typeof MENSAJE_SOLO_LECTURA] ?? "Ahora no se puede archivar." };
    const quien = quienArchiva(pedido.auth);
    if (!quien.ok) return { ok: false, causa: "permiso", motivo: quien.motivo };
    const hasta = pedido.hasta ?? diaParaArchivar(estado, ahora);
    const por = pedido.por ?? quien.usuario.nombre;
    const correr = () => archivarEnElMotor(estado, hasta, { ahora, por });
    let res: ReturnType<typeof archivarEnElMotor>;
    try {
      res = correr();
    } catch {
      return { ok: false, causa: "estado", motivo: "No se pudo armar el archivo. Probá de nuevo." };
    }
    if (!res.ok) return { ok: false, causa: "estado", motivo: res.motivo };
    const bytesAntes = textoActual().length;
    if (res.vacio) return { ok: true, hasta, conteos: res.conteos, anexo: res.anexo, bytesAntes, vacio: true, bytesDespues: bytesAntes };
    // El respaldo completo de ahora (el sobre v1 de siempre) y el anexo, en UN archivo con sus huellas.
    // Con `guardado` (ms), como el respaldo que se descarga (FORMATO-RESPALDO.md).
    const respaldo: FotoEstado & { guardado: number } = { v: VERSION_ESTADO, estado, secuencia: secuenciaIds(), guardado: relojMs() };
    const paquete = paqueteParaArchivar(respaldo, res);
    const textoDelArchivo = JSON.stringify(paquete);
    const pendienteDeEste = { huella: paquete.huella, enCurso: false };
    archivoPendiente = pendienteDeEste;
    const sigue = () => archivoPendiente === pendienteDeEste;
    const repetido: ResultadoDelArchivo = { ok: false, causa: "repetido", motivo: "" };

    const confirmar = async ({ archivoElegido }: { archivoElegido?: string } = {}): Promise<ResultadoDelArchivo> => {
      // Doble clic, o ya confirmado, o se preparó otro: en silencio.
      if (!sigue() || pendienteDeEste.enCurso) return repetido;
      if (!puedeOperar() || recargando) return { ok: false, causa: "estado", motivo: MENSAJE_SOLO_LECTURA[meta.jornada as keyof typeof MENSAJE_SOLO_LECTURA] ?? "Ahora no se puede archivar." };
      // Lo que se va a archivar AHORA (puede haber cambiado desde el paso 1).
      let ahoraRes: ReturnType<typeof archivarEnElMotor>;
      try {
        ahoraRes = correr();
      } catch {
        return { ok: false, causa: "estado", motivo: "No se pudo armar el archivo. Probá de nuevo." };
      }
      const guardarAnexo = guardado?.guardarAnexo;
      if (guardarAnexo) {
        // La base: no hace falta el archivo, pero lo que se guarda tiene que ser lo mismo que se preparó.
        if (!ahoraRes.ok || ahoraRes.vacio || huellaAnexo(ahoraRes.anexo) !== pendienteDeEste.huella) {
          archivoPendiente = null;
          return { ok: false, causa: "cambio", motivo: "Cambió algo de esos días desde que se preparó: prepará el archivado de nuevo." };
        }
        const marca = cambios;
        pendienteDeEste.enCurso = true;
        let ok = false;
        try {
          ok = await guardarAnexo.call(guardado, JSON.stringify(ahoraRes.anexo), hasta);
        } catch {
          ok = false;
        }
        pendienteDeEste.enCurso = false;
        if (!sigue()) return repetido;
        if (!ok) return { ok: false, causa: "guardado", motivo: "No se pudo guardar el archivo de esos días: no se achicó nada. Probá de nuevo." };
        if (cambios !== marca) {
          // Algo cambió mientras se guardaba: se vuelve a calcular y, si ya no es lo mismo, no se achica.
          ahoraRes = correr();
          if (!ahoraRes.ok || ahoraRes.vacio || huellaAnexo(ahoraRes.anexo) !== pendienteDeEste.huella) {
            archivoPendiente = null;
            return { ok: false, causa: "cambio", motivo: "Cambió algo de esos días mientras se guardaba: prepará el archivado de nuevo." };
          }
        }
      } else {
        // Este equipo: el archivo que el dueño eligió tiene que ser el que se descargó, entero, para ESTE archivado.
        let elegido: unknown;
        try {
          elegido = JSON.parse(archivoElegido ?? "");
        } catch {
          return { ok: false, causa: "danado", motivo: "El archivo está incompleto o dañado: descargalo de nuevo." };
        }
        const v = verificarPaqueteArchivo(elegido, ahoraRes, pendienteDeEste.huella);
        if (!sigue()) return repetido;
        if (!v.ok) {
          if (v.causa === "cambio") archivoPendiente = null;
          return { ok: false, causa: v.causa, motivo: v.motivo };
        }
      }
      if (!ahoraRes.ok || ahoraRes.vacio) return { ok: false, causa: "cambio", motivo: "Ya no hay nada para archivar hasta ese día: prepará de nuevo." };
      // Recién ahora: el estado achicado reemplaza al vivo, sin «Deshacer», y se guarda en el acto.
      archivoPendiente = null;
      estado = ahoraRes.estado;
      fotoPrevia = null;
      fotoDesde = null;
      cambios++;
      const bytesDespues = textoActual().length;
      const c = ahoraRes.conteos;
      aviso = {
        id: ++idAviso,
        ok: true,
        mensaje: `Archivado hasta el ${ddmm(hasta)}: ${c.reservas} turnos, ${c.cuentas} cuentas y ${c.movimientos} movimientos de caja (${kb(bytesAntes)} → ${kb(bytesDespues)}).`,
        deshacer: false,
      };
      avisar();
      guardarYa();
      avisarTamano(bytesDespues);
      return { ok: true, vacio: false, hasta, conteos: c, anexo: ahoraRes.anexo, bytesAntes, bytesDespues };
    };
    return {
      ok: true,
      vacio: false,
      hasta,
      conteos: res.conteos,
      anexo: res.anexo,
      bytesAntes,
      bytesDespues: textoDelEstado(res.estado).length,
      textoDelArchivo,
      huella: paquete.huella,
      guardaAnexo: !!guardado?.guardarAnexo,
      confirmar,
    };
  };

  /**
   * Después de archivar o restaurar: avisa por el tamaño aunque no cruce la cuadrícula. Con el guardado de este equipo,
   * `bytes` ya es lo que se guardó (en el acto); con otro (asíncrono), la estimación hasta que llegue.
   */
  const avisarTamano = (estimado: number) => {
    ponerMeta(primarioLocal && meta.guardado === "guardado" ? {} : { bytes: estimado, lleno: estimado > AVISO_LLENO }, true);
  };

  // ── restaurar un respaldo ──
  const restaurar = (respaldo: unknown, { auth }: { auth?: Auth } = {}): ResultadoDeRestaurar => {
    if (!puedeOperar() || recargando) return { ok: false, causa: "estado", motivo: MENSAJE_SOLO_LECTURA[meta.jornada as keyof typeof MENSAJE_SOLO_LECTURA] ?? "Ahora no se puede restaurar." };
    const quien = quienArchiva(auth);
    if (!quien.ok) return { ok: false, causa: "permiso", motivo: quien.motivo.replace("Archivar", "Restaurar") };
    let foto: unknown = respaldo;
    if (typeof respaldo === "string") {
      try {
        foto = JSON.parse(respaldo);
      } catch {
        return { ok: false, causa: "danado", motivo: "El archivo está incompleto o dañado: no se restauró nada." };
      }
    }
    const h = hidratarEstado(foto);
    if (!h.ok) return { ok: false, causa: "danado", motivo: `No se puede restaurar: ${h.motivo}.` };
    // Antes de reemplazar, una copia de lo de ahora al lado (como el «-antes-golive» del vanilla). Sin lugar, no se toca.
    const bytesAntes = textoActual().length;
    const copia = `antes-de-restaurar:${relojMs()}`;
    let copiado = false;
    try {
      copiado = espejo?.guardarCopia(copia, textoParaGuardar()) ?? false;
    } catch {
      copiado = false;
    }
    if (!copiado)
      return { ok: false, causa: "sin-lugar", motivo: "No hay lugar en este equipo para guardar una copia de lo de ahora: no se restauró nada. Descargá un respaldo y archivá los días cerrados." };
    reemplazar(h.estado);
    retomo = true;
    archivoPendiente = null;
    // Quien opera tiene que seguir existiendo con el mismo PIN en lo restaurado; si no, queda sin operador.
    if (operadorElegido) {
      const previo = operadorElegido;
      const u = estado.usuarios.find((x) => x.id === previo.usuario.id && x.activo !== false);
      const sigue = !!u && (previo.auth.pin === undefined ? true : !!u.pin && u.pin === previo.auth.pin);
      operadorElegido = sigue ? { usuario: u!, auth: previo.auth } : null;
    }
    for (const o of oyentesOperador) o();
    cambios++;
    const bytesDespues = textoActual().length;
    aviso = { id: ++idAviso, ok: true, mensaje: `Listo: se restauró el respaldo (lo de antes quedó copiado en este equipo).`, deshacer: false };
    avisar();
    guardarYa();
    adelantarTexto();
    avisarTamano(bytesDespues);
    return { ok: true, copia: `${clave}:${copia}`, bytesAntes, bytesDespues, operador: operadorActual() };
  };

  // ── empezar otra jornada en blanco ──
  const empezarEnBlanco = ({ auth }: { auth?: Auth } = {}): ResultadoDeRestaurar => {
    if (!real) return { ok: false, causa: "estado", motivo: "Empezar en blanco es de la jornada real." };
    if (!puedeOperar() || recargando) return { ok: false, causa: "estado", motivo: MENSAJE_SOLO_LECTURA[meta.jornada as keyof typeof MENSAJE_SOLO_LECTURA] ?? "Ahora no se puede." };
    const quien = quienArchiva(auth);
    if (!quien.ok) return { ok: false, causa: "permiso", motivo: quien.motivo.replace("Archivar", "Empezar en blanco") };
    // Antes, una copia de la jornada de ahora al lado (como el «-anterior» del vanilla). Sin lugar, no se toca nada.
    const bytesAntes = textoActual().length;
    const copia = `antes-de-blanco:${relojMs()}`;
    let copiado = false;
    try {
      copiado = espejo?.guardarCopia(copia, textoParaGuardar()) ?? false;
    } catch {
      copiado = false;
    }
    if (!copiado)
      return { ok: false, causa: "sin-lugar", motivo: "No hay lugar en este equipo para guardar una copia de la jornada de ahora: no se empezó nada. Descargá un respaldo y archivá los días cerrados." };
    // La jornada nueva: el club en blanco, sin configurar (sale la consola de arranque) y sin nadie operando.
    reemplazar(crearClubReal(fechaLocal(new Date(relojMs()))));
    retomo = false;
    archivoPendiente = null;
    operadorElegido = null;
    for (const o of oyentesOperador) o();
    cambios++;
    const bytesDespues = textoActual().length;
    aviso = { id: ++idAviso, ok: true, mensaje: "Listo: empezó una jornada nueva en blanco (la anterior quedó copiada en este equipo). Cada dueño arma su PIN.", deshacer: false };
    avisar();
    guardarYa();
    adelantarTexto();
    avisarTamano(bytesDespues);
    return { ok: true, copia: `${clave}:${copia}`, bytesAntes, bytesDespues, operador: null };
  };

  // ── la consola de arranque (jornada real sin configurar) ──
  const arranque = (accion: (estado: EstadoClub, ahora: Ahora) => Desenlace): Desenlace => {
    const negar = (mensaje: string): Desenlace => {
      aviso = { id: ++idAviso, ok: false, mensaje, deshacer: false };
      avisar();
      return { ok: false, mensaje };
    };
    if (!real) return negar("La consola de arranque es sólo de la jornada real.");
    if (estado.config.configurado !== false) return negar("El club ya está configurado: entrá con tu PIN.");
    if (operadorActual()) return negar("Ya entraste con tu PIN: hacelo desde la pantalla de siempre.");
    if (!puedeOperar()) return negarSoloLectura();
    let d: Desenlace;
    try {
      d = accion(estado, ahora);
    } catch {
      d = { ok: false, mensaje: "No se pudo hacer. Probá de nuevo." };
    }
    // Sin «Deshacer»: lo de antes ya no se deshace (como `ejecutar` con una acción no deshacible).
    fotoPrevia = null;
    fotoDesde = null;
    aviso = { id: ++idAviso, ok: d.ok, mensaje: d.mensaje, deshacer: false };
    cambio();
    return d;
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
          if (activo) return;
          cerrarCanal();
          if (!soltarCandado) return;
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
        abrirCanal();
        if (!candadoPedido && meta.jornada === "abriendo") tomarJornada("abrir");
      } else if (guardado && !primarioLocal) {
        void sincronizar("abrir");
      }
      return detener;
    },
    latir,
    apartes() {
      return leerApartes()
        .reverse()
        .flatMap((cuando) => {
          const texto = almacenamiento?.getItem(`${CLAVE_APARTES}:${cuando}`);
          return texto ? [{ cuando, texto }] : [];
        });
    },
    correrRelojDemo(minutos) {
      if (real) return;
      const { abre, cierra } = horarioDe(estado, ahora.fecha);
      const min = Math.min(cierra, Math.max(abre, ahora.min + minutos));
      if (min === ahora.min) return;
      ahora = { ...ahora, min };
      avisar();
    },
    aplicar(accion) {
      if (!puedeOperar()) {
        negarSoloLectura();
        throw new Error(MENSAJE_SOLO_LECTURA[meta.jornada as keyof typeof MENSAJE_SOLO_LECTURA] ?? "Sólo lectura.");
      }
      // La misma regla que `ejecutar`: en la jornada real no se escribe sin alguien que haya entrado con su PIN.
      if (real && !operadorActual()) {
        const mensaje = "Entrá con tu PIN para operar.";
        aviso = { id: ++idAviso, ok: false, mensaje, deshacer: false };
        avisar();
        throw new Error(mensaje);
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
    prepararArchivo,
    restaurar,
    empezarEnBlanco,
    arranque,
    async archivarDiasCerrados({ archivoElegido, ...pedido } = {}) {
      const p = prepararArchivo(pedido);
      if (!("confirmar" in p)) return p;
      return p.confirmar({ archivoElegido });
    },
    usarAca() {
      if (meta.jornada !== "otra-pestania") return;
      ponerMeta({ jornada: "abriendo" });
      pedirLaPosta();
    },
    ejecutar(accion, { deshacible = false } = {}) {
      if (!puedeOperar()) return negarSoloLectura();
      // En la jornada real nadie opera sin haber entrado con su PIN: no depende de que el bloqueo (pieza global de la
      // sesión del club) ya esté cargado y encima. Varias operaciones del motor no piden `auth`; sin esto correrían
      // con un `auth` vacío y sin saber quién las hizo.
      if (real && !operadorActual()) {
        const mensaje = "Entrá con tu PIN para operar.";
        aviso = { id: ++idAviso, ok: false, mensaje, deshacer: false };
        avisar();
        return { ok: false, mensaje };
      }
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
    pedirAcceso(nombre) {
      if (!puedeOperar()) return negarSoloLectura();
      const limpio = String(nombre ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, LARGO_NOMBRE_ACCESO);
      let d: Desenlace;
      if (estado.solicitudesAcceso.filter((s) => s.estado === "pendiente").length >= TOPE_PEDIDOS_DE_ACCESO) {
        d = { ok: false, mensaje: "Ya hay varios pedidos de acceso esperando al dueño: avisale para que los resuelva." };
      } else {
        try {
          const r = solicitarAcceso(estado, limpio, ahora);
          d = r.ok ? { ok: true, mensaje: "Listo: el pedido le llegó al dueño. Cuando lo apruebe te da el PIN." } : { ok: false, mensaje: r.motivo };
        } catch {
          d = { ok: false, mensaje: "No se pudo pedir el acceso. Probá de nuevo." };
        }
      }
      aviso = { id: ++idAviso, ok: d.ok, mensaje: d.mensaje, deshacer: false };
      if (!d.ok) {
        avisar();
        return d;
      }
      // Lo de antes ya no se deshace (el estado cambió debajo de la foto).
      fotoPrevia = null;
      fotoDesde = null;
      cambio();
      return d;
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
      // El reloj de la demo vuelve a las 19:10 (si se lo había corrido con −30′/+30′).
      ahora = { fecha: hoyDemo, min: MINUTO_DEMO };
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
