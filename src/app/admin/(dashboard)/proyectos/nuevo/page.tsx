import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { clientesDelNegocio } from "@/lib/proyectos/datos.server";
import FormNuevo from "./FormNuevo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo proyecto" };

export default async function NuevoProyecto() {
  await requireApp("proyectos");
  const clientes = await clientesDelNegocio();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <Link href="/admin/proyectos" className="text-sm underline">← Proyectos</Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold text-strong">Nuevo proyecto</h1>
      <FormNuevo clientes={clientes} />
    </main>
  );
}
