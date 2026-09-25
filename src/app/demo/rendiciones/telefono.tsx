"use client";

// El teléfono de "Quien rinde". En escritorio se dibuja un marco de ~390 px con la app adentro
// (con su propio scroll y su barra de acciones abajo); en el celular el marco desaparece y la
// app ocupa la pantalla, con la barra de acciones pegada al borde inferior. Las reglas viven
// en estilos.tsx (.rendi-telefono*), así el mismo árbol sirve para los dos casos.

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { IconoVolver } from "./piezas";

export function MarcoTelefono({ children }: { children: ReactNode }) {
  return (
    // Perfil "Comercio": la app del teléfono respira más que el escritorio de Tesorería (ADR-059).
    <div className="rendi-telefono" data-density="lite">
      <div id="rendi-app" className="rendi-telefono__pantalla scroll-mt-36">
        <div className="rendi-telefono__barra" aria-hidden="true">
          <span className="tabular-nums">10:24</span>
          <span className="rendi-isla" />
          <span className="flex items-center gap-1.5">
            <svg viewBox="0 0 18 12" className="h-3 w-[18px]" fill="currentColor">
              <rect x="0" y="8" width="3" height="4" rx="1" />
              <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
              <rect x="10" y="3" width="3" height="9" rx="1" />
              <rect x="15" y="0" width="3" height="12" rx="1" />
            </svg>
            <svg viewBox="0 0 26 12" className="h-3 w-[26px]" fill="none">
              <rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke="currentColor" opacity="0.4" />
              <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" />
              <rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.4" />
            </svg>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Una pantalla de la app: título con "Volver" (opcional), contenido con scroll propio y la
 * barra de acciones abajo. Cada pantalla se monta con su `key`: al navegar, el scroll arranca
 * arriba.
 */
export function PantallaApp({
  titulo,
  onVolver,
  acciones,
  children,
}: {
  titulo?: string;
  onVolver?: () => void;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  // Al entrar a una pantalla con título, el foco va a ese título: quien navega con teclado o
  // lector de pantalla no queda "perdido" cuando el botón que tocó desaparece.
  const encabezado = useRef<HTMLHeadingElement>(null);
  const conTitulo = Boolean(titulo);
  useEffect(() => {
    if (conTitulo) encabezado.current?.focus({ preventScroll: true });
  }, [conTitulo]);

  return (
    <>
      <div className="rendi-telefono__scroll">
        {titulo ? (
          <div className="z-[4] flex min-h-12 items-center gap-1 border-b border-line bg-surface/95 px-2 py-1.5 backdrop-blur sm:sticky sm:top-0">
            {onVolver ? (
              <Button variant="ghost" size="sm" onClick={onVolver} className="px-2">
                <IconoVolver />
                Volver
              </Button>
            ) : null}
            <h3 ref={encabezado} tabIndex={-1} className="min-w-0 truncate pr-2 text-sm font-semibold text-strong outline-none">
              {titulo}
            </h3>
          </div>
        ) : null}
        <div className="space-y-5 px-4 pb-8 pt-4">{children}</div>
      </div>
      {acciones ? (
        <div className="rendi-telefono__acciones border-t border-line bg-surface-raised px-4 py-3">{acciones}</div>
      ) : null}
    </>
  );
}
