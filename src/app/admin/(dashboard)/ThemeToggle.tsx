"use client";

import { useEffect, useState } from "react";
import { applyTheme, resolveTheme, setTheme as persistTheme, type Theme } from "../theme-client";

// Toggle claro/oscuro del backoffice (skin Fable, mockups aprobados por el dueño).
//
// El default lo decide el SISTEMA (prefers-color-scheme, resuelto sin flash por
// AdminThemeScript); este botón lo pisa a mano y lo persiste en localStorage.
// Mecánica compartida en ../theme-client.ts (la usa también /admin/apariencia):
// cambia el atributo `data-theme` de los contenedores `[data-skin="fable"]` y los
// tokens de globals.css flipan solos (incluido el acento del tenant, que tiene
// tono claro y tono oscuro inyectados por el layout). Sin re-render del árbol,
// sin round-trip al server: es piel, no estado de negocio.

export default function ThemeToggle() {
  // SSR arranca en "light" (mismo fallback que manda el server); al montar se
  // sincroniza con el tema real. El ícono puede corregirse un frame después del
  // primer render — la PANTALLA nunca flashea (eso ya lo resolvió el script inline).
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // Doble función: leer el tema vigente para el ícono, y RE-APLICARLO por si
    // esta pantalla llegó por navegación client-side (donde el script inline del
    // HTML inicial no vuelve a correr).
    const t = resolveTheme();
    applyTheme(t);
    setTheme(t);
    // Si otro control (el selector de /admin/apariencia) cambia el tema, este
    // botón se entera y corrige su ícono.
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("gsg-admin-theme-change", onChange);
    return () => window.removeEventListener("gsg-admin-theme-change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    persistTheme(next);
    setTheme(next);
    window.dispatchEvent(new CustomEvent<Theme>("gsg-admin-theme-change", { detail: next }));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      title={theme === "dark" ? "Pasar a tema claro" : "Pasar a tema oscuro"}
      className="grid place-items-center w-9 h-9 rounded-lg text-muted hover:text-strong hover:bg-surface-sunken transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {theme === "dark" ? (
        /* sol — estamos en oscuro, el botón ofrece volver al claro */
        <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        /* luna — estamos en claro, el botón ofrece pasar al oscuro */
        <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
