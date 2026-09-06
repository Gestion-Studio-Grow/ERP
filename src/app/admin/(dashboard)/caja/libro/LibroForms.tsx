"use client";

// Formularios del LIBRO DE CAJA.
//
// ⚠️ NO usan `useActionState` + `<form action={...}>`, a diferencia de CajaForms.tsx.
// El QA de recorrido encontró que por ese camino ~4 de cada 10 guardados quedaban
// colgados en "Guardando…" para siempre: el server action respondía 200 en menos de
// 200 ms y la fila QUEDABA ESCRITA en la base, pero el estado del hook nunca se
// resolvía — sin error en consola ni en el servidor. En una caja eso es el peor
// error posible: la persona no ve nada, vuelve a tipear, y queda el doble cobro.
//
// Acá la acción se INVOCA DIRECTO y se espera su promesa. Si el servidor contesta
// —y contesta— el `await` resuelve sí o sí, y de ahí sale tanto el mensaje como el
// refresco de la lista (`router.refresh()`). Es un camino más simple y sin
// intermediarios que puedan perder la actualización.
//
// Objetivo de diseño de la carga: que anotar una fila cueste lo mismo que en la
// planilla. Fecha, tipo y medio quedan PEGADOS en lo último usado (se cargan seis
// egresos en efectivo seguidos), el foco vuelve al detalle y cada alta confirma en
// pantalla lo que guardó.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLibroEntry, deleteLibroEntry, type LibroActionState } from "@/lib/libro-caja-actions";
import { Field, Input, Select, buttonClasses } from "@/components/ui";

function Mensaje({ state }: { state: LibroActionState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="rounded-md bg-success-soft px-3 py-2 text-sm text-success"
      >
        {state.message ?? "Guardado."}
      </p>
    );
  }
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {state.error}
    </p>
  );
}

export function AddLibroEntryForm({
  defaultDate,
  viewMonth,
}: {
  defaultDate: string;
  viewMonth: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<LibroActionState>(null);
  const [pending, startTransition] = useTransition();

  // El estado arranca del mes que se está mirando y se re-inicializa al cambiar de
  // mes porque la página monta este componente con `key={monthKey}`. Sin ese remonte,
  // llegar a agosto con la flecha y guardar mandaba la fila a septiembre —se guardaba
  // bien pero desaparecía de la pantalla, que es peor que un error visible.
  //
  // Fecha, tipo y medio CONTROLADOS y pegados: sobreviven al reset del formulario.
  // Volver a elegir "egreso / efectivo" en cada fila es exactamente la fricción que
  // esta pantalla viene a sacar.
  const [date, setDate] = useState(defaultDate);
  const [type, setType] = useState("INGRESO");
  const [method, setMethod] = useState("MP");
  // Cuando la acción pide confirmación (fecha fuera del mes, o posible duplicado)
  // guardamos los datos tal cual se enviaron para poder reenviarlos con `confirm`.
  const [porConfirmar, setPorConfirmar] = useState<FormData | null>(null);

  function enviar(fd: FormData) {
    startTransition(async () => {
      const res = await addLibroEntry(null, fd);
      setState(res);
      if (res?.ok) {
        setPorConfirmar(null);
        formRef.current?.reset();
        formRef.current?.querySelector<HTMLInputElement>("#libro-detail")?.focus();
        router.refresh();
      } else if (res && !res.ok && res.confirmable) {
        setPorConfirmar(fd);
      } else {
        setPorConfirmar(null);
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("viewMonth", viewMonth);
        enviar(fd);
      }}
      className="flex flex-col gap-4"
    >
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
            placeholder="De quién entró o en qué se gastó"
          />
        </Field>
        <Field label="Tipo" htmlFor="libro-type">
          <Select id="libro-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="INGRESO">Ingreso</option>
            <option value="EGRESO">Egreso</option>
          </Select>
        </Field>
        <Field label="Medio" htmlFor="libro-method">
          <Select
            id="libro-method"
            name="method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
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

      <Mensaje state={state} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`${buttonClasses("solid", "md")} disabled:opacity-50`}
        >
          {pending ? "Guardando…" : "Agregar movimiento"}
        </button>

        {/* Segundo paso explícito cuando la acción avisó algo raro (fecha fuera del
            mes, posible duplicado). No se guarda nada hasta que la persona insiste. */}
        {porConfirmar && !pending && (
          <button
            type="button"
            onClick={() => {
              const fd = porConfirmar;
              fd.set("confirm", "1");
              enviar(fd);
            }}
            className={buttonClasses("outline", "md")}
          >
            Guardar igual
          </button>
        )}
      </div>
    </form>
  );
}

// Borrado de una fila. Form propio por fila: borrar plata es puntual y se audita
// fila por fila. Dos pasos —la ✕ pregunta, y recién el segundo clic borra— porque
// no hay deshacer y un toque de más se lleva un movimiento.
export function DeleteLibroEntryButton({ id, detail }: { id: string; detail: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armado, setArmado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si se armó y no se confirma, se desarma solo: un botón de borrar que queda
  // cebado esperando un clic distraído es peor que pedir el clic de nuevo.
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(t);
  }, [armado]);

  function borrar() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteLibroEntry(null, fd);
      if (res?.ok) {
        setError(null);
        setArmado(false);
        router.refresh();
      } else {
        // El error del borrado tiene que VERSE: antes iba sólo al `title` y a un
        // `sr-only`, así que en pantalla no pasaba nada.
        setError(res && !res.ok ? res.error : "No se pudo borrar.");
        setArmado(false);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => (armado ? borrar() : setArmado(true))}
        title={armado ? `Confirmar borrado de “${detail}”` : `Borrar “${detail}”`}
        aria-label={
          armado ? `Confirmar borrado del movimiento ${detail}` : `Borrar movimiento ${detail}`
        }
        className={
          armado
            ? "rounded bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger disabled:opacity-50"
            : "rounded px-1.5 py-0.5 text-xs text-faint hover:bg-danger-soft hover:text-danger disabled:opacity-50"
        }
      >
        {pending ? "…" : armado ? "¿Borrar?" : "✕"}
      </button>
    </span>
  );
}
