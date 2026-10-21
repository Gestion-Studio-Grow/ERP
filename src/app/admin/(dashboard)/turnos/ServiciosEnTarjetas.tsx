"use client";

// Los servicios del mostrador como tarjetas: nombre, duración y precio, y quién lo hace. Un toque en
// la profesional elige las dos cosas de una (la clienta está enfrente: menos pasos que dos listas).
// Las listas de abajo siguen siendo la fuente del formulario; esto sólo las completa.

import { fmtMoneyARS, cn } from "@/components/ui";
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";

type Servicio = { id: string; name: string; durationMin: number; price: number; residentPrice: number | null };
type Profesional = { id: string; name: string; services: Servicio[] };

export function serviciosConQuienLosHace(profesionales: Profesional[]) {
  const porId = new Map<string, { servicio: Servicio; quienes: { id: string; name: string }[] }>();
  for (const p of profesionales) {
    for (const s of p.services) {
      const fila = porId.get(s.id) ?? { servicio: s, quienes: [] };
      fila.quienes.push({ id: p.id, name: p.name });
      porId.set(s.id, fila);
    }
  }
  return [...porId.values()].sort((a, b) => a.servicio.name.localeCompare(b.servicio.name, "es"));
}

export default function ServiciosEnTarjetas({
  profesionales,
  profesionalElegido,
  servicioElegido,
  vecina = false,
  onElegir,
}: {
  profesionales: Profesional[];
  profesionalElegido: string;
  servicioElegido: string;
  /** La clienta está tildada «de la zona»: el precio es el local, si el servicio lo tiene. */
  vecina?: boolean;
  onElegir: (profesionalId: string, servicioId: string) => void;
}) {
  const filas = serviciosConQuienLosHace(profesionales);
  if (filas.length === 0) return null;
  return (
    <section aria-labelledby="servicios-tarjetas" className="space-y-2">
      <h3 id="servicios-tarjetas" className="text-sm font-medium text-muted">
        Elegí el servicio y quién atiende
      </h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filas.map(({ servicio, quienes }) => {
          const elegido = servicio.id === servicioElegido;
          // El mismo precio que se congela al reservar (y que se cobra): con «de la zona», el local.
          const { priceAtBooking, isResidentBooking } = precioCongeladoDeReserva(servicio, vecina);
          return (
            <li
              key={servicio.id}
              data-ui="card"
              data-servicio={servicio.id}
              className={cn(
                "space-y-2 rounded-md border p-3",
                // `!`: la piel (renglon.css, sin capa) pinta borde y fondo de toda tarjeta.
                elegido ? "!border-accent !bg-accent-soft" : "border-line bg-surface-raised",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 font-medium text-strong">{servicio.name}</p>
                <p className="shrink-0 tabular-nums text-strong">{fmtMoneyARS(priceAtBooking, 0)}</p>
              </div>
              <p className="text-xs text-muted">
                {servicio.durationMin} min{isResidentBooking ? " · precio local" : ""}
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Quién hace ${servicio.name}`}>
                {quienes.map((q) => {
                  const esta = elegido && q.id === profesionalElegido;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      aria-pressed={esta}
                      onClick={() => onElegir(q.id, servicio.id)}
                      className={cn("chip-btn h-11 px-3 text-sm", esta && "!border-accent !bg-accent !text-on-accent")}
                    >
                      {q.name}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
