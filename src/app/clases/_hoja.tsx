"use client";

// La hoja que sube desde abajo en las pantallas PÚBLICAS («¿Quién sos?», «Pedí tu link», «Cambiar
// horario», «Dejarle un mensaje»). Es un <dialog> nativo con `showModal()`, como la Hoja del kit
// (foco adentro, Escape cierra, lo de atrás inerte, el lector la anuncia como diálogo), pero pinta
// con la piel del profe (`--padel-*`) y no carga los íconos ni el arrastre del backoffice: en la
// vidriera pública cada kilobyte de JS cuenta (LCP < 2,5 s). Controlada: `abierta` + `onCerrar`.

import { useEffect, useId, useRef, type ReactNode } from "react";
import { foco } from "./_estilos";

export function HojaPublica({
  abierta,
  onCerrar,
  titulo,
  descripcion,
  children,
  pie,
  qa,
}: {
  abierta: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  descripcion?: ReactNode;
  children: ReactNode;
  /** La acción principal, fija al pie de la hoja (a mano del pulgar, encima del teclado). */
  pie?: ReactNode;
  qa?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const idDesc = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);

  return (
    <dialog
      ref={ref}
      data-qa={qa}
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
      className="m-auto mb-0 w-full max-w-[35rem] rounded-t-[var(--radius-xl,1.5rem)] bg-[var(--padel-superficie)] p-0 text-[var(--padel-texto)] shadow-overlay backdrop:bg-black/50"
    >
      <div className="flex max-h-[88dvh] flex-col">
        <span aria-hidden className="mx-auto mt-2.5 block h-1.5 w-10 rounded-full bg-[var(--padel-linea)]" />
        <header className="flex items-start gap-3 px-5 pb-2 pt-2">
          <div className="min-w-0 flex-1 pt-1.5">
            <h2 id={idTitulo} className="text-lg font-bold">
              {titulo}
            </h2>
            {descripcion && (
              <p id={idDesc} className="mt-1 text-base text-[var(--padel-suave)]">
                {descripcion}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className={`-mr-2 inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-2xl leading-none text-[var(--padel-suave)] ${foco}`}
          >
            <span aria-hidden>×</span>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {pie && <footer className="border-t border-[var(--padel-linea)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{pie}</footer>}
      </div>
    </dialog>
  );
}
