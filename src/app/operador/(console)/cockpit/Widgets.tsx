// Widgets del Cockpit (W1–W6) — presentacionales, server components. Reciben datos
// ya derivados (src/lib/cockpit) y los pintan. 3D via CSS (cockpit.css) + SVG, sin
// dependencias. Wording criollo (ADR-044). Read-only: ninguno muta estado.

import type {
  EstadoSalud,
  TenantSalud,
  ResumenSalud,
  ComponenteSalud,
  SnapshotNeon,
} from "@/lib/cockpit/salud";
import type {
  TareaReingenieria,
  Horizonte,
  AlertaCritica,
  PasoFlujo,
} from "@/lib/cockpit/plan";
import { resumenPlan } from "@/lib/cockpit/plan";

// ── Semáforo (colores criollos) ──────────────────────────────────────────────

const SEMAFORO: Record<EstadoSalud, { dot: string; text: string; borde: string; fondo: string; hex: string }> = {
  sano: { dot: "bg-emerald-500", text: "text-emerald-300", borde: "border-emerald-500/30", fondo: "bg-emerald-500/10", hex: "#10b981" },
  atencion: { dot: "bg-amber-500", text: "text-amber-300", borde: "border-amber-500/30", fondo: "bg-amber-500/10", hex: "#f59e0b" },
  caido: { dot: "bg-red-500", text: "text-red-300", borde: "border-red-500/30", fondo: "bg-red-500/10", hex: "#ef4444" },
};

// Marco común de panel — capa 3D + título.
function Panel({
  titulo,
  hint,
  className = "",
  children,
}: {
  titulo: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`cockpit-panel min-w-0 rounded-xl border border-line bg-elevated p-5 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-strong">{titulo}</h2>
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// ── W1 · Mapa de tenants ─────────────────────────────────────────────────────

export function TenantMap({ tenants, resumen }: { tenants: TenantSalud[]; resumen: ResumenSalud }) {
  return (
    <Panel titulo="Mapa de tenants" hint={`${resumen.total} negocios`}>
      <div className="mb-4 flex flex-wrap gap-4 text-xs">
        <span className="text-emerald-300">🟢 {resumen.sanos} andan</span>
        <span className="text-amber-300">🟡 {resumen.atencion} tu ojo</span>
        <span className="text-red-300">🔴 {resumen.caidos} caídos</span>
      </div>
      {tenants.length === 0 ? (
        <p className="text-sm text-muted">Sin datos de tenants (control-plane sin respuesta).</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tenants.map((t) => {
            const s = SEMAFORO[t.estado];
            return (
              <div
                key={t.id}
                className={`cockpit-tile rounded-lg border ${s.borde} ${s.fondo} p-3`}
                title={t.motivo}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-strong">{t.name}</span>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot} ${t.estado !== "sano" ? "cockpit-pulse" : ""}`} />
                </div>
                <div className="mt-1 truncate text-xs text-muted">{t.motivo}</div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── W2 · Diagrama de arquitectura (SVG, coloreado por salud) ──────────────────

// Una caja de componente del diagrama de arquitectura (SVG). Top-level para no
// declarar un componente durante el render (react-hooks/static-components).
function CajaArq({ c, x, y, w, h }: { c: ComponenteSalud; x: number; y: number; w: number; h: number }) {
  const s = SEMAFORO[c.estado];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={s.hex} fillOpacity={0.12} stroke={s.hex} strokeOpacity={0.5} />
      <circle cx={x + 12} cy={y + h / 2} r={4} fill={s.hex} />
      <text x={x + 24} y={y + 19} fontSize={11.5} fill="#e5e7eb" fontWeight={600}>
        {c.label.length > 20 ? c.label.slice(0, 19) + "…" : c.label}
      </text>
      <text x={x + 24} y={y + 34} fontSize={9.5} fill="#94a3b8">
        {c.nota.length > 24 ? c.nota.slice(0, 23) + "…" : c.nota}
      </text>
    </g>
  );
}

export function ArchitectureDiagram({ componentes }: { componentes: ComponenteSalud[] }) {
  // Layout en 2 filas: app arriba; DB/RLS/plugins abajo. Líneas app→cada componente.
  const anchoCaja = 150;
  const altoCaja = 46;
  const cols = 3;
  const gapX = 24;
  const filaSuperiorY = 12;
  const filaInferiorY = 120;
  const app = componentes.find((c) => c.id === "app")!;
  const resto = componentes.filter((c) => c.id !== "app");
  const totalAncho = cols * anchoCaja + (cols - 1) * gapX;
  const appX = (totalAncho - anchoCaja) / 2;

  const cajaInferiorX = (i: number) => (i % cols) * (anchoCaja + gapX);
  const cajaInferiorY = (i: number) => filaInferiorY + Math.floor(i / cols) * (altoCaja + 22);

  const filas = Math.ceil(resto.length / cols);
  const alto = filaInferiorY + filas * (altoCaja + 22);

  return (
    <Panel titulo="Arquitectura (salud en vivo)" hint="app · datos · plugins">
      <svg viewBox={`0 0 ${totalAncho} ${alto}`} className="w-full" role="img" aria-label="Diagrama de arquitectura con salud de componentes">
        {resto.map((_, i) => {
          const cx = cajaInferiorX(i) + anchoCaja / 2;
          const cy = cajaInferiorY(i);
          return (
            <line
              key={`l${i}`}
              x1={appX + anchoCaja / 2}
              y1={filaSuperiorY + altoCaja}
              x2={cx}
              y2={cy}
              stroke="#475569"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}
        <CajaArq c={app} x={appX} y={filaSuperiorY} w={anchoCaja} h={altoCaja} />
        {resto.map((c, i) => (
          <CajaArq key={c.id} c={c} x={cajaInferiorX(i)} y={cajaInferiorY(i)} w={anchoCaja} h={altoCaja} />
        ))}
      </svg>
    </Panel>
  );
}

// ── W3 · Estado de la DB (Neon) ──────────────────────────────────────────────

const NEON_TONO: Record<SnapshotNeon["estado"], { text: string; label: string }> = {
  sano: { text: "text-emerald-300", label: "Anda" },
  atencion: { text: "text-amber-300", label: "Necesita tu ojo" },
  caido: { text: "text-red-300", label: "Caído" },
  en_pausa: { text: "text-muted", label: "En pausa" },
};

export function NeonStatus({ neon }: { neon: SnapshotNeon }) {
  const t = NEON_TONO[neon.estado];
  const dato = (v: number | null, suf = "") => (v === null ? "—" : `${v}${suf}`);
  return (
    <Panel titulo="Base de datos (Neon)" hint="solo lectura">
      <div className={`mb-3 text-sm font-medium ${t.text}`}>{t.label}</div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { k: "Conexiones", v: dato(neon.conexiones) },
          { k: "Latencia", v: dato(neon.latenciaMs, " ms") },
          { k: "Locks", v: dato(neon.locks) },
        ].map((m) => (
          <div key={m.k} className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs text-muted">{m.k}</div>
            <div className="mt-1 text-lg font-semibold text-strong">{m.v}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-faint">{neon.nota}</p>
    </Panel>
  );
}

// ── W4 · Diagrama de flujo del trabajo (SVG) ─────────────────────────────────

export function WorkflowDiagram({ flujo }: { flujo: PasoFlujo[] }) {
  const w = 150;
  const h = 54;
  const gap = 20;
  const total = flujo.length * w + (flujo.length - 1) * gap;
  return (
    <Panel titulo="Flujo de trabajo" hint="gobernanza (ADR-049)">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${total} ${h + 8}`} className="min-w-[560px]" role="img" aria-label="Flujo de gobernanza">
          {flujo.map((p, i) => {
            const x = i * (w + gap);
            return (
              <g key={p.id}>
                {i > 0 && (
                  <line x1={x - gap} y1={h / 2} x2={x} y2={h / 2} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#flecha)" />
                )}
                <rect x={x} y={4} width={w} height={h} rx={9} fill="#1e293b" stroke="#334155" />
                <text x={x + w / 2} y={h / 2 - 2} fontSize={12} fontWeight={700} fill="#e5e7eb" textAnchor="middle">
                  {p.actor}
                </text>
                <text x={x + w / 2} y={h / 2 + 14} fontSize={9} fill="#94a3b8" textAnchor="middle">
                  {p.hace.length > 24 ? p.hace.slice(0, 23) + "…" : p.hace}
                </text>
              </g>
            );
          })}
          <defs>
            <marker id="flecha" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
            </marker>
          </defs>
        </svg>
      </div>
    </Panel>
  );
}

// ── W5 · Panel de información crítica ─────────────────────────────────────────

export function CriticalPanel({ alertas }: { alertas: AlertaCritica[] }) {
  const rojas = alertas.filter((a) => a.severidad === "roja");
  const amarillas = alertas.filter((a) => a.severidad === "amarilla");
  return (
    <Panel
      titulo="Necesita tu ojo"
      hint={`${rojas.length} rojas · ${amarillas.length} amarillas`}
      className="border-l-4 border-l-amber-500/60"
    >
      {alertas.length === 0 ? (
        <p className="text-sm text-emerald-300">Nada urgente. Todo bajo control.</p>
      ) : (
        <ul className="space-y-2.5">
          {alertas.map((a) => {
            const roja = a.severidad === "roja";
            return (
              <li key={a.id} className={`rounded-lg border p-3 ${roja ? "border-red-500/30 bg-red-500/10" : "border-amber-500/25 bg-amber-500/10"}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 ${roja ? "text-red-400" : "text-amber-400"}`}>{roja ? "⛔" : "⚠️"}</span>
                  <div>
                    <div className="text-sm font-medium text-strong">{a.titulo}</div>
                    <div className="text-xs text-muted">{a.detalle}</div>
                    <div className="mt-1 text-xs text-faint">
                      <span className="text-muted">Vos:</span> {a.accionDueno}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ── W6 · Plan / Roadmap en vivo ──────────────────────────────────────────────

const TAREA_TONO: Record<TareaReingenieria["estado"], { dot: string; text: string; label: string }> = {
  hecho: { dot: "bg-emerald-500", text: "text-emerald-300", label: "hecho" },
  "en-curso": { dot: "bg-sky-500 cockpit-pulse", text: "text-sky-300", label: "en curso" },
  pendiente: { dot: "bg-slate-500", text: "text-muted", label: "pendiente" },
};

export function PlanRoadmap({ plan, horizontes }: { plan: TareaReingenieria[]; horizontes: Horizonte[] }) {
  const r = resumenPlan(plan);
  return (
    <Panel titulo="Plan de reingeniería (en vivo)" hint={`${r.hechas}/${r.total} listas`}>
      {/* Barra de avance */}
      <div className="mb-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${r.pctHecho}%` }} />
        </div>
        <div className="mt-1 text-xs text-faint">{r.pctHecho}% del bloque T1–T5</div>
      </div>

      <ol className="space-y-2">
        {plan.map((t) => {
          const tono = TAREA_TONO[t.estado];
          return (
            <li key={t.id} className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tono.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                  <span className="text-sm font-medium text-strong">{t.id}</span>
                  <span className="min-w-0 truncate text-sm text-muted">{t.titulo}</span>
                  <span className={`shrink-0 text-xs ${tono.text}`}>· {tono.label}</span>
                  {t.commit && <code className="shrink-0 text-xs text-faint">{t.commit}</code>}
                </div>
                <div className="text-xs text-faint">{t.detalle}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Horizontes */}
      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Horizontes</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {horizontes.map((h) => (
            <div key={h.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs font-medium text-strong">{h.titulo}</div>
              <div className="mt-1 text-xs text-muted">{h.hito}</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
