"use client";

// Formularios del LIBRO DE CAJA. Client components finos, mismo patrón que
// CajaForms.tsx: el estado de error va inline con `useActionState` (las acciones
// DEVUELVEN el error en vez de lanzar) y el de envío con `SubmitButton`.
//
// El objetivo de diseño de la carga es UNO: que anotar una fila cueste lo mismo que
// en la planilla. Por eso el formulario es una sola línea, la fecha queda pegada en
// la última usada (se cargan varias del mismo día seguidas) y el foco vuelve al
// detalle después de guardar, para poder tipear la siguiente sin tocar el mouse.

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { addLibroEntry, deleteLibroEntry, type LibroActionState } from "@/lib/libro-caja-actions";
import { Field, Input, Select, buttonClasses } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";

function FormError({ state }: { state: LibroActionState }) {
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {state.error}
    </p>
  );
}

export function AddLibroEntryForm({ defaultDate }: { defaultDate: string }) {
  const [state, formAction] = useActionState<LibroActionState, FormData>(addLibroEntry, null);
  const formRef = useRef<HTMLFormElement>(null);
  // La fecha es CONTROLADA y sobrevive al reset: se cargan varias filas del mismo día
  // en fila, y volver a tipear la fecha en cada una es exactamente la fricción que
  // esta pantalla viene a sacar.
  const [date, setDate] = useState(defaultDate);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      // Foco de vuelta al detalle para tipear la fila siguiente sin tocar el mouse.
      // Se busca por id en vez de con un ref porque `Input` es un componente de
      // presentación que no declara `ref` en sus props.
      formRef.current?.querySelector<HTMLInputElement>("#libro-detail")?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[9.5rem_1fr_8rem_9.5rem_9rem]">
        <Field label="Fecha" htmlFor="libro-date" required>
          <Input
            id="libro-date"
            type="date"
            name="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Detalle" htmlFor="libro-detail" required>
          <Input
            id="libro-detail"
            type="text"
            name="detail"
            required
            autoComplete="off"
            placeholder="Nombre de la clienta, comisión, alquiler…"
          />
        </Field>
        <Field label="Tipo" htmlFor="libro-type">
          <Select id="libro-type" name="type" defaultValue="INGRESO">
            <option value="INGRESO">Ingreso</option>
            <option value="EGRESO">Egreso</option>
          </Select>
        </Field>
        <Field label="Medio" htmlFor="libro-method">
          <Select id="libro-method" name="method" defaultValue="MP">
            <option value="EFECTIVO">Efectivo</option>
            <option value="MP">MP / Transf.</option>
            <option value="TARJETA">Tarjeta</option>
          </Select>
        </Field>
        <Field label="Monto" htmlFor="libro-amount" required>
          <Input
            id="libro-amount"
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            required
            inputMode="decimal"
            className="text-right tabular-nums"
          />
        </Field>
      </div>
      <FormError state={state} />
      <div>
        <SubmitButton className={buttonClasses("solid", "md")} pendingText="Guardando…">
          Agregar movimiento
        </SubmitButton>
      </div>
    </form>
  );
}

// Borrado de una fila. Va como form propio por fila (no como acción masiva): borrar
// plata es puntual y se audita fila por fila.
//
// Usa su propio botón en vez de `SubmitButton` porque necesita `title`/`aria-label`
// (es un botón de sólo ícono: sin nombre accesible, un lector de pantalla anunciaría
// nada más que "✕") y el componente compartido no los expone.
function DeleteSubmit({ label, title }: { label: string; title: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-label={label}
      className="rounded px-1.5 py-0.5 text-xs text-faint hover:bg-danger-soft hover:text-danger disabled:opacity-50"
    >
      {pending ? "…" : "\u2715"}
    </button>
  );
}

export function DeleteLibroEntryButton({ id, detail }: { id: string; detail: string }) {
  const [state, formAction] = useActionState<LibroActionState, FormData>(deleteLibroEntry, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <DeleteSubmit
        label={`Borrar movimiento ${detail}`}
        title={state && !state.ok ? state.error : `Borrar \u201c${detail}\u201d`}
      />
      {state && !state.ok && <span className="sr-only" role="alert">{state.error}</span>}
    </form>
  );
}
