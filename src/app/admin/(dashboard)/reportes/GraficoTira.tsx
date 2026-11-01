// La tira: cómo vino el período, un palo por día, semana o mes. La usan las tres pantallas de Reportes
// y no calcula plata: dibuja los tramos que arma `tira-core.ts`.

import { fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { Tira, Unidad } from "./tira-core";

const money = (n: number) => fmtMoneyARS(n, 0);

export const NOMBRE_UNIDAD: Record<Unidad, { una: string; mejor: string; hueco: string }> = {
  dia: { una: "día", mejor: "Mejor día", hueco: "El palo hueco es hoy: el día todavía no terminó." },
  semana: {
    una: "semana",
    mejor: "Mejor semana",
    hueco: "Los palos huecos son semanas incompletas: la de hoy y, si el período arranca a mitad de semana, la primera.",
  },
  mes: { una: "mes", mejor: "Mejor mes", hueco: "Los palos huecos son meses incompletos: el de hoy y el primero del período." },
};

/** Un palo por tramo; los incompletos, huecos. El tope del gráfico dice cuánto vale. */
export function GraficoTira({ tira, que, cada }: { tira: Tira; que: "vendido" | "cobrado"; cada: { uno: string; varios: string } }) {
  const n = tira.tramos.length;
  const tope = Math.max(0, ...tira.tramos.map((t) => t.total));
  const paso = Math.max(1, Math.ceil(n / 6));
  const u = NOMBRE_UNIDAD[tira.unidad];
  const cuantos = (c: number) => `${fmtNumberAR(c)} ${c === 1 ? cada.uno : cada.varios}`;
  return (
    <figure className="mt-3">
      <p className="flex items-baseline justify-between text-xs text-muted">
        <span className="tabular-nums">{money(tope)}</span>
        <span>por {u.una}</span>
      </p>
      <ol
        aria-label={`Lo ${que} por ${u.una}, del más viejo al más nuevo`}
        className="mt-1 flex h-40 items-end gap-[3px] border-b border-t border-dashed border-b-line-strong border-t-line sm:h-48"
      >
        {tira.tramos.map((t) => {
          const esMejor = tira.mejor?.desde === t.desde;
          const alto = t.total > 0 ? Math.max(t.alto * 100, 1.5) : 0;
          const estado = t.enCurso ? " (en curso)" : t.parcial ? " (incompleta)" : "";
          return (
            <li key={t.desde} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${t.etiqueta}: ${money(t.total)} · ${cuantos(t.cantidad)}${estado}`}>
              <span
                aria-hidden="true"
                className={cn(
                  "mx-auto block w-4/5 max-w-12",
                  t.total <= 0 ? "" : t.parcial ? "border-2 border-b-0 border-strong" : esMejor ? "bg-accent" : "bg-strong",
                )}
                style={{ height: `${alto}%` }}
              />
              <span className="sr-only">
                {t.etiqueta}: {money(t.total)}, {cuantos(t.cantidad)}{estado}
                {esMejor ? `. ${u.mejor}.` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <div aria-hidden="true" className="mt-1 flex gap-[3px] text-[11px] text-muted">
        {tira.tramos.map((t, i) => (
          <span key={t.desde} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {i % paso === 0 || i === n - 1 ? (t.enCurso ? "hoy" : t.corta) : ""}
          </span>
        ))}
      </div>
      {tira.tramos.some((t) => t.parcial) && <figcaption className="mt-2 text-xs text-muted">{u.hueco}</figcaption>}
    </figure>
  );
}
