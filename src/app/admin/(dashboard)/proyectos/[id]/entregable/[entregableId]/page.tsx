import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { Badge, buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { fichaEntregable } from "@/lib/proyectos/datos.server";
import { anularEntregable, descartarBorrador, enviarVersion, guardarEntregable } from "@/lib/proyectos/acciones";
import { ayudaEspecificacion, ESTADO_ENTREGABLE_LABEL, estadoDelEntregable, fechaCorta, fechaParaInput, type EstadoEntregable } from "@/lib/proyectos/core";
import { campo, etiqueta, tarjeta } from "../../../_vista";
import { SubirVersion } from "./_version";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pieza del proyecto" };

const ESTADO_VERSION: Record<string, string> = {
  BORRADOR: "Borrador: el cliente todavía no la ve",
  ENVIADA: "Esperando al cliente",
  APROBADA: "Aprobada",
  CAMBIOS: "Pidió cambios",
  REEMPLAZADA: "Reemplazada sin respuesta",
};

const toneDeEntregable = (e: EstadoEntregable) => (e === "APROBADO" ? "success" : e === "CAMBIOS" ? "danger" : "neutral");

export default async function FichaEntregable({ params, searchParams }: { params: Promise<{ id: string; entregableId: string }>; searchParams: Promise<{ ver?: string }> }) {
  await requireApp("proyectos");
  const { id, entregableId } = await params;
  const { ver } = await searchParams;
  const data = await fichaEntregable(id, entregableId, Number(ver) || undefined);
  if (!data) notFound();
  const { entregable: e } = data;
  const estado = estadoDelEntregable(e.versiones);
  const borrador = e.versiones.find((v) => v.estado === "BORRADOR");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Link href={`/admin/proyectos/${id}`} className="text-sm underline">← {e.proyecto.nombre}</Link>
      <header className="mb-4 mt-2">
        <p className="text-sm text-muted">#{e.proyecto.numero} · {e.proyecto.client.name}</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-strong">{e.nombre}</h1>
          <Badge tone={toneDeEntregable(estado)}>{ESTADO_ENTREGABLE_LABEL[estado]}</Badge>
        </div>
      </header>

      <section className={cn(tarjeta, "mb-4")} aria-label="Versiones">
        <h2 className="mb-3 font-semibold text-strong">Versiones</h2>
        {e.versiones.length === 0 && <p className="text-sm text-muted">Todavía no hay ninguna. Subí la primera acá abajo.</p>}
        <ol className="grid gap-4">
          {e.versiones.map((v) => (
            <li key={v.id} aria-label={`Versión ${v.numero}`} className="min-w-0 border-t border-line pt-3 first:border-t-0 first:pt-0">
              <p className="font-medium text-strong">Versión {v.numero} · {ESTADO_VERSION[v.estado] ?? v.estado}</p>
              <p className="text-sm text-muted">{[v.subidoPor, v.enviadaEl && `enviada el ${fechaCorta(v.enviadaEl)}`].filter(Boolean).join(" · ")}</p>
              {v.nota && <p className="mt-1 text-sm">{v.nota}</p>}
              {v.especificacion && <p className="mt-1 text-sm text-muted">{v.especificacion}</p>}
              {v.respondidoPor && (
                <p className={cn("mt-2 text-sm", v.estado === "CAMBIOS" && "font-medium text-strong")}>
                  {v.respondidoPor}, {fechaCorta(v.respondidaEl)}{v.comentario && `: «${v.comentario}»`}
                </p>
              )}
              {v.datos ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.datos} alt={`${e.nombre}, versión ${v.numero}`} className="mt-2 max-h-96 w-auto max-w-full rounded-lg border border-line" />
              ) : v.url ? (
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm underline">Abrir link</a>
              ) : (
                <Link href={`?ver=${v.numero}`} className="mt-2 inline-flex min-h-11 items-center text-sm underline">Ver imagen</Link>
              )}
              {v.estado === "BORRADOR" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={enviarVersion}>
                    <input type="hidden" name="id" value={v.id} />
                    <SubmitButton className={buttonClasses("solid", "md")}>Enviar al cliente</SubmitButton>
                  </form>
                  <form action={descartarBorrador}>
                    <input type="hidden" name="id" value={v.id} />
                    <button type="submit" className={buttonClasses("ghost", "md")}>Descartar</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className={cn(tarjeta, "mb-4")} aria-label="Subir versión">
        <h2 className="mb-3 font-semibold text-strong">{borrador ? "Cambiar el borrador" : "Subir una versión"}</h2>
        <SubirVersion entregableId={e.id} hayBorrador={!!borrador} />
      </section>

      <section className={cn(tarjeta, "mb-4")} aria-label="Datos de la pieza">
        <h2 className="mb-3 font-semibold text-strong">Datos de la pieza</h2>
        <form action={guardarEntregable} className="grid gap-3">
          <input type="hidden" name="id" value={e.id} />
          <label className={etiqueta}>Nombre<input name="nombre" required maxLength={120} defaultValue={e.nombre} className={campo} /></label>
          <label className={etiqueta}>Especificación<input name="especificacion" maxLength={300} defaultValue={e.especificacion} placeholder={ayudaEspecificacion(e.proyecto.servicio)} className={campo} /></label>
          <label className={etiqueta}>Para cuándo<input type="date" name="venceEl" defaultValue={fechaParaInput(e.venceEl)} className={campo} /></label>
          <SubmitButton className={buttonClasses("outline", "md")}>Guardar datos</SubmitButton>
          <p className="text-sm text-muted">Una versión ya enviada conserva la especificación con la que salió.</p>
        </form>
      </section>

      <form action={anularEntregable}>
        <input type="hidden" name="id" value={e.id} />
        <button type="submit" className={buttonClasses("ghost", "md")}>Sacar esta pieza del proyecto</button>
      </form>
    </main>
  );
}
