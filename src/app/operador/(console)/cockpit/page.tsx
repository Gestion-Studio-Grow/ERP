// COCKPIT OPERADOR (control-plane, ADR-021 / spec T4). Tablero de mando read-only:
// mapa de tenants, salud de arquitectura, estado de Neon, flujo, alertas críticas y
// plan/roadmap en vivo. 3D via CSS + SVG (cero deps). CERO escrituras.
//
// Reversibilidad: la ruta es aditiva; el link en el nav está detrás de COCKPIT_ENABLED.
// Se accede directo para probar. Datos por poll suave (AutoRefresh), Neon-free-consciente.

import "./cockpit.css";
import { cargarCockpit } from "@/lib/cockpit/datos";
import { peorEstado } from "@/lib/cockpit/salud";
import AutoRefresh from "./AutoRefresh";
import {
  TenantMap,
  ArchitectureDiagram,
  NeonStatus,
  WorkflowDiagram,
  CriticalPanel,
  PlanRoadmap,
} from "./Widgets";

export const dynamic = "force-dynamic";

const SALUD_HEX: Record<string, string> = { sano: "#10b981", atencion: "#f59e0b", caido: "#ef4444" };

function horaCriolla(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function CockpitPage() {
  const d = await cargarCockpit();

  // Salud global: el peor entre tenants y componentes (el "¿anda todo?" del dueño).
  const global = peorEstado([
    d.resumenTenants.peor,
    ...d.componentes.map((c) => c.estado),
  ]);

  return (
    <div className="space-y-6">
      {/* Encabezado con salud global */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`h-3.5 w-3.5 rounded-full ${global !== "sano" ? "cockpit-pulse" : ""}`}
              style={{ background: SALUD_HEX[global] }}
              aria-hidden
            />
            <h1 className="text-2xl font-semibold">Cockpit</h1>
            <span className="text-sm" style={{ color: SALUD_HEX[global] }}>
              {global === "sano" ? "Anda todo" : global === "atencion" ? "Necesita tu ojo" : "Algo caído"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Estado de la plataforma — solo lectura. No muestra datos de negocio de ningún cliente.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <AutoRefresh seconds={30} />
          <span className="text-xs text-faint">última lectura {horaCriolla(d.ts)}</span>
        </div>
      </div>

      {/* Tablero 3D */}
      <div className="cockpit-board space-y-5">
        {/* Fila 1 — lo que el dueño mira primero: qué necesita su ojo */}
        <CriticalPanel alertas={d.alertas} />

        {/* Fila 2 — mapa de tenants + plan en vivo */}
        <div className="grid gap-5 lg:grid-cols-2">
          <TenantMap tenants={d.tenants} resumen={d.resumenTenants} />
          <PlanRoadmap plan={d.plan} horizontes={d.horizontes} />
        </div>

        {/* Fila 3 — arquitectura + Neon */}
        <div className="grid gap-5 lg:grid-cols-2">
          <ArchitectureDiagram componentes={d.componentes} />
          <NeonStatus neon={d.neon} />
        </div>

        {/* Fila 4 — flujo de trabajo */}
        <WorkflowDiagram flujo={d.flujo} />
      </div>

      {/* Nota de aislamiento (transparencia, ADR-021) */}
      <p className="text-xs text-faint">
        Plano de control (super-admin). Señala lo que requiere tu atención; no ejecuta nada
        irreversible — publicar, migrar y rotar secretos siguen siendo decisión tuya.
      </p>
    </div>
  );
}
