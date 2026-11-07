import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { Importador } from "./_importador";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar la planilla de status" };

// MIA T1: trae las oportunidades de la planilla de status sin recargarlas a mano. Primero se previsualiza; nada se
// escribe hasta confirmar (src/lib/proyectos/acciones-importar.ts).
export default async function ImportarStatus() {
  await requireApp("proyectos");
  await exigirVer("pipeline");
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <Link href="/admin/proyectos" className="inline-flex min-h-11 items-center text-sm underline">← Proyectos</Link>
      <h1 className="mb-1 text-2xl font-bold text-strong">Importar la planilla de status</h1>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Exportá la pestaña como CSV (Archivo → Descargar → CSV). La primera fila tiene que traer los títulos: cliente, proyecto, productor,
        comercial, status y fecha del evento. Primero vas a ver qué entra y qué no; nada se guarda hasta que confirmes.
      </p>
      <Importador />
    </main>
  );
}
