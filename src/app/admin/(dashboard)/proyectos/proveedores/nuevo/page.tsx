import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { tarjeta } from "../../_vista";
import { FormProveedor } from "../FormProveedor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo proveedor" };

export default async function NuevoProveedor() {
  await requireApp("proyectos");
  const a = await exigirVer("proveedores");
  if (!puede(a, "proveedores", "editar")) redirect("/admin/proyectos/proveedores");
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-5">
      <Link href="/admin/proyectos/proveedores" className="inline-flex min-h-11 items-center text-sm text-strong underline">Volver a proveedores</Link>
      <h1 className="text-2xl font-bold text-strong">Nuevo proveedor</h1>
      <section className={tarjeta}><FormProveedor /></section>
    </main>
  );
}
