import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { etapa2ActivaActual } from "@/lib/proyectos/etapa2.server";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { tarjeta } from "../_vista";
import { Importador } from "./_importador";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar planilla de proyectos" };

export default async function ImportarPlanilla() {
  await requireApp("proyectos");
  if (!(await etapa2ActivaActual("importador"))) notFound();
  const a = await actorActual();

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-5">
      <h1 className="text-2xl font-bold text-strong">Importar planilla de proyectos</h1>
      {a.rol === "DIRECCION" ? (
        <Importador />
      ) : (
        <section className={tarjeta}>
          <p className="text-sm text-muted">Sólo Dirección puede importar planillas.</p>
        </section>
      )}
    </main>
  );
}
