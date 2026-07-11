import { cn } from "./cn";

// Indicador (KPI) para paneles/dashboards (ADR-059 D6). Extraído del home
// analítico del backoffice (`/admin`, S4) donde vivía duplicado como
// componente local `Kpi`: mismo look, ahora centralizado acá para que
// cualquier pantalla lo reuse sin reinventar el chip de ícono + valor.
//
// Token-driven (D4): el padding/margen respira con la densidad (`--space-*`);
// el tamaño del chip de ícono es fijo (chrome, no "aire"). Presentacional
// puro — sin `next/link` adentro: el llamador decide si envuelve en <Link>
// (igual que hacía el `Kpi` original), consistente con Card/PageHeader/
// SectionGroup. El chip usa `--accent` (marca del tenant) — no es señal de
// tier (D5 no aplica acá: un KPI no comunica perfil/edición).

export type KpiTileProps = {
  label: string;
  value: React.ReactNode;
  /** Ícono ya armado por el llamador (ej. un <svg>…</svg>), pintado dentro del chip. */
  icon?: React.ReactNode;
  /** Dato secundario chico debajo del valor (ej. "3 de 5 turnos"). */
  sub?: React.ReactNode;
  className?: string;
};

export function KpiTile({ label, value, icon, sub, className }: KpiTileProps) {
  return (
    <div
      className={cn(
        "h-full rounded-xl border border-line bg-surface-raised shadow-xs p-md",
        "transition-colors hover:border-line-strong",
        className,
      )}
    >
      {/* Spec del mockup (fix 7): label 12.5px/500 · valor 27px/700/-.03em con
          tabular-nums (los llamadores ya no necesitan envolver el valor) ·
          ritmo vertical 7px entre label/valor/sub. */}
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-medium leading-tight text-muted">{label}</p>
        {icon && (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-[7px] text-[27px] font-bold leading-tight tracking-[-0.03em] tabular-nums text-strong">{value}</p>
      {sub && <p className="mt-[7px] text-xs text-muted">{sub}</p>}
    </div>
  );
}
