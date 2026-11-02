"use client";

import { useRef, useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { cancelarReunion, crearReunion, editarReunion } from "@/lib/proyectos/acciones-gestion";
import { campo, etiqueta } from "../_vista";

export function FormReunion({ proyectos, reunion }: { proyectos: { id: string; texto: string }[]; reunion?: { id: string; titulo: string; tipo: string; fecha: string; lugar: string; proyectoId: string | null } }) {
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
            const r = await (reunion ? editarReunion(fd) : crearReunion(fd));
            if (!r.ok) return setError(r.error);
            if (!reunion) form.current?.reset();
            setHecho(true);
          } catch {
            setError("No se pudo guardar. Probá de nuevo.");
          }
        })
      }
    >
      {reunion && <input type="hidden" name="id" value={reunion.id} />}
      <label className={etiqueta}>Título<input name="titulo" required maxLength={160} defaultValue={reunion?.titulo} className={campo} /></label>
      <label className={etiqueta}>Fecha y hora<input name="fecha" type="datetime-local" required defaultValue={reunion?.fecha} className={campo} /></label>
      <label className={etiqueta}>
        Tipo
        <select name="tipo" defaultValue={reunion?.tipo ?? "REUNION"} className={campo}>
          <option value="REUNION">Reunión</option>
          <option value="MONTAJE">Armado y desarme</option>
          <option value="EVENTO_TENTATIVO">Evento tentativo</option>
        </select>
      </label>
      <label className={etiqueta}>
        Proyecto
        <select name="proyectoId" defaultValue={reunion?.proyectoId ?? ""} className={campo}>
          <option value="">Sin proyecto</option>
          {proyectos.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}
        </select>
      </label>
      <label className={cn(etiqueta, "sm:col-span-2")}>Lugar o link<input name="lugar" maxLength={300} defaultValue={reunion?.lugar} className={campo} /></label>
      <p className="text-xs text-muted sm:col-span-2">Si elegís un proyecto, se le avisa a su equipo.</p>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={ocupado} className={buttonClasses("solid", "md")}>{ocupado ? "Guardando…" : reunion ? "Guardar cambios" : "Guardar reunión"}</button>
        {hecho && <p role="status" className="text-sm text-strong">Quedó en el calendario.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}

export function CancelarReunion({ id }: { id: string }) {
  const [seguro, setSeguro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  if (!seguro) return <button type="button" className={cn(buttonClasses("ghost", "md"), "justify-self-start")} onClick={() => setSeguro(true)}>Cancelar reunión</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-strong">Se saca del calendario y se le avisa al equipo.</p>
      <button
        type="button"
        disabled={ocupado}
        className={buttonClasses("solid", "md")}
        onClick={() =>
          iniciar(async () => {
            const fd = new FormData();
            fd.set("id", id);
            try {
              const r = await cancelarReunion(fd);
              if (!r.ok) setError(r.error);
            } catch {
              setError("No se pudo cancelar. Probá de nuevo.");
            }
          })
        }
      >
        {ocupado ? "Cancelando…" : "Sí, cancelarla"}
      </button>
      <button type="button" disabled={ocupado} className={buttonClasses("ghost", "md")} onClick={() => setSeguro(false)}>No</button>
      {error && <p role="alert" className="basis-full text-sm text-danger">{error}</p>}
    </div>
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
