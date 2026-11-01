"use client";

// Abrir una versión: clic sobre la imagen deja un comentario numerado en ese punto. El comentario general no necesita mouse.

import { useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, cn } from "@/components/ui";
import { comentarVersion, resolverComentario, revisarVersion } from "@/lib/proyectos/acciones-diseno";
import { etiqueta, tarjeta } from "./_vista";

export interface ComentarioVisor {
  id: string;
  numero: number | null;
  x: number | null;
  y: number | null;
  autor: string;
  fecha: string;
  texto: string;
  resuelto: boolean;
  revision: "APROBADA" | "CAMBIOS" | null;
}

const areaTexto = "w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-strong";

export function VisorVersion({ versionId, src, alt, link, comentarios, puedeEditar }: { versionId: string; src: string | null; alt: string; link: string | null; comentarios: readonly ComentarioVisor[]; puedeEditar: boolean }) {
  const [punto, setPunto] = useState<{ x: number; y: number } | null>(null);
  const [textoPunto, setTextoPunto] = useState("");
  const [general, setGeneral] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [nota, setNota] = useState("");
  const [activo, setActivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const imagen = useRef<HTMLImageElement>(null);
  const router = useRouter();

  const hacer = (accion: () => Promise<{ ok: true } | { ok: false; error: string }>, despues?: () => void) => {
    setError(null);
    iniciar(async () => {
      try {
        const r = await accion();
        if (!r.ok) return setError(r.error);
        despues?.();
        router.refresh();
      } catch {
        setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
      }
    });
  };

  const marcar = (e: MouseEvent<HTMLImageElement>) => {
    if (!puedeEditar || !imagen.current) return;
    const caja = imagen.current.getBoundingClientRect();
    if (caja.width === 0 || caja.height === 0) return;
    setPunto({ x: ((e.clientX - caja.left) / caja.width) * 100, y: ((e.clientY - caja.top) / caja.height) * 100 });
  };

  const conPunto = comentarios.filter((c) => c.x != null && c.y != null);
  const proximo = conPunto.length + 1;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {src ? (
          <>
            <div className="relative mx-auto w-fit max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imagen} src={src} alt={alt} onClick={marcar} className={cn("block h-auto max-h-[80dvh] w-auto max-w-full rounded-lg border border-line", puedeEditar && "cursor-crosshair")} />
              {conPunto.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActivo(c.id)}
                  aria-label={`Ver el comentario ${c.numero}, de ${c.autor}`}
                  style={{ left: `${c.x}%`, top: `${c.y}%` }}
                  className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                >
                  <span className={cn("flex size-7 items-center justify-center rounded-full border-2 border-surface text-xs font-bold shadow-xs", c.resuelto ? "bg-surface-raised text-muted" : "bg-accent text-on-accent", activo === c.id && "ring-2 ring-accent")}>{c.numero}</span>
                </button>
              ))}
              {punto && (
                <span aria-hidden style={{ left: `${punto.x}%`, top: `${punto.y}%` }} className="pointer-events-none absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-surface bg-accent text-xs font-bold text-on-accent">{proximo}</span>
              )}
            </div>
            {puedeEditar && <p className="mt-2 text-center text-sm text-muted">Tocá un punto de la imagen para dejar un comentario ahí.</p>}
          </>
        ) : link ? (
          <div className={tarjeta}>
            <p className="text-sm text-muted">Esta versión es un link: comentala con un comentario general.</p>
            <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center break-all text-sm underline">{link}</a>
          </div>
        ) : (
          <p className={cn(tarjeta, "text-sm text-muted")}>Esta versión no tiene imagen.</p>
        )}
      </div>

      <aside className="grid min-w-0 content-start gap-4">
        {punto && (
          <section className={tarjeta} aria-label={`Comentario ${proximo} sobre la imagen`}>
            <label className={etiqueta}>
              Comentario {proximo}, en el punto marcado
              <textarea
                value={textoPunto}
                onChange={(e) => setTextoPunto(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setPunto(null)}
                maxLength={1000}
                rows={3}
                autoFocus
                className={areaTexto}
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                disabled={ocupado || !textoPunto.trim()}
                onClick={() => hacer(() => comentarVersion({ versionId, texto: textoPunto, x: punto.x, y: punto.y }), () => { setPunto(null); setTextoPunto(""); })}
              >
                Guardar
              </Button>
              <Button variant="ghost" onClick={() => { setPunto(null); setTextoPunto(""); }}>Cancelar</Button>
            </div>
          </section>
        )}

        {puedeEditar && (
          <section className={tarjeta} aria-label="Comentario general">
            <label className={etiqueta}>
              Comentario general
              <textarea value={general} onChange={(e) => setGeneral(e.target.value)} maxLength={1000} rows={2} className={areaTexto} />
            </label>
            <Button variant="outline" className="mt-2" disabled={ocupado || !general.trim()} onClick={() => hacer(() => comentarVersion({ versionId, texto: general }), () => setGeneral(""))}>Comentar</Button>
          </section>
        )}

        {puedeEditar && (
          <section className={tarjeta} aria-label="Revisión interna">
            <h2 className="text-sm font-semibold text-strong">Revisión del equipo</h2>
            <p className="mt-1 text-sm text-muted">Queda entre nosotros: el cliente no la ve.</p>
            {pidiendo ? (
              <div className="mt-2 grid gap-2">
                <label className={etiqueta}>Qué hay que cambiar<textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} rows={3} autoFocus className={areaTexto} /></label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={ocupado || !nota.trim()} onClick={() => hacer(() => revisarVersion({ versionId, tipo: "CAMBIOS", nota }), () => { setPidiendo(false); setNota(""); })}>Pedir cambios</Button>
                  <Button variant="ghost" onClick={() => setPidiendo(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={ocupado} onClick={() => hacer(() => revisarVersion({ versionId, tipo: "APROBADA" }))}>Aprobar</Button>
                <Button variant="outline" disabled={ocupado} onClick={() => setPidiendo(true)}>Pedir cambios</Button>
              </div>
            )}
          </section>
        )}

        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}

        <section aria-label="Comentarios" className="grid gap-2">
          <h2 className="text-sm font-semibold text-strong">Comentarios ({comentarios.filter((c) => !c.revision).length})</h2>
          {comentarios.length === 0 && <p className="text-sm text-muted">Todavía nadie comentó.</p>}
          {comentarios.map((c) => (
            <article key={c.id} className={cn(tarjeta, "p-3", activo === c.id && "border-accent", c.resuelto && "opacity-70")}>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {c.numero != null && <span className="flex size-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent">{c.numero}</span>}
                <span className="font-medium text-strong">{c.autor}</span>
                <span>{c.fecha}</span>
              </p>
              {c.revision ? (
                <p className="mt-1 break-words text-sm text-strong"><strong>{c.revision === "APROBADA" ? "Aprobó esta versión" : "Pidió cambios"}</strong>{c.texto && `: ${c.texto}`}</p>
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-strong">{c.texto}</p>
              )}
              {!c.revision && puedeEditar && (
                <button type="button" aria-pressed={c.resuelto} disabled={ocupado} onClick={() => hacer(() => resolverComentario({ id: c.id, resuelto: !c.resuelto }))} className="mt-1 inline-flex min-h-11 items-center text-sm underline">
                  {c.resuelto ? "Reabrir" : "Marcar resuelto"}
                </button>
              )}
              {!c.revision && !puedeEditar && c.resuelto && <p className="mt-1 text-sm text-muted">Resuelto</p>}
            </article>
          ))}
        </section>
      </aside>
    </div>
  );
}
