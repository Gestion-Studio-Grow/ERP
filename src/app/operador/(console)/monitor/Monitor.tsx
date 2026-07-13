// Widgets del MONITOR DE SOPORTE — presentacionales, server components. Reciben los
// datos ya derivados y traducidos (src/lib/monitor) y los pintan. Wording criollo
// (ADR-044/046). El ÚNICO elemento que muta es el botón "Reintentar" (server action
// idempotente). Accesibilidad: estados con texto + color (no solo color), role="alert"
// en lo urgente, labels reales.

import Link from "next/link";
import { Card, Badge, Button, fmtCuit, fmtMoneyARS } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { reintentarComprobante, reintentarTodosPendientes } from "@/lib/monitor-actions";
import type {
  ComprobanteEnCola,
  FacturaRechazada,
  FiscalTenant,
  EstadoCron,
  AlertaMonitor,
  ResumenFacturacion,
} from "@/lib/monitor/datos";
import type { DiagnosticoError, SeveridadError } from "@/lib/monitor/arca-errores";
import type { ComponenteSalud, TenantSalud, EstadoSalud } from "@/lib/cockpit/salud";

// ── helpers de presentación ──────────────────────────────────────────────────

const SEV_TONE: Record<SeveridadError, BadgeTone> = { roja: "danger", amarilla: "warning" };
const SALUD_TONE: Record<EstadoSalud, BadgeTone> = { sano: "success", atencion: "warning", caido: "danger" };
const SALUD_LABEL: Record<EstadoSalud, string> = { sano: "Anda", atencion: "Tu ojo", caido: "Caído" };

function horaCriolla(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// Marco común de panel (mismo lenguaje visual que el cockpit).
function Panel({ titulo, hint, children, className = "" }: { titulo: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-elevated p-5 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-strong">{titulo}</h2>
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// El error, en criollo: qué pasó + qué hacer + (plegado) el detalle técnico.
function ErrorCriollo({ d, compacto = false }: { d: DiagnosticoError; compacto?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge tone={SEV_TONE[d.severidad]} dot>
          <span className="sr-only">{d.severidad === "roja" ? "Urgente: " : "Atención: "}</span>
          {d.titulo}
        </Badge>
      </div>
      {!compacto && <p className="text-sm text-muted">{d.queePaso}</p>}
      <p className="text-sm text-strong">
        <span className="text-faint">Qué hacer: </span>{d.accion}
      </p>
      <details className="text-xs text-faint">
        {/* py para llegar al piso de touch target AA (≥24px de alto) en mobile. */}
        <summary className="inline-block cursor-pointer py-1.5 hover:text-muted">Ver detalle técnico</summary>
        <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-surface p-2 font-mono text-faint">{d.crudo}</pre>
      </details>
    </div>
  );
}

// ── KPIs de facturación ──────────────────────────────────────────────────────

export function ResumenFacturacionPanel({ r, modo, invoicing }: { r: ResumenFacturacion; modo: string; invoicing: boolean }) {
  const modoLabel: Record<string, string> = { stub: "Stub (apagado)", homologacion: "Homologación (test)", real: "Real (producción)" };
  const kpis = [
    { k: "En cola", v: r.pendientes, tone: r.pendientes > 0 ? "info" : "neutral" as BadgeTone },
    { k: "Fallando", v: r.fallidos, tone: r.fallidos > 0 ? "danger" : "neutral" as BadgeTone },
    { k: "Rechazadas", v: r.rechazadas, tone: r.rechazadas > 0 ? "warning" : "neutral" as BadgeTone },
    { k: "Autorizadas", v: r.autorizadas, tone: "success" as BadgeTone },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Modo ARCA:</span>
        <Badge tone={modo === "real" ? "success" : modo === "homologacion" ? "info" : "neutral"} dot>{modoLabel[modo] ?? modo}</Badge>
        <Badge tone={invoicing ? "success" : "neutral"} dot>{invoicing ? "Facturación encendida" : "Facturación apagada"}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((m) => (
          <Card key={m.k} className="p-4">
            <div className="text-xs text-muted">{m.k}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-semibold text-strong tabular-nums">{m.v}</span>
              {m.v > 0 && m.tone !== "neutral" && <span className={`h-2 w-2 rounded-full ${m.tone === "danger" ? "bg-red-500" : m.tone === "warning" ? "bg-amber-500" : m.tone === "success" ? "bg-emerald-500" : "bg-sky-500"}`} />}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Panel "necesita tu ojo" (alertas cross-tenant) ───────────────────────────

export function AlertasPanel({ alertas }: { alertas: AlertaMonitor[] }) {
  const rojas = alertas.filter((a) => a.severidad === "roja");
  const amarillas = alertas.filter((a) => a.severidad === "amarilla");
  return (
    <Panel titulo="Necesita tu ojo" hint={`${rojas.length} rojas · ${amarillas.length} amarillas`} className="border-l-4 border-l-amber-500/60">
      {alertas.length === 0 ? (
        <p className="text-sm text-emerald-300">Nada urgente. La facturación viene sin errores.</p>
      ) : (
        <ul className="space-y-2.5" role="list">
          {alertas.map((a) => {
            const roja = a.severidad === "roja";
            return (
              <li key={a.id} className={`rounded-lg border p-3 ${roja ? "border-red-500/30 bg-red-500/10" : "border-amber-500/25 bg-amber-500/10"}`} role={roja ? "alert" : undefined}>
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 ${roja ? "text-red-400" : "text-amber-400"}`} aria-hidden>{roja ? "⛔" : "⚠️"}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-strong">{a.titulo}</div>
                    <div className="text-xs text-muted">{a.detalle}</div>
                    <div className="mt-1 text-xs text-faint"><span className="text-muted">Qué hacer:</span> {a.accion}</div>
                    {a.tenantId && (
                      <Link href={`/operador/tenants/${a.tenantId}`} className="mt-1 inline-block text-xs text-accent hover:underline">
                        Ir al tenant →
                      </Link>
                    )}
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

// ── Cola del outbox de ARCA ──────────────────────────────────────────────────

function RetryButton({ eventId, invoicing }: { eventId: string; invoicing: boolean }) {
  return (
    <form action={reintentarComprobante}>
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="outline" size="sm" disabled={!invoicing}>Reintentar</Button>
    </form>
  );
}

export function ColaOutboxPanel({ cola, invoicing }: { cola: ComprobanteEnCola[]; invoicing: boolean }) {
  return (
    <Panel
      titulo="Cola de facturación (ARCA)"
      hint={`${cola.length} en cola`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Comprobantes que esperan CAE o que fallaron. El reintento es idempotente: nunca duplica una factura.
        </p>
        {cola.some((c) => c.estado === "fallido") && (
          <form action={reintentarTodosPendientes}>
            <Button type="submit" variant="subtle" size="sm" disabled={!invoicing}>Reintentar todos</Button>
          </form>
        )}
      </div>
      {cola.length === 0 ? (
        <p className="text-sm text-emerald-300">Cola vacía — no hay comprobantes pendientes ni fallando.</p>
      ) : (
        <ul className="space-y-3" role="list">
          {cola.map((c) => (
            <li key={c.eventId} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-strong">{c.tenantNombre}</span>
                    <Badge tone={c.estado === "fallido" ? "danger" : "info"} dot>{c.estado === "fallido" ? `Falló · ${c.intentos} intento${c.intentos === 1 ? "" : "s"}` : "Pendiente"}</Badge>
                    <span className="text-xs text-faint">en cola desde {horaCriolla(c.esperandoDesde)}</span>
                  </div>
                  {c.diagnostico ? (
                    <ErrorCriollo d={c.diagnostico} />
                  ) : (
                    <p className="text-sm text-muted">Todavía no se despachó. Cuando el cron corra (o reintentes) va a ARCA.</p>
                  )}
                </div>
                <div className="shrink-0">
                  <RetryButton eventId={c.eventId} invoicing={invoicing} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── Facturas rechazadas ──────────────────────────────────────────────────────

export function RechazadasPanel({ rechazadas }: { rechazadas: FacturaRechazada[] }) {
  if (rechazadas.length === 0) return null;
  return (
    <Panel titulo="Facturas rechazadas por ARCA" hint={`${rechazadas.length} recientes`}>
      <ul className="space-y-3" role="list">
        {rechazadas.map((f) => (
          <li key={f.invoiceId} className="rounded-lg border border-line bg-surface p-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-strong">{f.tenantNombre}</span>
              {f.total != null && <span className="text-xs text-muted">{fmtMoneyARS(f.total)}</span>}
              <span className="text-xs text-faint">{horaCriolla(f.cuando)}</span>
            </div>
            {f.diagnostico && <ErrorCriollo d={f.diagnostico} />}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── Estado fiscal por tenant ─────────────────────────────────────────────────

function Check({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={ok ? "success" : "warning"} dot><span className="sr-only">{ok ? "listo" : "falta"}: </span>{ok ? "✓" : "✗"}</Badge>
      <span className="text-xs text-muted">{texto}</span>
    </span>
  );
}

export function FiscalPorTenantPanel({ tenants }: { tenants: FiscalTenant[] }) {
  return (
    <Panel titulo="Estado fiscal por tenant" hint={`${tenants.length} negocios`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              <th className="px-3 py-2 font-medium">Negocio</th>
              <th className="px-3 py-2 font-medium">CUIT</th>
              <th className="px-3 py-2 font-medium">Certificado</th>
              <th className="px-3 py-2 font-medium">Última emisión</th>
              <th className="px-3 py-2 font-medium">Últ. error</th>
              <th className="px-3 py-2 font-medium">¿Listo?</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-line/50 last:border-0 align-top">
                <td className="px-3 py-3">
                  <Link href={`/operador/tenants/${t.id}`} className="font-medium text-strong hover:text-accent">{t.nombre}</Link>
                  <div className="text-xs text-faint">/{t.slug}</div>
                </td>
                <td className="px-3 py-3">
                  <Check ok={t.cuitOk} texto={t.cuitOk ? fmtCuit(t.cuit) : "sin cargar"} />
                </td>
                <td className="px-3 py-3 space-y-1">
                  <Check ok={t.certOk && !t.certVencido} texto={!t.certOk ? "sin cargar" : t.certVencido ? `vencido ${t.certVence}` : t.certVence ? `vence ${t.certVence}` : "cargado"} />
                  {t.cuitCertMismatch && <div className="text-xs text-red-300">CUIT ≠ cert</div>}
                </td>
                <td className="px-3 py-3 text-muted text-xs">{t.ultimaEmision ? horaCriolla(t.ultimaEmision) : <span className="text-faint">nunca</span>}</td>
                <td className="px-3 py-3">
                  {t.ultimoError ? (
                    <span title={t.ultimoError.queePaso}>
                      <Badge tone={SEV_TONE[t.ultimoError.severidad]} dot>{t.ultimoError.titulo}</Badge>
                    </span>
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  )}
                  {t.pendientes > 0 && <div className="mt-1 text-xs text-sky-300">{t.pendientes} en cola</div>}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={t.listoParaFacturar ? "success" : "neutral"} dot>{t.listoParaFacturar ? "Sí" : "No"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Salud de plataforma (superficies + tenants + crons) ──────────────────────

export function SaludPanel({ superficies, tenants, crons }: { superficies: ComponenteSalud[]; tenants: TenantSalud[]; crons: EstadoCron[] }) {
  return (
    <Panel titulo="Salud de la plataforma" hint={`${superficies.length} superficies · ${tenants.length} tenants`}>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Superficies / componentes */}
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Superficies</h3>
          <ul className="space-y-2" role="list">
            {superficies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-strong">{c.label}</div>
                  <div className="truncate text-xs text-muted">{c.nota}</div>
                </div>
                <Badge tone={SALUD_TONE[c.estado]} dot>{SALUD_LABEL[c.estado]}</Badge>
              </li>
            ))}
          </ul>
        </div>
        {/* Tenants (sitios) */}
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Sitios de tenants</h3>
          <ul className="space-y-2" role="list">
            {tenants.length === 0 ? (
              <li className="text-sm text-muted">Sin datos de tenants.</li>
            ) : (
              tenants.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-strong">{t.name}</div>
                    <div className="truncate text-xs text-muted">{t.motivo}</div>
                  </div>
                  <Badge tone={SALUD_TONE[t.estado]} dot>{SALUD_LABEL[t.estado]}</Badge>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Crons */}
      <div className="mt-4 border-t border-line pt-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Tareas programadas (crons)</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {crons.map((c) => (
            <div key={c.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="text-sm font-medium text-strong">{c.nombre}</div>
              <div className="text-xs text-muted">{c.agenda}</div>
              <div className="mt-1 text-xs text-faint">
                Última señal: {c.ultimaSenal ? horaCriolla(c.ultimaSenal) : "sin registro"}
              </div>
              <div className="text-xs text-faint">{c.nota}</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
