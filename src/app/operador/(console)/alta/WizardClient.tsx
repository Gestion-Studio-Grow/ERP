"use client";

// WIZARD DE ALTA DE TENANT — 5 pasos + panel de preview en vivo (RFC-003 §3.1) sobre la fábrica
// de tenants (ADR-074). CLIENT-SAFE: sólo importa tipos (se borran en build), UI del design system,
// helpers puros de mapeo y los Server Actions del alta. NADA server-tainted (Prisma, branding,
// catálogo de plugins) — todo el catálogo llega por props desde el server (page.tsx).
//
// Flujo: cada cambio dispara (debounced) el DRY-RUN obligatorio (`planTenantAction`) → el plan
// alimenta el preview en vivo, la validación inline (slug/host/email) y los chips de módulos. El
// commit (`commitTenantAction`) sólo se habilita con el plan sin colisiones, y muestra el estado de
// la saga (PENDING→ACTIVE) o el fallo compensado, más la entrega segura del bootstrap (fuera de la URL).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, Field, Input, Select, Button, Badge } from "@/components/ui";
import { BootstrapReveal } from "@/components/BootstrapReveal";
import { planTenantAction, commitTenantAction } from "@/lib/operator-provisioning-actions";
import {
  suggestMonogram,
  type RawWizardForm,
  type CommitActionResult,
} from "@/lib/provisioning/console-input";
import { suggestSlug } from "@/lib/provisioning/slug";
import { HAPPY_PATH, type ProvisionState } from "@/lib/provisioning/state-machine";
import type { ProvisionPlan } from "@/lib/provisioning/types";

export interface WizardData {
  blueprintGroups: { family: string; items: { id: string; label: string }[] }[];
  moduleCatalog: { id: string; label: string; description: string; plugin: boolean }[];
  empresaModuleIds: string[];
  accents: { id: string; light: string; dark: string; onLight: string; onDark: string }[];
  isSecondTenant: boolean;
}

const STEPS = ["Negocio", "Rubro", "Módulos", "Marca + link", "Revisar"] as const;

// ETIQUETAS DE LA SAGA. Dos de estos pasos NO HACEN NADA todavía y por eso no dicen que sí:
// `HOST_BOUND` e `INVITED` corren sobre `NoopHostBinder` / `NoopInviter`
// (src/lib/provisioning/runtime.ts:46-47, stubs.ts:46-69) — registran la llamada en un array y
// devuelven ok. El stepper los pintaba en verde con "Link ligado ✓" y "Dueño invitado ✓": el
// operador se iba convencido de que el dominio quedó apuntado y de que al dueño le llegó un mail.
// No pasó ninguna de las dos. Se relabelan a "pendiente — manual" en vez de construir el binder y
// el inviter: son 5 altas, ligar el dominio e invitar a mano es una hora; la maquinaria (API de
// Vercel/DNS + mailing transaccional + compensación) cuesta mucho más que eso.
const STATE_LABEL: Record<ProvisionState, string> = {
  PENDING: "Pendiente",
  DB_COMMITTED: "Datos creados",
  HOST_BOUND: "Link: pendiente — manual",
  INVITED: "Aviso al dueño: pendiente — manual",
  ACTIVE: "Activo",
  FAILED_COMPENSATED: "Falló (compensado)",
};

/** Pasos que la saga marca como cumplidos pero que hoy son no-ops (quedan a mano). */
const PASOS_MANUALES: ProvisionState[] = ["HOST_BOUND", "INVITED"];

export function AltaWizard({ data }: { data: WizardData }) {
  // `edicion` queda fijo en "comercio" y SIN selector a propósito: el alta lo aceptaba pero no lo
  // persiste (src/lib/provisioning/adapters.ts:83-86,110-115 lo admite en su comentario) y el
  // gating por perfil está apagado. Elegir "Empresa" en pantalla y entregar un "Comercio" es una
  // promesa comercial que el sistema no cumple. El campo se mantiene en el form para no cambiar
  // el contrato del motor; vuelve a la UI el día que se persista de verdad.
  const [form, setForm] = useState<RawWizardForm>({ edicion: "comercio", frontTheme: "light" });
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<ProvisionPlan | null>(null);
  const [planPending, setPlanPending] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitActionResult | null>(null);

  const set = (patch: Partial<RawWizardForm>) => setForm((f) => ({ ...f, ...patch }));

  // Auto-sugerir el slug desde el nombre mientras el operador no lo edite a mano (RFC-003 §3.1 paso 1).
  function onNameChange(name: string) {
    setForm((f) => ({ ...f, name, ...(slugTouched ? {} : { slug: suggestSlug(name) }) }));
  }

  // DRY-RUN debounced: el motor puro re-corre en el server con cada cambio relevante y alimenta el
  // preview. Un id de request evita que una respuesta vieja pise a una nueva (carrera).
  const reqId = useRef(0);
  const planKey = JSON.stringify({
    name: form.name, slug: form.slug, rubro: form.rubro, blueprint: form.blueprint,
    edicion: form.edicion, ownerEmail: form.ownerEmail, subdomain: form.subdomain,
    accentPreset: form.accentPreset, monogram: form.monogram,
  });
  useEffect(() => {
    // Sin nombre ni slug no hay nada que planificar. Se limpia el plan DENTRO del
    // timeout junto con el resto: hacerlo en el cuerpo del efecto era un setState
    // síncrono — un render en cascada por cada tecla del formulario.
    const id = ++reqId.current;
    const vacio = !form.name && !form.slug;
    const t = setTimeout(async () => {
      if (vacio) {
        setPlan(null);
        setPlanPending(false);
        return;
      }
      setPlanPending(true);
      try {
        const p = await planTenantAction(form);
        if (id === reqId.current) setPlan(p);
      } finally {
        if (id === reqId.current) setPlanPending(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  const has = (kind: string) => plan?.collisions.some((c) => c.kind === kind) ?? false;
  const msg = (kind: string) => plan?.collisions.find((c) => c.kind === kind)?.message;

  // Validez por paso: los pasos con validación dura (slug/host/email) exigen el plan sin esa colisión.
  const step0Ok =
    Boolean(form.name?.trim()) && Boolean(form.slug?.trim()) && Boolean(form.ownerEmail?.trim()) &&
    !has("slug-invalid") && !has("slug-taken") && !has("email-invalid") && !planPending;
  const step3Ok = !has("host-invalid") && !has("host-taken");
  // Paso 2 (rubro) OBLIGATORIO: sin rubro ni blueprint explícito el alta cae al blueprint de
  // servicios y el local de carne nace con agenda de turnos. Bloquea el "Siguiente" Y el
  // "Crear tenant" (se podía saltar el paso yendo directo al final).
  const step1Ok = Boolean(form.rubro?.trim() || form.blueprint?.trim());
  const canAdvance = step === 0 ? step0Ok : step === 1 ? step1Ok : step === 3 ? step3Ok : true;
  const canCommit = Boolean(plan?.ok) && step1Ok && !planPending && !committing && !result?.ok;

  async function onCommit() {
    setCommitting(true);
    try {
      setResult(await commitTenantAction(form));
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setCommitting(false);
    }
  }

  const accent = data.accents.find((a) => a.id === form.accentPreset);
  const theme = form.frontTheme === "dark" ? "dark" : "light";
  const monogram = (form.monogram?.trim() || suggestMonogram(form.name ?? "")).slice(0, 3) || "—";

  return (
    <div className="grid lg:grid-cols-[1fr_20rem] gap-6 items-start">
      <div className="space-y-6 min-w-0">
        <Stepper step={step} valid={step0Ok} rubroOk={step1Ok} hostOk={step3Ok} plan={plan} />

        {result ? (
          <ResultPanel result={result} tenantId={result.tenantId} />
        ) : (
          <>
            {step === 0 && <StepNegocio form={form} set={set} onNameChange={onNameChange} setSlugTouched={setSlugTouched} plan={plan} planPending={planPending} has={has} msg={msg} />}
            {step === 1 && <StepRubro form={form} set={set} data={data} plan={plan} />}
            {step === 2 && <StepModulos plan={plan} data={data} planPending={planPending} />}
            {step === 3 && <StepMarca form={form} set={set} data={data} monogram={monogram} theme={theme} accent={accent} has={has} msg={msg} planPending={planPending} />}
            {step === 4 && <StepRevisar form={form} plan={plan} isSecondTenant={data.isSecondTenant} />}

            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                ← Atrás
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
                  Siguiente →
                </Button>
              ) : (
                <Button onClick={onCommit} disabled={!canCommit}>
                  {committing ? "Creando…" : "Crear tenant"}
                </Button>
              )}
            </div>
            {!canCommit && step === STEPS.length - 1 && !result && !step1Ok && (
              <p className="text-xs text-danger" role="alert">
                Falta elegir el <b>rubro</b> (paso 2). Sin rubro el negocio nace con blueprint de servicios.
              </p>
            )}
            {!canCommit && step === STEPS.length - 1 && !result && step1Ok && plan && !plan.ok && (
              <p className="text-xs text-danger" role="alert">
                Hay validaciones sin resolver — revisá los pasos marcados antes de crear.
              </p>
            )}
          </>
        )}
      </div>

      {/* Panel de preview en vivo (persistente) — el corazón del rediseño (P2/P5/P9). */}
      <PreviewPanel form={form} plan={plan} planPending={planPending} data={data} monogram={monogram} theme={theme} accent={accent} />
    </div>
  );
}

// --- Barra de progreso -------------------------------------------------------

function Stepper({ step, valid, rubroOk, hostOk, plan }: { step: number; valid: boolean; rubroOk: boolean; hostOk: boolean; plan: ProvisionPlan | null }) {
  return (
    <nav aria-label="Progreso del alta" className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const done = i === 0 ? valid : i === 1 ? rubroOk : i === 3 ? hostOk : i < step;
        const current = i === step;
        return (
          <span
            key={label}
            aria-current={current ? "step" : undefined}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 " +
              (current ? "border-accent text-strong" : "border-line text-muted")
            }
          >
            <span
              aria-hidden
              className={
                "grid size-5 place-items-center rounded-full text-xs " +
                (done && !current ? "bg-success text-white" : current ? "bg-accent text-white" : "bg-surface-sunken text-muted")
              }
            >
              {done && !current ? "✓" : i + 1}
            </span>
            {label}
          </span>
        );
      })}
      {plan && !plan.ok && <Badge tone="danger" dot>revisar</Badge>}
    </nav>
  );
}

// --- Paso 1 · Negocio --------------------------------------------------------

function Availability({ pending, error, ok, okLabel }: { pending: boolean; error?: string; ok: boolean; okLabel: string }) {
  if (pending) return <span className="text-xs text-muted">verificando…</span>;
  if (error) return <span className="text-xs text-danger" role="alert">✗ {error}</span>;
  if (ok) return <span className="text-xs text-success">✓ {okLabel}</span>;
  return null;
}

function StepNegocio({
  form, set, onNameChange, setSlugTouched, plan, planPending, has, msg,
}: {
  form: RawWizardForm; set: (p: Partial<RawWizardForm>) => void; onNameChange: (v: string) => void;
  setSlugTouched: (v: boolean) => void; plan: ProvisionPlan | null; planPending: boolean;
  has: (k: string) => boolean; msg: (k: string) => string | undefined;
}) {
  const slugFilled = Boolean(form.slug?.trim());
  const emailFilled = Boolean(form.ownerEmail?.trim());
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-medium">Negocio</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Nombre del negocio" required htmlFor="w-name">
          <Input id="w-name" value={form.name ?? ""} onChange={(e) => onNameChange(e.target.value)} placeholder="Estética Norte" />
        </Field>
        <Field label="Slug (URL-safe, único)" required htmlFor="w-slug" hint="minúsculas, números y guiones">
          <Input
            id="w-slug"
            value={form.slug ?? ""}
            onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value }); }}
            placeholder="estetica-norte"
          />
          {slugFilled && (
            <Availability pending={planPending} error={msg("slug-invalid") ?? msg("slug-taken")} ok={!has("slug-invalid") && !has("slug-taken") && Boolean(plan)} okLabel="disponible" />
          )}
        </Field>
        <Field label="Nombre del dueño (OWNER)" htmlFor="w-owner">
          <Input id="w-owner" value={form.ownerName ?? ""} onChange={(e) => set({ ownerName: e.target.value })} placeholder="Ana Ruiz" />
        </Field>
        <Field label="Email del dueño (login)" required htmlFor="w-email">
          <Input id="w-email" type="email" value={form.ownerEmail ?? ""} onChange={(e) => set({ ownerEmail: e.target.value })} placeholder="ana@estetica-norte.com" />
          {emailFilled && <Availability pending={planPending} error={msg("email-invalid")} ok={!has("email-invalid") && Boolean(plan)} okLabel="formato válido" />}
        </Field>
      </div>
    </Card>
  );
}

// --- Paso 2 · Rubro + Edición ------------------------------------------------

function StepRubro({
  form, set, data, plan,
}: { form: RawWizardForm; set: (p: Partial<RawWizardForm>) => void; data: WizardData; plan: ProvisionPlan | null }) {
  const elegido = Boolean(form.rubro?.trim() || form.blueprint?.trim());
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-medium">Rubro del negocio</h2>
      <p className="text-sm text-muted">
        Define con qué nace el local: catálogo, wording de la vidriera y pantallas. <b>Es obligatorio</b>{" "}
        — ver más abajo por qué no se puede pasar de largo.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Rubro (texto libre)" htmlFor="w-rubro" hint="Se resuelve al blueprint del rubro, o al comodín genérico.">
          <Input id="w-rubro" value={form.rubro ?? ""} onChange={(e) => set({ rubro: e.target.value })} placeholder="p. ej. ferretería, spa, carnicería…" />
        </Field>
        <Field label="…o blueprint explícito" htmlFor="w-bp" hint="Si lo elegís, tiene prioridad sobre el rubro.">
          <Select id="w-bp" value={form.blueprint ?? ""} onChange={(e) => set({ blueprint: e.target.value })}>
            <option value="">(según rubro / default)</option>
            {data.blueprintGroups.map((g) => (
              <optgroup key={g.family} label={g.family}>
                {g.items.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>

      {/* Resolución EN VIVO del blueprint (resuelve P3). */}
      {plan && elegido && (
        <div className="rounded-md bg-info-soft text-info text-sm px-3 py-2">
          Se crea como: <b>{plan.blueprint.label}</b> <span className="opacity-80">— {plan.blueprint.note}</span>
        </div>
      )}

      {/* POR QUÉ ES OBLIGATORIO: sin rubro el alta caía al blueprint de SERVICIOS. Un local de
          carne llamado "MAGRA Lomas" nacía con agenda de turnos, lista de espera y catálogo de
          servicios, y "Crear tenant" quedaba habilitado igual. Con 5 locales abriendo juntos eso
          son 5 altas mal nacidas que se arreglan a mano, tenant por tenant. El rubro NO se puede
          cambiar cómodamente después: manda el catálogo semilla y el wording de la vidriera. */}
      {!elegido && (
        <div className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2" role="alert">
          <b>Elegí el rubro para seguir.</b> Si se pasa de largo, el negocio nace con el blueprint de{" "}
          <b>servicios</b> (agenda de turnos, lista de espera, catálogo de servicios) — aunque sea una
          carnicería. Corregirlo después es rehacer el alta.
        </div>
      )}

    </Card>
  );
}

// --- Paso 3 · Módulos (preview derivado del motor) ---------------------------

function StepModulos({ plan, data, planPending }: { plan: ProvisionPlan | null; data: WizardData; planPending: boolean }) {
  const label = (id: string) => data.moduleCatalog.find((m) => m.id === id)?.label ?? id;
  const desc = (id: string) => data.moduleCatalog.find((m) => m.id === id)?.description ?? "";
  const modules = plan?.modules ?? [];
  const baseMods = modules;
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-medium">Módulos que se activan</h2>
      <p className="text-sm text-muted">
        Derivados del <b>rubro</b> (motor de la fábrica, ADR-074). Son los que quedan guardados en el
        tenant; hoy el menú real se decide por rubro, así que esta lista es la referencia de lo que
        contrata el local, no un interruptor de pantallas.
      </p>
      {planPending && modules.length === 0 ? (
        <p className="text-sm text-muted">Calculando el set…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted mb-2">Base del rubro</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {baseMods.map((id) => (
                <div key={id} className="rounded-md border border-line p-3">
                  <span className="font-medium text-sm">{label(id)}</span>
                  <span className="block text-xs text-muted">{desc(id)}</span>
                </div>
              ))}
              {baseMods.length === 0 && <p className="text-xs text-muted">—</p>}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// --- Paso 4 · Marca + link + datos de empresa --------------------------------

function StepMarca({
  form, set, data, monogram, theme, accent, has, msg, planPending,
}: {
  form: RawWizardForm; set: (p: Partial<RawWizardForm>) => void; data: WizardData;
  monogram: string; theme: "light" | "dark"; accent?: WizardData["accents"][number];
  has: (k: string) => boolean; msg: (k: string) => string | undefined; planPending: boolean;
}) {
  const bg = accent ? (theme === "dark" ? accent.dark : accent.light) : "var(--surface-sunken)";
  const fg = accent ? (theme === "dark" ? accent.onDark : accent.onLight) : "var(--text-muted)";
  const subFilled = Boolean(form.subdomain?.trim());
  return (
    <Card className="p-5 space-y-5">
      <h2 className="font-medium">Marca y link</h2>

      <Field label="Acento de marca" htmlFor="w-accent">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Acento de marca">
          {data.accents.map((a) => {
            const on = form.accentPreset === a.id;
            return (
              <button
                type="button"
                key={a.id}
                role="radio"
                aria-checked={on}
                aria-label={a.id}
                onClick={() => set({ accentPreset: a.id })}
                className={"flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm " + (on ? "border-accent" : "border-line hover:bg-elevated")}
              >
                <span aria-hidden className="size-4 rounded-full border border-line" style={{ background: theme === "dark" ? a.dark : a.light }} />
                {a.id}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Tema de la vidriera" htmlFor="w-theme">
          <Select id="w-theme" value={form.frontTheme ?? "light"} onChange={(e) => set({ frontTheme: e.target.value })}>
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </Select>
        </Field>
        <Field label="Monograma" htmlFor="w-mono" hint="Si lo dejás vacío, se sugiere del nombre.">
          <Input id="w-mono" value={form.monogram ?? ""} onChange={(e) => set({ monogram: e.target.value })} maxLength={3} placeholder={monogram} />
        </Field>
      </div>

      {/* Preview del monograma con el acento (resuelve P5). */}
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-lg font-semibold" style={{ background: bg, color: fg }}>{monogram}</span>
        <span className="text-sm text-muted">Así se ve el acento sobre el tema elegido.</span>
      </div>

      <Field label="Subdominio / link propio" htmlFor="w-sub" hint="Su URL propia. Único. Opcional.">
        <Input id="w-sub" value={form.subdomain ?? ""} onChange={(e) => set({ subdomain: e.target.value })} placeholder="estetica-norte" />
        {subFilled && (
          <Availability pending={planPending} error={msg("host-invalid") ?? msg("host-taken")} ok={!has("host-invalid") && !has("host-taken")} okLabel="disponible" />
        )}
      </Field>

      <details className="rounded-md border border-line p-3">
        <summary className="text-sm font-medium cursor-pointer">Datos de contacto del negocio (opcional)</summary>
        <div className="grid md:grid-cols-2 gap-4 mt-3">
          <Field label="Ciudad" htmlFor="w-city"><Input id="w-city" value={form.city ?? ""} onChange={(e) => set({ city: e.target.value })} /></Field>
          <Field label="WhatsApp" htmlFor="w-wa"><Input id="w-wa" value={form.whatsapp ?? ""} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="+54 9 …" /></Field>
          <Field label="Dirección" htmlFor="w-addr"><Input id="w-addr" value={form.addressLine ?? ""} onChange={(e) => set({ addressLine: e.target.value })} /></Field>
          <Field label="Instagram" htmlFor="w-ig"><Input id="w-ig" value={form.instagram ?? ""} onChange={(e) => set({ instagram: e.target.value })} placeholder="@…" /></Field>
        </div>
      </details>
    </Card>
  );
}

// --- Paso 5 · Revisar --------------------------------------------------------

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-line last:border-0">
      <span className="text-sm text-muted">{k}</span>
      <span className="text-sm text-strong text-right">{v}</span>
    </div>
  );
}

function StepRevisar({
  form, plan, isSecondTenant,
}: { form: RawWizardForm; plan: ProvisionPlan | null; isSecondTenant: boolean }) {
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-medium">Revisar y crear</h2>

      {isSecondTenant && (
        <div className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2" role="alert">
          ⚠️ Este sería el <b>2º tenant</b>. El gate RLS de ADR-018 bloquea el alta hasta activar el
          aislamiento por fila en Postgres. Si RLS no está activo, el commit se abortará con un error explícito.
        </div>
      )}

      <div className="rounded-md border border-line p-4">
        <Row k="Negocio" v={form.name || "—"} />
        <Row k="Slug" v={`/${form.slug || "—"}`} />
        <Row k="Dueño" v={form.ownerEmail || "—"} />
        <Row k="Blueprint" v={plan ? `${plan.blueprint.label}` : "—"} />
        <Row k="Módulos" v={`${plan?.modules.length ?? 0} activos`} />
        <Row k="Acento / tema" v={`${form.accentPreset || "default"} · ${form.frontTheme === "dark" ? "oscuro" : "claro"}`} />
        <Row k="Link" v={form.subdomain ? `/${form.subdomain}` : "sin subdominio"} />
      </div>

      {plan && plan.objects.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-2">Se crearían</p>
          <ul className="text-sm space-y-1">
            {plan.objects.map((o, i) => (
              <li key={i} className="flex gap-2"><span className="text-success">＋</span><span>{o.label}<span className="text-muted"> — {o.detail}</span></span></li>
            ))}
          </ul>
        </div>
      )}

      {plan && plan.warnings.length > 0 && (
        <ul className="text-xs text-warning space-y-1">
          {plan.warnings.map((w) => <li key={w.code}>• {w.message}</li>)}
        </ul>
      )}
      {plan && plan.collisions.length > 0 && (
        <ul className="text-xs text-danger space-y-1" role="alert">
          {plan.collisions.map((c, i) => <li key={i}>✗ {c.message}</li>)}
        </ul>
      )}
    </Card>
  );
}

// --- Resultado del commit (saga + bootstrap) ---------------------------------

function SagaStepper({ state }: { state: ProvisionState }) {
  const reached = HAPPY_PATH.indexOf(state);
  const failed = state === "FAILED_COMPENSATED";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {HAPPY_PATH.map((s, i) => {
        const manual = PASOS_MANUALES.includes(s);
        const done = !failed && reached >= i && !manual;
        return (
          <span
            key={s}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs " +
              (done ? "bg-success-soft text-success" : manual ? "bg-warning-soft text-warning" : "bg-surface-sunken text-muted")
            }
          >
            <span aria-hidden>{done ? "✓" : manual ? "⋯" : "○"}</span>{STATE_LABEL[s]}
          </span>
        );
      })}
    </div>
  );
}

function ResultPanel({ result, tenantId }: { result: CommitActionResult; tenantId?: string }) {
  const outcome = result.outcome;

  if (!result.ok && !outcome) {
    // Bloqueado antes de escribir (colisiones / gate RLS de ADR-018).
    return (
      <Card className="p-5 space-y-3">
        <h2 className="font-medium text-danger">No se pudo crear el tenant</h2>
        <p className="text-sm text-danger whitespace-pre-wrap" role="alert">{result.error}</p>
        <p className="text-sm text-muted">No se escribió nada. Corregí lo indicado y volvé a intentar.</p>
      </Card>
    );
  }

  const state = outcome?.state ?? "PENDING";
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-medium">{result.ok ? "Tenant creado" : "Alta con compensación"}</h2>
      <SagaStepper state={state} />

      {state === "FAILED_COMPENSATED" && outcome?.failure && (
        <div className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2" role="alert">
          Falló en <b>{outcome.failure.atState}</b>: {outcome.failure.reason}.
          {outcome.failure.compensated.length > 0 && <> Se compensó: {outcome.failure.compensated.join(", ")}.</>}
          <span className="block mt-1">Los datos del tenant NO se borraron (aditivo/idempotente): reintentar es seguro.</span>
        </div>
      )}

      {/* Entrega segura del bootstrap (P10): fuera de la URL, copiar al portapapeles, se muestra una vez. */}
      {result.generatedPassword && (
        <BootstrapReveal
          password={result.generatedPassword}
          label={<>Contraseña de bootstrap del OWNER (se muestra <b>una sola vez</b>, comunicala por canal seguro):</>}
        />
      )}

      {/* Lo que la saga NO hizo. Va acá, pegado al resultado, porque es el único momento en que el
          operador tiene el alta fresca: después se olvida y el local abre sin link y sin aviso. */}
      {result.ok && (
        <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
          <p className="font-medium">Falta hacer a mano (el alta no lo hace):</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            <li>
              • <b>Ligar el link:</b> el subdominio queda guardado en el tenant, pero apuntar el
              dominio en Vercel/DNS es manual.
            </li>
            <li>
              • <b>Avisarle al dueño:</b> no se envía ningún mail. Pasale por canal seguro la
              contraseña de acá arriba (o generá una nueva en la ficha, “Contraseña del OWNER”).
            </li>
            <li>
              • <b>Datos fiscales y de contacto:</b> CUIT, punto de venta de ARCA, dirección real e
              Instagram. La ficha tiene el checklist “Listo para abrir” con lo que falta.
            </li>
          </ul>
        </div>
      )}

      {tenantId && (
        <Link href={`/operador/tenants/${tenantId}`} className="inline-block">
          <Button variant="outline" size="sm">Ir a la ficha del tenant →</Button>
        </Link>
      )}
    </Card>
  );
}

// --- Panel de preview en vivo ------------------------------------------------

function PreviewPanel({
  form, plan, planPending, data, monogram, theme, accent,
}: {
  form: RawWizardForm; plan: ProvisionPlan | null; planPending: boolean; data: WizardData;
  monogram: string; theme: "light" | "dark"; accent?: WizardData["accents"][number];
}) {
  const bg = accent ? (theme === "dark" ? accent.dark : accent.light) : "var(--surface-sunken)";
  const fg = accent ? (theme === "dark" ? accent.onDark : accent.onLight) : "var(--text-muted)";
  const isEmpresa = (id: string) => data.empresaModuleIds.includes(id);
  const label = (id: string) => data.moduleCatalog.find((m) => m.id === id)?.label ?? id;
  return (
    <aside className="lg:sticky lg:top-6">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Vista previa del tenant</p>
          {planPending && <span className="text-xs text-muted">actualizando…</span>}
        </div>

        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg font-semibold shrink-0" style={{ background: bg, color: fg }}>{monogram}</span>
          <div className="min-w-0">
            <p className="font-medium truncate">{form.name || "Nombre del negocio"}</p>
            <p className="text-xs text-muted truncate">/{form.slug || "slug"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {plan && <Badge tone="info">{plan.blueprint.label}</Badge>}
        </div>

        {plan && plan.modules.length > 0 && (
          <div>
            <p className="text-xs text-muted mb-1">Módulos ({plan.modules.length})</p>
            <div className="flex flex-wrap gap-1">
              {plan.modules.map((id) => (
                <span key={id} className={"rounded px-1.5 py-0.5 text-[11px] " + (isEmpresa(id) ? "bg-info-soft text-info" : "bg-surface-sunken text-muted")}>
                  {label(id)}
                </span>
              ))}
            </div>
          </div>
        )}

        {form.subdomain && <p className="text-xs text-muted">🔗 /{form.subdomain}</p>}

        {plan && plan.collisions.length > 0 && (
          <div className="text-xs text-danger space-y-0.5" role="alert">
            {plan.collisions.map((c, i) => <p key={i}>✗ {c.message}</p>)}
          </div>
        )}
      </Card>
    </aside>
  );
}
