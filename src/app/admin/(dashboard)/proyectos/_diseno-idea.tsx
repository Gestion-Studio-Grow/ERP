"use client";

// La ficha de la idea: se escribe a mano o se pide una propuesta a la IA. La propuesta llena el formulario; guardar lo decide la persona.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, cn } from "@/components/ui";
import { agregarMoodboard, alternarImagenIdea, guardarIdea, proponerIdea, quitarMoodboard } from "@/lib/proyectos/acciones-diseno";
import { srcDeImagen, type Moodboard } from "@/lib/proyectos/diseno-core";
import { campo, etiqueta, tarjeta } from "./_vista";

const CAMPOS = [
  { id: "concepto", label: "Concepto", filas: 4 },
  { id: "narrativa", label: "Narrativa", filas: 4 },
  { id: "referencias", label: "Referencias", filas: 3 },
  { id: "materialidades", label: "Materialidades", filas: 3 },
  { id: "informacion", label: "Información importante (no sale en la presentación)", filas: 3 },
] as const;

export interface TextosIdea {
  concepto: string;
  narrativa: string;
  referencias: string;
  materialidades: string;
  informacion: string;
}

export function FormIdea({ proyectoId, inicial, puedeEditar, iaLista, mostrarPedido }: { proyectoId: string; inicial: TextosIdea; puedeEditar: boolean; iaLista: boolean; mostrarPedido?: boolean }) {
  const [v, setV] = useState(inicial);
  const [pedido, setPedido] = useState("");
  const [sinGuardar, setSinGuardar] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();

  const guardar = () => {
    setError(null);
    setListo(false);
    iniciar(async () => {
      try {
        const r = await guardarIdea({ proyectoId, ...v });
        if (!r.ok) return setError(r.error);
        setSinGuardar(false);
        setListo(true);
        router.refresh();
      } catch {
        setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
      }
    });
  };
  const proponer = () => {
    setError(null);
    setListo(false);
    iniciar(async () => {
      try {
        const r = await proponerIdea({ proyectoId, pedido });
        if (!r.ok) return setError(r.error);
        setV(r.idea);
        setSinGuardar(true);
      } catch {
        setError("La IA no respondió. Probá de nuevo.");
      }
    });
  };

  return (
    <div className="grid gap-3">
      {mostrarPedido && puedeEditar && iaLista && (
        <label className={etiqueta}>Pedido especial (opcional)<input value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={2000} placeholder="Algo que la propuesta tenga que tener en cuenta" className={campo} /></label>
      )}
      {CAMPOS.map((c) => (
        <label key={c.id} className={etiqueta}>
          {c.label}
          <textarea
            value={v[c.id]}
            readOnly={!puedeEditar}
            onChange={(e) => { setV({ ...v, [c.id]: e.target.value }); setSinGuardar(true); setListo(false); }}
            rows={c.filas}
            maxLength={8000}
            className="w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-strong"
          />
        </label>
      ))}
      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={ocupado} onClick={guardar}>{ocupado ? "Un momento…" : "Guardar idea"}</Button>
          <Button variant="outline" disabled={ocupado || !iaLista} onClick={proponer} title={iaLista ? undefined : "Falta conectar la IA"}>Proponer con IA</Button>
          {sinGuardar && <span className="text-sm text-muted">Hay cambios sin guardar.</span>}
          {listo && <span role="status" className="text-sm text-muted">Guardada.</span>}
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

export function GrillaImagenes({ proyectoId, imagenes, puedeEditar, vacio }: { proyectoId: string; imagenes: readonly { ref: string; nombre: string; elegida: boolean }[]; puedeEditar: boolean; vacio: string }) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  if (imagenes.length === 0) return <p className="text-sm text-muted">{vacio}</p>;
  return (
    <div className="grid gap-2">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {imagenes.map((i) => {
          const src = srcDeImagen(i.ref);
          return (
            <li key={i.ref} className={cn(tarjeta, "grid min-w-0 content-start gap-2 p-2", i.elegida && "border-accent")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src ? <img src={src} alt={i.nombre} loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" /> : <span className="text-xs text-muted">Sin imagen</span>}
              <p className="truncate text-xs text-muted" title={i.nombre}>{i.nombre}</p>
              {puedeEditar ? (
                <Button
                  size="sm"
                  variant={i.elegida ? "subtle" : "outline"}
                  aria-pressed={i.elegida}
                  disabled={ocupado}
                  onClick={() => {
                    setError(null);
                    iniciar(async () => {
                      try {
                        const r = await alternarImagenIdea({ proyectoId, ref: i.ref });
                        if (!r.ok) return setError(r.error);
                        router.refresh();
                      } catch {
                        setError("No se pudo guardar. Probá de nuevo.");
                      }
                    });
                  }}
                >
                  {i.elegida ? "Quitar de la ficha" : "Elegir para la ficha"}
                </Button>
              ) : (
                i.elegida && <p className="text-xs font-medium text-strong">Elegida</p>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

export function Moodboards({ proyectoId, moodboards, puedeEditar }: { proyectoId: string; moodboards: readonly Moodboard[]; puedeEditar: boolean }) {
  const [nombre, setNombre] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const ejecutar = (accion: () => Promise<{ ok: true } | { ok: false; error: string }>, despues?: () => void) => {
    setError(null);
    iniciar(async () => {
      try {
        const r = await accion();
        if (!r.ok) return setError(r.error);
        despues?.();
        router.refresh();
      } catch {
        setError("No se pudo guardar. Probá de nuevo.");
      }
    });
  };
  return (
    <div className="grid gap-3">
      {moodboards.length === 0 && <p className="text-sm text-muted">Sin moodboards vinculados.</p>}
      <ul className="grid gap-1">
        {moodboards.map((m) => (
          <li key={m.link} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <a href={m.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-0 items-center break-all text-sm underline">{m.nombre}</a>
            {puedeEditar && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => ejecutar(() => quitarMoodboard({ proyectoId, link: m.link }))}>Quitar</Button>}
          </li>
        ))}
      </ul>
      {puedeEditar && (
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del moodboard" placeholder="Nombre" maxLength={120} className={campo} />
          <input value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link del moodboard" placeholder="https://…" inputMode="url" className={campo} />
          <Button variant="outline" disabled={ocupado || !link.trim()} onClick={() => ejecutar(() => agregarMoodboard({ proyectoId, nombre, link }), () => { setNombre(""); setLink(""); })}>Vincular</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
