"use client";

// ============================================================================
// «MÁS» (⋯) — las acciones que no son la del paso que sigue.
// ============================================================================
//
// Un renglón ofrece UNA tecla; lo demás («Pesar y ajustar», «Anular», «Eliminar») vive acá. Es un
// `popover` NATIVO: se cierra solo tocando afuera o con Escape, sin estado. Como el anclaje CSS
// todavía no está en todos los navegadores, al abrirse se ubica debajo del botón (o arriba si no
// entra), pegado al borde derecho del botón y nunca fuera de la pantalla.
//
// Los hijos son <button> o <a>; un toque en cualquiera cierra el menú. `data-peligro` en el que
// borra o anula (se pinta en rojo; la confirmación la pide la acción, no el menú).

import { useId, useRef } from "react";
import { cn } from "./cn";

export function MenuMas({
  etiqueta = "Más acciones",
  icono,
  children,
  className,
}: {
  /** Para el lector de pantalla: «Más acciones del pedido #474». */
  etiqueta?: string;
  /** Otro dibujo para el botón (p. ej. ⇅ en «Ordenar»); por defecto, los tres puntos. */
  icono?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const ubicar = (e: React.ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== "open") return;
    const b = boton.current?.getBoundingClientRect();
    const m = menu.current;
    if (!b || !m) return;
    const alto = m.offsetHeight;
    const abajo = b.bottom + 4 + alto <= window.innerHeight;
    m.style.position = "fixed";
    m.style.inset = "auto";
    m.style.top = `${abajo ? b.bottom + 4 : Math.max(8, b.top - 4 - alto)}px`;
    m.style.right = `${Math.max(8, window.innerWidth - b.right)}px`;
  };

  return (
    <>
      <button
        ref={boton}
        type="button"
        data-ui="mas"
        popoverTarget={id}
        aria-label={etiqueta}
        className={cn("inline-grid h-11 w-11 place-items-center rounded text-muted", className)}
      >
        {icono ?? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        )}
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        data-ui="menu"
        role="menu"
        aria-label={etiqueta}
        onBeforeToggle={ubicar}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button")) menu.current?.hidePopover();
        }}
      >
        {children}
      </div>
    </>
  );
}
