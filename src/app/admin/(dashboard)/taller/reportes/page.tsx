import { requireApp } from "@/lib/require-app";
import { EmptyState } from "@/components/ui";
import { reportesTaller } from "@/lib/taller/datos.server";
import { pesos } from "@/lib/taller/core";
import { BarraTaller, tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taller · Reportes" };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

export default async function ReportesTallerPage() {
  await requireApp("taller");
  const r = await reportesTaller();
  const tope = Math.max(1, ...r.porMes.map((m) => m.total));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <h1 className="mb-1 text-2xl font-bold text-strong">Reportes del taller</h1>
      <p className="mb-4 text-sm text-muted">Últimos 12 meses, sobre trabajos entregados.</p>
      <BarraTaller activa="/admin/taller/reportes" conPlata />

      {r.entregadas === 0 ? (
        <EmptyState title="Todavía no hay trabajos entregados" description="Cuando entregues el primer auto, acá vas a ver cuánto facturás, tu ticket promedio y qué trabajos salen más." />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Facturado", pesos(r.facturado)],
              ["Ticket promedio", pesos(r.ticketPromedio)],
              ["Trabajos entregados", String(r.entregadas)],
              ["Presupuestos aprobados", r.tasaAprobacion == null ? "—" : `${r.tasaAprobacion} %`],
            ].map(([k, v]) => (
              <div key={k} className={tarjeta}>
                <p className="text-sm text-muted">{k}</p>
                <p className="text-xl font-bold tabular-nums text-strong sm:text-2xl">{v}</p>
              </div>
            ))}
          </div>
          {r.tasaItems != null && (
            <p className="text-sm text-muted">De cada 100 ítems que presupuestás, el cliente te aprueba {r.tasaItems}.</p>
          )}

          <section className={tarjeta} aria-label="Facturación por mes">
            <h2 className="mb-3 font-bold text-strong">Facturación por mes</h2>
            <ul className="grid grid-cols-1 gap-2 text-sm">
              {r.porMes.map((m) => (
                <li key={m.mes} className="grid grid-cols-[4rem_1fr_auto] items-center gap-2">
                  <span className="text-muted">{nombreMes(m.mes)}</span>
                  <span className="h-3 overflow-hidden rounded-full" style={{ background: "var(--bar-track)" }}>
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (m.total / tope) * 100)}%` }} />
                  </span>
                  <span className="tabular-nums text-strong">{pesos(m.total)} <span className="text-muted">({m.ordenes})</span></span>
                </li>
              ))}
            </ul>
          </section>

          <section className={tarjeta} aria-label="Trabajos más frecuentes">
            <h2 className="mb-3 font-bold text-strong">Trabajos más frecuentes</h2>
            <ol className="grid grid-cols-1 gap-1.5 text-sm">
              {r.trabajos.map(([nombre, n]) => (
                <li key={nombre} className="flex justify-between gap-3"><span>{nombre}</span><span className="tabular-nums text-muted">{n}</span></li>
              ))}
            </ol>
          </section>

          <section className={tarjeta} aria-label="Rendimiento por mecánico">
            <h2 className="mb-3 font-bold text-strong">Por mecánico</h2>
            <ul className="grid grid-cols-1 gap-1.5 text-sm">
              {r.mecanicos.map((m) => (
                <li key={m.nombre} className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-medium text-strong">{m.nombre}</span>
                  <span className="tabular-nums text-muted">
                    {m.ordenes} {m.ordenes === 1 ? "trabajo" : "trabajos"} · {pesos(m.total)} de mano de obra{m.horas > 0 && ` · ${String(m.horas).replace(".", ",")} h`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={tarjeta} aria-label="Clientes que más facturan">
            <h2 className="mb-3 font-bold text-strong">Clientes que más facturan</h2>
            <ol className="grid grid-cols-1 gap-1.5 text-sm">
              {r.clientes.map((c) => (
                <li key={c.nombre} className="flex justify-between gap-3">
                  <span>{c.nombre} <span className="text-muted">({c.ordenes})</span></span>
                  <span className="tabular-nums text-strong">{pesos(c.total)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </main>
  );
}
