// «12 % más que del 06/05 al 03/08 ($ 1.234.000)»: el total del período contra el tramo de igual largo
// que termina justo antes. La cuenta y las fechas son de `report-periodo.ts`.

import { fmtMoneyARS } from "@/components/ui";
import { contraElAnterior, rangoDelAnterior, type PeriodoReporte } from "@/lib/report-periodo";

export function ContraAnterior({ actual, anterior, periodo }: { actual: number; anterior: number; periodo: PeriodoReporte }) {
  // El día 1 de «Este mes» se compararía hoy, que no terminó, contra ayer entero: un «100 % menos»
  // a la mañana no dice nada. Y sin nada cobrado todavía tampoco hay qué comparar.
  if (actual <= 0 || (periodo.dias === 1 && !periodo.cerrado)) return null;
  const rango = rangoDelAnterior(periodo);
  const c = contraElAnterior(actual, anterior);
  if (!c) return <p className="mt-1 text-xs text-muted">Sin movimientos del {rango} para comparar.</p>;
  const color = c.tono === "sube" ? "text-success" : c.tono === "baja" ? "text-danger" : "text-strong";
  return (
    <p className="mt-1 text-xs text-muted">
      <span className={`font-medium ${color}`}>{c.texto}</span> que del {rango} ({fmtMoneyARS(anterior, 0)})
    </p>
  );
}
