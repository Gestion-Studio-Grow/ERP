import { cn } from "./cn";
import { partirCifra } from "./display-core";

// LA TIRA — el ticket que crece mientras se vende y se corta para cobrar. Cada línea entra como
// impresa (bajo la piel nueva), el borde de abajo va perforado y el total es un display.
// Presentacional, sin "use client": las líneas y los totales los arma la pantalla de venta (que
// es la que sabe de kilos, precios y descuentos); acá sólo se dibujan. `acciones` va al lado de
// cada línea (p. ej. un IconButton «Sacar»).

export type LineaTicket = {
  id: string;
  producto: string;
  /** «1,280 kg × $20.900» o «2 u × $10.900». */
  detalle: string;
  importe: number;
  acciones?: React.ReactNode;
};

export function Ticket({
  cabeza,
  lineas,
  pie,
  className,
}: {
  /** Arriba, chico: «Ticket 0247 · 12:41». */
  cabeza?: React.ReactNode;
  lineas: LineaTicket[];
  /** Lo de abajo del corte: el total, el medio de pago, el vuelto. */
  pie?: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-ui="ticket" className={cn("rounded-lg bg-surface-raised px-4 pt-3 shadow-card", className)}>
      {cabeza && (
        <p data-parte="cabeza" className="flex justify-between gap-3 pb-2 text-xs text-muted">
          {cabeza}
        </p>
      )}
      <ol className="m-0 list-none p-0">
        {lineas.map((l) => (
          <li key={l.id} data-parte="linea" className="flex items-center gap-3 border-t border-line py-2.5">
            <div className="min-w-0 flex-1">
              <p data-parte="producto" className="truncate font-medium text-strong">
                {l.producto}
              </p>
              <p data-parte="detalle" className="text-xs tabular-nums text-muted">
                {l.detalle}
              </p>
            </div>
            <p data-parte="importe" className="shrink-0 font-semibold tabular-nums text-strong">
              {partirCifra(l.importe, "plata", Number.isInteger(l.importe)).texto}
            </p>
            {l.acciones}
          </li>
        ))}
      </ol>
      {pie && (
        <div data-parte="corte" className="mt-1 border-t border-dashed border-line-strong pb-3 pt-3">
          {pie}
        </div>
      )}
    </section>
  );
}
