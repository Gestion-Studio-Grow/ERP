import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { leerLaminas } from "@/lib/proyectos/diseno-core";
import { exigirVer, proyectoVisible } from "@/lib/proyectos/gestion.server";
import { VisorLaminas } from "../../_diseno-laminas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Presentación" };

export default async function PaginaPresentacion({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("diseno");
  const { id } = await params;
  const p = await prisma.proyectoPresentacion.findFirst({ where: { id, tenantId: a.tenantId }, select: { nombre: true, plantilla: true, laminas: true, proyectoId: true } });
  if (!p || !(await proyectoVisible(a, p.proyectoId))) notFound();
  return <VisorLaminas laminas={leerLaminas(p.laminas)} plantilla={p.plantilla} nombre={p.nombre} volverA={`/admin/proyectos/${p.proyectoId}?tab=diseno&sub=presentaciones`} />;
}
