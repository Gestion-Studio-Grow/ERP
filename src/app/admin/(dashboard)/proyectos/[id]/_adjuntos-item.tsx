"use client";

// Los adjuntos de un ítem, desde su fila de la ficha: verlos, sumar uno y desvincularlo. El archivo sigue en la pestaña Archivos.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, Cajon } from "@/components/ui";
import { adjuntosDeItem, vincularArchivo } from "@/lib/proyectos/acciones-ficha";
import { SubirArchivo } from "./_piezas";

type Adjunto = { id: string; nombre: string; ruta: string };

export function AdjuntosItem({ proyectoId, itemId, descripcion, cantidad }: { proyectoId: string; itemId: string; descripcion: string; cantidad: number }) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<Adjunto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();

  const cargar = () =>
    iniciar(async () => {
      const r = await adjuntosDeItem({ proyectoId, itemId });
      if (r.ok) setLista(r.archivos);
      else setError(r.error);
    });

  const quitar = (id: string) =>
    iniciar(async () => {
      const f = new FormData();
      f.set("id", id);
      f.set("proyectoId", proyectoId);
      f.set("itemId", "");
      const r = await vincularArchivo(f);
      if (!r.ok) return setError(r.error);
      const a = await adjuntosDeItem({ proyectoId, itemId });
      if (a.ok) setLista(a.archivos);
      router.refresh();
    });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setAbierto(true);
          cargar();
        }}
        className="flex min-h-11 w-full items-center justify-center underline tabular-nums"
        aria-label={`Adjuntos de ${descripcion}: ${cantidad}`}
      >
        {cantidad}
      </button>
      <Cajon abierto={abierto} onCerrar={() => setAbierto(false)} titulo={`Adjuntos de ${descripcion}`}>
        <div className="grid gap-4 p-1">
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {lista === null ? (
            <p className="text-sm text-muted">Cargando…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted">Este ítem todavía no tiene adjuntos.</p>
          ) : (
            <ul className="grid gap-2">
              {lista.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-1 text-sm">
                  <a href={f.ruta} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 items-center break-words underline">{f.nombre}</a>
                  <button type="button" disabled={ocupado} onClick={() => quitar(f.id)} className={buttonClasses("ghost", "md")} aria-label={`Desvincular ${f.nombre}`}>Desvincular</button>
                </li>
              ))}
            </ul>
          )}
          <SubirArchivo proyectoId={proyectoId} itemId={itemId} alTerminar={cargar} />
        </div>
      </Cajon>
    </>
  );
}
