import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { proveedorParaEditar } from "@/lib/proyectos/gestion-lecturas.server";
import { tarjeta } from "../../../_vista";
import { FormProveedor } from "../../FormProveedor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar proveedor" };

export default async function EditarProveedor({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("proveedores");
  const { id } = await params;
  if (!puede(a, "proveedores", "editar")) redirect(`/admin/proyectos/proveedores/${id}`);
  const proveedor = await proveedorParaEditar(a.tenantId, id);
  if (!proveedor) notFound();
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-5">
      <Link href={`/admin/proyectos/proveedores/${id}`} className="inline-flex min-h-11 items-center text-sm text-strong underline">Volver a {proveedor.name}</Link>
      <h1 className="text-2xl font-bold text-strong">Editar proveedor</h1>
      <section className={tarjeta}><FormProveedor valores={proveedor} /></section>
    </main>
  );
}
