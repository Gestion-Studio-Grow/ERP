import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { buttonClasses, cn, EmptyState, Pestanas } from "@/components/ui";
import { TOPE_TABLERO, tableroPipeline } from "@/lib/proyectos/ficha.server";
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
  const consultasPendientes = await prisma.consulta.count({ where: { tenantId: a.tenantId, estado: { in: ["NUEVA", "PARA_PERSONA"] } } });

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-strong">Proyectos</h1>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link href="/admin/proyectos/consultas" className={cn(buttonClasses("outline", "lg"), "w-full justify-center sm:w-auto")}>
            Consultas
            {consultasPendientes > 0 && <span aria-label={`${consultasPendientes} esperando a una persona`} className="ml-2 rounded-full bg-accent px-2 text-xs text-on-accent">{consultasPendientes}</span>}
          </Link>
          {edita && <Link href="/admin/proyectos/nuevo" className={cn(buttonClasses("solid", "lg"), "w-full justify-center sm:w-auto")}>+ Nuevo lead</Link>}
        </div>
      </header>
      {tarjetas.length >= TOPE_TABLERO && <p role="status" className="mb-3 text-sm text-danger">Se muestran los primeros {TOPE_TABLERO} proyectos. Para llegar a los demás, usá el buscador de arriba.</p>}
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
