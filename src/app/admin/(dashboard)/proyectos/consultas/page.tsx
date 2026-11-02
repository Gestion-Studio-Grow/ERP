import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { tarjeta } from "../_vista";
import { cuando, ESTADO_LABEL, INTENCION_LABEL } from "./_etiquetas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consultas" };

const FILTROS = [["", "Para atender"], ["PARA_PERSONA", "Para una persona"], ["EN_CALIFICACION", "Se está calificando"], ["CONVERTIDA", "Ya son proyectos"], ["DESCARTADA", "Descartadas"], ["TODAS", "Todas"]] as const;

// La bandeja de consultas de potenciales clientes: lo que llega por el formulario, el mail o WhatsApp y hoy se pierde si nadie lo ve.
export default async function BandejaDeConsultas({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("pipeline");
  const { estado = "" } = await searchParams;
  const filtro = FILTROS.some(([k]) => k === estado) ? estado : "";
  const where = filtro === "TODAS" ? {} : filtro ? { estado: filtro } : { estado: { in: ["NUEVA", "PARA_PERSONA", "EN_CALIFICACION"] } };
  const [consultas, porAtender] = await Promise.all([
    prisma.consulta.findMany({ where: { tenantId: a.tenantId, ...where }, orderBy: { ultimaActividad: "desc" }, take: 100, select: { id: true, canal: true, nombre: true, empresa: true, email: true, telefono: true, estado: true, intencion: true, ultimaActividad: true, mensajes: { orderBy: { createdAt: "asc" }, take: 1, select: { texto: true } } } }),
    prisma.consulta.count({ where: { tenantId: a.tenantId, estado: { in: ["NUEVA", "PARA_PERSONA"] } } }),
  ]);

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-strong">Consultas</h1>
          <p className="text-sm text-muted" aria-live="polite">{porAtender === 0 ? "No hay consultas esperando a una persona." : porAtender === 1 ? "1 consulta espera a una persona." : `${porAtender} consultas esperan a una persona.`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/consulta" target="_blank" className={buttonClasses("outline", "md")}>Ver el formulario público</Link>
          <Link href="/admin/proyectos" className={buttonClasses("ghost", "md")}>← Proyectos</Link>
        </div>
      </header>

      <nav aria-label="Filtrar consultas" className="flex flex-wrap gap-2">
        {FILTROS.map(([k, label]) => (
          <Link key={k} href={k ? `/admin/proyectos/consultas?estado=${k}` : "/admin/proyectos/consultas"} aria-current={filtro === k ? "page" : undefined} className={cn("min-h-11 rounded-lg px-3 py-2 text-sm font-medium", filtro === k ? "bg-accent text-on-accent" : "bg-surface-raised text-strong")}>
            {label}
          </Link>
        ))}
      </nav>

      {consultas.length === 0 ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>No hay consultas en esta vista. Las que lleguen por el formulario público aparecen acá.</p>
      ) : (
        <ul className="grid gap-2">
          {consultas.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/proyectos/consultas/${c.id}`} className={cn(tarjeta, "grid gap-1 hover:border-accent", c.intencion === "ESCALAR" && "border-danger")}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-strong">{c.empresa || c.nombre || "Contacto sin nombre"}{c.empresa && c.nombre ? ` · ${c.nombre}` : ""}</span>
                  <span className="text-xs text-muted">{cuando.format(c.ultimaActividad)}</span>
                </span>
                <span className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 font-medium text-strong">{ESTADO_LABEL[c.estado] ?? c.estado}</span>
                  <span className={cn("rounded-full px-2 py-0.5 font-medium", c.intencion === "ESCALAR" ? "bg-danger text-on-accent" : "bg-surface-raised text-strong")}>{INTENCION_LABEL[c.intencion] ?? c.intencion}</span>
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-muted">{c.canal.toLowerCase()}</span>
                </span>
                <span className="line-clamp-2 text-sm text-muted">{c.mensajes[0]?.texto}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
