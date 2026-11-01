import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { fechaCorta } from "@/lib/proyectos/core";
import { estadoDeVersion, leerRevision, linkSeguro, numerarPuntos, revisionVigente, srcDeImagen } from "@/lib/proyectos/diseno-core";
import { exigirVer, proyectoVisible, puede } from "@/lib/proyectos/gestion.server";
import { VisorVersion } from "../../../_diseno-visor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Versión de la pieza" };

export default async function PaginaVersion({ params }: { params: Promise<{ versionId: string }> }) {
  await requireApp("gestion-diseno");
  const a = await exigirVer("diseno");
  const { versionId } = await params;
  const v = await prisma.proyectoEntregableVersion.findFirst({
    where: { id: versionId, tenantId: a.tenantId },
    select: {
      id: true,
      numero: true,
      estado: true,
      url: true,
      nota: true,
      subidoPor: true,
      createdAt: true,
      entregable: { select: { id: true, nombre: true, proyectoId: true, proyecto: { select: { nombre: true } }, versiones: { orderBy: { numero: "desc" }, select: { id: true, numero: true } } } },
      comentarios: { orderBy: { createdAt: "asc" }, select: { id: true, x: true, y: true, autor: true, texto: true, resueltoEl: true, createdAt: true } },
    },
  });
  if (!v || !(await proyectoVisible(a, v.entregable.proyectoId))) notFound();
  const numeros = numerarPuntos(v.comentarios);
  const comentarios = v.comentarios.map((c) => {
    const r = leerRevision(c.texto);
    return { id: c.id, numero: numeros.get(c.id) ?? null, x: c.x, y: c.y, autor: c.autor, fecha: fechaCorta(c.createdAt), texto: r.nota, resuelto: !!c.resueltoEl, revision: r.tipo };
  });
  const estado = estadoDeVersion(v.estado, revisionVigente(v.comentarios));
  const volver = `/admin/proyectos/${v.entregable.proyectoId}?tab=diseno&sub=versiones`;
  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-5">
      <Link href={volver} className="inline-flex min-h-11 items-center text-sm underline">← {v.entregable.proyecto.nombre}</Link>
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-bold text-strong">{v.entregable.nombre} · v{v.numero}</h1>
          <Badge tone={/Aprobada/.test(estado) ? "success" : /[Cc]ambios/.test(estado) ? "danger" : "neutral"}>{estado}</Badge>
        </div>
        <p className="text-sm text-muted">{[v.subidoPor, fechaCorta(v.createdAt)].filter(Boolean).join(" · ")}</p>
        {v.nota && <p className="mt-1 break-words text-sm">{v.nota}</p>}
        {v.entregable.versiones.length > 1 && (
          <nav aria-label="Otras versiones" className="mt-2 flex flex-wrap gap-1">
            {v.entregable.versiones.map((o) => (
              <Link key={o.id} href={`/admin/proyectos/diseno/version/${o.id}`} aria-current={o.id === v.id ? "page" : undefined} className={o.id === v.id ? "inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm text-on-accent" : "inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm text-strong"}>v{o.numero}</Link>
            ))}
          </nav>
        )}
      </header>
      <VisorVersion
        versionId={v.id}
        src={v.url ? null : srcDeImagen(v.id)}
        alt={`${v.entregable.nombre}, versión ${v.numero}`}
        link={linkSeguro(v.url)}
        comentarios={comentarios}
        puedeEditar={puede(a, "diseno", "editar")}
      />
    </main>
  );
}
