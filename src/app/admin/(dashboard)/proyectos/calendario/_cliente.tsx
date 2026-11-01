"use client";

import { useRef, useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { crearReunion } from "@/lib/proyectos/acciones-gestion";
import { campo, etiqueta } from "../_vista";

export function FormReunion({ proyectos }: { proyectos: { id: string; texto: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      className="grid gap-3 sm:grid-cols-2"
      action={(fd) =>
        iniciar(async () => {
          setError(null);
          setHecho(false);
          try {
            const r = await crearReunion(fd);
            if (!r.ok) return setError(r.error);
            form.current?.reset();
            setHecho(true);
          } catch {
            setError("No se pudo guardar. Probá de nuevo.");
          }
        })
      }
    >
      <label className={etiqueta}>Título<input name="titulo" required maxLength={160} className={campo} /></label>
      <label className={etiqueta}>Fecha y hora<input name="fecha" type="datetime-local" required className={campo} /></label>
      <label className={etiqueta}>
        Tipo
        <select name="tipo" defaultValue="REUNION" className={campo}>
          <option value="REUNION">Reunión</option>
          <option value="MONTAJE">Armado y desarme</option>
          <option value="EVENTO_TENTATIVO">Evento tentativo</option>
        </select>
      </label>
      <label className={etiqueta}>
        Proyecto
        <select name="proyectoId" defaultValue="" className={campo}>
          <option value="">Sin proyecto</option>
          {proyectos.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}
        </select>
      </label>
      <label className={cn(etiqueta, "sm:col-span-2")}>Lugar o link<input name="lugar" maxLength={300} className={campo} /></label>
      <p className="text-xs text-muted sm:col-span-2">Si elegís un proyecto, se le avisa a su equipo.</p>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={ocupado} className={buttonClasses("solid", "md")}>{ocupado ? "Guardando…" : "Guardar reunión"}</button>
        {hecho && <p role="status" className="text-sm text-strong">Quedó en el calendario.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}

export function CopiarDireccion({ direccion }: { direccion: string }) {
  const [copiado, setCopiado] = useState(false);
  const campoTexto = useRef<HTMLInputElement>(null);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(direccion);
      setCopiado(true);
    } catch {
      // Sin permiso del navegador: queda seleccionada para copiarla a mano.
      campoTexto.current?.select();
    }
  };
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <input ref={campoTexto} readOnly value={direccion} aria-label="Dirección de suscripción" onFocus={(e) => e.currentTarget.select()} className={campo} />
      <button type="button" onClick={copiar} className={buttonClasses("outline", "md")} aria-live="polite">{copiado ? "Copiada" : "Copiar"}</button>
    </div>
  );
}
