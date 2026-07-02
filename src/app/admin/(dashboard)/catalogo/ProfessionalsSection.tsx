"use client";

import { useState } from "react";
import {
  createProfessional,
  toggleProfessionalActive,
  updateProfessional,
  deleteProfessional,
  setWorkingHours,
} from "@/lib/catalog-actions";

type Box = { id: string; name: string; active: boolean };
type Service = { id: string; name: string; active: boolean };
type WorkingHour = { dayOfWeek: number; startTime: string; endTime: string };
type Professional = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  box: Box | null;
  services: Service[];
  commissionPercent: number;
  workingHours: WorkingHour[];
};

const DAYS = [
  { n: 1, label: "Lunes" },
  { n: 2, label: "Martes" },
  { n: 3, label: "Miércoles" },
  { n: 4, label: "Jueves" },
  { n: 5, label: "Viernes" },
  { n: 6, label: "Sábado" },
  { n: 0, label: "Domingo" },
];
const DAY_SHORT: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

function scheduleSummary(hours: WorkingHour[]) {
  if (hours.length === 0) return "Sin horario configurado";
  return [...hours]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((h) => `${DAY_SHORT[h.dayOfWeek]} ${h.startTime}–${h.endTime}`)
    .join(" · ");
}

function WorkingHoursEditor({ professional: p }: { professional: Professional }) {
  const byDay = new Map(p.workingHours.map((h) => [h.dayOfWeek, h]));

  return (
    <div className="rounded-lg border p-4 bg-neutral-50">
      <p className="text-sm font-medium mb-3">Horario semanal</p>
      <form action={setWorkingHours} className="space-y-2">
        <input type="hidden" name="professionalId" value={p.id} />
        {DAYS.map((d) => {
          const existing = byDay.get(d.n);
          return (
            <div key={d.n} className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2 w-28 shrink-0">
                <input
                  type="checkbox"
                  name="enabledDay"
                  value={d.n}
                  defaultChecked={!!existing}
                />
                {d.label}
              </label>
              <input type="hidden" name="day" value={d.n} />
              <input
                type="time"
                name="startTime"
                defaultValue={existing?.startTime ?? "09:00"}
                className="rounded-md border px-2 py-1"
              />
              <span className="text-neutral-400">a</span>
              <input
                type="time"
                name="endTime"
                defaultValue={existing?.endTime ?? "19:00"}
                className="rounded-md border px-2 py-1"
              />
            </div>
          );
        })}
        <button type="submit" className="text-sm font-medium mt-1">
          Guardar horario
        </button>
      </form>
    </div>
  );
}

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
  const [editingHours, setEditingHours] = useState(false);

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
          <button
            onClick={() => setEditingHours((v) => !v)}
            className="text-sm text-neutral-500 hover:underline"
          >
            Horario
          </button>
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
      <p className="text-xs text-neutral-400 mt-1">{scheduleSummary(p.workingHours)}</p>

      {editingHours && (
        <div className="mt-3">
          <WorkingHoursEditor professional={p} />
        </div>
      )}
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
        Cada profesional tiene un box fijo, los servicios que puede realizar y su propio horario
        semanal — los días sin horario configurado no se ofrecen para reservar.
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
        <p className="text-xs text-neutral-400">
          El horario semanal se configura después de crear el profesional, con el botón "Horario".
        </p>
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
