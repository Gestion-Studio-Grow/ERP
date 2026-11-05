// «Links para redes» (PLAN.md del link, punto 6): arriba, cuántas reservas llegaron desde redes en
// los últimos 30 días; abajo, un link por cada combinación profesional × servicio que existe.
// En el celular, una lista apilada por profesional (sin scroll horizontal); en la PC, una grilla.

import CompartirLink from "./CompartirLink";
import type { DatosCompartir, OrigenContado } from "./compartir-core";

export default function LinksParaRedes({ datos, reservas }: { datos: DatosCompartir; reservas: OrigenContado[] }) {
  const total = reservas.reduce((a, r) => a + r.cantidad, 0);
  const conServicios = datos.lista.filter((p) => p.services.length > 0);
  return (
    <section aria-labelledby="t-links-redes" data-qa="links-para-redes">
      <h2 id="t-links-redes" className="mb-1 text-lg font-medium text-strong">Links para redes</h2>
      <p className="mb-3 text-sm text-muted">
        Cada link abre la reserva con el servicio y la persona ya elegidos. Mandalo por WhatsApp o ponelo en la bio de Instagram.
      </p>

      <div className="mb-4 rounded-lg border border-line bg-surface-raised px-4 py-3" data-qa="reservas-desde-redes">
        <h3 className="text-sm font-medium text-strong">Reservas desde redes (30 días)</h3>
        {total === 0 ? (
          <p className="mt-1 text-sm text-muted">
            Todavía no llegó ninguna. Cuando alguien reserve desde un link de acá, lo vas a ver contado.
          </p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-semibold text-strong">{total}</p>
            <ul className="mt-2 grid gap-1">
              {reservas.map((r) => (
                <li key={r.origen} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-body">{r.red}</span>
                    {r.detalle && <span className="text-muted"> · {r.detalle}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-strong">{r.cantidad}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {conServicios.length === 0 ? (
        <p className="rounded-lg border border-line px-4 py-4 text-sm text-muted">
          Para tener links, asigná servicios a un profesional activo en «Asignación de servicios».
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {conServicios.map((p) => (
            <div key={p.id} className="min-w-0 rounded-lg border border-line px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="min-w-0 truncate font-medium text-strong">{p.name}</h3>
                <CompartirLink datos={datos} sel={{ professionalId: p.id }} etiqueta="Su link" />
              </div>
              <ul className="grid gap-1.5">
                {p.services.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-sm text-body">{s.name}</span>
                    <CompartirLink datos={datos} sel={{ serviceId: s.id, professionalId: p.id }} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
