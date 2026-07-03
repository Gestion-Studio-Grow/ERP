"use client";

import { useState } from "react";
import { createResource, updateResource, deleteResource } from "@/lib/catalog-actions";
import { useToast } from "../ToastProvider";

type Resource = {
  id: string;
  name: string;
  quantity: number;
  active: boolean;
  services: { id: string }[];
};

function ResourceRow({ resource: r }: { resource: Resource }) {
  const [editing, setEditing] = useState(false);
  const { showError, showSuccess } = useToast();

  if (editing) {
    return (
      <form
        action={async (fd) => {
          await updateResource(fd);
          setEditing(false);
        }}
        className="flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5"
      >
        <input type="hidden" name="id" value={r.id} />
        <input name="name" defaultValue={r.name} required className="flex-1 min-w-[140px] rounded-md border px-2 py-1 text-sm" />
        <input
          name="quantity"
          type="number"
          min={1}
          step={1}
          defaultValue={r.quantity}
          required
          className="w-20 rounded-md border px-2 py-1 text-sm"
        />
        <span className="text-sm text-neutral-500">unidades</span>
        <button type="submit" className="text-sm font-medium">
          Guardar
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500">
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border px-4 py-2.5">
      <div>
        <span className="font-medium">{r.name}</span>
        <span className="ml-2 text-sm text-neutral-500">
          {r.quantity} unidad{r.quantity !== 1 ? "es" : ""} · {r.services.length} servicio
          {r.services.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setEditing(true)} className="chip-btn">
          Editar
        </button>
        <form
          action={async (fd) => {
            if (!confirm(`¿Eliminar el recurso "${r.name}"?`)) return;
            try {
              await deleteResource(fd);
              showSuccess(`"${r.name}" eliminado.`);
            } catch (err) {
              showError(err instanceof Error ? err.message : "No se pudo eliminar.");
            }
          }}
        >
          <input type="hidden" name="id" value={r.id} />
          <button type="submit" className="chip-btn chip-btn-danger">
            Eliminar
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResourcesSection({ resources }: { resources: Resource[] }) {
  return (
    <section>
      <h2 className="text-lg font-medium mb-1">Recursos (máquinas y gabinetes)</h2>
      <p className="text-sm text-neutral-500 mb-3">
        Equipos o espacios con cantidad limitada que varios servicios comparten (ej. 2
        radiofrecuencias, 3 gabinetes). La cantidad define cuántos turnos que lo usan pueden
        coincidir en el mismo horario. En cada servicio elegís qué recursos consume.
      </p>

      <div className="space-y-2 mb-4">
        {resources.map((r) => (
          <ResourceRow key={r.id} resource={r} />
        ))}
        {resources.length === 0 && (
          <p className="text-sm text-neutral-500">No hay recursos cargados todavía.</p>
        )}
      </div>

      <form action={createResource} className="flex flex-wrap items-center gap-2 rounded-lg border p-4">
        <input
          name="name"
          required
          placeholder="Nombre (ej. Radiofrecuencia, Gabinete)"
          className="flex-1 min-w-[180px] rounded-md border px-3 py-2 text-sm"
        />
        <input
          name="quantity"
          type="number"
          min={1}
          step={1}
          defaultValue={1}
          required
          placeholder="Cantidad"
          className="w-24 rounded-md border px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium">
          Agregar
        </button>
      </form>
    </section>
  );
}
