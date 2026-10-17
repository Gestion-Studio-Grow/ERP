// ============================================================================
// EL ALMACÉN DE LA DEMO DEL CLUB — el estado del motor, quién lo escucha y dónde se guarda.
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
//
// GUARDADO (modo demo): nada va a la base. La foto (`serializarEstado`, el mismo sobre v1 del
// respaldo del piloto, docs/tenants/breakpoint/FORMATO-RESPALDO.md) se guarda en ESTE equipo, en
// localStorage, con una clave por negocio y por persona: `gsg-club:<negocio>:<usuario>:v1`. Así dos
// negocios o dos personas en la misma compu no se pisan (MT: todo almacenamiento local se
// namespacea). El guardado se agrupa (no se escribe en cada toque) y se fuerza al salir.
//
// PERFORMANCE (docs/producto/PERFORMANCE-TERMINALES.md, ronda 3). Con un estado grande (un mes de jornada,
// ~4 millones de caracteres, cerca del tope de localStorage) copiar el estado entero cuesta ~300 ms en una PC
// lenta (CPU ×4) y se hacía DOS veces por acción: la foto de «Deshacer» (`serializarEstado` = `structuredClone`),
// en el toque mismo, y otra al guardar. Ahora hay UN texto del estado por versión (`textoDelEstado`):
//   · se arma con `JSON.stringify` directo (~4 veces más barato que copiar y después pasar a texto, y da el MISMO
//     texto: el estado del motor es JSON — se guarda y se retoma así — y `serializarEstado` es
//     `{ v, estado: copia, secuencia }`; almacen.test.ts lo compara carácter por carácter);
//   · se arma cuando el navegador está libre después de cada acción (`requestIdleCallback`), así la foto de
//     «Deshacer» de la acción siguiente ya está hecha y no se paga en el toque;
//   · lo usan la foto de «Deshacer», el guardado y la copia para las previas (`copia()`, ciclo-core/canchas-core).
// «Deshacer» vuelve con `hidratarEstado` (el mismo camino que retomar lo guardado). El guardado se escribe un
// rato después de la última acción, cuando el navegador está libre, y en el acto al salir (`guardarYa`).
//
// La demo es DEL DÍA: si lo guardado es de otro día, arranca una demo nueva (los turnos de ayer no
// le sirven a nadie). «Volver a la demo» la rearma desde cero.
//
// Corre sólo en el navegador: el motor guarda su contador de ids a nivel de módulo.

import { VERSION_ESTADO, generarDemo, hidratarEstado, materializarFijos, secuenciaIds, sumarDias } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha, FotoEstado, Usuario } from "@/lib/club/motor.mjs";
import type { Role } from "@/lib/capabilities";

/** La demo del día con los turnos fijos ya bajados a la semana que muestra la agenda (como el club vanilla). */
function demoDelDia(hoy: Fecha): EstadoClub {
  const e = generarDemo(hoy, MINUTO_DEMO);
  for (let d = 1; d < 7; d++) materializarFijos(e, sumarDias(hoy, d));
  return e;
}

/** El reloj de la demo: la jornada del club a las 19:10, con turnos en juego y mesas abiertas. */
export const MINUTO_DEMO = 19 * 60 + 10;

/** La clave del guardado de la demo en este equipo. Sin negocio o sin persona no hay clave «de todos». */
export function claveDeLaDemo(negocio: string, usuario: string): string {
  if (!negocio.trim() || !usuario.trim()) throw new Error("La demo del club necesita el negocio y la persona para guardar.");
  return `gsg-club:${negocio}:${usuario}:v1`;
}

/** Lo que se guarda: el sobre v1 del motor más el día de la demo y cuándo se guardó. */
export interface FotoDeLaDemo extends FotoEstado {
  hoy: Fecha;
  guardado: number;
}

/** El pedazo de `Storage` que se usa (se reemplaza en los tests). */
export type Guardado = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Lo guardado de la demo de HOY, o null (no hay, es de otro día, o no se pudo leer). Nunca tira. */
export function leerDemo(guardado: Guardado | null, clave: string, hoy: Fecha): EstadoClub | null {
  if (!guardado) return null;
  let crudo: string | null;
  try {
    crudo = guardado.getItem(clave);
  } catch {
    return null;
  }
  if (!crudo) return null;
  try {
    const foto = JSON.parse(crudo) as Partial<FotoDeLaDemo>;
    if (foto?.hoy !== hoy) return null;
    const h = hidratarEstado(foto);
    return h.ok ? h.estado : null;
  } catch {
    return null;
  }
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

/** Guarda la foto. Devuelve false si el navegador no deja (incógnito, sin lugar): la demo sigue en memoria. */
export function guardarDemo(guardado: Guardado | null, clave: string, estado: EstadoClub, hoy: Fecha, ahoraMs: number): boolean {
  if (!guardado) return false;
  try {
    return guardarTexto(guardado, clave, textoDelEstado(estado), hoy, ahoraMs);
  } catch {
    return false;
  }
}

function guardarTexto(guardado: Guardado | null, clave: string, textoEstado: string, hoy: Fecha, ahoraMs: number): boolean {
  if (!guardado) return false;
  try {
    guardado.setItem(clave, textoDeLaDemo(textoEstado, hoy, ahoraMs));
    return true;
  } catch {
    return false;
  }
}

/** El rol del ERP de quien mira (la sesión ya lo autenticó). */
export type RolDelPanel = Role;

/**
 * Quién opera el motor en la demo. En el ERP la identidad la da el LOGIN, no el PIN de 2 dígitos del piloto (que
 * no se porta: FORMATO-RESPALDO.md). Pero el motor pide un usuario del club (y su PIN para lo sensible: egreso,
 * cierre de caja), así que la demo opera con el usuario de ejemplo de ese rol: un dueño para OWNER y recepción
 * para el resto. Es SÓLO de la demo: el modo real (BP-3) ata el usuario del club al usuario del ERP.
 */
export function operadorDeLaDemo(estado: EstadoClub, rol: RolDelPanel): { usuario: Usuario; auth: Auth } | null {
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

export interface Almacen {
  /** El estado vivo. Se LEE para armar vistas; se cambia sólo con `aplicar`. */
  estado(): EstadoClub;
  ahora(): Ahora;
  version(): number;
  suscribir(alCambiar: () => void): () => void;
  /** Corre una operación del motor sobre el estado y avisa a los suscriptos. */
  aplicar<R>(accion: (estado: EstadoClub, ahora: Ahora) => R): R;
  /** Tira lo tocado y arma la demo de cero. */
  volverALaDemo(): void;
  /** Escribe ya lo pendiente (al salir de la página). */
  guardarYa(): void;
  /**
   * Una copia del estado para simular sin tocarlo (las previas de cancelar, la falta, la lluvia): sale del texto
   * del estado de esta versión (`JSON.parse`), que suele estar ya armado. Cada llamada da una copia nueva.
   */
  copia(): EstadoClub;
  /**
   * Una simulación sobre una copia (`copia()`), guardada por `clave` hasta el próximo cambio del estado: las previas
   * se calculan una vez por estado y por opción, no en cada render (copiar un estado grande cuesta).
   */
  simular<T>(clave: string, fn: (copia: EstadoClub) => T): T;
  /** ¿Lo que se ve viene de lo guardado en este equipo (y no de una demo recién armada)? */
  retomada(): boolean;
  /** Con qué usuario del club opera la demo (ver `operadorDeLaDemo`). */
  auth(): Auth;
  operador(): string;
  /** El rol del ERP de quien mira (algunas decisiones son de un dueño: perdonar una falta). */
  rol(): RolDelPanel;
  /**
   * Corre una acción de la pantalla, deja el aviso y, si salió bien y es `deshacible`, guarda la foto de antes para
   * «Deshacer» (sólo la ÚLTIMA acción, como el club vanilla con PREVIO/UNDO).
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
  hoy: Fecha;
  clave: string;
  guardado: Guardado | null;
  /** Cuánto se espera para agrupar el guardado (después, se escribe cuando el navegador está libre). 0 = guardar en el acto. */
  demoraGuardadoMs?: number;
  /** Para correr algo cuando el navegador está libre (`requestIdleCallback`); sin él, no se adelanta nada. */
  enReposo?: ((fn: () => void) => void) | null;
  reloj?: () => number;
  /** Para vencer «Deshacer» a los 6 s (se reemplaza en los tests). */
  programar?: (fn: () => void, ms: number) => unknown;
  /** El rol del ERP de quien mira: decide con qué usuario del club opera la demo. */
  rol?: RolDelPanel;
}

/** setTimeout que no retiene el proceso (en Node, para los tests); en el navegador es el de siempre. */
function programarSinRetener(fn: () => void, ms: number): unknown {
  const t = setTimeout(fn, ms) as unknown as { unref?: () => void };
  t.unref?.();
  return t;
}

/** `requestIdleCallback` del navegador (con un tope de espera), o null (Node, Safari viejo). */
function reposoDelNavegador(): ((fn: () => void) => void) | null {
  const w = typeof window !== "undefined" ? (window as Window & { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }) : null;
  return w?.requestIdleCallback ? (fn) => void w.requestIdleCallback!(fn, { timeout: 1000 }) : null;
}

export function crearAlmacen({ hoy, clave, guardado, demoraGuardadoMs = 1500, reloj = Date.now, programar = programarSinRetener, rol = "RECEPTION", enReposo = reposoDelNavegador() }: OpcionesAlmacen): Almacen {
  const previo = leerDemo(guardado, clave, hoy);
  let estado = previo ?? demoDelDia(hoy);
  let retomo = previo !== null;
  const ahora: Ahora = { fecha: hoy, min: MINUTO_DEMO };
  let version = 0;
  const oyentes = new Set<() => void>();
  let pendiente: ReturnType<typeof setTimeout> | null = null;
  // El texto del estado, armado a lo sumo una vez por cambio (`cambios` sube sólo si el estado pudo cambiar).
  let cambios = 0;
  let texto: { cambios: number; valor: string } | null = null;
  let simulaciones: { cambios: number; valores: Map<string, unknown> } = { cambios: -1, valores: new Map() };
  const textoActual = (): string => {
    if (texto?.cambios !== cambios) texto = { cambios, valor: textoDelEstado(estado) };
    return texto.valor;
  };
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

  const escribir = () => {
    pendiente = null;
    // Sin almacenamiento (incógnito) no hay nada que escribir: ni se arma el texto.
    if (!guardado) return;
    try {
      guardarTexto(guardado, clave, textoActual(), hoy, reloj());
    } catch {
      // sin texto no hay guardado: la demo sigue en memoria
    }
  };
  const programarGuardado = () => {
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
  const avisar = () => {
    version++;
    for (const o of oyentes) o();
  };
  let aviso: AvisoDelClub | null = null;
  /** La foto de antes de la última acción deshacible: el texto del estado (ver `textoActual`). */
  let fotoPrevia: string | null = null;
  let fotoDesde: number | null = null;
  let mensajePrevio = "";
  let idAviso = 0;
  const quien = () => operadorDeLaDemo(estado, rol);
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

  return {
    estado: () => estado,
    ahora: () => ahora,
    version: () => version,
    retomada: () => retomo,
    suscribir(alCambiar) {
      oyentes.add(alCambiar);
      return () => {
        oyentes.delete(alCambiar);
      };
    },
    aplicar(accion) {
      // Aunque el motor diga que no, puede haber cambiado algo antes (cobrar todo cobra de a una
      // parte y avisa si quedó un resto): se avisa siempre y las vistas deciden si cambiaron.
      try {
        return accion(estado, ahora);
      } finally {
        cambio();
      }
    },
    auth: () => quien()?.auth ?? {},
    operador: () => quien()?.usuario.nombre ?? "",
    rol: () => rol,
    aviso: () => aviso,
    ejecutar(accion, { deshacible = false } = {}) {
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
        d = accion(estado, ahora, quien()?.auth ?? {});
      } catch {
        // El motor no tira por una regla; si algo tiró igual, no se rompe la pantalla.
        d = { ok: false, mensaje: "No se pudo hacer. Probá de nuevo." };
      }
      // Sólo se deshace la ÚLTIMA acción. Si ésta no se puede deshacer, o falló (el motor puede haber cobrado una
      // parte antes de decir que no), lo de antes ya no se deshace: volver a una foto vieja pisaría lo que pasó.
      fotoPrevia = d.ok && foto ? foto : null;
      fotoDesde = fotoPrevia ? reloj() : null;
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
      aviso = { id: ++idAviso, ok: d.ok, mensaje: d.mensaje, deshacer: fotoPrevia !== null && deshacerVigente(fotoDesde, reloj()) };
      avisar();
    },
    puedeDeshacer: () => fotoPrevia !== null && deshacerVigente(fotoDesde, reloj()),
    olvidarDeshacer: () => soltarFoto(),
    deshacer() {
      if (!fotoPrevia) return;
      if (!deshacerVigente(fotoDesde, reloj())) return soltarFoto();
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
      if (pendiente !== null) clearTimeout(pendiente);
      pendiente = null;
      try {
        guardado?.removeItem(clave);
      } catch {
        // sin almacenamiento: alcanza con rearmarla en memoria
      }
      estado = demoDelDia(hoy);
      retomo = false;
      fotoPrevia = null;
      fotoDesde = null;
      aviso = { id: ++idAviso, ok: true, mensaje: "Listo: volviste a la demo de hoy, como recién abierta.", deshacer: false };
      cambios++;
      avisar();
      adelantarTexto();
    },
    guardarYa() {
      if (pendiente === null) return;
      clearTimeout(pendiente);
      escribir();
    },
    copia() {
      return (JSON.parse(textoActual()) as FotoEstado).estado;
    },
    simular(claveSim, fn) {
      if (simulaciones.cambios !== cambios) simulaciones = { cambios, valores: new Map() };
      if (simulaciones.valores.has(claveSim)) return simulaciones.valores.get(claveSim) as ReturnType<typeof fn>;
      const valor = fn((JSON.parse(textoActual()) as FotoEstado).estado);
      // Pocas por estado (las opciones de un formulario): con más, se tira la más vieja.
      if (simulaciones.valores.size >= 16) simulaciones.valores.delete(simulaciones.valores.keys().next().value!);
      simulaciones.valores.set(claveSim, valor);
      return valor;
    },
  };
}
