"use client";

import { useState } from "react";
import {
  createProfessional,
  toggleProfessionalActive,
  updateProfessional,
  deleteProfessional,
} from "@/lib/catalog-actions";

type Box = { id: string; name: string; active: boolean };
type Service = { id: string; name: string; active: boolean };
type Professional = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  box: Box | null;
  services: Service[];
  commissionPercent: number;
};

function ProfessionalRow({
  professional: p,
  boxes,
  services,
}: {
  professional: Professional;
  boxes: Box[];
  services: Service[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={async (fd) => {
          await updateProfessional(fd);
          setEditing(false);
        }}
        className="space-y-2 rounded-lg border p-4"
      >
        <input type="hidden" name="id" value={p.id} />
        <div className="grid grid-cols-2 gap-2">
          <input
            name="name"
            defaultValue={p.name}
            required
            className="rounded-md border px-3 py-2 text-sm"
          />
          <input
            name="phone"
            defaultValue={p.phone ?? ""}
            placeholder="Teléfono"
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            name="boxId"
            defaultValue={p.box?.id ?? ""}
            required
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Seleccioná un box</option>
            {boxes
              .filter((b) => b.active || b.id === p.box?.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              name="commissionPercent"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={p.commissionPercent}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <span className="text-sm text-neutral-500 whitespace-nowrap">% comisión</span>
          </div>
        </div>
        <div>
          <p className="text-sm text-neutral-500 mb-1">Servicios que realiza</p>
          <div className="flex flex-wrap gap-2">
            {services
              .filter((s) => s.active || p.services.some((ps) => ps.id === s.id))
              .map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="serviceIds"
                    value={s.id}
                    defaultChecked={p.services.some((ps) => ps.id === s.id)}
                  />
                  {s.name}
                </label>
              ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" className="text-sm font-medium">
            Guardar
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500">
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between">
        <span className={p.active ? "font-medium" : "font-medium text-neutral-400 line-through"}>
          {p.name}
        </span>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(true)} className="text-sm text-neutral-500 hover:underline">
            Editar
          </button>
          <form action={toggleProfessionalActive}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="active" value={String(p.active)} />
            <button type="submit" className="text-sm text-neutral-500 hover:underline">
              {p.active ? "Desactivar" : "Activar"}
            </button>
          </form>
          <form
            action={async (fd) => {
              if (!confirm(`¿Eliminar a "${p.name}"? Esta acción no se puede deshacer.`)) return;
              try {
                await deleteProfessional(fd);
              } catch (err) {
                alert(err instanceof Error ? err.message : "No se pudo eliminar.");
              }
            }}
          >
            <input type="hidden" name="id" value={p.id} />
            <button type="submit" className="text-sm text-red-600 hover:underline">
              Eliminar
            </button>
          </form>
        </div>
      </div>
      <p className="text-sm text-neutral-500">
        {p.box ? p.box.name : "Sin box asignado"} · {p.phone || "sin teléfono"} ·{" "}
        {p.commissionPercent}% comisión
      </p>
      <p className="text-sm text-neutral-500">
        {p.services.length > 0
          ? p.services.map((s) => s.name).join(", ")
          : "Sin servicios asignados"}
      </p>
    </div>
  );
}

export default function ProfessionalsSection({
  professionals,
  boxes,
  services,
}: {
  professionals: Professional[];
  boxes: Box[];
  services: Service[];
}) {
  return (
    <section>
      <h2 className="text-lg font-medium mb-1">Profesionales</h2>
      <p className="text-sm text-neutral-500 mb-3">
        Cada profesional tiene un box fijo y los servicios que puede realizar.
      </p>
      <div className="space-y-2 mb-4">
        {professionals.map((p) => (
          <ProfessionalRow key={p.id} professional={p} boxes={boxes} services={services} />
        ))}
        {professionals.length === 0 && (
          <p className="text-sm text-neutral-500">No hay profesionales cargados todavía.</p>
        )}
      </div>

      <form action={createProfessional} className="space-y-2 rounded-lg border p-4">
        <p className="text-sm font-medium">Agregar profesional</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            name="name"
            required
            placeholder="Nombre y apellido"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <input
            name="phone"
            placeholder="Teléfono (opcional)"
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select name="boxId" required className="w-full rounded-md border px-3 py-2 text-sm">
            <option value="">Seleccioná un box</option>
            {boxes
              .filter((b) => b.active)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              name="commissionPercent"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={0}
              placeholder="0"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <span className="text-sm text-neutral-500 whitespace-nowrap">% comisión</span>
          </div>
        </div>
        <div>
          <p className="text-sm text-neutral-500 mb-1">Servicios que realiza</p>
          <div className="flex flex-wrap gap-2">
            {services
              .filter((s) => s.active)
              .map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <input type="checkbox" name="serviceIds" value={s.id} />
                  {s.name}
                </label>
              ))}
            {services.length === 0 && (
              <p className="text-sm text-neutral-500">Cargá servicios primero.</p>
            )}
          </div>
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-black text-white px-4 py-2 text-sm font-medium"
        >
          Agregar profesional
        </button>
      </form>
    </section>
  );
}
