"use client";

// EL CANDADO DE LA BARRA del panel de casa (PanelDeCasa.tsx), como el del club de hoy: un botón con el candado que abre
// un menú corto. Adentro, lo que la app ponga (`#casa-menu`: el club, «Bloquear la pantalla») y «Salir» del ERP, que así
// no queda suelto en la barra. Se cierra con Escape, tocando afuera o eligiendo algo.

import { useEffect, useRef, useState, type ReactNode } from "react";

export const ID_MENU_DE_LA_CASA = "casa-menu";

export default function MenuDeLaCasa({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setAbierto(false);
      boton.current?.focus();
    };
    document.addEventListener("pointerdown", afuera, true);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", afuera, true);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className="relative">
      <button
        ref={boton}
        type="button"
        data-casa="enlace"
        aria-expanded={abierto}
        aria-controls={ID_MENU_DE_LA_CASA + "-lista"}
        aria-label="Bloquear o salir"
        title="Bloquear o salir"
        onClick={() => setAbierto((a) => !a)}
        className="grid size-11 place-items-center rounded-md"
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </button>
      {/* Siempre montado (oculto si está cerrado): la app pone sus opciones adentro por portal al cargar. */}
      <div
        id={ID_MENU_DE_LA_CASA + "-lista"}
        data-casa="menu"
        hidden={!abierto}
        onClick={(e) => {
          if ((e.target as Element).closest("button")) setAbierto(false);
        }}
        className="absolute right-0 top-full z-40 mt-1 flex min-w-56 flex-col gap-1 rounded-md border border-line bg-surface-raised p-1.5 text-body"
      >
        <div id={ID_MENU_DE_LA_CASA} className="flex flex-col gap-1 empty:hidden" />
        {children}
      </div>
    </div>
  );
}
