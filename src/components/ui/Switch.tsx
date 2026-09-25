import { cn } from "./cn";

// Interruptor: un checkbox nativo con `role="switch"` (el lector dice «activado / desactivado»),
// así anda sin JavaScript y manda su `name` en un <form>. Para prender o apagar algo que surte
// efecto YA (avisar por WhatsApp, cobrar seña). Si hace falta «Guardar», es un checkbox, no esto.
// La fila entera se toca (44 px de alto): la palabra a la izquierda, la perilla a la derecha.
// Presentacional, sin "use client".

export type SwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & {
  /** Qué prende. */
  etiqueta: React.ReactNode;
  /** Qué cambia, en una línea. */
  detalle?: React.ReactNode;
};

export function Switch({ etiqueta, detalle, className, ...props }: SwitchProps) {
  return (
    <label data-ui="switch-fila" className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-3", className)}>
      <span className="min-w-0">
        <span data-parte="texto" className="block text-sm font-medium text-strong">
          {etiqueta}
        </span>
        {detalle && (
          <span data-parte="detalle" className="block text-xs text-muted">
            {detalle}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        data-ui="switch"
        className="relative h-6 w-10 shrink-0 cursor-pointer accent-[var(--accent)]"
        {...props}
      />
    </label>
  );
}
