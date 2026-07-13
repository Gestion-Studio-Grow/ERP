// MONITOR DE SOPORTE / IMPLEMENTADOR (control-plane, ADR-021). El tablero donde un
// implementador ve, cross-tenant y EN CRIOLLO, qué falló en la facturación de ARCA y
// qué hacer — sin ir a los logs de Vercel ni a la base. Read-only salvo el reintento
// (idempotente). Guardado por requireOperator() (layout) + operatorPrisma cross-tenant.
//
// Fuente: src/lib/monitor/datos.ts (reusa OutboxEvent/Invoice/TenantFiscalCredential;
// no inventa tablas). Traducción a criollo: src/lib/monitor/arca-errores.ts.

import Link from "next/link";
import AutoRefresh from "../cockpit/AutoRefresh";
import { cargarMonitor } from "@/lib/monitor/datos";
import type { SeveridadError } from "@/lib/monitor/arca-errores";
import {
  ResumenFacturacionPanel,
  AlertasPanel,
  ColaOutboxPanel,
  RechazadasPanel,
  FiscalPorTenantPanel,
  SaludPanel,
} from "./Monitor";

export const dynamic = "force-dynamic";

interface FiltroSearch {
  tenant?: string; // id de tenant
  sev?: string; // "roja" | "amarilla"
  ok?: string;
  error?: string;
}

function esSeveridad(v: string | undefined): v is SeveridadError {
  return v === "roja" || v === "amarilla";
}

export default async function MonitorPage({ searchParams }: { searchParams: Promise<FiltroSearch> }) {
  const { tenant, sev, ok, error } = await searchParams;
  const d = await cargarMonitor();

  // Filtros (server-side, sin estado de cliente): por tenant y por severidad.
  const sevFiltro = esSeveridad(sev) ? sev : null;
  const tenantFiltro = tenant && d.fiscalPorTenant.some((t) => t.id === tenant) ? tenant : null;

  const cola = d.cola.filter(
    (c) => (!tenantFiltro || c.tenantId === tenantFiltro) && (!sevFiltro || c.diagnostico?.severidad === sevFiltro),
  );
  const rechazadas = d.rechazadas.filter(
    (r) => (!tenantFiltro || r.tenantId === tenantFiltro) && (!sevFiltro || r.diagnostico?.severidad === sevFiltro),
  );
  const alertas = d.alertas.filter(
    (a) => (!tenantFiltro || a.tenantId === tenantFiltro) && (!sevFiltro || a.severidad === sevFiltro),
  );
  const fiscal = tenantFiltro ? d.fiscalPorTenant.filter((t) => t.id === tenantFiltro) : d.fiscalPorTenant;

  const hayFiltro = !!(tenantFiltro || sevFiltro);
  const qs = (patch: Partial<{ tenant: string | null; sev: string | null }>): string => {
    const p = new URLSearchParams();
    const nt = patch.tenant === undefined ? tenantFiltro : patch.tenant;
    const ns = patch.sev === undefined ? sevFiltro : patch.sev;
    if (nt) p.set("tenant", nt);
    if (ns) p.set("sev", ns);
    const s = p.toString();
    return s ? `/operador/monitor?${s}` : "/operador/monitor";
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Monitor de soporte</h1>
          <p className="mt-1 text-sm text-muted">
            Qué falló en la facturación, en criollo y con qué hacer — cross-tenant, sin ir a los logs.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {/* 60s (no 30): cada refresh hace ~6 lecturas cross-tenant a Neon; el plan free
              pide cuidar el consumo y el monitor es de baja frecuencia. */}
          <AutoRefresh seconds={60} />
          <span className="text-xs text-faint">última lectura {new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(d.generadoTs))}</span>
        </div>
      </div>

      {/* Mensajes de resultado del reintento */}
      {ok && <div role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">{ok}</div>}
      {error && <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger whitespace-pre-wrap">{error}</div>}
      {d.degradado && (
        <div role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Vista parcial: alguna fuente de datos no respondió. Los números pueden estar incompletos.
        </div>
      )}

      {/* KPIs de facturación */}
      <ResumenFacturacionPanel r={d.resumen} modo={d.modoArca} invoicing={d.invoicingEnabled} />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Filtrar:</span>
        <Link href={qs({ sev: "roja" })} className={`rounded-full border px-3 py-1 text-xs ${sevFiltro === "roja" ? "border-red-500/50 bg-red-500/15 text-red-200" : "border-line text-muted hover:text-strong"}`}>Solo rojas</Link>
        <Link href={qs({ sev: "amarilla" })} className={`rounded-full border px-3 py-1 text-xs ${sevFiltro === "amarilla" ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : "border-line text-muted hover:text-strong"}`}>Solo amarillas</Link>
        {/* Chips de tenant (links, accesibles sin JS) — mantienen la severidad activa */}
        <div className="flex flex-wrap gap-1">
          {d.fiscalPorTenant.map((t) => (
            <Link key={t.id} href={qs({ tenant: tenantFiltro === t.id ? null : t.id })} className={`rounded-full border px-2.5 py-1 text-xs ${tenantFiltro === t.id ? "border-accent/50 bg-accent-soft text-accent" : "border-line text-muted hover:text-strong"}`}>{t.nombre}</Link>
          ))}
        </div>
        {hayFiltro && <Link href="/operador/monitor" className="text-xs text-accent hover:underline">Limpiar filtros</Link>}
      </div>

      {/* Lo urgente primero */}
      <AlertasPanel alertas={alertas} />

      {/* Estado de la facturación (ARCA) — lo más importante */}
      <ColaOutboxPanel cola={cola} invoicing={d.invoicingEnabled} />
      <RechazadasPanel rechazadas={rechazadas} />
      <FiscalPorTenantPanel tenants={fiscal} />

      {/* Salud general */}
      <SaludPanel superficies={d.superficies} tenants={d.tenantsSalud} crons={d.crons} />

      <p className="text-xs text-faint">
        Plano de control (super-admin). No muestra secretos (certificados, claves, tokens). El reintento es
        idempotente: nunca duplica un comprobante.
      </p>
    </div>
  );
}
