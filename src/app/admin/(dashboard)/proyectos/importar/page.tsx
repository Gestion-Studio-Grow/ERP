import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { formulaDelNegocio } from "@/lib/proyectos/precio-capas.server";
import { Importador } from "./_importador";

export const dynamic = "force-dynamic";
// Confirmar graba en tandas cortas (acciones-importar.ts); una planilla grande tarda más que el tope por defecto.
export const maxDuration = 120;
export const metadata = { title: "Importar la planilla de status" };

// MIA T1: trae las oportunidades de la planilla de status sin recargarlas a mano. Primero se previsualiza; nada se
// escribe hasta confirmar (src/lib/proyectos/acciones-importar.ts).
export default async function ImportarStatus() {
  await requireApp("proyectos");
  const a = await exigirVer("pipeline");
  // Lo mismo que exige la acción: fórmula por capas vigente y permiso de costos (asigna productor y comercial).
  const formula = await formulaDelNegocio(a.tenantId);
  const aviso = !formula.vigente
    ? "El importador va con la fórmula de precio por capas: prendela en Configuración de proyectos."
    : !puede(a, "costos", "editar")
      ? "Importar asigna productor y comercial: hace falta el permiso para editar costos. Pedíselo a Dirección."
      : null;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <Link href="/admin/proyectos" className="inline-flex min-h-11 items-center text-sm underline">← Proyectos</Link>
      <h1 className="mb-1 text-2xl font-bold text-strong">Importar la planilla de status</h1>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Exportá la pestaña como CSV (Archivo → Descargar → CSV). La primera fila tiene que traer los títulos: cliente, proyecto, productor,
        comercial, status y fecha del evento. Primero vas a ver qué entra y qué no; nada se guarda hasta que confirmes.
      </p>
      {aviso ? <p role="status" className="max-w-3xl text-sm">{aviso}</p> : <Importador />}
    </main>
  );
}
