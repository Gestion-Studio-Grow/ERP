"use client";

import { useMemo, useState } from "react";
import { updateServiceReminderConfig } from "@/lib/reminders-actions";
import SubmitButton from "@/components/SubmitButton";

// Árbol de configuración de recordatorios por servicio. Reemplaza el listado
// plano de un formulario abierto por servicio (con 20+ servicios era un muro):
// categorías colapsadas → tocás una y ves sus servicios con su estado como
// chip ("24 hs" / "Off") → tocás un servicio y recién ahí se abre su config.

type Service = {
  id: string;
  name: string;
  reminderEnabled: boolean;
  reminderHoursBefore: number;
  category: { id: string; name: string } | null;
};

function StatusChip({ service }: { service: Service }) {
  if (!service.reminderEnabled) {
    return (
      <span className="inline-block rounded-full bg-neutral-100 text-neutral-500 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
        Desactivado
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
      {service.reminderHoursBefore} hs antes
    </span>
  );
}

function ServiceConfigForm({ service }: { service: Service }) {
  return (
    <form
      action={updateServiceReminderConfig}
      className="flex flex-wrap items-center gap-3 border-t bg-neutral-50 px-3 py-3"
    >
      <input type="hidden" name="id" value={service.id} />
      <label className="flex items-center gap-1.5 text-sm text-neutral-600">
        <input type="checkbox" name="reminderEnabled" defaultChecked={service.reminderEnabled} />
        Recordatorio activado
      </label>
      <label className="flex items-center gap-1.5 text-sm text-neutral-600">
        Avisar
        <input
          type="number"
          name="reminderHoursBefore"
          defaultValue={service.reminderHoursBefore}
          min={1}
          className="w-16 rounded border px-2 py-1"
        />
        hs antes
      </label>
      <SubmitButton
        pendingText="Guardando…"
        className="text-sm rounded-md bg-black text-white px-3 py-1.5"
      >
        Guardar
      </SubmitButton>
    </form>
  );
}

export default function ReminderServicesTree({ services }: { services: Service[] }) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openService, setOpenService] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; services: Service[] }>();
    for (const s of services) {
      const key = s.category?.id ?? "__none__";
      const name = s.category?.name ?? "Sin categoría";
      if (!byId.has(key)) byId.set(key, { id: key, name, services: [] });
      byId.get(key)!.services.push(s);
    }
    // "Sin categoría" al final; el resto ya viene ordenado por category.order.
    const list = [...byId.values()];
    const idx = list.findIndex((g) => g.id === "__none__");
    if (idx >= 0) list.push(...list.splice(idx, 1));
    return list;
  }, [services]);

  if (services.length === 0) {
    return <p className="text-sm text-neutral-500">Sin servicios activos.</p>;
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const open = openCategory === g.id;
        const offCount = g.services.filter((s) => !s.reminderEnabled).length;
        return (
          <div key={g.id} className="rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setOpenCategory(open ? null : g.id);
                setOpenService(null);
              }}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-neutral-50"
            >
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="font-medium text-sm truncate">{g.name}</span>
                <span className="text-xs text-neutral-400 whitespace-nowrap">
                  {g.services.length} servicio{g.services.length !== 1 ? "s" : ""}
                  {offCount > 0 && ` · ${offCount} sin recordatorio`}
                </span>
              </span>
              <span
                aria-hidden
                className={`text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
              >
                ›
              </span>
            </button>

            {open && (
              <div className="border-t divide-y">
                {g.services.map((s) => {
                  const openConfig = openService === s.id;
                  return (
                    <div key={s.id}>
                      <button
                        type="button"
                        onClick={() => setOpenService(openConfig ? null : s.id)}
                        aria-expanded={openConfig}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-neutral-50"
                      >
                        <span className="text-sm truncate">{s.name}</span>
                        <StatusChip service={s} />
                      </button>
                      {openConfig && <ServiceConfigForm service={s} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
