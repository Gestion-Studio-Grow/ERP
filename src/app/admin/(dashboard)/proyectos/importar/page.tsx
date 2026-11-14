import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { etapa2ActivaActual } from "@/lib/proyectos/etapa2.server";
import { actorActual, puede } from "@/lib/proyectos/gestion.server";
import { formulaDelNegocio } from "@/lib/proyectos/precio-capas.server";
import { tarjeta } from "../_vista";
import { Importador } from "./_importador";
import { ImportadorStatus } from "./_importador-status";

export const dynamic = "force-dynamic";
// El de status confirma en tandas cortas (acciones-importar.ts); una planilla grande tarda más que el tope por defecto.
export const maxDuration = 120;
export const metadata = { title: "Importar planillas de proyectos" };

// UNA sola pantalla de importación, con dos capacidades, cada una tras su interruptor de la Etapa 2 (etapa2-core.ts,
// apagados por defecto, por negocio):
//   · `proyectos-importador` (#69): la planilla .xlsx de proyectos, sólo Dirección, con el tope de 2 MB del servidor
//     (acciones-importador.ts) — tal cual;
//   · `proyectos-precio-capas` (#41, MIA T1): la planilla de status en CSV, que además pide la fórmula por capas
//     vigente y el permiso de editar costos (acciones-importar.ts).
// Con los dos apagados la página no existe (404), como en main.
export default async function ImportarPlanillas() {
  await requireApp("proyectos");
  const [conXlsx, a] = await Promise.all([etapa2ActivaActual("importador"), actorActual()]);
  const formula = await formulaDelNegocio(a.tenantId);
  const conStatus = formula.encendida && puede(a, "pipeline", "ver");
  if (!conXlsx && !conStatus) notFound();

  const avisoStatus = !formula.disponible
    ? "Todavía no está habilitado en este negocio: falta actualizar la base."
    : !formula.vigente
      ? "El importador de status va con la fórmula de precio por capas: prendela en Configuración de proyectos."
      : !puede(a, "costos", "editar")
        ? "Importar asigna productor y comercial: hace falta el permiso para editar costos. Pedíselo a Dirección."
        : null;

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5">
      <Link href="/admin/proyectos" className="inline-flex min-h-11 items-center text-sm underline">← Proyectos</Link>
      <h1 className="text-2xl font-bold text-strong">Importar planillas de proyectos</h1>

      {conXlsx && (
        <section aria-labelledby="titulo-xlsx" className="grid gap-4">
          <h2 id="titulo-xlsx" className="text-lg font-semibold text-strong">Planilla de proyectos (Excel .xlsx)</h2>
          {a.rol === "DIRECCION" ? (
            <Importador />
          ) : (
            <div className={tarjeta}>
              <p className="text-sm text-muted">Sólo Dirección puede importar planillas.</p>
            </div>
          )}
        </section>
      )}

      {conStatus && (
        <section aria-labelledby="titulo-status" className={`${tarjeta} grid gap-3`}>
          <h2 id="titulo-status" className="text-lg font-semibold text-strong">Planilla de status (CSV)</h2>
          <p className="max-w-3xl text-sm text-muted">
            Exportá la pestaña como CSV (Archivo → Descargar → CSV). La primera fila tiene que traer los títulos: cliente, proyecto, productor,
            comercial, status y fecha del evento. Primero vas a ver qué entra y qué no; nada se guarda hasta que confirmes.
          </p>
          {avisoStatus ? <p role="status" className="max-w-3xl text-sm">{avisoStatus}</p> : <ImportadorStatus />}
        </section>
      )}
    </main>
  );
}
