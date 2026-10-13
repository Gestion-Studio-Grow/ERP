import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, EmptyState } from "@/components/ui";
import { roleHasCapability } from "@/lib/capabilities";
import { listaPropiedades, veLaPlata } from "@/lib/inmobiliaria/datos.server";
import { esEstadoPropiedad, ESTADO_PROPIEDAD_LABEL, ESTADOS_PROPIEDAD, precioDeCartel, TIPO_LABEL, type TipoPropiedad } from "@/lib/inmobiliaria/core";
import { BarraInmo, Calidad, ChipPropiedad, RAIZ, tarjeta, titulo } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Propiedades" };

export default async function Propiedades({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string }> }) {
  const user = await requireApp("inmobiliaria");
  const { estado: crudo, q } = await searchParams;
  const estado = esEstadoPropiedad(crudo) ? crudo : undefined;
  const fichas = await listaPropiedades({ estado, texto: q });
  const filtro = (e?: string) => `${RAIZ}/propiedades${e ? `?estado=${e}` : ""}`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={titulo}>Propiedades</h1>
          <p className="text-sm text-muted">
            {fichas.length} {fichas.length === 1 ? "ficha" : "fichas"}
            {estado ? ` · ${ESTADO_PROPIEDAD_LABEL[estado].toLowerCase()}s` : ""}
          </p>
        </div>
        <Link href={`${RAIZ}/propiedades/nueva`} className={cn(buttonClasses("solid", "lg"), "w-full justify-center sm:w-auto")}>
          + Cargar propiedad
        </Link>
      </header>

      <BarraInmo activa={`${RAIZ}/propiedades`} conPlata={veLaPlata(user)} esDuenio={roleHasCapability(user.role, "users:manage")} />

      <form className="mb-3 flex gap-2" role="search">
        {estado && <input type="hidden" name="estado" value={estado} />}
        <input name="q" defaultValue={q ?? ""} placeholder="Buscar por código, calle, barrio o título" aria-label="Buscar propiedades" className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface-raised px-3 text-sm text-strong" />
        <button type="submit" className={buttonClasses("outline", "md")}>
          Buscar
        </button>
      </form>

      <nav aria-label="Filtrar por estado" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[undefined, ...ESTADOS_PROPIEDAD].map((e) => (
          <Link
            key={e ?? "todas"}
            href={filtro(e)}
            aria-current={e === estado ? "page" : undefined}
            className={cn("flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium", e === estado ? "border-transparent bg-accent text-on-accent" : "border-line text-strong")}
          >
            {e ? ESTADO_PROPIEDAD_LABEL[e] : "Todas"}
          </Link>
        ))}
      </nav>

      {fichas.length === 0 ? (
        <EmptyState title="No hay fichas acá" description="Cargá la primera con «Cargar propiedad»: tipo, zona, precio y fotos. Antes de publicar te decimos qué le falta." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fichas.map((p) => (
            <li key={p.id} className={cn(tarjeta, "relative flex gap-3")}>
              <div className="size-24 shrink-0 overflow-hidden rounded-xl" style={{ background: "var(--line)" }}>
                {p.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.foto} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <span className="grid size-full place-items-center text-xs text-body">Sin fotos</span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <ChipPropiedad estado={p.estado} />
                  <span className="text-xs text-muted">
                    {p.codigo} · {TIPO_LABEL[p.tipo as TipoPropiedad] ?? p.tipo}
                  </span>
                </span>
                {/* py/-my: el link mide 44 px para el dedo sin mover el renglón (toda la tarjeta ya es clickeable). */}
                <Link href={`${RAIZ}/propiedades/${p.id}`} className="-my-2.5 line-clamp-2 py-2.5 font-semibold text-strong after:absolute after:inset-0 after:content-['']">
                  {p.titulo}
                </Link>
                <span className="truncate text-sm text-muted">{[p.direccion, p.zona].filter(Boolean).join(" · ") || "Sin dirección"}</span>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-semibold tabular-nums text-strong">{precioDeCartel(p).texto}</span>
                  <span className="flex items-center gap-3">
                    {p.consultas > 0 && <span className="text-xs text-muted">{p.consultas} consulta{p.consultas > 1 ? "s" : ""}</span>}
                    <Calidad puntaje={p.puntaje} chico />
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
