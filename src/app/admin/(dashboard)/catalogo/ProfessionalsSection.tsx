"use client";

import { useState } from "react";
import {
  createProfessional,
  toggleProfessionalActive,
  updateProfessional,
  deleteProfessional,
  setWorkingHours,
  createProfessionalBlock,
  deleteProfessionalBlock,
  setProfessionalServiceCommission,
} from "@/lib/catalog-actions";
import { fmtShortDate } from "@/lib/datetime";
import { useToast } from "../ToastProvider";

type Box = { id: string; name: string; active: boolean };
type Service = { id: string; name: string; active: boolean };
type WorkingHour = { dayOfWeek: number; startTime: string; endTime: string };
type Block = { id: string; startsAt: Date; endsAt: Date; reason: string };
type ServiceCommission = { serviceId: string; commissionPercent: number };
type Professional = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  box: Box | null;
  services: Service[];
  commissionPercent: number;
  workingHours: WorkingHour[];
  blocks: Block[];
  serviceCommissions: ServiceCommission[];
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

// Novedades / ausencias del profesional (G9): franco, vacaciones, no viene tal día.
function NovedadesEditor({ professional: p }: { professional: Professional }) {
  const { showError } = useToast();
  return (
    <div className="rounded-lg border p-4 bg-neutral-50">
      <p className="text-sm font-medium mb-1">Novedades / ausencias</p>
      <p className="text-xs text-neutral-500 mb-3">
        Bloqueá los días que este profesional no está (franco, vacaciones, no viene). La agenda no
        va a ofrecer turnos con él en ese rango.
      </p>
      {p.blocks.length > 0 && (
        <ul className="space-y-1 mb-3">
          {p.blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between text-sm">
              <span>
                {fmtShortDate(b.startsAt)} – {fmtShortDate(b.endsAt)} ·{" "}
                <span className="text-neutral-500">{b.reason}</span>
              </span>
              <form action={deleteProfessionalBlock}>
                <input type="hidden" name="id" value={b.id} />
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Quitar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form
        action={async (fd) => {
          try {
            await createProfessionalBlock(fd);
          } catch (err) {
            showError(err instanceof Error ? err.message : "No se pudo guardar la novedad.");
          }
        }}
        className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.5fr_auto] items-end gap-2"
      >
        <input type="hidden" name="professionalId" value={p.id} />
        <label className="text-xs text-neutral-500">
          Desde
          <input type="date" name="startDate" required className="mt-1 w-full rounded-md border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-neutral-500">
          Hasta
          <input type="date" name="endDate" required className="mt-1 w-full rounded-md border px-2 py-1 text-sm" />
        </label>
        <input
          name="reason"
          required
          placeholder="Motivo (vacaciones, franco...)"
          className="col-span-2 sm:col-span-1 rounded-md border px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="col-span-2 sm:col-span-1 rounded-md bg-black text-white px-3 py-2 sm:py-1.5 text-sm font-medium"
        >
          Agregar
        </button>
      </form>
    </div>
  );
}

// Comisión por servicio (G18): override del % general para servicios puntuales.
function CommissionsEditor({ professional: p }: { professional: Professional }) {
  const overrideFor = (serviceId: string) =>
    p.serviceCommissions.find((c) => c.serviceId === serviceId)?.commissionPercent;
  return (
    <div className="rounded-lg border p-4 bg-neutral-50">
      <p className="text-sm font-medium mb-1">Comisión por servicio</p>
      <p className="text-xs text-neutral-500 mb-3">
        Comisión general: <strong>{p.commissionPercent}%</strong>. Si un servicio paga distinto,
        poné el porcentaje acá. Dejalo vacío para usar el general.
      </p>
      {p.services.length === 0 ? (
        <p className="text-sm text-neutral-500">Este profesional no tiene servicios asignados.</p>
      ) : (
        <div className="space-y-1.5">
          {p.services.map((s) => (
            <form
              key={s.id}
              action={setProfessionalServiceCommission}
              className="flex items-center gap-2 text-sm"
            >
              <input type="hidden" name="professionalId" value={p.id} />
              <input type="hidden" name="serviceId" value={s.id} />
              <span className="flex-1 truncate">{s.name}</span>
              <input
                name="commissionPercent"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={overrideFor(s.id) ?? ""}
                placeholder={`${p.commissionPercent}`}
                className="w-20 rounded-md border px-2 py-1 text-sm"
              />
              <span className="text-neutral-400">%</span>
              <button type="submit" className="text-xs font-medium text-neutral-600 hover:underline">
                Guardar
              </button>
            </form>
          ))}
        </div>
      )}
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
  const [editingNovedades, setEditingNovedades] = useState(false);
  const [editingComisiones, setEditingComisiones] = useState(false);
  const { showError, showSuccess } = useToast();

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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className={p.active ? "font-medium" : "font-medium text-neutral-400 line-through"}>
          {p.name}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            onClick={() => setEditingHours((v) => !v)}
            className="text-sm text-neutral-500 hover:underline"
          >
            Horario
          </button>
          <button
            onClick={() => setEditingNovedades((v) => !v)}
            className="text-sm text-neutral-500 hover:underline"
          >
            Novedades
          </button>
          <button
            onClick={() => setEditingComisiones((v) => !v)}
            className="text-sm text-neutral-500 hover:underline"
          >
            Comisiones
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
                showSuccess(`"${p.name}" eliminado.`);
              } catch (err) {
                showError(err instanceof Error ? err.message : "No se pudo eliminar.");
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
      {editingNovedades && (
        <div className="mt-3">
          <NovedadesEditor professional={p} />
        </div>
      )}
      {editingComisiones && (
        <div className="mt-3">
          <CommissionsEditor professional={p} />
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
