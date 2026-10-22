import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { chipLinkAtributos, EmptyState } from "@/components/ui";
import { alumnosPagina, badgePendientes, deudores } from "@/lib/padel/datos.server";
import { Cabecera } from "../_cabecera";
import { campo } from "../config/_estilos";
import { aFila } from "./_fila";
import { FilaDeAlumno, ListaAlumnos } from "./_lista";
import { NuevoAlumno } from "./_nuevo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Alumnos", manifest: "/clases/app.webmanifest" };

type Vista = "todos" | "deben";

// ALUMNOS (matias-DISENO.md §2.3 · M-071/M-086): el buscador (consulta al servidor, sin tope),
// «+ Alumno», y los chips Todos · Deben. «Deben» lista sólo a los que deben, del que más al que
// menos. Cada fila abre la ficha.
// Provisional: «Fijos» llega con los turnos fijos (Tanda 5, PadelSerie) y «Nuevos» queda para
// después; hoy un alumno nuevo se ve en su fila como «0 clases».
export default async function ClasesAlumnos({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string }> }) {
  await requireApp("padel-clases");
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 60);
  const ver: Vista = sp.ver === "deben" ? "deben" : "todos";
  const [pagina, quienDebe, numero] = await Promise.all([
    ver === "todos" ? alumnosPagina(q) : Promise.resolve(null),
    deudores(),
    badgePendientes(),
  ]);
  const texto = q.trim().toLocaleLowerCase("es-AR");
  const deben = quienDebe.filter((d) => !texto || d.nombre.toLocaleLowerCase("es-AR").includes(texto) || d.telefono.includes(texto.replace(/\D/g, "") || "\u0000"));
  const href = (v: Vista) => `/admin/clases/alumnos?${new URLSearchParams({ ...(q ? { q } : {}), ...(v === "deben" ? { ver: v } : {}) })}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Cabecera titulo="Alumnos" detalle="Se suman solos cuando piden clase desde tu link, o los cargás vos." pendientes={numero} />

      <div className="mb-3 flex gap-2">
        <form className="min-w-0 flex-1" role="search" action="/admin/clases/alumnos">
          <label htmlFor="buscar-alumno" className="sr-only">Buscar alumno por nombre o celular</label>
          <input id="buscar-alumno" name="q" type="search" defaultValue={q} placeholder="Buscar por nombre o celular" className={campo} data-qa="buscar-alumno" />
          {ver === "deben" && <input type="hidden" name="ver" value="deben" />}
        </form>
        <NuevoAlumno />
      </div>

      <nav aria-label="Qué alumnos ver" className="mb-4 flex gap-2">
        <Link href={href("todos")} {...chipLinkAtributos(ver === "todos", "min-h-12 px-5 sm:min-h-12")} data-qa="ver-todos">
          Todos
        </Link>
        <Link href={href("deben")} {...chipLinkAtributos(ver === "deben", "min-h-12 px-5 sm:min-h-12")} data-qa="ver-deben">
          Deben <span className="tabular-nums">{quienDebe.length}</span>
        </Link>
      </nav>

      {ver === "deben" ? (
        deben.length === 0 ? (
          <EmptyState title={q ? "No encontramos a nadie con eso que deba" : "Nadie te debe. 👏"} description="Cuando des una clase y no te la paguen, aparece acá." />
        ) : (
          <ul className="grid gap-2" aria-label="Alumnos que deben, del que más al que menos">
            {deben.map((d) => (
              <li key={d.alumnoId}>
                {/* dadas -1: en «Deben» la fila muestra lo que debe, no las clases tomadas. */}
                <FilaDeAlumno a={{ id: d.alumnoId, nombre: d.nombre, nivel: "", dadas: -1, ultima: null, debe: d.total, clasesQueDebe: d.cantidad, enRevision: 0, aFavor: 0 }} />
              </li>
            ))}
          </ul>
        )
      ) : !pagina || pagina.items.length === 0 ? (
        <EmptyState
          title={q ? "No encontramos a nadie con eso" : "Todavía no tenés alumnos"}
          description={q ? "Probá con otra parte del nombre o del celular." : "Compartí tu link del turnero en la bio de Instagram, o cargá uno con «+ Alumno»."}
        />
      ) : (
        <ListaAlumnos key={q} iniciales={pagina.items.map(aFila)} siguiente={pagina.siguiente} q={q} />
      )}
    </main>
  );
}
