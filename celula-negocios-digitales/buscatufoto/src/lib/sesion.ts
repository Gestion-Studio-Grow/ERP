"use client";

import { useSyncExternalStore } from "react";

/**
 * Sesión de prueba del fotógrafo: sólo el id en localStorage. Sin contraseña (modo demostración).
 * Con backend, esto pasa a ser una cookie de sesión del servidor.
 */
const CLAVE = "btf:sesion";
const oyentes = new Set<() => void>();

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function iniciarSesion(fotografoId: string) {
  try {
    localStorage.setItem(CLAVE, fotografoId);
  } catch {
    /* modo privado: la sesión dura lo que la pestaña */
  }
  memoria = fotografoId;
  oyentes.forEach((o) => o());
}

export function cerrarSesion() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {}
  memoria = null;
  oyentes.forEach((o) => o());
}

let memoria: string | null | undefined;

function actual(): string | null {
  if (memoria === undefined) memoria = leer();
  return memoria;
}

function suscribir(o: () => void) {
  oyentes.add(o);
  const alStorage = (e: StorageEvent) => {
    if (e.key === CLAVE) {
      memoria = e.newValue;
      o();
    }
  };
  window.addEventListener("storage", alStorage);
  return () => {
    oyentes.delete(o);
    window.removeEventListener("storage", alStorage);
  };
}

/** id del fotógrafo logueado; `undefined` mientras hidrata (en el servidor), `null` si no hay sesión. */
export function useSesion(): string | null | undefined {
  return useSyncExternalStore(suscribir, actual, () => undefined);
}
