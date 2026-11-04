"use client";

/** Clave de localStorage con el id del fotógrafo logueado (en modo servidor es sólo un recordatorio; manda la cookie). */
export const CLAVE_SESION = "btf:sesion";

export function leerSesionLocal(): string | null {
  try {
    return localStorage.getItem(CLAVE_SESION);
  } catch {
    return null;
  }
}
