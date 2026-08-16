"use client";

import { useEffect } from "react";
import { applyTheme, changeTheme, resolveTheme, useAdminTheme, type Theme } from "../theme-client";

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
  // El tema se LEE del store del navegador (ver `useAdminTheme`): llega en el primer
  // render y se mantiene al día solo cuando lo cambia el selector de /admin/apariencia.
  // La PANTALLA nunca flashea — eso ya lo resolvió el script inline antes del paint.
  const theme = useAdminTheme();

  // Lo ÚNICO que queda como efecto es lo que SÍ es un efecto: RE-APLICAR el tema al
  // DOM cuando esta pantalla llegó por navegación client-side (ahí el script inline
  // del HTML inicial no vuelve a correr). No toca estado de React.
  useEffect(() => {
    applyTheme(resolveTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    changeTheme(next);
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
