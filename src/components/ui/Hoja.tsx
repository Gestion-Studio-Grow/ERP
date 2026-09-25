"use client";

// HOJA — lo que sube desde abajo en el celular (y flota abajo al centro en la PC): elegir un
// cliente, ver el detalle de un cobro, confirmar algo con más de un dato. Es un <dialog> NATIVO
// abierto con `showModal()`: el foco queda adentro, Escape cierra, lo de atrás queda inerte y el
// lector de pantalla lo anuncia como diálogo. Sin librerías.
//
// Se cierra con Escape, tocando afuera (el fondo), con la «X», o ARRASTRANDO la manija hacia
// abajo (más de 96 px). La entrada (resorte) y la salida son CSS (`@starting-style` en la piel).
// Controlada: `abierta` + `onCerrar`.

import { useEffect, useId, useRef } from "react";
import { cn } from "./cn";
import { IconButton } from "./IconButton";
import { Icono } from "./Icono";

export type HojaProps = {
  abierta: boolean;
  onCerrar: () => void;
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  children: React.ReactNode;
  /** Las acciones de abajo (la principal, a mano del pulgar). */
  pie?: React.ReactNode;
  className?: string;
};

const ARRASTRE_CIERRA = 96;

export function Hoja({ abierta, onCerrar, titulo, descripcion, children, pie, className }: HojaProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const arrastre = useRef<{ y0: number; dy: number } | null>(null);
  const idTitulo = useId();
  const idDesc = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);

  const mover = (dy: number) => {
    const d = ref.current;
    if (d) d.style.translate = dy > 0 ? `0 ${dy}px` : "";
  };

  return (
    <dialog
      ref={ref}
      data-ui="hoja"
      aria-labelledby={idTitulo}
      aria-describedby={descripcion ? idDesc : undefined}
      onClose={onCerrar}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onClick={(e) => {
        // Un toque en el fondo (fuera de la caja) llega con el propio <dialog> como destino.
        if (e.target === e.currentTarget) onCerrar();
      }}
      className={cn("m-auto mb-0 w-full max-w-lg rounded-t-2xl bg-surface-raised p-0 text-body shadow-overlay backdrop:bg-black/40", className)}
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div
          className="flex cursor-grab touch-none justify-center pb-1 pt-2.5"
          onPointerDown={(e) => {
            arrastre.current = { y0: e.clientY, dy: 0 };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!arrastre.current) return;
            arrastre.current.dy = e.clientY - arrastre.current.y0;
            mover(arrastre.current.dy);
          }}
          onPointerUp={() => {
            const dy = arrastre.current?.dy ?? 0;
            arrastre.current = null;
            mover(0);
            if (dy > ARRASTRE_CIERRA) onCerrar();
          }}
          onPointerCancel={() => {
            arrastre.current = null;
            mover(0);
          }}
        >
          <span data-parte="manija" aria-hidden className="block h-1.5 w-10 rounded-full bg-line-strong" />
        </div>
        <header className="flex items-start gap-3 px-5 pb-2">
          <div className="min-w-0 flex-1 pt-2">
            <h2 id={idTitulo} className="text-lg font-semibold text-strong">
              {titulo}
            </h2>
            {descripcion && (
              <p id={idDesc} className="mt-0.5 text-sm text-muted">
                {descripcion}
              </p>
            )}
          </div>
          <IconButton etiqueta="Cerrar" icono={<Icono nombre="cerrar" />} onClick={onCerrar} />
        </header>
        <div data-parte="cuerpo" className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {children}
        </div>
        {pie && (
          <footer data-parte="pie" className="flex flex-wrap gap-2 border-t border-line px-5 pt-3">
            {pie}
          </footer>
        )}
      </div>
    </dialog>
  );
}
