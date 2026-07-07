"use client";

// ABM de la ASIGNACIÓN servicio↔profesional (variante, ADR-055) — fix-forward de
// A-1 / DX-6. Antes la asignación vivía SOLA dentro del form de cada profesional, así
// que una carga "todos con todo" pasaba desapercibida (todas las profesionales se
// veían iguales en la vidriera). Acá la asignación es un ABM de PRIMERA CLASE:
//   - se ve de un vistazo quién hace cada servicio (y qué falta),
//   - se edita desde el lado del SERVICIO (complementa el lado del profesional), y
//   - un panel de diagnóstico AVISA cuando la asignación es uniforme o hay huecos.
// Sello GSG: el crédito va en el footer del backoffice (ADR-043), no por sección.

import { useState } from "react";
import { setServiceProfessionals } from "@/lib/catalog-actions";
import { diagnosticar, hayAvisos } from "@/modules/catalog/asignacion";
import { useToast } from "../ToastProvider";

type Prof = { id: string; name: string; active: boolean; serviceIds: string[] };
type Svc = { id: string; name: string; active: boolean; categoryName: string | null };

// Panel de diagnóstico: hace VISIBLE el antipatrón DX-6 y los huecos de cobertura.
function DiagnosticoPanel({ profesionales, servicios }: { profesionales: Prof[]; servicios: Svc[] }) {
  const d = diagnosticar(profesionales, servicios);
  if (!hayAvisos(d)) {
    return (
      <p className="mb-4 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm text-muted">
        ✓ La asignación se ve sana: cada profesional tiene su propio set de servicios y no hay
        huecos de cobertura.
      </p>
    );
  }
  return (
    <div className="mb-4 rounded-lg border border-line-strong bg-surface-sunken px-4 py-3 text-sm space-y-2">
      <p className="font-medium text-strong">Revisá la asignación</p>
      {d.asignacionUniforme && (
        <p className="text-danger">
          ⚠️ Las {d.profesionalesConServicios} profesionales con servicios tienen{" "}
          <strong>exactamente el mismo set</strong>. Si no es real, corregilo: una carga uniforme
          hace que todas se vean iguales en la vidriera (lección DX-6). La asignación tiene que ser
          distinta por profesional.
        </p>
      )}
      {d.serviciosSinProfesional.length > 0 && (
        <p className="text-strong">
          <strong>{d.serviciosSinProfesional.length}</strong> servicio(s) sin nadie que los realice:{" "}
          <span className="text-muted">
            {d.serviciosSinProfesional.map((s) => s.name).join(", ")}
          </span>
          .
        </p>
      )}
      {d.profesionalesSinServicio.length > 0 && (
        <p className="text-strong">
          <strong>{d.profesionalesSinServicio.length}</strong> profesional(es) sin servicios
          asignados:{" "}
          <span className="text-muted">
            {d.profesionalesSinServicio.map((p) => p.name).join(", ")}
          </span>
          .
        </p>
      )}
    </div>
  );
}

// Editor de un servicio: qué profesionales lo realizan. Muestra las activas + las que
// ya estén asignadas (aunque estén inactivas, para poder desasignarlas).
function ServicioRow({ servicio, profesionales }: { servicio: Svc; profesionales: Prof[] }) {
  const [open, setOpen] = useState(false);
  const { showError, showSuccess } = useToast();

  const asignadas = profesionales.filter((p) => p.serviceIds.includes(servicio.id));
  const seleccionables = profesionales.filter(
    (p) => p.active || p.serviceIds.includes(servicio.id),
  );
  const asignadasIds = new Set(asignadas.map((p) => p.id));

  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm"
      >
        <span className="flex items-center gap-2">
          <span className={`text-faint transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          <span className="font-medium text-strong">{servicio.name}</span>
          {!servicio.active && <span className="text-xs text-muted">(inactivo)</span>}
          {servicio.categoryName && (
            <span className="text-xs text-muted">· {servicio.categoryName}</span>
          )}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            asignadas.length > 0 ? "bg-accent text-white" : "bg-surface-sunken text-danger"
          }`}
        >
          {asignadas.length > 0 ? `${asignadas.length} prof.` : "sin asignar"}
        </span>
      </button>

      {open && (
        <form
          action={async (fd) => {
            try {
              await setServiceProfessionals(fd);
              showSuccess("Asignación guardada.");
              setOpen(false);
            } catch (e) {
              showError(e instanceof Error ? e.message : "No se pudo guardar la asignación.");
            }
          }}
          className="px-3 pb-3"
        >
          <input type="hidden" name="serviceId" value={servicio.id} />
          {seleccionables.length === 0 ? (
            <p className="text-sm text-muted">
              No hay profesionales cargadas. Agregá profesionales primero.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {seleccionables.map((p) => (
                <label
                  key={p.id}
                  className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <input
                    type="checkbox"
                    name="professionalId"
                    value={p.id}
                    defaultChecked={asignadasIds.has(p.id)}
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  {p.name}
                  {!p.active && <span className="text-xs text-muted">(inactiva)</span>}
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-4">
            <button type="submit" className="text-sm font-medium">
              Guardar
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function AsignacionSection({
  services,
  professionals,
}: {
  services: Svc[];
  professionals: Prof[];
}) {
  // Orden: primero los que están SIN asignar (lo que hay que resolver), después el resto.
  const asignadosPorServicio = new Set<string>();
  for (const p of professionals) for (const sid of p.serviceIds) asignadosPorServicio.add(sid);
  const ordenados = [...services].sort((a, b) => {
    const aSin = asignadosPorServicio.has(a.id) ? 1 : 0;
    const bSin = asignadosPorServicio.has(b.id) ? 1 : 0;
    if (aSin !== bSin) return aSin - bSin; // sin asignar primero
    return a.name.localeCompare(b.name, "es");
  });

  return (
    <section>
      <h2 className="mb-1 text-lg font-medium text-strong">Asignación de servicios</h2>
      <p className="mb-3 text-sm text-muted">
        Quién realiza cada servicio. La asignación es explícita y distinta por profesional — cada
        una ofrece lo suyo, no todas todo. También podés asignarla desde la ficha de cada
        profesional; es la misma relación, editable de los dos lados.
      </p>

      <DiagnosticoPanel profesionales={professionals} servicios={services} />

      {services.length === 0 ? (
        <p className="text-sm text-muted">No hay servicios cargados todavía.</p>
      ) : (
        <div className="rounded-lg border border-line">
          {ordenados.map((s) => (
            <ServicioRow key={s.id} servicio={s} profesionales={professionals} />
          ))}
        </div>
      )}
    </section>
  );
}
