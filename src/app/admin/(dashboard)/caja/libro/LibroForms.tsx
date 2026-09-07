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
  // ¿La acción pidió confirmación (fecha fuera del mes, o posible duplicado)?
  //
  // Es un BOOLEANO, no una copia del FormData. Guardar la foto de los datos y
  // reenviarla era un bug que costaba plata: si la persona veía el aviso de
  // duplicado, se daba cuenta de que era otra clienta, CORREGÍA los campos y
  // apretaba "Guardar igual", se guardaba el movimiento VIEJO —el duplicado que la
  // guarda venía a evitar— y el corregido se perdía, con la pantalla mostrando los
  // datos nuevos. Ahora el reenvío relee el formulario.
  const [porConfirmar, setPorConfirmar] = useState(false);

  // Lee SIEMPRE lo que está en pantalla en este instante.
  function datosActuales(confirmar: boolean): FormData | null {
    const form = formRef.current;
    if (!form) return null;
    const fd = new FormData(form);
    fd.set("viewMonth", viewMonth);
    if (confirmar) fd.set("confirm", "1");
    return fd;
  }

  function enviar(confirmar: boolean) {
    const fd = datosActuales(confirmar);
    if (!fd) return;
    startTransition(async () => {
      const res = await addLibroEntry(null, fd);
      setState(res);
      if (res?.ok) {
        setPorConfirmar(false);
        formRef.current?.reset();
        formRef.current?.querySelector<HTMLInputElement>("#libro-detail")?.focus();
        router.refresh();
      } else {
        setPorConfirmar(Boolean(res && !res.ok && res.confirmable));
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        enviar(false);
      }}
      // Tocar cualquier campo cancela una confirmación pendiente: si la persona
      // corrigió el dato, lo que corresponde es volver a validar de cero, no dejar
      // a mano un botón que saltea las guardas sobre datos que ya cambiaron.
      onInput={() => {
        if (porConfirmar) {
          setPorConfirmar(false);
          setState(null);
        }
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
          <button type="button" onClick={() => enviar(true)} className={buttonClasses("outline", "md")}>
            Guardar igual
          </button>
        )}
      </div>
    </form>
  );
}

// Qué filas están "armadas" para borrar, FUERA del estado de React.
//
// El QA midió que ~8% de los borrados no pasaban del primer clic: al borrar una
// fila, el refresco de la lista remonta los botones de las demás y `useState(false)`
// volvía a cero, así que el segundo clic re-armaba en vez de confirmar y en pantalla
// no pasaba nada. No perdía datos, pero es un "apreté y no pasó nada" sobre un botón
// que maneja plata.
//
// Guardar el armado en un módulo y sembrar el estado desde ahí en el montaje lo hace
// sobrevivir al remonte. Es un Set y no un contexto porque no hay ningún componente
// cliente que envuelva la tabla (las filas las pinta el server component).
const ARMADOS = new Set<string>();

// Borrado de una fila. Form propio por fila: borrar plata es puntual y se audita
// fila por fila. Dos pasos —la ✕ pregunta, y recién el segundo clic borra— porque
// no hay deshacer y un toque de más se lleva un movimiento.
export function DeleteLibroEntryButton({ id, detail }: { id: string; detail: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // El inicializador corre en cada montaje: si la fila ya estaba armada antes del
  // refresco, vuelve armada.
  const [armado, setArmadoState] = useState(() => ARMADOS.has(id));
  const [error, setError] = useState<string | null>(null);

  function setArmado(v: boolean) {
    if (v) ARMADOS.add(id);
    else ARMADOS.delete(id);
    setArmadoState(v);
  }

  // Si se armó y no se confirma, se desarma solo: un botón de borrar que queda
  // cebado esperando un clic distraído es peor que pedir el clic de nuevo.
  useEffect(() => {
    if (!armado) return;
    // Se desarma tocando el Set directamente (y no `setArmado`) para no depender de
    // una función que se recrea en cada render y haría re-correr el efecto siempre.
    const t = setTimeout(() => {
      ARMADOS.delete(id);
      setArmadoState(false);
    }, 4000);
    return () => clearTimeout(t);
  }, [armado, id]);

  function borrar() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteLibroEntry(null, fd);
      if (res?.ok) {
        setError(null);
        ARMADOS.delete(id);
        setArmadoState(false);
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
