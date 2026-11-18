// La orden de pago tal cual se lee y se imprime: proveedor, qué comprobantes y cuotas cancela, total y firmas.
import { fechaCorta } from "@/lib/proyectos/core";
import type { ordenParaVer } from "@/lib/proyectos/comprobantes.server";
import { tarjeta } from "../../../_vista";
import { plata } from "../../_compras";

type Orden = NonNullable<Awaited<ReturnType<typeof ordenParaVer>>>;

export function DetalleOrden({ o }: { o: Orden }) {
  return (
    <section aria-label="Detalle de la orden" className={`${tarjeta} grid gap-3 print:border-0 print:p-0`}>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted">Proveedor</dt><dd className="font-semibold text-strong">{o.supplier.name}{o.supplier.taxId ? ` · CUIT ${o.supplier.taxId}` : ""}</dd></div>
        <div><dt className="text-xs text-muted">Fecha</dt><dd className="text-strong">{fechaCorta(o.createdAt)}</dd></div>
        <div><dt className="text-xs text-muted">Se paga con</dt><dd className="text-strong">{o.medio}</dd></div>
        <div><dt className="text-xs text-muted">Pagada</dt><dd className="text-strong">{o.pagadaEl ? fechaCorta(o.pagadaEl) : "Todavía no"}</dd></div>
      </dl>
      <table className="w-full text-sm">
        <caption className="sr-only">Comprobantes que cancela</caption>
        <thead className="text-left text-xs text-muted">
          <tr><th className="py-1 pr-3 font-medium">Comprobante</th><th className="pr-3 font-medium">Cuota</th><th className="text-right font-medium">Importe</th></tr>
        </thead>
        <tbody>
          {o.lineas.map((l, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-2 pr-3">{l.comprobante.tipo} {l.comprobante.numero} · {fechaCorta(l.comprobante.fecha)}</td>
              <td className="pr-3">{l.cuota ? `${l.cuota.concepto} (vence ${fechaCorta(l.cuota.venceEl)})` : "—"}</td>
              <td className="text-right">{plata(l.importeCentavos)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-semibold text-strong"><td colSpan={2} className="py-2">Total</td><td className="text-right">{plata(o.total)}</td></tr>
        </tfoot>
      </table>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted">Hizo la orden</dt><dd className="text-strong">{o.creadaNombre}</dd></div>
        <div><dt className="text-xs text-muted">Aprobó y pagó</dt><dd className="text-strong">{o.aprobadaNombre ?? "Pendiente (otra persona de Administración)"}</dd></div>
      </dl>
    </section>
  );
}
