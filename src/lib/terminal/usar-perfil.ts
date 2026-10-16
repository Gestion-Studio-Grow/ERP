"use client";

// ============================================================================
// usePerfilDeTerminal — el perfil de ESTE equipo para ESTA persona, en el navegador.
// ============================================================================
//
// Lee y escribe el `localStorage` con la clave de `claveDelPerfil` (negocio + persona). El
// negocio y la persona los pasa el server component por props: el cliente no los adivina.
//
// Con `useSyncExternalStore`: en el servidor (y en el primer render del navegador) no hay
// almacén, así que `listo` es false y la pantalla no pinta un perfil inventado que después
// salta; cuando hidrata, lee el guardado. Se entera de los cambios de otra pestaña (evento
// `storage`) y de los propios (los avisa `guardar`).

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { claveDelPerfil, guardarPerfil, perfilDeTexto, type AlmacenDelEquipo, type PerfilDeTerminal } from "./perfil-core";

/** El `localStorage`, o `null` si no se puede usar (modo privado, bloqueado: leerlo puede tirar). */
function almacenDelEquipo(): AlmacenDelEquipo | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

// Los que escuchan en ESTA pestaña: el evento `storage` sólo llega a las OTRAS.
const oyentes = new Set<() => void>();

function suscribir(avisar: () => void): () => void {
  oyentes.add(avisar);
  window.addEventListener("storage", avisar);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

/** Sin negocio o sin persona no hay clave: el perfil vive sólo en memoria (el de fábrica). */
function claveSegura(tenantSlug: string, userId: string): string | null {
  try {
    return claveDelPerfil(tenantSlug, userId);
  } catch {
    return null;
  }
}

export type UsoDelPerfil = {
  /** El perfil vigente (el de fábrica mientras no se leyó el almacén). */
  perfil: PerfilDeTerminal;
  /** Ya se leyó el almacén del equipo (false en el servidor y en el primer render). */
  listo: boolean;
  /** Guarda en este equipo. `false` si no se pudo (perfil inválido, almacén lleno o bloqueado). */
  guardar: (perfil: PerfilDeTerminal) => boolean;
};

export function usePerfilDeTerminal({ tenantSlug, userId }: { tenantSlug: string; userId: string }): UsoDelPerfil {
  const clave = claveSegura(tenantSlug, userId);
  // El texto guardado (un string se compara por valor: la instantánea es estable). `undefined`
  // en el servidor = todavía no se leyó.
  const crudo = useSyncExternalStore<string | null | undefined>(
    suscribir,
    () => {
      if (!clave) return null;
      try {
        return almacenDelEquipo()?.getItem(clave) ?? null;
      } catch {
        return null;
      }
    },
    () => undefined,
  );
  const perfil = useMemo(() => perfilDeTexto(crudo), [crudo]);
  const guardar = useCallback(
    (nuevo: PerfilDeTerminal) => {
      if (!clave) return false;
      const ok = guardarPerfil(almacenDelEquipo(), clave, nuevo);
      if (ok) for (const avisar of oyentes) avisar();
      return ok;
    },
    [clave],
  );
  return { perfil, listo: crudo !== undefined, guardar };
}
