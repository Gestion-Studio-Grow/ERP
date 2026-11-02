import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { CAMPOS_BRIEF, esDemorada, ESTADO_DATO_LABEL, esperaSinRespuestaHumana, textoDeEspera, type BriefConsulta } from "@/lib/proyectos/consulta-core";
import { mailConectado } from "@/lib/notifications";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { tarjeta } from "../../_vista";
import { cuando, ENVIO_LABEL, ESTADO_LABEL, INTENCION_LABEL } from "../_etiquetas";
import { PanelConsulta } from "./PanelConsulta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consulta" };
export const maxDuration = 120;

export default async function DetalleDeConsulta({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("pipeline");
  const { id } = await params;
  const c = await prisma.consulta.findFirst({ where: { id: id.slice(0, 40), tenantId: a.tenantId }, include: { mensajes: { orderBy: { createdAt: "asc" }, take: 100 } } });
  if (!c) notFound();
  const brief = (c.brief ?? {}) as BriefConsulta;
  const edita = puede(a, "pipeline", "editar");
  const esperaMs = ["NUEVA", "PARA_PERSONA", "EN_CALIFICACION"].includes(c.estado) ? esperaSinRespuestaHumana(c.mensajes, new Date()) : null;
  const antes = c.email || c.telefono
    ? await prisma.consulta.count({ where: { tenantId: a.tenantId, id: { not: c.id }, OR: [...(c.email ? [{ email: c.email }] : []), ...(c.telefono ? [{ telefono: c.telefono }] : [])] } })
    : 0;
  const borradores = c.mensajes.filter((m) => m.direccion === "SALIENTE" && m.envio === "BORRADOR");

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-5">
      <header className="grid gap-2">
        <Link href="/admin/proyectos/consultas" className={cn(buttonClasses("ghost", "md"), "min-h-11 justify-self-start")}>← Consultas</Link>
        <h1 className="text-2xl font-bold text-strong">{c.empresa || c.nombre || "Contacto sin nombre"}</h1>
        <p className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-surface-raised px-2 py-0.5 font-medium text-strong">{ESTADO_LABEL[c.estado] ?? c.estado}</span>
          <span className={cn("rounded-full px-2 py-0.5 font-medium", c.intencion === "ESCALAR" ? "bg-danger text-on-accent" : "bg-surface-raised text-strong")}>{INTENCION_LABEL[c.intencion] ?? c.intencion}</span>
          <span className="rounded-full bg-surface-raised px-2 py-0.5 text-muted">{c.canal.toLowerCase()}</span>
        </p>
        {esperaMs !== null && (
          <p role="note" className={cn("rounded-lg border p-2 text-sm font-medium", esDemorada(esperaMs) ? "border-danger text-danger" : "border-line text-strong")}>
            Espera a una persona {textoDeEspera(esperaMs)}.{esDemorada(esperaMs) ? " Ya pasaron las 4 horas sin respuesta." : ""}
          </p>
        )}
        {antes > 0 && <p role="note" className="rounded-lg border border-line p-2 text-sm text-strong">Ya consultó {antes === 1 ? "otra vez" : `${antes} veces más`} con este mismo contacto.</p>}
        {c.motivos.length > 0 && <p role="note" className="rounded-lg border border-danger p-2 text-sm text-danger">Por qué hay que atenderla: {c.motivos.join(", ")}.</p>}
      </header>

      <section aria-label="Contacto" className={cn(tarjeta, "grid gap-1 text-sm text-strong sm:grid-cols-3")}>
        <p><span className="text-muted">Nombre: </span>{c.nombre || "—"}</p>
        <p><span className="text-muted">Mail: </span>{c.email ? <a className="underline" href={`mailto:${c.email}`}>{c.email}</a> : "—"}</p>
        <p><span className="text-muted">WhatsApp: </span>{c.telefono ? <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${c.telefono}`}>+{c.telefono}</a> : "—"}</p>
      </section>

      <section aria-label="Brief" className={tarjeta}>
        <h2 className="mb-2 font-semibold text-strong">Lo que se sabe del pedido</h2>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          {CAMPOS_BRIEF.map((campo) => {
            const d = brief[campo.clave];
            const estado = d?.estado ?? "PENDIENTE";
            return (
              <div key={campo.clave} className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-line px-3 py-2">
                <dt className="font-medium text-strong">{campo.etiqueta}</dt>
                <dd className={cn(estado === "PENDIENTE" ? "text-danger" : "text-strong")}>
                  {d?.valor ? `${d.valor} · ` : ""}
                  <span className="text-xs text-muted">{ESTADO_DATO_LABEL[estado]}{campo.indispensable && estado === "PENDIENTE" ? " (indispensable)" : ""}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section aria-label="Conversación" className="grid gap-2">
        <h2 className="font-semibold text-strong">Conversación</h2>
        <ol className="grid gap-2">
          {c.mensajes.filter((m) => m.envio !== "BORRADOR" && m.envio !== "DESCARTADO").map((m) => (
            <li key={m.id} className={cn("grid gap-1 rounded-2xl border p-3 text-sm", m.direccion === "ENTRANTE" ? "border-line bg-surface-raised" : "border-accent")}>
              <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span className="font-semibold text-strong">{m.direccion === "ENTRANTE" ? "Cliente" : m.origen === "PLANTILLA" ? "Respuesta automática" : m.autor ? `Equipo · ${m.autor}` : "Equipo"}</span>
                <span>{cuando.format(m.createdAt)}</span>
              </span>
              <span className="whitespace-pre-line text-strong">{m.texto}</span>
              {m.direccion === "SALIENTE" && ENVIO_LABEL[m.envio] && <span className="text-xs text-muted">{ENVIO_LABEL[m.envio]}</span>}
            </li>
          ))}
        </ol>
      </section>

      {edita ? (
        <PanelConsulta
          id={c.id}
          estado={c.estado}
          proyectoId={c.proyectoId}
          puedeUsarIA={puede(a, "ia", "editar")}
          tieneMail={mailConectado() && !!c.email}
          borradores={borradores.map((b) => ({ id: b.id, texto: b.texto, problemas: b.problemas }))}
        />
      ) : (
        <p className="text-sm text-muted">Tu rol puede ver las consultas pero no responderlas.</p>
      )}
    </main>
  );
}
