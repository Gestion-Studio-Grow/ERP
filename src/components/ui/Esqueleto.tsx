import { cn } from "./cn";

// Esqueletos de carga: UN solo dibujo para "esto está llegando", igual en todas las pantallas.
// Antes cada una armaba el suyo (el loading del panel con `motion-safe:animate-pulse`, el número
// del Inicio con `animate-pulse` a secas, que ignoraba "reducir movimiento"). Ahora:
//   · `Esqueleto`: la barra gris. Pulsa sólo si la persona no pidió menos movimiento.
//   · `KpiTileEsqueleto`: un KpiTile que todavía no llegó, con su misma caja y sus mismas medidas
//     (label, chip, valor, bajada), así la grilla no salta al llegar el número.
//   · `NumeroEsqueleto`: el número de un botón del Inicio, del mismo alto que el que llega.
// Son decorativos (aria-hidden): quien los usa anuncia la carga una vez, con texto, no por barra.

export function Esqueleto({ className }: { className?: string }) {
  return <span aria-hidden data-ui="esqueleto" className={cn("block rounded bg-surface-sunken motion-safe:animate-pulse", className)} />;
}

export function KpiTileEsqueleto({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("h-full rounded-xl border border-line bg-surface-raised p-md shadow-xs", className)}>
      <div className="flex items-center justify-between">
        <Esqueleto className="h-3 w-24" />
        <Esqueleto className="size-8 rounded-lg" />
      </div>
      <Esqueleto className="mt-[7px] h-7 w-28" />
      <Esqueleto className="mt-[7px] h-3 w-32" />
    </div>
  );
}

/** El número de un botón del Inicio mientras llega: mismo borde, mismo alto (valor + bajada). */
export function NumeroEsqueleto({ className }: { className?: string }) {
  return (
    <span className={cn("mt-auto block border-t border-line pt-3", className)} aria-hidden>
      <Esqueleto className="h-7 w-16" />
      <Esqueleto className="mt-1.5 h-3.5 w-28" />
    </span>
  );
}
