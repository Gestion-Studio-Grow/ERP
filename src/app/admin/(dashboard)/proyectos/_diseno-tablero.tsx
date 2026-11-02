"use client";

// El tablero de tareas: columnas por estado, arrastre de tarjetas, selector para el celular y el teclado, filtros, alta y edición.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Cajon, cn } from "@/components/ui";
import { guardarTareaDiseno, moverTareaDiseno } from "@/lib/proyectos/acciones-diseno";
import { iniciales } from "@/lib/proyectos/diseno-core";
import { ESTADO_TAREA_LABEL, ESTADOS_TAREA } from "@/lib/proyectos/gestion-core";
import { campo, etiqueta, tarjeta } from "./_vista";

export interface TareaTablero {
  id: string;
  titulo: string;
  estado: string;
  area: string;
  proyectoId: string;
  proyecto: string;
  personaId: string | null;
  responsable: string | null;
  vence: string | null;
  venceInput: string;
  vencida: boolean;
}

export interface PersonaTablero {
  id: string;
  nombre: string;
  veTodo: boolean;
}

type Borrador = { id: string | null; titulo: string; proyectoId: string; personaId: string; venceEl: string; area: string };

export function TableroTareas({
  tareas,
  proyectos,
  personas,
  equipoPorProyecto,
  miPersonaId,
  puedeEditar,
  proyectoFijo,
}: {
  tareas: readonly TareaTablero[];
  proyectos: readonly { id: string; nombre: string }[];
  personas: readonly PersonaTablero[];
  equipoPorProyecto: Readonly<Record<string, readonly string[]>>;
  miPersonaId: string | null;
  puedeEditar: boolean;
  /** Dentro de la ficha: un solo proyecto y sólo tareas de Diseño; sin filtros. */
  proyectoFijo?: string;
}) {
  const [locales, setLocales] = useState(tareas);
  const [quien, setQuien] = useState("todos");
  const [proyecto, setProyecto] = useState("");
  const [soloDiseno, setSoloDiseno] = useState(false);
  const [sobre, setSobre] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();

  // Lo que vuelve del servidor pisa el arrastre optimista.
  const [recibidas, setRecibidas] = useState(tareas);
  if (recibidas !== tareas) {
    setRecibidas(tareas);
    setLocales(tareas);
  }

  const visibles = useMemo(
    () =>
      locales.filter((t) => {
        if (quien === "mias" && t.personaId !== miPersonaId) return false;
        if (quien !== "todos" && quien !== "mias" && t.personaId !== quien) return false;
        if (proyecto && t.proyectoId !== proyecto) return false;
        return !soloDiseno || t.area === "DISENO";
      }),
    [locales, quien, proyecto, soloDiseno, miPersonaId],
  );

  const mover = (id: string, estado: string) => {
    const previa = locales.find((t) => t.id === id);
    if (!previa || previa.estado === estado) return;
    setError(null);
    setLocales((ls) => ls.map((t) => (t.id === id ? { ...t, estado } : t)));
    iniciar(async () => {
      try {
        const r = await moverTareaDiseno({ id, estado });
        if (!r.ok) throw new Error(r.error);
        router.refresh();
      } catch (e) {
        setLocales((ls) => ls.map((t) => (t.id === id ? previa : t)));
        setError(e instanceof Error && e.message ? e.message : "No se pudo mover la tarea. Probá de nuevo.");
      }
    });
  };

  const abrirNueva = () => {
    setErrorForm(null);
    setBorrador({ id: null, titulo: "", proyectoId: proyectoFijo || proyecto || proyectos[0]?.id || "", personaId: "", venceEl: "", area: "DISENO" });
  };
  const abrir = (t: TareaTablero) => {
    if (!puedeEditar) return;
    setErrorForm(null);
    setBorrador({ id: t.id, titulo: t.titulo, proyectoId: t.proyectoId, personaId: t.personaId ?? "", venceEl: t.venceInput, area: t.area });
  };
  const guardar = () => {
    if (!borrador) return;
    setErrorForm(null);
    iniciar(async () => {
      try {
        const r = await guardarTareaDiseno({ ...borrador, personaId: borrador.personaId || null });
        if (!r.ok) return setErrorForm(r.error);
        setBorrador(null);
        router.refresh();
      } catch {
        setErrorForm("No se pudo guardar. Revisá la conexión y probá de nuevo.");
      }
    });
  };
  const asignables = borrador ? personas.filter((p) => p.veTodo || (equipoPorProyecto[borrador.proyectoId] ?? []).includes(p.id) || p.id === borrador.personaId) : [];

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-end gap-2">
        {!proyectoFijo && (
          <>
            <label className={cn(etiqueta, "min-w-40 flex-1 sm:flex-none")}>
              Quién
              <select value={quien} onChange={(e) => setQuien(e.target.value)} className={campo}>
                <option value="todos">Todo el equipo</option>
                {miPersonaId && <option value="mias">Mis tareas</option>}
                {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className={cn(etiqueta, "min-w-40 flex-1 sm:flex-none")}>
              Proyecto
              <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={campo}>
                <option value="">Todos</option>
                {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-strong">
              <input type="checkbox" checked={soloDiseno} onChange={(e) => setSoloDiseno(e.target.checked)} className="size-5" />
              Sólo Diseño
            </label>
          </>
        )}
        {puedeEditar && <Button onClick={abrirNueva} className="ml-auto" disabled={proyectos.length === 0}>Nueva tarea</Button>}
      </div>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ESTADOS_TAREA.map((estado) => {
          const delEstado = visibles.filter((t) => t.estado === estado);
          return (
            <section
              key={estado}
              aria-label={ESTADO_TAREA_LABEL[estado]}
              onDragOver={puedeEditar ? (e) => { e.preventDefault(); setSobre(estado); } : undefined}
              onDragLeave={puedeEditar ? () => setSobre(null) : undefined}
              onDrop={puedeEditar ? (e) => { e.preventDefault(); setSobre(null); mover(e.dataTransfer.getData("text/plain"), estado); } : undefined}
              className={cn("grid min-w-0 content-start gap-2 rounded-2xl border border-line bg-surface p-2", sobre === estado && "border-accent")}
            >
              <h3 className="flex items-center justify-between px-1 text-sm font-semibold text-strong">
                {ESTADO_TAREA_LABEL[estado]}
                <span className="rounded-full bg-surface-raised px-2 text-xs text-muted">{delEstado.length}</span>
              </h3>
              {delEstado.length === 0 && <p className="px-1 pb-2 text-sm text-muted">Nada por acá.</p>}
              {delEstado.map((t) => (
                <article
                  key={t.id}
                  draggable={puedeEditar}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                  className={cn(tarjeta, "grid min-w-0 gap-2 p-3", puedeEditar && "cursor-grab")}
                >
                  {!proyectoFijo && <p className="truncate text-xs text-muted">{t.proyecto}</p>}
                  {puedeEditar ? (
                    <button type="button" onClick={() => abrir(t)} className="min-h-11 break-words text-left text-sm font-medium text-strong underline-offset-2 hover:underline">{t.titulo}</button>
                  ) : (
                    <p className="break-words text-sm font-medium text-strong">{t.titulo}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-surface text-[11px] font-semibold text-strong">{iniciales(t.responsable)}</span>
                    <span className="min-w-0 truncate">{t.responsable ?? "Sin asignar"}</span>
                    {!proyectoFijo && t.area === "DISENO" && <span className="rounded-full border border-line px-2">Diseño</span>}
                  </div>
                  {t.vence && <p className={cn("text-xs", t.vencida ? "font-semibold text-danger" : "text-muted")}>{t.vencida && "⚠ "}Vence {t.vence}</p>}
                  {puedeEditar && (
                    <label className="grid gap-1 text-xs text-muted">
                      Estado
                      <select value={t.estado} onChange={(e) => mover(t.id, e.target.value)} className={campo} aria-label={`Estado de ${t.titulo}`}>
                        {ESTADOS_TAREA.map((s) => <option key={s} value={s}>{ESTADO_TAREA_LABEL[s]}</option>)}
                      </select>
                    </label>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>

      <Cajon
        abierto={!!borrador}
        onCerrar={() => setBorrador(null)}
        titulo={borrador?.id ? "Editar tarea" : "Nueva tarea"}
        pie={<Button onClick={guardar} disabled={ocupado || !borrador?.titulo.trim() || !borrador?.proyectoId}>{ocupado ? "Guardando…" : "Guardar tarea"}</Button>}
      >
        {borrador && (
          <div className="grid gap-3 p-1">
            <label className={etiqueta}>Título<input value={borrador.titulo} onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })} maxLength={200} className={campo} autoFocus /></label>
            {!proyectoFijo && (
              <label className={etiqueta}>
                Proyecto
                <select value={borrador.proyectoId} onChange={(e) => setBorrador({ ...borrador, proyectoId: e.target.value, personaId: "" })} className={campo}>
                  <option value="" disabled>Elegí un proyecto</option>
                  {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
            )}
            <label className={etiqueta}>
              Persona
              <select value={borrador.personaId} onChange={(e) => setBorrador({ ...borrador, personaId: e.target.value })} className={campo}>
                <option value="">Sin asignar</option>
                {asignables.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <span className="text-xs font-normal text-muted">Aparece quien está en el equipo del proyecto, o ve todos los proyectos.</span>
            </label>
            <label className={etiqueta}>Vencimiento<input type="date" value={borrador.venceEl} onChange={(e) => setBorrador({ ...borrador, venceEl: e.target.value })} className={campo} /></label>
            <label className={etiqueta}>
              Área
              <select value={borrador.area} onChange={(e) => setBorrador({ ...borrador, area: e.target.value })} className={campo}>
                <option value="DISENO">Diseño</option>
                <option value="PRODUCCION">Producción</option>
              </select>
            </label>
            {errorForm && <p role="alert" className="text-sm font-medium text-danger">{errorForm}</p>}
          </div>
        )}
      </Cajon>
    </div>
  );
}
