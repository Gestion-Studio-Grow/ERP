"use client";

// ============================================================================
// SELECCIONAR DEL ALMACÉN — cada pantalla toma lo suyo y sólo se repinta si eso cambió.
// ============================================================================
//
// `useSyncExternalStore` sobre el almacén (almacen.ts) con una SELECCIÓN y una regla para reusar lo
// anterior (`compartir`): la grilla reusa las celdas que no cambiaron (`compartirAgenda`) y la
// cuenta del turno, la vista entera si su firma es la misma. Si lo seleccionado es el MISMO objeto
// que antes, React no repinta ese componente aunque el almacén haya cambiado.
//
// La selección se calcula a lo sumo una vez por versión del almacén (queda en el caché de la
// instancia), así que `getSnapshot` es estable como pide React.

import { useRef, useSyncExternalStore } from "react";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen, EstadoDelGuardado, Operador } from "./almacen";

type Cache<T> = { version: number; seleccionar: (e: EstadoClub, a: Ahora) => T; valor: T };

export function useSeleccion<T>(
  almacen: Almacen,
  seleccionar: (estado: EstadoClub, ahora: Ahora) => T,
  compartir: (previa: T | undefined, nueva: T) => T,
): T {
  const cache = useRef<Cache<T> | null>(null);
  const leer = (): T => {
    const version = almacen.version();
    const c = cache.current;
    if (c && c.version === version && c.seleccionar === seleccionar) return c.valor;
    const valor = compartir(c?.valor, seleccionar(almacen.estado(), almacen.ahora()));
    cache.current = { version, seleccionar, valor };
    return valor;
  };
  return useSyncExternalStore(almacen.suscribir, leer, leer);
}

/** Reusa la vista anterior si su firma no cambió. */
export function porFirma<T extends { firma: string } | null>(previa: T | undefined, nueva: T): T {
  return previa !== undefined && previa !== null && nueva !== null && previa.firma === nueva.firma ? previa : nueva;
}

/**
 * Quién opera, por su propio canal (`suscribirOperador`): cambiar de operador repinta SÓLO a quien lo muestra, no a
 * las pantallas del estado (la agenda no se entera).
 */
export function useOperador(almacen: Almacen): Operador | null {
  return useSyncExternalStore(almacen.suscribirOperador, almacen.operador, almacen.operador);
}

/** Cómo va el guardado y la jornada, por su propio canal (`suscribirGuardado`): lo usa la cinta de arriba. */
export function useEstadoDelGuardado(almacen: Almacen): EstadoDelGuardado {
  return useSyncExternalStore(almacen.suscribirGuardado, almacen.estadoDelGuardado, almacen.estadoDelGuardado);
}
