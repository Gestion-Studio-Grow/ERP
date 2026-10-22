import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { chipLinkAtributos, cn, EmptyState, Plata } from "@/components/ui";
import { badgePendientes, bandeja } from "@/lib/padel/datos.server";
import { diaHumano, horaHumana } from "@/lib/padel/core";
import { TarjetaClase } from "../_vista";
import { Cabecera } from "../_cabecera";
import { AccionesClase } from "../_acciones";
import { MarcarLeidos } from "./MarcarLeidos";
import { RevisarComprobante } from "./_comprobante";
import { SinAvisar } from "./_sin-avisar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Bandeja", manifest: "/clases/app.webmanifest" };

const ICONO: Record<string, string> = {
  pedido: "📅", comprobante: "🧾", cancelacion: "❌", proxima: "🔁", respuesta: "💬", "link-pedido": "🔗",
  cambio: "↔️", "cambio-pedido": "↔️", "no-voy": "🙋", mensaje: "✉️",
};

const SECCIONES = [
  { id: "pedidos", rotulo: "Pedidos" },
  { id: "comprobantes", rotulo: "Comprobantes" },
  { id: "avisos", rotulo: "Avisos" },
  { id: "sinAvisar", rotulo: "Sin avisar" },
] as const;
type Seccion = (typeof SECCIONES)[number]["id"];

const titulo = "mb-2 text-sm font-bold uppercase tracking-wide text-strong";

// LA BANDEJA, detrás de la campana (matias-DISENO.md §2.3 · M-067/M-076/M-085): chips Pedidos ·
// Comprobantes · Avisos · Sin avisar con su número. Sin chip elegido se ve todo, en ese orden.
// Los pedidos usan la MISMA tarjeta y los mismos botones que Hoy y Semana (M-065).
// Un comprobante para varias clases (mismo alumno, misma foto, mismo momento) es una tarjeta con
// el total: el profe lo revisa una vez.
export default async function ClasesBandeja({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requireApp("padel-clases");
  const verRaw = (await searchParams).ver;
  const ver: Seccion | null = SECCIONES.some((s) => s.id === verRaw) ? (verRaw as Seccion) : null;
  const [b, numero] = await Promise.all([bandeja(), badgePendientes()]);
  const mostrar = (s: Seccion) => ver === null || ver === s;

  const grupos = new Map<string, { ids: string[]; nombre: string; total: number; comprobante: string | null; enviadoEl: Date | null; clases: { empiezaEn: Date; precio: number }[] }>();
  for (const c of b.comprobantes) {
    const clave = `${c.token}|${c.enviadoEl?.getTime() ?? c.id}`;
    const g = grupos.get(clave) ?? { ids: [], nombre: c.nombre, total: 0, comprobante: c.comprobante, enviadoEl: c.enviadoEl, clases: [] };
    g.ids.push(c.id);
    g.total += c.precio;
    g.clases.push({ empiezaEn: c.empiezaEn, precio: c.precio });
    grupos.set(clave, g);
  }
  const nada = b.pedidos.length === 0 && b.comprobantes.length === 0 && b.contadores.avisos === 0 && b.sinAvisar.length === 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Cabecera titulo="Bandeja" detalle="Lo que espera tu respuesta. Cada cosa se resuelve con un toque." pendientes={numero} actual="pendientes" />

      <nav aria-label="Qué ver de la bandeja" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {SECCIONES.map((s) => (
          <Link
            key={s.id}
            href={ver === s.id ? "/admin/clases/pendientes" : `/admin/clases/pendientes?ver=${s.id}`}
            {...chipLinkAtributos(ver === s.id, "min-h-12 shrink-0 px-4 sm:min-h-12")}
            data-qa={`chip-${s.id}`}
          >
            {s.rotulo} <span className="tabular-nums">({s.id === "comprobantes" ? grupos.size : b.contadores[s.id]})</span>
          </Link>
        ))}
      </nav>

      {nada && <EmptyState title="Estás al día" description="No hay pedidos, comprobantes ni avisos esperando." />}

      {mostrar("pedidos") && (b.pedidos.length > 0 || ver === "pedidos") && (
        <section className="mb-6" aria-labelledby="t-pedidos">
          <h2 id="t-pedidos" className={titulo}>Pedidos por confirmar ({b.pedidos.length})</h2>
          {b.pedidos.length === 0 ? (
            <p className="text-sm text-muted">No hay pedidos esperando.</p>
          ) : (
            <ul className="grid gap-3">
              {b.pedidos.map((c) => (
                <li key={c.id}>
                  <TarjetaClase
                    estado={c.estado}
                    pago={c.pagoEstado}
                    hora={horaHumana(c.empiezaEn)}
                    nombre={c.nombre}
                    qa="pedido"
                    detalle={
                      <>
                        <span className="capitalize">{diaHumano(c.empiezaEn)}</span>
                        {" · "}
                        {c.tipo === "GRUPAL" ? `grupal (${c.personas})` : "individual"}
                        {c.precio > 0 && <> · <Plata valor={c.precio} sinCentavos /></>}
                        {c.dadas > 0 ? ` · ya tomó ${c.dadas}` : " · alumno nuevo"}
                      </>
                    }
                  >
                    <AccionesClase c={c} conProxima={false} />
                  </TarjetaClase>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {mostrar("comprobantes") && (grupos.size > 0 || ver === "comprobantes") && (
        <section className="mb-6" aria-labelledby="t-comprobantes">
          <h2 id="t-comprobantes" className={titulo}>Comprobantes por revisar ({grupos.size})</h2>
          {grupos.size === 0 ? (
            <p className="text-sm text-muted">No hay comprobantes por revisar.</p>
          ) : (
            <ul className="grid gap-3">
              {[...grupos.values()].map((g) => (
                <li key={g.ids.join(",")} className="grid gap-3 rounded-2xl border border-line bg-surface-raised p-4" data-qa="comprobante">
                  <p className="flex flex-wrap items-baseline justify-between gap-2 text-base font-bold text-strong">
                    <span>{g.nombre}</span>
                    <Plata valor={g.total} sinCentavos />
                  </p>
                  <p className="text-sm text-muted">
                    {g.clases.length === 1 ? "Clase del " : `${g.clases.length} clases: `}
                    {g.clases.map((c, i) => (
                      <span key={i} className="capitalize">
                        {i > 0 && ", "}
                        {diaHumano(c.empiezaEn)} {horaHumana(c.empiezaEn)}
                      </span>
                    ))}
                  </p>
                  {g.comprobante && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.comprobante} alt={`Comprobante que mandó ${g.nombre}`} className="max-h-96 w-full rounded-lg border border-line bg-surface-sunken object-contain" />
                  )}
                  <RevisarComprobante claseIds={g.ids} nombre={g.nombre} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {mostrar("sinAvisar") && (b.sinAvisar.length > 0 || ver === "sinAvisar") && (
        <section className="mb-6" aria-labelledby="t-sin-avisar">
          <h2 id="t-sin-avisar" className={titulo}>Sin avisar ({b.sinAvisar.length})</h2>
          <p className="mb-2 text-sm text-muted">WhatsApp que quedaron armados y no mandaste. Tocá y sale.</p>
          <SinAvisar items={b.sinAvisar.map((s) => ({ avisoId: s.avisoId, tipo: s.tipo, nombre: s.nombre, wa: s.wa, creadoEl: s.creadoEl.toISOString() }))} />
        </section>
      )}

      {mostrar("avisos") && (b.avisos.length > 0 || ver === "avisos") && (
        <section aria-labelledby="t-avisos">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="t-avisos" className="text-sm font-bold uppercase tracking-wide text-strong">Avisos de los últimos días</h2>
            {b.avisos.some((a) => !a.leidoEl) && <MarcarLeidos />}
          </div>
          {b.avisos.length === 0 ? (
            <p className="text-sm text-muted">No pasó nada en los últimos días.</p>
          ) : (
            <ul className="grid gap-1.5">
              {b.avisos.map((a) => (
                <li key={a.id} className={cn("flex gap-2 rounded-xl border border-line px-3 py-2 text-sm text-body", !a.leidoEl && "bg-accent-soft font-semibold text-strong")}>
                  <span aria-hidden>{ICONO[a.tipo] ?? "•"}</span>
                  <span className="min-w-0 flex-1">{a.texto}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{horaHumana(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
