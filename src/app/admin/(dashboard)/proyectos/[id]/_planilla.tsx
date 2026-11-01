// La planilla de venta: rubro con subtotal, ítem, cantidad, importe. Nunca un costo. La usan la cotización y el papel.

import { pesos } from "@/lib/proyectos/core";
import type { GrupoPlanilla } from "@/lib/proyectos/ficha-core";

export function PlanillaVenta({ grupos, neto, ivaPct }: { grupos: readonly GrupoPlanilla[]; neto: number; ivaPct?: number }) {
  if (grupos.length === 0) return <p className="text-sm text-muted">Sin ítems todavía.</p>;
  const iva = ivaPct ? Math.round(neto * ivaPct) / 100 : 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 pr-2 font-medium">Detalle</th>
            <th className="pr-2 text-right font-medium">Cantidad</th>
            <th className="text-right font-medium">Importe</th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g.rubro}>
            <tr className="border-t border-line">
              <th colSpan={2} className="pt-2 text-left text-xs font-semibold uppercase tracking-wide text-strong">{g.rubro}</th>
              <td className="pt-2 text-right font-semibold text-strong tabular-nums">{pesos(g.subtotal)}</td>
            </tr>
            {g.lineas.map((l, n) => (
              <tr key={n}>
                <td className="py-0.5 pr-2">{l.descripcion}</td>
                <td className="pr-2 text-right tabular-nums">{l.cantidad === null ? "" : l.cantidad.toLocaleString("es-AR")}</td>
                <td className="text-right tabular-nums">{pesos(l.importe)}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot className="border-t-2 border-line">
          {ivaPct ? (
            <>
              <tr><th colSpan={2} className="pt-2 text-left font-medium">Neto</th><td className="pt-2 text-right tabular-nums">{pesos(neto)}</td></tr>
              <tr><th colSpan={2} className="text-left font-medium">IVA {ivaPct}%</th><td className="text-right tabular-nums">{pesos(iva)}</td></tr>
              <tr><th colSpan={2} className="text-left font-bold text-strong">Total</th><td className="text-right font-bold text-strong tabular-nums">{pesos(neto + iva)}</td></tr>
            </>
          ) : (
            <tr><th colSpan={2} className="pt-2 text-left font-bold text-strong">Total</th><td className="pt-2 text-right font-bold text-strong tabular-nums">{pesos(neto)}</td></tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
