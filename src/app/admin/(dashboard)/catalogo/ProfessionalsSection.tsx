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
import { Input, Select, buttonClasses } from "@/components/ui";

type Box = { id: string; name: string; active: boolean };
type Service = {
  id: string;
  name: string;
  active: boolean;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
};
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
    <div className="rounded-lg border border-line p-4 bg-surface-raised">
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
                  className="accent-accent"
                />
                {d.label}
              </label>
              <input type="hidden" name="day" value={d.n} />
              <input
                type="time"
                name="startTime"
                defaultValue={existing?.startTime ?? "09:00"}
                className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
              />
              <span className="text-faint">a</span>
              <input
                type="time"
                name="endTime"
                defaultValue={existing?.endTime ?? "19:00"}
                className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
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
    <div className="rounded-lg border border-line p-4 bg-surface-raised">
      <p className="text-sm font-medium mb-1">Novedades / ausencias</p>
      <p className="text-xs text-muted mb-3">
        Bloqueá los días que este profesional no está (franco, vacaciones, no viene). La agenda no
        va a ofrecer turnos con él en ese rango.
      </p>
      {p.blocks.length > 0 && (
        <ul className="space-y-1 mb-3">
          {p.blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between text-sm">
              <span>
                {fmtShortDate(b.startsAt)} – {fmtShortDate(b.endsAt)} ·{" "}
                <span className="text-muted">{b.reason}</span>
              </span>
              <form action={deleteProfessionalBlock}>
                <input type="hidden" name="id" value={b.id} />
                <button type="submit" className="text-xs text-danger hover:underline">
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
        <label className="text-xs text-muted">
          Desde
          <input type="date" name="startDate" required className="mt-1 w-full rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent" />
        </label>
        <label className="text-xs text-muted">
          Hasta
          <input type="date" name="endDate" required className="mt-1 w-full rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent" />
        </label>
        <input
          name="reason"
          required
          placeholder="Motivo (vacaciones, franco...)"
          className="col-span-2 sm:col-span-1 rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
        />
        <button
          type="submit"
          className={buttonClasses("solid", "sm", "col-span-2 sm:col-span-1 sm:py-1.5")}
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
    <div className="rounded-lg border border-line p-4 bg-surface-raised">
      <p className="text-sm font-medium mb-1">Comisión por servicio</p>
      <p className="text-xs text-muted mb-3">
        Comisión general: <strong>{p.commissionPercent}%</strong>. Si un servicio paga distinto,
        poné el porcentaje acá. Dejalo vacío para usar el general.
      </p>
      {p.services.length === 0 ? (
        <p className="text-sm text-muted">Este profesional no tiene servicios asignados.</p>
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
                className="w-20 rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
              />
              <span className="text-faint">%</span>
              <button type="submit" className="text-xs font-medium text-body hover:underline">
                Guardar
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

// Selector de servicios agrupado por categoría, colapsable. Reemplaza la
// pared de checkboxes sueltos (79 servicios en una sola bolsa) por un árbol
// que se puede recorrer por categoría — clave en mobile, donde tocar un
// checkbox de 1 línea entre decenas de otros lleva a error de tap.
function ServiceTreePicker({
  services,
  selectedIds,
  name,
}: {
  services: Service[];
  selectedIds: Set<string>;
  name: string;
}) {
  const groups = new Map<string, { label: string; items: Service[] }>();
  for (const s of services) {
    const key = s.category?.id ?? "sin-categoria";
    const label = s.category?.name ?? "Sin categoría";
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(s);
  }
  const selectedCountIn = (items: Service[]) => items.filter((s) => selectedIds.has(s.id)).length;

  return (
    <div className="rounded-md border border-line divide-y">
      {[...groups.values()].map((g) => {
        const selectedCount = selectedCountIn(g.items);
        return (
          <details key={g.label} className="group" open={selectedCount > 0}>
            <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer select-none list-none text-sm">
              <span className="flex items-center gap-2">
                <span className="text-faint transition-transform group-open:rotate-90">›</span>
                {g.label}
              </span>
              <span
                className={`text-xs rounded-full px-2 py-0.5 ${
                  selectedCount > 0 ? "bg-accent text-white" : "bg-surface-sunken text-muted"
                }`}
              >
                {selectedCount > 0 ? `${selectedCount}/${g.items.length}` : g.items.length}
              </span>
            </summary>
            <div className="px-3 pb-3 pt-1 flex flex-wrap gap-2">
              {g.items.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border border-line px-3 py-2.5 text-sm min-h-11 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <input
                    type="checkbox"
                    name={name}
                    value={s.id}
                    defaultChecked={selectedIds.has(s.id)}
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </details>
        );
      })}
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
        className="space-y-2 rounded-lg border border-line p-4"
      >
        <input type="hidden" name="id" value={p.id} />
        <div className="grid grid-cols-2 gap-2">
          <Input
            name="name"
            defaultValue={p.name}
            required
          />
          <Input
            name="phone"
            defaultValue={p.phone ?? ""}
            placeholder="Teléfono"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            name="boxId"
            defaultValue={p.box?.id ?? ""}
            required
          >
            <option value="">Seleccioná un box</option>
            {boxes
              .filter((b) => b.active || b.id === p.box?.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </Select>
          <div className="flex items-center gap-2">
            <Input
              name="commissionPercent"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={p.commissionPercent}
            />
            <span className="text-sm text-muted whitespace-nowrap">% comisión</span>
          </div>
        </div>
        <div>
          <p className="text-sm text-muted mb-1">Servicios que realiza</p>
          <ServiceTreePicker
            services={services.filter((s) => s.active || p.services.some((ps) => ps.id === s.id))}
            selectedIds={new Set(p.services.map((ps) => ps.id))}
            name="serviceIds"
          />
        </div>
        <div className="flex gap-4 pt-1">
          <button
            type="submit"
            className={buttonClasses("solid", "md", "min-h-11")}
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={buttonClasses("outline", "md", "min-h-11")}
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  const chipBtn =
    "min-h-10 flex items-center rounded-md border border-line px-3 text-sm text-body active:bg-surface-sunken";
  const chipBtnActive = "min-h-10 flex items-center rounded-md border border-accent bg-accent px-3 text-sm text-white";

  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className={p.active ? "font-medium" : "font-medium text-faint line-through"}>
          {p.name}
        </span>
        <button onClick={() => setEditing(true)} className="text-sm text-muted hover:underline shrink-0">
          Editar
        </button>
      </div>
      <p className="text-sm text-muted">
        {p.box ? p.box.name : "Sin box asignado"} · {p.phone || "sin teléfono"} ·{" "}
        <strong className="text-body">{p.commissionPercent}% comisión</strong>
      </p>
      <p className="text-sm text-muted">
        {p.services.length > 0
          ? p.services.map((s) => s.name).join(", ")
          : "Sin servicios asignados"}
      </p>
      <p className="text-xs text-faint mt-1 mb-3">{scheduleSummary(p.workingHours)}</p>

      {/* Grupo de acciones frecuentes — botones con cuerpo real, min 40px de
          alto para el dedo, separados en dos filas para no amontonarse en
          mobile (antes eran links de texto pegados uno al lado del otro). */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button
          onClick={() => setEditingComisiones((v) => !v)}
          className={editingComisiones ? chipBtnActive : chipBtn}
        >
          Comisión
        </button>
        <button
          onClick={() => setEditingHours((v) => !v)}
          className={editingHours ? chipBtnActive : chipBtn}
        >
          Horario
        </button>
        <button
          onClick={() => setEditingNovedades((v) => !v)}
          className={editingNovedades ? chipBtnActive : chipBtn}
        >
          Novedades
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={toggleProfessionalActive}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="active" value={String(p.active)} />
          <button type="submit" className={chipBtn}>
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
          <button type="submit" className={`${chipBtn} text-danger border-danger/40`}>
            Eliminar
          </button>
        </form>
      </div>

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
      <p className="text-sm text-muted mb-3">
        Cada profesional tiene un box fijo, los servicios que puede realizar y su propio horario
        semanal — los días sin horario configurado no se ofrecen para reservar.
      </p>
      <div className="space-y-2 mb-4">
        {professionals.map((p) => (
          <ProfessionalRow key={p.id} professional={p} boxes={boxes} services={services} />
        ))}
        {professionals.length === 0 && (
          <p className="text-sm text-muted">No hay profesionales cargados todavía.</p>
        )}
      </div>

      <form action={createProfessional} className="space-y-2 rounded-lg border border-line p-4">
        <p className="text-sm font-medium">Agregar profesional</p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            name="name"
            required
            placeholder="Nombre y apellido"
          />
          <Input
            name="phone"
            placeholder="Teléfono (opcional)"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select name="boxId" required>
            <option value="">Seleccioná un box</option>
            {boxes
              .filter((b) => b.active)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </Select>
          <div className="flex items-center gap-2">
            <Input
              name="commissionPercent"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={0}
              placeholder="0"
            />
            <span className="text-sm text-muted whitespace-nowrap">% comisión</span>
          </div>
        </div>
        <div>
          <p className="text-sm text-muted mb-1">Servicios que realiza</p>
          {services.length === 0 ? (
            <p className="text-sm text-muted">Cargá servicios primero.</p>
          ) : (
            <ServiceTreePicker
              services={services.filter((s) => s.active)}
              selectedIds={new Set()}
              name="serviceIds"
            />
          )}
        </div>
        <p className="text-xs text-faint">
          El horario semanal se configura después de crear el profesional, con el botón "Horario".
        </p>
        <button
          type="submit"
          className={buttonClasses("solid", "md", "w-full")}
        >
          Agregar profesional
        </button>
      </form>
    </section>
  );
}
