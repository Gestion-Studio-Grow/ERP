"use client";

import { useMemo, useState } from "react";
import { updateServiceReminderConfig } from "@/lib/reminders-actions";
import SubmitButton from "@/components/SubmitButton";
import { Marca, Renglon, Rotulo, buttonClasses } from "@/components/ui";
import PasoVacio from "../turnos/PasoVacio";
import { vacioSinServicios } from "../turnos/pasos";

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
      <span className="inline-block rounded-full bg-surface-sunken text-muted px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
        Desactivado
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-success-soft text-success px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
      {service.reminderHoursBefore} hs antes
    </span>
  );
}

function ServiceConfigForm({ service }: { service: Service }) {
  return (
    <form
      action={updateServiceReminderConfig}
      className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-sunken px-3 py-3"
    >
      <input type="hidden" name="id" value={service.id} />
      <label className="flex items-center gap-1.5 text-sm text-body max-sm:min-h-11">
        <input type="checkbox" name="reminderEnabled" defaultChecked={service.reminderEnabled} className="accent-accent" />
        Recordatorio activado
      </label>
      <label className="flex items-center gap-1.5 text-sm text-body">
        Avisar
        <input
          type="number"
          name="reminderHoursBefore"
          defaultValue={service.reminderHoursBefore}
          min={1}
          inputMode="numeric"
          className="w-16 rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-strong focus:border-accent max-sm:h-11"
        />
        hs antes
      </label>
      <SubmitButton
        pendingText="Guardando…"
        className={buttonClasses("solid", "sm")}
      >
        Guardar
      </SubmitButton>
    </form>
  );
}

export default function ReminderServicesTree({
  services,
  abreCatalogo = false,
  renglon = false,
}: {
  services: Service[];
  /** ¿Quien mira puede abrir el Catálogo? Decide si el estado vacío lleva a cargar servicios. */
  abreCatalogo?: boolean;
  /**
   * Diseño nuevo («Renglón»): todos los servicios a la vista, agrupados por categoría, cada uno con
   * su estado en palabras («24 hs antes», «Sin aviso») y «Cambiar» que abre el mismo formulario. Sin
   * el acordeón de dos niveles: antes había que tocar dos veces para saber si un servicio avisaba.
   */
  renglon?: boolean;
}) {
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
    return (
      <PasoVacio paso={vacioSinServicios({ abreCatalogo })} />
    );
  }

  if (renglon) {
    return (
      <div>
        {groups.map((g) => (
          <div key={g.id} className="pt-3">
            <Rotulo as="h3">{g.name}</Rotulo>
            <ul aria-label={`Servicios de ${g.name}`}>
              {g.services.map((s) => {
                const abierto = openService === s.id;
                return (
                  <li key={s.id} className="border-b border-line">
                    <Renglon
                      className="border-b-0"
                      titulo={<span className="break-words">{s.name}</span>}
                      detalle={
                        s.reminderEnabled ? (
                          <Marca tipo="hecho">{`${s.reminderHoursBefore} hs antes`}</Marca>
                        ) : (
                          <Marca tipo="pendiente" className="text-muted">
                            Sin aviso
                          </Marca>
                        )
                      }
                      tecla={
                        <button
                          type="button"
                          onClick={() => setOpenService(abierto ? null : s.id)}
                          aria-expanded={abierto}
                          className={buttonClasses("ghost", "sm", "min-h-11")}
                        >
                          {abierto ? "Cerrar" : "Cambiar"}
                          <span className="sr-only">{` el recordatorio de ${s.name}`}</span>
                        </button>
                      }
                    />
                    {abierto && <ServiceConfigForm service={s} />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const open = openCategory === g.id;
        const offCount = g.services.filter((s) => !s.reminderEnabled).length;
        return (
          <div key={g.id} className="rounded-lg border border-line overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setOpenCategory(open ? null : g.id);
                setOpenService(null);
              }}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-accent-soft max-sm:min-h-11"
            >
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="font-medium text-sm truncate">{g.name}</span>
                <span className="text-xs text-faint whitespace-nowrap">
                  {g.services.length} servicio{g.services.length !== 1 ? "s" : ""}
                  {offCount > 0 && ` · ${offCount} sin recordatorio`}
                </span>
              </span>
              <span
                aria-hidden
                className={`text-faint transition-transform ${open ? "rotate-90" : ""}`}
              >
                ›
              </span>
            </button>

            {open && (
              <div className="border-t border-line divide-y divide-line">
                {g.services.map((s) => {
                  const openConfig = openService === s.id;
                  return (
                    <div key={s.id}>
                      <button
                        type="button"
                        onClick={() => setOpenService(openConfig ? null : s.id)}
                        aria-expanded={openConfig}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent-soft max-sm:min-h-11"
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
