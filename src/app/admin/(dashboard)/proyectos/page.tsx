import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, EmptyState, Pestanas } from "@/components/ui";
import { tableroPipeline } from "@/lib/proyectos/ficha.server";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { Pipeline } from "./_pipeline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proyectos" };

export default async function TableroProyectos({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("pipeline");
  const { vista } = await searchParams;
  const tarjetas = await tableroPipeline(a);
  const edita = puede(a, "pipeline", "editar");
  const esLista = vista === "lista";

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-strong">Proyectos</h1>
        {edita && <Link href="/admin/proyectos/nuevo" className={cn(buttonClasses("solid", "lg"), "w-full justify-center sm:w-auto")}>+ Nuevo lead</Link>}
      </header>
      <Pestanas
        etiqueta="Vistas de Proyectos"
        conRaya
        className="mb-4"
        pestanas={[
          { href: "/admin/proyectos", etiqueta: "Kanban", actual: !esLista },
          { href: "/admin/proyectos?vista=lista", etiqueta: "Lista", actual: esLista },
        ]}
      />
      {tarjetas.length === 0 ? (
        <EmptyState title="Todavía no hay proyectos" description="Cargá el primer lead para empezar." />
      ) : (
        <Pipeline tarjetas={tarjetas} vista={esLista ? "lista" : "kanban"} edita={edita} />
      )}
    </main>
  );
}
