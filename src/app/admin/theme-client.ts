"use client";

// Mecánica CLIENTE del tema del backoffice (skin Fable) — compartida por el
// ThemeToggle de la topbar y el selector de /admin/apariencia, para que ambos
// muevan EXACTAMENTE el mismo estado (mismo storage, mismo atributo) y no haya
// dos verdades. El anti-flash del primer paint vive aparte (AdminThemeScript,
// script inline que corre antes de React).

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
