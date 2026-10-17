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
// La demo es DEL DÍA: si lo guardado es de otro día, arranca una demo nueva (los turnos de ayer no
// le sirven a nadie). «Volver a la demo» la rearma desde cero.
//
// Corre sólo en el navegador: el motor guarda su contador de ids a nivel de módulo.

import { generarDemo, hidratarEstado, materializarFijos, serializarEstado, sumarDias } from "@/lib/club/motor.mjs";
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

/** Guarda la foto. Devuelve false si el navegador no deja (incógnito, sin lugar): la demo sigue en memoria. */
export function guardarDemo(guardado: Guardado | null, clave: string, estado: EstadoClub, hoy: Fecha, ahoraMs: number): boolean {
  if (!guardado) return false;
  try {
    const foto: FotoDeLaDemo = { ...serializarEstado(estado), hoy, guardado: ahoraMs };
    guardado.setItem(clave, JSON.stringify(foto));
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
  /** Vuelve el estado a como estaba antes de la última acción deshacible. */
  deshacer(): void;
  aviso(): AvisoDelClub | null;
}

export interface OpcionesAlmacen {
  hoy: Fecha;
  clave: string;
  guardado: Guardado | null;
  /** Cuánto se espera para agrupar el guardado. 0 = guardar en el acto. */
  demoraGuardadoMs?: number;
  reloj?: () => number;
  /** El rol del ERP de quien mira: decide con qué usuario del club opera la demo. */
  rol?: RolDelPanel;
}

export function crearAlmacen({ hoy, clave, guardado, demoraGuardadoMs = 400, reloj = Date.now, rol = "RECEPTION" }: OpcionesAlmacen): Almacen {
  const previo = leerDemo(guardado, clave, hoy);
  let estado = previo ?? demoDelDia(hoy);
  let retomo = previo !== null;
  const ahora: Ahora = { fecha: hoy, min: MINUTO_DEMO };
  let version = 0;
  const oyentes = new Set<() => void>();
  let pendiente: ReturnType<typeof setTimeout> | null = null;

  const escribir = () => {
    pendiente = null;
    guardarDemo(guardado, clave, estado, hoy, reloj());
  };
  const programarGuardado = () => {
    if (demoraGuardadoMs <= 0) return escribir();
    if (pendiente === null) pendiente = setTimeout(escribir, demoraGuardadoMs);
  };
  const avisar = () => {
    version++;
    for (const o of oyentes) o();
  };
  let aviso: AvisoDelClub | null = null;
  let fotoPrevia: FotoEstado | null = null;
  let mensajePrevio = "";
  let idAviso = 0;
  const quien = () => operadorDeLaDemo(estado, rol);

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
        avisar();
        programarGuardado();
      }
    },
    auth: () => quien()?.auth ?? {},
    operador: () => quien()?.usuario.nombre ?? "",
    rol: () => rol,
    aviso: () => aviso,
    ejecutar(accion, { deshacible = false } = {}) {
      const foto = deshacible ? serializarEstado(estado) : null;
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
      if (fotoPrevia) mensajePrevio = d.mensaje;
      aviso = { id: ++idAviso, ok: d.ok, mensaje: d.mensaje, deshacer: d.ok && fotoPrevia !== null };
      avisar();
      programarGuardado();
      return d;
    },
    informar(d) {
      aviso = { id: ++idAviso, ok: d.ok, mensaje: d.mensaje, deshacer: fotoPrevia !== null };
      avisar();
    },
    deshacer() {
      if (!fotoPrevia) return;
      const h = hidratarEstado(fotoPrevia);
      fotoPrevia = null;
      if (!h.ok) {
        aviso = { id: ++idAviso, ok: false, mensaje: "No se pudo deshacer.", deshacer: false };
      } else {
        estado = h.estado;
        aviso = { id: ++idAviso, ok: true, mensaje: `Listo, se deshizo: ${mensajePrevio}`, deshacer: false };
      }
      avisar();
      programarGuardado();
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
      aviso = { id: ++idAviso, ok: true, mensaje: "Listo: volviste a la demo de hoy, como recién abierta.", deshacer: false };
      avisar();
    },
    guardarYa() {
      if (pendiente === null) return;
      clearTimeout(pendiente);
      escribir();
    },
  };
}
