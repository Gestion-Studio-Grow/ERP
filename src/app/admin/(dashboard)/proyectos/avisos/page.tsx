import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { marcarAvisoLeido, marcarTodosLeidos } from "@/lib/proyectos/acciones-gestion";
import { TIPOS_AVISO } from "@/lib/proyectos/gestion-core";
import { actorActual } from "@/lib/proyectos/gestion.server";
import { cuandoEnArgentina } from "@/lib/proyectos/gestion-lecturas-core";
import { misAvisos } from "@/lib/proyectos/gestion-lecturas.server";
import { tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avisos" };

const ETIQUETA = Object.fromEntries(TIPOS_AVISO.map((t) => [t.id, t.label])) as Record<string, string>;

export default async function AvisosGestion() {
  await requireApp("proyectos");
  const a = await actorActual();
  const { avisos, noLeidos } = await misAvisos(a);
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-strong">Avisos</h1>
          <p className="text-sm text-muted">{noLeidos === 0 ? "Sin avisos por leer" : noLeidos === 1 ? "1 sin leer" : `${noLeidos} sin leer`}</p>
        </div>
        {noLeidos > 0 && (
          <form action={marcarTodosLeidos}>
            <button type="submit" className={buttonClasses("outline", "md")}>Marcar todos como leídos</button>
          </form>
        )}
      </header>
      {avisos.length === 0 ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>Todavía no tenés avisos.</p>
      ) : (
        <ul className={cn(tarjeta, "grid")}>
          {avisos.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
              <div className="min-w-0 flex-1 basis-56">
                <p className={cn("break-words text-sm text-strong", !x.leidoEl && "font-semibold")}>{!x.leidoEl && <span className="mr-1 rounded-full bg-accent px-2 py-0.5 text-xs text-on-accent">Nuevo</span>}{x.texto}</p>
                <p className="text-xs text-muted">{[ETIQUETA[x.tipo], cuandoEnArgentina(x.createdAt)].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {x.enlace?.startsWith("/") && !x.enlace.startsWith("//") && <Link href={x.enlace} className={buttonClasses("outline", "sm")}>Abrir</Link>}
                {!x.leidoEl && (
                  <form action={marcarAvisoLeido}>
                    <input type="hidden" name="id" value={x.id} />
                    <button type="submit" className={buttonClasses("ghost", "sm")}>Marcar leído</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
