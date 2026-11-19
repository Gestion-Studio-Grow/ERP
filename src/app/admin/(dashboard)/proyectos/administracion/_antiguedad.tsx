// MIA-50 T09 · O34: antigüedad de lo que falta cobrar y pagar, por tramos de días de atraso. Los tramos son el parámetro
// `antiguedad.tramos`; los importes salen de los mismos renglones que «Cuentas a cobrar» y «Cuentas a pagar» (lo que
// falta de cada cuota, en pesos de hoy), así cada tabla suma lo mismo que las cuotas pendientes de esa lista.
// No entran los renglones «Sin calendario» ni los gastos cargados sin cuota: no tienen vencimiento.

import { cn } from "@/components/ui";
import { pesos } from "@/lib/proyectos/core";
import { aPesos } from "@/lib/proyectos/gestion-core";
import { antiguedadDe, type Antiguedad } from "@/lib/proyectos/antiguedad-core";
import { valorDelNegocio } from "@/lib/proyectos/parametros/leer.server";
import { tarjeta } from "../_vista";

type Cuota = { tipo: string; monto: number; moneda: string; venceEl: Date; pagadoEl: Date | null; pendiente?: number; noSeCobra: boolean };

function Tabla({ titulo, datos }: { titulo: string; datos: Antiguedad }) {
  const id = `antiguedad-${titulo.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <section className={tarjeta} aria-labelledby={id}>
      <h2 id={id} className="mb-2 font-semibold text-strong">{titulo}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="py-1 pr-2 font-medium">Atraso</th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">Cuotas</th>
            <th scope="col" className="py-1 text-right font-medium">Importe</th>
          </tr>
        </thead>
        <tbody>
          {datos.tramos.map((t) => (
            <tr key={t.id} className={cn("border-t border-line", t.id !== "A_VENCER" && t.total > 0 && "text-danger")}>
              <th scope="row" className="py-2 pr-2 text-left font-normal">{t.etiqueta}</th>
              <td className="py-2 pr-2 text-right tabular-nums">{t.cantidad}</td>
              <td className="py-2 text-right tabular-nums">{pesos(t.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line-strong font-semibold text-strong">
            <th scope="row" className="py-2 pr-2 text-left">Total</th>
            <td className="py-2 pr-2 text-right tabular-nums">{datos.cantidad}</td>
            <td className="py-2 text-right tabular-nums">{pesos(datos.total)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

/** `verPagos`: lo que se paga es costo; el rol que no ve el costo no ve esa tabla (igual que los totales de «A pagar»). */
export async function TabAntiguedad({ tenantId, cuotas, tc, verPagos }: { tenantId: string; cuotas: readonly Cuota[]; tc: Readonly<Record<string, number>>; verPagos: boolean }) {
  const limites = await valorDelNegocio(tenantId, "antiguedad.tramos");
  const pendientes = cuotas
    .filter((c) => !c.pagadoEl && !c.noSeCobra)
    .map((c) => ({ tipo: c.tipo, venceEl: c.venceEl, importe: aPesos(c.pendiente ?? c.monto, c.moneda, tc) }));
  const { COBRO, PAGO } = antiguedadDe(pendientes, limites, new Date());
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">Lo que falta cobrar y pagar según cuántos días pasaron del vencimiento, en pesos de hoy. Los tramos se cambian en Ajustes de Proyectos.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tabla titulo="A cobrar" datos={COBRO} />
        {verPagos && <Tabla titulo="A pagar" datos={PAGO} />}
      </div>
    </div>
  );
}
