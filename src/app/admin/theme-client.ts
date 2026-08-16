"use client";

// Mecánica CLIENTE del tema del backoffice (skin Fable) — compartida por el
// ThemeToggle de la topbar y el selector de /admin/apariencia, para que ambos
// muevan EXACTAMENTE el mismo estado (mismo storage, mismo atributo) y no haya
// dos verdades. El anti-flash del primer paint vive aparte (AdminThemeScript,
// script inline que corre antes de React).

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/** Clave de localStorage del tema elegido a mano (la lee también AdminThemeScript). */
export const THEME_STORAGE_KEY = "gsg-admin-theme";

/** Tema vigente: elección manual persistida → sistema (prefers-color-scheme) → claro. */
export function resolveTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* storage bloqueado → seguimos con el sistema */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Aplica el tema a TODAS las superficies con el skin Fable (los tokens flipan solos). */
export function applyTheme(theme: Theme) {
  document
    .querySelectorAll('[data-skin="fable"]')
    .forEach((el) => el.setAttribute("data-theme", theme));
}

/** Aplica + persiste (la elección manual pisa al sistema de ahí en más). */
export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* modo incógnito / storage lleno: el cambio aplica igual, solo no persiste */
  }
}

// --- Lectura del tema como STORE EXTERNO -------------------------------------
//
// El tema no es estado de React: vive en localStorage + en el atributo del DOM, y
// lo puede cambiar otro control de otra parte de la pantalla. El toggle de la
// topbar y el selector de /admin/apariencia lo leían igual: un `useEffect` que
// llamaba `setState` al montar — un render extra en CADA pantalla del backoffice,
// sólo para saber qué ícono dibujar. Con `useSyncExternalStore` el valor llega en el
// primer render del cliente y los dos controles se mantienen sincronizados por el
// mismo evento, sin duplicar la mecánica en cada componente.

/** Evento con el que un control le avisa a los otros que el tema cambió. */
export const THEME_CHANGE_EVENT = "gsg-admin-theme-change";

function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  // Otra pestaña del mismo backoffice también cuenta.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Tema vigente, reactivo. En el server devuelve "light" — el mismo fallback que
 * manda el layout, así que el HTML inicial coincide y no hay desajuste de
 * hidratación. La pantalla nunca flashea: el color real lo pone AdminThemeScript
 * antes del primer paint; acá sólo se decide qué ícono/opción se marca.
 */
export function useAdminTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, resolveTheme, () => "light" as Theme);
}

/** Cambia el tema y le avisa a todos los controles montados. */
export function changeTheme(theme: Theme) {
  setTheme(theme);
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
}
