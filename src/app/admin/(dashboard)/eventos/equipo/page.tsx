import { requireApp } from "@/lib/require-app";
import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import { ETIQUETA_PUESTO, rangoDeFechas } from "@/lib/eventos-sponsors/core";
import { resumenDelEquipo } from "@/lib/eventos-sponsors/repo";
import { tomasDePedidos, type TomaDePedido } from "@/lib/crm-comercial/repo";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { crmComercialPrendido } from "@/cambios/interruptores";
import { abrirEventos, Encabezado, FaltaMigracion, LinkFuente, SelloVerificacion } from "../comun";
import { FormularioPedido } from "./FormularioPedido";

export const dynamic = "force-dynamic";

// EVENTOS Y SPONSORS · «Equipo»: el CRM es el equipo de agentes. Qué relevó, cuánto está verificado,
// qué hizo cada puesto, qué quedó en duda y los pedidos del negocio (entran en cola; los toma una sesión
// de GSG: acá no corre ningún modelo ni se llama a ninguna API).

const DIA = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** «Córdoba · 1 al 31 de mar de 2027», «Buenos Aires · desde 1 de mar de 2027». */
function dondeYCuando(p: { region: string | null; desde: Date | null; hasta: Date | null }): string {
  const cuando = p.desde ? (p.hasta ? rangoDeFechas(p.desde, p.hasta) : `desde ${DIA(p.desde)}`) : p.hasta ? `hasta ${DIA(p.hasta)}` : null;
  return [p.region, cuando].filter(Boolean).join(" · ");
}

const FECHA = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
const ESTADO_PEDIDO: Record<string, string> = { EN_COLA: "En cola", EN_CURSO: "En curso", HECHO: "Hecho", DESCARTADO: "Descartado" };
const QUE_HACE: Record<string, string> = {
  descubridor: "Encuentra los eventos de la región y la fecha, con su fuente.",
  identificador: "Identifica las marcas de cada evento y su rol.",
  verificador: "Abre cada fuente y confirma el dato, o lo deja en duda.",
  contactos: "Propone el canal institucional de la empresa, a aceptar por el negocio.",
  redactor: "Arma borradores de mail. Nunca envía.",
  seguidor: "Lleva el estado de cada marca.",
};

/** «Lo tomó Ana · verificador el 16 nov 10:20 · cerrado el …». Sin toma, nada. */
function textoToma(t: TomaDePedido | undefined): string | null {
  if (!t?.tomadoPor) return null;
  return [`Lo tomó ${t.tomadoPor}${t.tomadoEl ? ` el ${FECHA.format(t.tomadoEl)}` : ""}`, t.cerradoEl ? `cerrado el ${FECHA.format(t.cerradoEl)}` : null, t.notaCierre].filter(Boolean).join(" · ");
}

export default async function EquipoPage() {
  const { tenantId, puedeCargar } = await abrirEventos(await requireApp("eventos-sponsors"));
  const r = await resumenDelEquipo(tenantId);
  // GSG-CRM-011: con el CRM comercial prendido, quién tomó cada pedido y cuándo (apagado, la pantalla queda igual).
  const tomas = !r.faltaMigracion && crmComercialPrendido(await interruptoresDelNegocio()) ? await tomasDePedidos(tenantId, r.pedidos.map((p) => p.id)) : new Map<string, TomaDePedido>();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Encabezado vista="equipo" puedeCargar={puedeCargar} descripcion="El equipo de agentes que busca los eventos de una región y las marcas que van a cada uno. Acá ves qué hizo y le pedís trabajo." />
      {r.faltaMigracion ? (
        <FaltaMigracion />
      ) : (
        <div className="grid gap-8">
          <section aria-labelledby="t-resumen">
            <h2 id="t-resumen" className="sr-only">Resumen</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Eventos", r.eventos],
                ["Marcas", r.marcas],
                ["Marcas en eventos verificadas", r.participacionesPorVerificacion.confirmado],
                ["En duda o sin poder verificar", r.participacionesPorVerificacion["en duda"] + r.participacionesPorVerificacion.falla + r.eventosPorVerificacion["en duda"] + r.eventosPorVerificacion.falla],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface px-4 py-3">
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className="text-2xl font-semibold tabular-nums text-strong">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-sm text-muted">
              Eventos: {r.eventosPorVerificacion.confirmado} verificados de {r.eventos}. Marcas en eventos sin verificar todavía: {r.participacionesPorVerificacion["sin verificar"]}.{" "}
              <Link href="/admin/eventos" className="text-accent underline underline-offset-2 hover:no-underline">Ver los eventos por región</Link>
            </p>
          </section>

          <section aria-labelledby="t-puestos">
            <h2 id="t-puestos" className="mb-3 text-lg font-semibold text-strong">Qué hizo cada puesto</h2>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {r.porPuesto.map((p) => (
                <li key={p.puesto} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-strong">{ETIQUETA_PUESTO[p.puesto]}</span>
                    <span className="block text-sm text-muted">{QUE_HACE[p.puesto]}</span>
                  </span>
                  <span className="text-sm tabular-nums text-muted">
                    {p.acciones === 0 ? "Sin actividad todavía" : `${p.acciones} ${p.acciones === 1 ? "paso" : "pasos"} · último ${p.ultima ? FECHA.format(p.ultima) : "—"}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted">Los contactos y los borradores de mail todavía no se guardan en el ERP: el módulo sólo lleva eventos y marcas.</p>
          </section>

          <section aria-labelledby="t-duda">
            <h2 id="t-duda" className="mb-3 text-lg font-semibold text-strong">
              Quedó en duda <span className="text-muted tabular-nums">({r.enDuda.length})</span>
            </h2>
            {r.enDuda.length === 0 ? (
              <EmptyState title="Nada en duda" description="El Verificador confirmó lo que revisó, o todavía no revisó nada." />
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {r.enDuda.map((d, i) => (
                  <li key={`${d.eventoId}-${d.marca ?? ""}-${i}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-strong">{d.marca ?? "El evento en sí (fecha, lugar u organizador)"}</span>
                      <Link href={`/admin/eventos/${d.eventoId}`} className="block text-sm text-muted underline-offset-2 hover:underline">{d.evento}</Link>
                    </span>
                    <SelloVerificacion v={d.verificacion} />
                    {d.urlFuente && <span className="text-sm"><LinkFuente url={d.urlFuente} /></span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="t-pedidos" className="grid gap-4 lg:grid-cols-2">
            <div>
              <h2 id="t-pedidos" className="mb-3 text-lg font-semibold text-strong">Pedirle trabajo al equipo</h2>
              {puedeCargar ? (
                <FormularioPedido />
              ) : (
                <p className="text-sm text-muted">Los pedidos los hace quien administra el negocio.</p>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-base font-semibold text-strong">Pedidos <span className="text-muted tabular-nums">({r.pedidos.length})</span></h3>
              {r.pedidos.length === 0 ? (
                <p className="text-sm text-muted">Todavía no hay pedidos.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                  {r.pedidos.map((p) => (
                    <li key={p.id} className="flex flex-col gap-1 px-4 py-3">
                      <span className="break-words text-strong">{p.pedido}</span>
                      {(p.region || p.desde || p.hasta) && <span className="text-sm text-muted">{dondeYCuando(p)}</span>}
                      <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                        <Badge tone={p.estado === "HECHO" ? "success" : p.estado === "EN_CURSO" ? "info" : "neutral"}>{ESTADO_PEDIDO[p.estado] ?? p.estado}</Badge>
                        {ETIQUETA_PUESTO[p.puesto as keyof typeof ETIQUETA_PUESTO] ?? p.puesto} · {FECHA.format(p.createdAt)}
                      </span>
                      {textoToma(tomas.get(p.id)) && <span className="text-sm text-muted">{textoToma(tomas.get(p.id))}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
