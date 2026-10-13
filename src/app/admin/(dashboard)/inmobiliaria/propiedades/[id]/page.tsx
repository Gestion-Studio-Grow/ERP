import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn } from "@/components/ui";
import { roleHasCapability } from "@/lib/capabilities";
import { personas, propiedadAdmin } from "@/lib/inmobiliaria/datos.server";
import { alternarDestacada, cambiarEstadoPropiedad, hacerPortada, quitarFotoPropiedad } from "@/lib/inmobiliaria/acciones";
import { ACCION_ESTADO, ESTADOS_EN_LA_WEB, estadosSiguientes } from "@/lib/inmobiliaria/core";
import { BarraInmo, Calidad, ChipPropiedad, RAIZ, subtitulo, tarjeta, titulo } from "../../_vista";
import { BotonEnviar, FormAccion, SubirFotosPropiedad } from "../../_piezas";
import { Ficha } from "../_ficha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Ficha" };

export default async function FichaDePropiedad({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApp("inmobiliaria");
  const { id } = await params;
  const [p, gente] = await Promise.all([propiedadAdmin(id), personas()]);
  if (!p) notFound();
  const enLaWeb = (ESTADOS_EN_LA_WEB as readonly string[]).includes(p.estado);
  const gritado = p.tituloSugerido !== p.titulo;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <header className="mb-4 flex flex-col gap-2">
        <Link href={`${RAIZ}/propiedades`} className="text-sm underline">
          ← Propiedades
        </Link>
        <span className="flex flex-wrap items-center gap-2">
          <ChipPropiedad estado={p.estado} />
          <span className="text-sm text-muted">{p.codigo}</span>
          {p.destacada && <span className="text-xs font-semibold text-strong">★ Destacada</span>}
        </span>
        <h1 className={titulo}>{p.tituloSugerido}</h1>
      </header>

      <BarraInmo activa={`${RAIZ}/propiedades`} conPlata={p.conPlata} esDuenio={roleHasCapability(user.role, "users:manage")} />

      <section className={cn(tarjeta, "mb-4 grid grid-cols-1 gap-3")} aria-label="Estado y publicación">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={subtitulo}>Qué tan completa está</h2>
          <Calidad puntaje={p.revision.puntaje} />
        </div>
        {p.revision.bloqueos.length > 0 && (
          <ul className="grid gap-1 text-sm" aria-label="Lo que falta para publicar">
            {p.revision.bloqueos.map((b) => (
              <li key={b} className="flex gap-2 font-medium text-strong">
                <span aria-hidden>⛔</span> {b}
              </li>
            ))}
          </ul>
        )}
        {p.revision.mejoras.length > 0 && (
          <ul className="grid gap-1 text-sm text-muted" aria-label="Lo que la mejora">
            {p.revision.mejoras.map((m) => (
              <li key={m} className="flex gap-2">
                <span aria-hidden>💡</span> {m}
              </li>
            ))}
          </ul>
        )}
        {gritado && (
          <p className="rounded-xl border border-line px-3 py-2 text-sm" style={{ background: "var(--warning-soft)" }}>
            En el sitio el título sale así: <strong>{p.tituloSugerido}</strong>. Si querés otro, cambialo abajo.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {estadosSiguientes(p.estado).map((e) => (
            <FormAccion key={e} accion={cambiarEstadoPropiedad}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="estado" value={e} />
              <BotonEnviar variant={e === "PUBLICADA" ? "solid" : "outline"} size="md" pendingText="…">
                {ACCION_ESTADO[e]}
              </BotonEnviar>
            </FormAccion>
          ))}
          <form action={alternarDestacada}>
            <input type="hidden" name="id" value={p.id} />
            <BotonEnviar variant="ghost" size="md" pendingText="…">
              {p.destacada ? "Quitar de destacadas" : "★ Destacar en la portada"}
            </BotonEnviar>
          </form>
          {enLaWeb && (
            <a href={`/propiedades/${p.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("ghost", "md")}>
              Ver en el sitio ↗
            </a>
          )}
        </div>
        {(p.consultas > 0 || p.contratos > 0) && (
          <p className="text-sm text-muted">
            {p.consultas > 0 && (
              <Link href={`${RAIZ}/consultas`} className="underline">
                {p.consultas} consulta{p.consultas > 1 ? "s" : ""} recibida{p.consultas > 1 ? "s" : ""}
              </Link>
            )}
            {p.consultas > 0 && p.contratos > 0 && " · "}
            {p.contratos > 0 && p.conPlata && (
              <Link href={`${RAIZ}/alquileres`} className="underline">
                {p.contratos} contrato{p.contratos > 1 ? "s" : ""}
              </Link>
            )}
          </p>
        )}
      </section>

      <section className={cn(tarjeta, "mb-4 grid grid-cols-1 gap-3")} aria-label="Fotos">
        <div className="flex items-center justify-between">
          <h2 className={subtitulo}>Fotos ({p.fotos.length})</h2>
          <span className="text-xs text-muted">La primera es la tapa</span>
        </div>
        {p.fotos.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {p.fotos.map((f, i) => (
              <li key={f.id} className="flex flex-col gap-1">
                <div className="aspect-[4/3] overflow-hidden rounded-xl" style={{ background: "var(--line)", outline: i === 0 ? "3px solid var(--accent)" : undefined }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.src} alt={f.alt || `Foto ${i + 1}`} className="size-full object-cover" loading="lazy" />
                </div>
                <div className="flex gap-1">
                  {i > 0 && (
                    <form action={hacerPortada} className="flex-1">
                      <input type="hidden" name="id" value={f.id} />
                      <button type="submit" className={cn(buttonClasses("ghost", "sm"), "h-11 w-full justify-center")}>
                        Tapa
                      </button>
                    </form>
                  )}
                  <form action={quitarFotoPropiedad} className="flex-1">
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className={cn(buttonClasses("ghost", "sm"), "h-11 w-full justify-center")} aria-label={`Quitar la foto ${i + 1}`}>
                      Quitar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <SubirFotosPropiedad propiedadId={p.id} />
      </section>

      <Ficha p={p} personas={gente} />
    </main>
  );
}
