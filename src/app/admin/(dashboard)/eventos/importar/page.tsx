import { requireApp } from "@/lib/require-app";
import { notFound } from "next/navigation";
import { abrirEventos, Encabezado } from "../comun";
import { FormularioImportar } from "./FormularioImportar";

export const dynamic = "force-dynamic";

// EVENTOS Y SPONSORS · cargar lo que relevó el equipo de agentes (JSON validado, sin duplicar).
// Sólo quien tiene clients:manage; la acción vuelve a chequear todo (rol, permiso, interruptor).

export default async function ImportarEventosPage() {
  const { puedeCargar } = await abrirEventos(await requireApp("eventos-sponsors"));
  if (!puedeCargar) notFound();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Encabezado vista="importar" puedeCargar descripcion="Subí el archivo que entregó el equipo de agentes. Lo que ya estaba no se duplica." />
      <FormularioImportar />
    </main>
  );
}
