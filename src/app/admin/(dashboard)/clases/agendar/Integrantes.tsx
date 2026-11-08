"use client";

// E7 · «¿Quiénes vienen?» en una clase con amigos: hasta 3 además del titular. Cada uno es un alumno
// tuyo (buscador) o uno nuevo con nombre y celular (con celular queda como alumno y le llega su link
// para mandar el comprobante de SU parte; sin celular, se cobra en la clase). Cada uno paga su parte.

import { useId, useMemo, useState } from "react";
import { BuscadorCombo, buttonClasses, cn } from "@/components/ui";
import { MAX_INTEGRANTES } from "@/lib/padel/core";
import { plataTexto } from "../_plata";

export type IntegranteForm = { alumnoId?: string; nombre: string; telefono: string };

const campo =
  "h-12 w-full rounded-xl border border-line-strong bg-surface-raised px-3 text-base text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Lo que viaja al servidor (`integrantes` del FormData): alumno existente o nombre + celular. */
export const integrantesParaEnviar = (lista: readonly IntegranteForm[]) =>
  JSON.stringify(lista.map((i) => (i.alumnoId ? { alumnoId: i.alumnoId } : { nombre: i.nombre.trim(), telefono: i.telefono.trim() })));

export function EditorIntegrantes({
  todos,
  excluir,
  lista,
  onCambiar,
  montoPorPersona,
}: {
  todos: { id: string; nombre: string; telefono: string }[];
  /** El titular (no puede ser integrante). */
  excluir: string | null;
  lista: IntegranteForm[];
  onCambiar: (l: IntegranteForm[]) => void;
  montoPorPersona: number;
}) {
  const idRotulo = useId();
  const idNombre = useId();
  const idTel = useId();
  const [nuevo, setNuevo] = useState<{ nombre: string; telefono: string } | null>(null);
  const usados = new Set(lista.map((i) => i.alumnoId).filter(Boolean));
  const opciones = useMemo(
    () => todos.filter((a) => a.id !== excluir && !usados.has(a.id)).map((a) => ({ id: a.id, etiqueta: a.nombre, detalle: a.telefono })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos, excluir, lista],
  );
  const lleno = lista.length >= MAX_INTEGRANTES;
  const nuevoListo = nuevo ? nuevo.nombre.trim().length >= 2 && (nuevo.telefono.trim() === "" || nuevo.telefono.replace(/\D/g, "").length >= 8) : false;

  return (
    <div className="grid gap-3" data-qa="integrantes">
      <p id={idRotulo} className="text-sm text-muted">
        ¿Quiénes vienen además del titular? Cada uno paga su parte{montoPorPersona > 0 ? ` (${plataTexto(montoPorPersona)})` : ""}.
      </p>
      {lista.length > 0 && (
        <ul aria-labelledby={idRotulo} className="grid gap-2">
          {lista.map((i, n) => (
            <li key={`${i.alumnoId ?? i.telefono}-${n}`} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-surface-raised px-3">
              <span className="text-base text-strong">
                {i.nombre}
                {!i.alumnoId && !i.telefono && <span className="text-sm text-muted"> · sin celular</span>}
              </span>
              <button
                type="button"
                className={cn(buttonClasses("ghost", "sm"), "min-h-12")}
                onClick={() => onCambiar(lista.filter((_, k) => k !== n))}
                aria-label={`Quitar a ${i.nombre}`}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {!lleno && !nuevo && (
        <>
          <BuscadorCombo
            opciones={opciones}
            valor=""
            onElegir={(id) => {
              const a = todos.find((x) => x.id === id);
              if (a) onCambiar([...lista, { alumnoId: a.id, nombre: a.nombre, telefono: a.telefono }]);
            }}
            placeholder="Sumar uno de tus alumnos…"
            ariaLabel="Buscar un alumno para sumar a la clase"
            className="[&_input]:h-12 [&_input]:text-base"
          />
          <button type="button" className="min-h-12 text-left text-sm font-semibold text-accent-ink underline underline-offset-2" onClick={() => setNuevo({ nombre: "", telefono: "" })} data-qa="integrante-nuevo">
            + Integrante nuevo: nombre y celular
          </button>
        </>
      )}
      {nuevo && (
        <div className="grid gap-3 rounded-xl border border-line p-3">
          <div>
            <label htmlFor={idNombre} className="mb-1 block text-sm text-strong">Nombre</label>
            <input id={idNombre} className={campo} autoComplete="off" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          </div>
          <div>
            <label htmlFor={idTel} className="mb-1 block text-sm text-strong">Celular (opcional)</label>
            <input id={idTel} type="tel" inputMode="tel" placeholder="11 5555-1234" className={campo} value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!nuevoListo}
              className={cn(buttonClasses("solid", "sm"), "min-h-12 flex-1")}
              onClick={() => {
                onCambiar([...lista, { nombre: nuevo.nombre.trim(), telefono: nuevo.telefono.trim() }]);
                setNuevo(null);
              }}
            >
              Sumar
            </button>
            <button type="button" className={cn(buttonClasses("outline", "sm"), "min-h-12 flex-1")} onClick={() => setNuevo(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
