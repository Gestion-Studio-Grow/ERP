"use client";

// ============================================================================
// CAJÓN y DIÁLOGO — lo que se abre encima, sobre <dialog> nativo.
// ============================================================================
//
//   · CAJÓN: la ficha al costado (proveedor, cuenta de un cliente, detalle de un traslado). En la
//     PC, 480 px a la derecha, a toda la altura; en el celular sube desde abajo como una hoja. La
//     lista de atrás queda a la vista y en su lugar.
//   · DIÁLOGO: lo irreversible (cerrar el día, anular con motivo): centrado, 440 px, con el verbo
//     en el botón («Anular el pedido #474», nunca «Aceptar»).
//
// Los dos son <dialog> modales nativos: el foco queda adentro y vuelve a donde estaba al cerrar,
// Escape cierra, el fondo es un velo sin vidrio. Se cierran también tocando afuera. La entrada es
// CSS (`@starting-style` en la piel), sin JS de animación.

import { useEffect, useId, useRef } from "react";
import { cn } from "./cn";
import { IconButton } from "./IconButton";
import { Icono } from "./Icono";

type PropsComunes = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: React.ReactNode;
  /** Una línea debajo del título (el estado de lo que se abre). */
  descripcion?: React.ReactNode;
  children: React.ReactNode;
  /** Las teclas de abajo; la principal a la derecha. */
  pie?: React.ReactNode;
  className?: string;
};

function useDialogoModal(abierto: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return ref;
}

function Flotante({ tipo, abierto, onCerrar, titulo, descripcion, children, pie, className }: PropsComunes & { tipo: "cajon" | "dialogo" }) {
  const ref = useDialogoModal(abierto);
  const idTitulo = useId();
  const idDesc = useId();
  return (
    <dialog
      ref={ref}
      data-ui={tipo}
      aria-labelledby={idTitulo}
      aria-describedby={descripcion ? idDesc : undefined}
      onClose={onCerrar}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className={cn("bg-surface-raised p-0 text-body", className)}
    >
      <div data-parte="marco">
        <header data-parte="cabeza">
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo}>{titulo}</h2>
            {descripcion && (
              <p id={idDesc} className="mt-0.5 text-sm text-muted">
                {descripcion}
              </p>
            )}
          </div>
          <IconButton etiqueta="Cerrar" icono={<Icono nombre="cerrar" />} onClick={onCerrar} />
        </header>
        <div data-parte="cuerpo">{children}</div>
        {pie && <footer data-parte="pie">{pie}</footer>}
      </div>
    </dialog>
  );
}

/** La ficha al costado (PC) o desde abajo (celular). */
export function Cajon(props: PropsComunes) {
  return <Flotante tipo="cajon" {...props} />;
}

/** Lo irreversible: centrado, con el verbo en el botón. */
export function Dialogo(props: PropsComunes) {
  return <Flotante tipo="dialogo" {...props} />;
}
