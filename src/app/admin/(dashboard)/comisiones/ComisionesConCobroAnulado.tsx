// El aviso de la pantalla de comisiones (reports/comision-ya-pagada.ts): comisiones ya pagadas de un
// turno al que después se le anuló un cobro. Sólo avisa; sin filas no dibuja nada, y la pantalla queda
// igual que siempre.

import { fmtShortDate } from "@/lib/datetime";
import { pesosDelCobro } from "@/lib/turnos/cobro-dividido";
import { textoDelPago, type ComisionConCobroAnulado } from "@/lib/reports/comision-ya-pagada";

export default function ComisionesConCobroAnulado({ filas }: { filas: readonly ComisionConCobroAnulado[] }) {
  if (filas.length === 0) return null;
  return (
    <section role="status" className="mb-4 rounded-md border border-line-strong bg-surface-sunken p-4 text-sm text-body">
      <h3 className="font-medium text-strong">Comisiones ya pagadas con un cobro anulado después</h3>
      <p className="mt-1 text-xs text-muted">Es sólo un aviso: esos pagos siguen como están y este listado no cambia ningún importe.</p>
      <ul className="mt-2 flex flex-col gap-1">
        {filas.map((f) => (
          <li key={f.turnoId}>
            Turno del {fmtShortDate(f.inicio)} de {f.cliente}: se anularon {pesosDelCobro(f.anulado)}. {textoDelPago(f)}
          </li>
        ))}
      </ul>
    </section>
  );
}
