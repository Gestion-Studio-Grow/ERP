"use client";

import { useSyncExternalStore } from "react";
import { obtenerRepo, resolverModo } from "./repo";
import { CLAVE_SESION as CLAVE, leerSesionLocal as leer } from "./repo/sesion-local";

/**
 * Sesión del fotógrafo.
 * - Demo: sólo el id en localStorage, sin contraseña.
 * - Servidor: manda la cookie HttpOnly `btf_sesion`; el id en localStorage es un recordatorio que se
 *   confirma (o se borra) una vez por pestaña con `GET /api/btf/yo`.
 */
const oyentes = new Set<() => void>();

export function iniciarSesion(fotografoId: string) {
  try {
    localStorage.setItem(CLAVE, fotografoId);
  } catch {
    /* modo privado: la sesión dura lo que la pestaña */
  }
  memoria = fotografoId;
  oyentes.forEach((o) => o());
}

function olvidar() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {}
  memoria = null;
  oyentes.forEach((o) => o());
}

/** Cierra la sesión; en modo servidor además borra la cookie (DELETE /api/btf/ingreso). */
export function cerrarSesion() {
  olvidar();
  void resolverModo().then((m) => (m === "servidor" ? obtenerRepo().salir() : undefined)).catch(() => undefined);
}

let verificada = false;

/** Modo servidor: alinea el recordatorio local con la cookie real (vencida, cerrada en otro lado, etc.). */
function verificarConServidor() {
  if (verificada || typeof window === "undefined") return;
  verificada = true;
  void resolverModo().then(async (m) => {
    if (m !== "servidor") return;
    let id: string | null;
    try {
      id = (await obtenerRepo().yo())?.id ?? null;
    } catch {
      return; // sin red: no se toca la sesión
    }
    if (id === actual()) return;
    if (id) iniciarSesion(id);
    else olvidar();
  });
}

let memoria: string | null | undefined;

function actual(): string | null {
  if (memoria === undefined) memoria = leer();
  return memoria;
}

function suscribir(o: () => void) {
  oyentes.add(o);
  verificarConServidor();
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
