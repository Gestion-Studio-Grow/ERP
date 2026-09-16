"use client";

import { useState } from "react";
import { updateClient } from "@/lib/client-actions";
import { useToast } from "../../ToastProvider";
import { Field, Input, Textarea, buttonClasses } from "@/components/ui";

// La ficha del cliente era de sólo lectura: un teléfono mal tipeado no se corregía nunca y
// la única vía para "arreglarlo" era reservarle otro turno con el número bien, que crea una
// SEGUNDA ficha. Este formulario es el que cierra ese callejón. Se muestra sólo a quien
// tiene `clients:manage` (lo decide la página), pero eso es UX: la seguridad real es el
// `requireCapability` de `updateClient` — ocultar un botón no es seguridad (ADR-017 §2.e).

export type ClienteEditable = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  /** Ya formateada "yyyy-mm-dd" por el server, que es lo que entiende <input type="date">. */
  birthDate: string | null;
};

export default function EditarClienteForm({ cliente }: { cliente: ClienteEditable }) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const { showError, showSuccess } = useToast();

  if (!editando) {
    return (
      <button type="button" onClick={() => setEditando(true)} className={buttonClasses("outline", "sm")}>
        Editar datos
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        setGuardando(true);
        try {
          const r = await updateClient(fd);
          if (r.ok) {
            showSuccess("Datos del cliente actualizados.");
            setEditando(false);
          } else {
            // El error se muestra y el formulario QUEDA ABIERTO con lo tipeado: el caso
            // típico es "ese teléfono ya es de otra ficha", y la persona necesita ver qué
            // puso para corregirlo.
            showError(r.error);
          }
        } finally {
          setGuardando(false);
        }
      }}
      className="rounded-lg border border-line bg-surface-raised p-4 space-y-4"
    >
      <input type="hidden" name="id" value={cliente.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre y apellido" htmlFor="cli-name" required>
          <Input id="cli-name" name="name" defaultValue={cliente.name} required maxLength={120} autoComplete="off" />
        </Field>

        <Field
          label="Teléfono"
          htmlFor="cli-phone"
          required
          hint="Es el número al que sale el recordatorio del turno."
        >
          <Input
            id="cli-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={cliente.phone}
            required
            autoComplete="off"
          />
        </Field>

        <Field label="Email" htmlFor="cli-email" hint="Opcional.">
          <Input id="cli-email" name="email" type="email" defaultValue={cliente.email ?? ""} autoComplete="off" />
        </Field>

        <Field label="Fecha de nacimiento" htmlFor="cli-birth" hint="Opcional.">
          <Input id="cli-birth" name="birthDate" type="date" defaultValue={cliente.birthDate ?? ""} />
        </Field>
      </div>

      <Field label="Notas internas" htmlFor="cli-notes" hint="No las ve el cliente.">
        <Textarea id="cli-notes" name="notes" defaultValue={cliente.notes ?? ""} rows={3} maxLength={2000} />
      </Field>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={guardando} className={buttonClasses("solid", "sm")}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          disabled={guardando}
          className={buttonClasses("ghost", "sm")}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
