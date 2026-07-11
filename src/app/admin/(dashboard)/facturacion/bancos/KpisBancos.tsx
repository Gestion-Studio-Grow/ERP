"use client";

// KPIs del tablero de Facturación automática — 4 tarjetas estilo mockup GSG
// Fable claro sobre el primitivo KpiTile del design system (no se duplica el
// patrón: la barra de objetivo entra por el slot `sub`). Client component SOLO
// por la animación de la goal bar (width 0 → % al montar) y el aria del tope.

import { useEffect, useState } from "react";
import { KpiTile, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import type { KpisFacturacionBancaria } from "@/lib/bancos-actions";

// Ícono de línea, mismo lenguaje que AdminShell (stroke 1.85, currentColor).
function Icono({ path }: { path: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      {path}
    </svg>
  );
}

/**
 * Barra de objetivo (goal bar del mockup) como `sub` de un KpiTile. Solo
 * <span>s: el slot `sub` se renderiza dentro de un <p>, y un <div> ahí sería
 * HTML inválido. `role="progressbar"` la hace legible por lector de pantalla.
 */
function GoalBar({ usado, tope }: { usado: number; tope: number }) {
  const pct = tope > 0 ? Math.min(100, Math.round((usado / tope) * 100)) : 0;
  // Ancho 0 en el primer paint → transición al % real (cubic-bezier del mockup).
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setAncho(pct), 120);
    return () => window.clearTimeout(t);
  }, [pct]);

  const color = pct >= 100 ? "bg-danger" : pct >= 90 ? "bg-warning" : "bg-accent";

  return (
    <span className="block">
      <span
        role="progressbar"
        aria-valuenow={usado}
        aria-valuemin={0}
        aria-valuemax={tope}
        aria-label={`Facturas del mes: ${usado} de ${tope}`}
        className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-sunken"
      >
        <span
          className={`block h-full rounded-full ${color} motion-reduce:transition-none`}
          style={{ width: `${ancho}%`, transition: "width 1s cubic-bezier(.2,.7,.2,1)" }}
        />
      </span>
      <span className="mt-1.5 flex justify-between text-[11px] tabular-nums text-faint">
        <span>Tope {fmtNumberAR(tope)} por mes</span>
        <span>{pct}%</span>
      </span>
      {pct >= 100 ? (
        <span role="alert" className="mt-1 block text-xs font-medium text-danger">
          Se alcanzó el tope del mes: no se emiten más facturas automáticas.
        </span>
      ) : pct >= 90 ? (
        <span role="alert" className="mt-1 block text-xs font-medium text-warning">
          Estás cerca del tope del mes ({usado} de {tope}).
        </span>
      ) : null}
    </span>
  );
}

export default function KpisBancos({ kpis }: { kpis: KpisFacturacionBancaria }) {
  const ultima = kpis.ultimasImportaciones[0];
  const capLleno = kpis.capRestante === 0;

  return (
    <section aria-label="Indicadores del mes" className="grid grid-cols-1 gap-sm sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        label="Facturado del mes"
        value={<span className="tabular-nums">{fmtMoneyARS(kpis.montoFacturadoMes)}</span>}
        sub="Todas las vías: banco, cobros y turnos."
        icon={<Icono path={<path d="M4 17l5-6 4 3 7-9" />} />}
      />
      <KpiTile
        label="Facturas emitidas"
        value={
          <span className={`tabular-nums ${capLleno ? "text-danger" : ""}`}>
            {fmtNumberAR(kpis.facturasMes)}
            <span className="text-base font-semibold text-muted"> / {fmtNumberAR(kpis.capFacturasMes)}</span>
          </span>
        }
        sub={<GoalBar usado={kpis.facturasMes} tope={kpis.capFacturasMes} />}
        icon={<Icono path={<><path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3z" /><path d="M10 8h4m-4 4h4" /></>} />}
      />
      <a
        href="#cola-revision"
        className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        aria-label={`Pendientes de revisión: ${kpis.pendientesRevision}. Ir a la cola de revisión.`}
      >
        <KpiTile
          className="cursor-pointer hover:shadow-raised"
          label="Pendientes de revisión"
          value={<span className="tabular-nums">{fmtNumberAR(kpis.pendientesRevision)}</span>}
          sub={
            kpis.pendientesRevision > 0
              ? "Ventas que necesitan datos del comprador · tocá para revisarlas"
              : "Nada para revisar. Todo al día."
          }
          icon={<Icono path={<><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4l3 2" /></>} />}
        />
      </a>
      <KpiTile
        label="Últimas importaciones"
        value={<span className="tabular-nums">{fmtNumberAR(kpis.ultimasImportaciones.length)}</span>}
        sub={
          ultima
            ? `Última: ${ultima.nombreArchivo} · ${fmtNumberAR(ultima.totalMovimientos)} movimientos`
            : "Todavía no subiste ningún extracto."
        }
        icon={<Icono path={<><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" /></>} />}
      />
    </section>
  );
}
