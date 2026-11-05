import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { hrefHistoria, leerFiltrosDeHistoria } from "@/lib/clientes/historia-core";

// La historia de la clienta desde su ficha. Vive en /admin/historias/[id] (app Historias, que pide
// agenda:read): así la abre también la profesional, que no tiene la app de Clientes. Esta ruta es
// la de la ficha, para quien ya tiene Clientes; lleva a la misma pantalla con los mismos filtros.
export default async function HistoriaDesdeLaFicha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireApp("clientes");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  redirect(hrefHistoria(id, leerFiltrosDeHistoria(sp)));
}
