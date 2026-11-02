import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import FormNuevo from "./FormNuevo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo lead" };

export default async function NuevoProyecto() {
  await requireApp("proyectos");
  const a = await exigirVer("pipeline");
  if (!puede(a, "pipeline", "editar")) redirect("/admin/proyectos");
  const clientes = await prisma.client.findMany({ where: { tenantId: a.tenantId }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } });
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <Link href="/admin/proyectos" className="inline-flex min-h-11 items-center text-sm underline">← Proyectos</Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold text-strong">Nuevo lead</h1>
      <FormNuevo clientes={clientes} />
    </main>
  );
}
