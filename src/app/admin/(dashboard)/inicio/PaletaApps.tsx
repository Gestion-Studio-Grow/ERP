"use client";

// La paleta de Ctrl/⌘K: el buscador de apps encima de cualquier pantalla del panel. La abre
// y la cierra AdminShell (atajo global y botón de la barra), que además guarda dónde estaba
// el foco para devolverlo; acá sólo se dibuja el diálogo. Se cierra con Escape, tocando
// afuera, al elegir una app o cuando el foco se va a otra parte de la página.

import { useId, useRef } from "react";
import type { AppDescriptor } from "@/apps/contract";
import BuscadorApps from "./BuscadorApps";

export default function PaletaApps({
  apps,
  abierta,
  onCerrar,
}: {
  apps: readonly AppDescriptor[];
  abierta: boolean;
  /** `devolverFoco`: volver al elemento que tenía el foco antes de abrir (Escape, afuera). */
  onCerrar: (devolverFoco: boolean) => void;
}) {
  const dialogo = useRef<HTMLDivElement>(null);
  const tituloId = useId();

  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh]">
      <div className="absolute inset-0 bg-strong/40" onClick={() => onCerrar(true)} aria-hidden />
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="relative flex max-h-[80dvh] w-full max-w-lg flex-col rounded-xl border border-line bg-surface-raised p-3 shadow-overlay"
        onBlur={(e) => {
          // El foco se fue a otra parte de la página (Tab afuera): la paleta no queda abierta
          // tapando lo que la persona está usando, y el foco se queda donde lo llevó.
          const destino = e.relatedTarget as Node | null;
          if (destino && !dialogo.current?.contains(destino)) onCerrar(false);
        }}
      >
        <h2 id={tituloId} className="sr-only">
          Buscar una app
        </h2>
        <BuscadorApps
          apps={apps}
          modo="lista"
          autoFocus
          alElegir={() => onCerrar(false)}
          alEscapar={() => onCerrar(true)}
        />
        <p className="mt-2 hidden border-t border-line px-1 pt-2 text-xs text-faint sm:block">
          ↑ ↓ para moverte · Enter para abrir · Esc para cerrar
        </p>
      </div>
    </div>
  );
}
