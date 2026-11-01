import { cn } from "./cn";

// Estado vacío estructurado (ícono + título + bajada + acción) — ADR-059 D6.
// Hoy el backoffice resuelve "no hay nada" con un <p className="text-muted">
// suelto por pantalla (ajustes/compras/catálogo/reportes…); este primitivo
// no los reemplaza en este PR (adopción es aparte, PR-3/M2), pero les da un
// techo consistente para cuando una pantalla necesite algo más que una
// línea: por qué está vacío y qué hacer al respecto.
//
// Token-driven (D4): padding/gaps respiran con la densidad. Escala nivel 5
// (29/10/2026): la tarjeta sube un escalón (superficie elevada, no hundida), el
// ícono crece a 56 px sobre el acento suave del negocio, el título nombra la causa
// en 19 px y la acción (`action`, ej. un <Button>) es la salida obvia. Argentino:
// título en criollo claro, nunca "No data available".

export type EmptyStateProps = {
  /** Ícono decorativo (ej. un <svg>…</svg>), oculto a lectores de pantalla. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Acción de salida (ej. un <Button>/<ButtonLink> "Cargar el primero"). */
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-ui="vacio"
      className={cn(
        "flex flex-col items-center gap-sm rounded-xl border border-line",
        "bg-surface-raised px-md py-2xl text-center shadow-xs",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          data-parte="icono"
          className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink [&_svg]:size-7"
        >
          {icon}
        </span>
      )}
      <div className="max-w-md">
        <p data-parte="titulo" className="text-lg font-semibold tracking-[-0.015em] text-strong [text-wrap:balance]">{title}</p>
        {description && <p className="mt-2xs text-base leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="mt-xs">{action}</div>}
    </div>
  );
}
