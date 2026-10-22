import { requireApp } from "@/lib/require-app";
import { cn, EmptyState } from "@/components/ui";
import { badgePendientes, pendientes } from "@/lib/padel/datos.server";
import { diaHumano, horaHumana, pesos } from "@/lib/padel/core";
import { BarraClases, tarjeta } from "../_vista";
import { AccionesClase } from "../_acciones";
import { MarcarLeidos } from "./MarcarLeidos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Pendientes", manifest: "/clases/app.webmanifest" };

const ICONO: Record<string, string> = { pedido: "📅", comprobante: "🧾", cancelacion: "❌", proxima: "🔁", respuesta: "💬", "link-pedido": "🔗" };

// La bandeja: lo que el profe tiene que contestar. Los pedidos del turnero, los comprobantes por
// revisar y lo que pasó en los últimos días (cancelaciones, clases que se repitieron solas).
export default async function ClasesPendientes() {
  await requireApp("padel-clases");
  const [{ pedidos, comprobantes, avisos }, numero] = await Promise.all([pendientes(), badgePendientes()]);
  const nada = pedidos.length === 0 && comprobantes.length === 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <h1 className="mb-1 text-2xl font-bold text-strong">Pendientes</h1>
      <p className="mb-4 text-sm text-muted">Lo que espera tu respuesta. Cada cosa se resuelve con un toque.</p>
      <BarraClases activa="/admin/clases/pendientes" pendientes={numero} />

      {nada && <EmptyState title="Estás al día" description="No hay pedidos ni comprobantes esperando." />}

      {pedidos.length > 0 && (
        <section className="mb-6" aria-label="Pedidos por confirmar">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-strong">Pedidos por confirmar ({pedidos.length})</h2>
          <ul className="grid gap-3">
            {pedidos.map((c) => (
              <li key={c.id} className={tarjeta} data-qa="pedido">
                <p className="text-lg font-bold capitalize text-strong">{diaHumano(c.empiezaEn)} · {horaHumana(c.empiezaEn)}</p>
                <p className="mb-3 text-sm text-muted">
                  <span className="font-semibold text-strong">{c.nombre}</span>
                  {" · "}{c.tipo === "GRUPAL" ? `grupal (${c.personas})` : "individual"}
                  {c.precio > 0 && ` · ${pesos(c.precio)}`}
                  {c.dadas > 0 ? ` · ya tomó ${c.dadas}` : " · alumno nuevo"}
                </p>
                <AccionesClase c={c} conProxima={false} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {comprobantes.length > 0 && (
        <section className="mb-6" aria-label="Comprobantes por revisar">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-strong">Comprobantes por revisar ({comprobantes.length})</h2>
          <ul className="grid gap-3">
            {comprobantes.map((c) => (
              <li key={c.id} className={tarjeta} data-qa="comprobante">
                <p className="text-base font-bold text-strong">{c.nombre} · {pesos(c.precio)}</p>
                <p className="mb-2 text-sm capitalize text-muted">Clase del {diaHumano(c.empiezaEn)} {horaHumana(c.empiezaEn)}</p>
                {c.comprobante && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.comprobante} alt={`Comprobante de ${c.nombre}`} className="mb-3 max-h-96 w-full rounded-lg border border-line object-contain" />
                )}
                {/* La foto ya está a la vista: las acciones van sin el "Ver comprobante". */}
                <AccionesClase c={{ id: c.id, estado: c.estado, pagoEstado: "EN_REVISION", nombre: c.nombre, comprobante: null, precio: c.precio }} conProxima={false} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {avisos.length > 0 && (
        <section aria-label="Últimos movimientos">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-strong">Últimos movimientos</h2>
            {avisos.some((a) => !a.leidoEl) && <MarcarLeidos />}
          </div>
          <ul className="grid gap-1.5">
            {avisos.map((a) => (
              <li key={a.id} className={cn("flex gap-2 rounded-xl border border-line px-3 py-2 text-sm", !a.leidoEl && "font-semibold text-strong")} style={!a.leidoEl ? { background: "var(--accent-soft)" } : undefined}>
                <span aria-hidden>{ICONO[a.tipo] ?? "•"}</span>
                <span className="min-w-0 flex-1">{a.texto}</span>
                <span className="shrink-0 text-xs text-muted">{horaHumana(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
