// Barras con los tokens del ERP, en HTML: los textos siguen legibles en un celular, cosa que un SVG escalado no garantiza.
// Cada barra lleva su valor en `title`, y las pantallas ponen al lado la tabla con los números.

import { cn } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";

/** «$ 1,2 M»: lo justo para que entre arriba de una barra. */
export function plataCorta(n: number): string {
  const a = Math.abs(n);
  const signo = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${signo}$ ${(a / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;
  if (a >= 1_000) return `${signo}$ ${(a / 1_000).toLocaleString("es-AR", { maximumFractionDigits: 0 })} mil`;
  return `${signo}$ ${Math.round(a)}`;
}

const ALTO = "h-40";

export interface SerieBarras {
  nombre: string;
  /** Clase de color de la barra. */
  clase: string;
}

/** Una o dos series por mes, lado a lado, desde el mismo cero. */
export function BarrasPorMes({ titulo, filas, series, conEtiquetas = true }: { titulo: string; filas: readonly { etiqueta: string; valores: readonly number[] }[]; series: readonly SerieBarras[]; conEtiquetas?: boolean }) {
  const max = Math.max(1, ...filas.flatMap((f) => f.valores));
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-medium text-strong">{titulo}</figcaption>
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-3 text-xs text-muted">
          {series.map((s) => (
            <li key={s.nombre} className="flex items-center gap-1"><span aria-hidden className={cn("inline-block size-2.5 rounded-sm", s.clase)} />{s.nombre}</li>
          ))}
        </ul>
      )}
      <div className={cn("flex items-stretch gap-1 border-b border-line", ALTO)}>
        {filas.map((f) => (
          <div key={f.etiqueta} className="flex min-w-0 flex-1 items-end justify-center gap-0.5">
            {f.valores.map((v, i) => (
              <div key={series[i].nombre} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" style={{ maxWidth: 28 }}>
                <div title={`${f.etiqueta} · ${series[i].nombre}: ${pesos(v)}`} className={cn("w-full rounded-t", series[i].clase)} style={{ height: v > 0 ? `max(2px, ${(v / max) * 100}%)` : 0 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {filas.map((f) => (
          <div key={f.etiqueta} className="min-w-0 flex-1 text-center text-[11px] leading-tight text-muted">
            {f.etiqueta}
            {conEtiquetas && series.length === 1 && f.valores[0] > 0 && <span className="hidden tabular-nums sm:block">{plataCorta(f.valores[0])}</span>}
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Un saldo por mes: arriba del cero en el color de acento, abajo en el de peligro, con su valor siempre a la vista. */
export function SaldoPorMes({ titulo, filas }: { titulo: string; filas: readonly { etiqueta: string; saldo: number }[] }) {
  const maxArriba = Math.max(0, ...filas.map((f) => f.saldo));
  const maxAbajo = Math.max(0, ...filas.map((f) => -f.saldo));
  const total = maxArriba + maxAbajo || 1;
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-medium text-strong">{titulo}</figcaption>
      <div className={cn("flex items-stretch gap-1", ALTO)}>
        {filas.map((f) => (
          <div key={f.etiqueta} title={`${f.etiqueta}: ${pesos(f.saldo)}`} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full flex-col items-center justify-end border-b border-line" style={{ height: `${(maxArriba / total) * 100}%` }}>
              {f.saldo > 0 && <div className="w-full max-w-7 rounded-t bg-accent" style={{ height: `max(2px, ${(f.saldo / (maxArriba || 1)) * 100}%)` }} />}
            </div>
            <div className="flex w-full flex-col items-center" style={{ height: `${(maxAbajo / total) * 100}%` }}>
              {f.saldo < 0 && <div className="w-full max-w-7 rounded-b bg-danger" style={{ height: `max(2px, ${(-f.saldo / (maxAbajo || 1)) * 100}%)` }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {filas.map((f) => (
          <div key={f.etiqueta} className="min-w-0 flex-1 text-center text-[11px] leading-tight text-muted">
            {f.etiqueta}
            <span className={cn("block tabular-nums", f.saldo < 0 ? "text-danger" : "text-strong")}>{plataCorta(f.saldo)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Barras acostadas, para listas con nombres largos: clientes, tipos de evento, etapas. */
export function BarrasAcostadas({ filas }: { filas: readonly { nombre: string; valor: number; texto: string }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <ul className="grid gap-2">
      {filas.map((f) => (
        <li key={f.nombre} className="grid gap-1">
          <div className="flex justify-between gap-2 text-sm">
            <span className="min-w-0 break-words text-strong">{f.nombre}</span>
            <span className="shrink-0 tabular-nums text-muted">{f.texto}</span>
          </div>
          <div className="h-2 rounded-full bg-surface">
            <div className="h-2 rounded-full bg-accent" style={{ width: f.valor > 0 ? `max(4px, ${(f.valor / max) * 100}%)` : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
