"use client";

// WIZARD DE ALTA DE TENANT — 6 pasos + panel de preview en vivo (RFC-003 §3.1) sobre la fábrica
// de tenants (ADR-074). CLIENT-SAFE: sólo importa tipos (se borran en build), UI del design system,
// helpers puros de mapeo y los Server Actions del alta. NADA server-tainted (Prisma, branding,
// catálogo de plugins) — todo el catálogo llega por props desde el server (page.tsx).
//
// Flujo: cada cambio dispara (debounced) el DRY-RUN obligatorio (`planTenantAction`) → el plan
// alimenta el preview en vivo, la validación inline (slug/host/email) y los chips de módulos. El
// commit (`commitTenantAction`) sólo se habilita con el plan sin colisiones, y muestra el estado de
// la saga (PENDING→ACTIVE) o el fallo compensado, más la entrega segura del bootstrap (fuera de la URL).
//
// ¿DE QUÉ RED? Un local de una marca con varios locales (MAGRA Canning) se abre en la MISMA corrida
// que el alta: apenas la fábrica crea el negocio, `sumarAltaALaRedAction` lo vincula a su casa, le
// carga el CUIT y el punto de venta (rechaza un par CUIT + punto de venta que ya usa otro negocio) y
// le deja la lista de precios de la casa. Antes de crear, `revisarAltaEnRedAction` hace el mismo
// chequeo sin escribir: mientras se carga el paso ("Siguiente" y "Crear" esperan la revisión de LO
// QUE ESTÁ ESCRITO, no la de antes del último cambio) y otra vez justo antes de crear. Si el paso de
// la red falla después de crear, el panel lo dice, deja corregir el CUIT y el punto de venta y
// reintentar (es idempotente), y lleva a las fichas del local y de la casa.
//
// La opción "Local de una red" sólo se ofrece si la fábrica da de alta SIN el catálogo de ejemplo
// del rubro (`altaEnRedDisponible`, lo decide page.tsx): un local de una red nace vacío y recibe la
// lista de la casa. Si la fábrica sembrara el catálogo de ejemplo, el local quedaría con productos
// y stock que no existen.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, Field, Input, Select, Button, Badge, buttonClasses } from "@/components/ui";
import { RevelarClave } from "../RevelarClave";
import { planTenantAction, commitTenantAction } from "@/lib/operator-provisioning-actions";
import { revisarAltaEnRedAction, sumarAltaALaRedAction, type RevisionAltaEnRed } from "@/lib/operador/red-locales-actions";
import type { ResultadoAltaEnRed } from "@/lib/multilocal/multilocal-core";
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
  /** Casas de una red a las que se puede sumar el local (paso "¿De qué red?"). */
  casas: { id: string; name: string; cuit: string | null }[];
  /** ¿La fábrica da de alta sin el catálogo de ejemplo? Si no, "Local de una red" no se ofrece. */
  altaEnRedDisponible: boolean;
}

const STEPS = ["Negocio", "Rubro", "¿De qué red?", "Módulos", "Marca y link", "Revisar"] as const;

/** Lo que se carga en el paso "¿De qué red?". Sin casa = local suelto, como siempre. */
type DatosRed = { casaId: string; alias: string; cuit: string; puntoVenta: string };

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
  const [red, setRedState] = useState<DatosRed>({ casaId: "", alias: "", cuit: "", puntoVenta: "" });
  // La revisión vale para los datos con que se pidió (`clave`): mientras el operador escribe, la
  // de antes no habilita nada.
  const [revisada, setRevisada] = useState<{ clave: string; r: RevisionAltaEnRed } | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [altaRed, setAltaRed] = useState<ResultadoAltaEnRed | null>(null);
  const [sumando, setSumando] = useState(false);
  const setRed = (patch: Partial<DatosRed>) => setRedState((r) => ({ ...r, ...patch }));

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

  // Chequeo del paso "¿De qué red?" SIN escribir (casa válida, CUIT + punto de venta libre),
  // debounced y con id de request igual que el dry-run. El alias no cambia nada del chequeo.
  const redReq = useRef(0);
  const redKey = JSON.stringify({ casaId: red.casaId, cuit: red.cuit, puntoVenta: red.puntoVenta });
  useEffect(() => {
    const id = ++redReq.current;
    const sinRed = !red.casaId;
    const pedido = { ...red };
    const t = setTimeout(async () => {
      if (sinRed) {
        setRevisada(null);
        setRevisando(false);
        return;
      }
      setRevisando(true);
      const r = await revisarRed(pedido);
      if (id === redReq.current) {
        setRevisada({ clave: redKey, r });
        setRevisando(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redKey]);
  // Sólo la revisión de lo que está escrito AHORA cuenta: durante los 350 ms del debounce la de
  // antes del último cambio no habilita "Siguiente" ni "Crear".
  const revision = revisada?.clave === redKey ? revisada.r : null;
  const redOk = !red.casaId || (revision?.ok === true && !revisando);
  const casaElegida = data.casas.find((c) => c.id === red.casaId) ?? null;

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
  const canAdvance = step === 0 ? step0Ok : step === 1 ? step1Ok : step === 2 ? redOk : step === 4 ? step3Ok : true;
  const canCommit = Boolean(plan?.ok) && step1Ok && redOk && !planPending && !committing && !result?.ok;

  /**
   * Suma el local recién creado a la red elegida (idempotente: sirve también para reintentar). El
   * reintento puede traer otro CUIT o punto de venta, corregidos en el panel del resultado.
   */
  async function sumarALaRed(tenantId: string, fiscal?: { cuit: string; puntoVenta: string }) {
    setSumando(true);
    try {
      const fd = new FormData();
      fd.set("casaId", red.casaId);
      fd.set("localId", tenantId);
      fd.set("alias", red.alias.trim() || form.name?.trim() || "");
      fd.set("cuit", fiscal?.cuit ?? red.cuit);
      fd.set("puntoVenta", fiscal?.puntoVenta ?? red.puntoVenta);
      setAltaRed(await sumarAltaALaRedAction(fd));
    } catch {
      setAltaRed({ ok: false, motivo: "No se pudo sumar el local a la red: no quedó nada a medias. Probá de nuevo." });
    } finally {
      setSumando(false);
    }
  }

  async function onCommit() {
    setCommitting(true);
    try {
      // Justo antes de crear, la revisión otra vez contra la base: entre la última revisión y el
      // clic otro operador pudo haber cargado ese punto de venta. Si no pasa, no se crea nada.
      if (red.casaId) {
        const r = await revisarRed(red);
        setRevisada({ clave: redKey, r });
        if (!r.ok) return;
      }
      // `sinCatalogo`: un local de una red no nace con el catálogo de ejemplo del rubro, nace con la
      // lista de la casa. La opción sólo se ofrece si la fábrica lo cumple (`altaEnRedDisponible`);
      // si igual sembrara, el panel del resultado lo avisa y la lista no le pisa esos productos.
      const conRed: RawWizardForm = red.casaId ? { ...form, sinCatalogo: true } : form;
      const r = await commitTenantAction(conRed);
      setResult(r);
      if (r.ok && r.tenantId && red.casaId) await sumarALaRed(r.tenantId);
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
        <Stepper step={step} valid={step0Ok} rubroOk={step1Ok} redOk={redOk} hostOk={step3Ok} plan={plan} />

        {result ? (
          <>
            <ResultPanel result={result} tenantId={result.tenantId} />
            {casaElegida && result.ok && result.tenantId && (
              <PanelDeLaRed
                casa={casaElegida.name}
                resultado={altaRed}
                sumando={sumando}
                sembrado={Boolean(result.outcome?.commit?.catalogSeeded)}
                casaId={casaElegida.id}
                localId={result.tenantId}
                fiscal={{ cuit: red.cuit, puntoVenta: red.puntoVenta }}
                cuitDeLaCasa={casaElegida.cuit}
                onReintentar={(fiscal) => sumarALaRed(result.tenantId!, fiscal)}
              />
            )}
          </>
        ) : (
          <>
            {step === 0 && <StepNegocio form={form} set={set} onNameChange={onNameChange} setSlugTouched={setSlugTouched} plan={plan} planPending={planPending} has={has} msg={msg} />}
            {step === 1 && <StepRubro form={form} set={set} data={data} plan={plan} />}
            {step === 2 && (
              <StepRed
                casas={data.casas}
                disponible={data.altaEnRedDisponible}
                red={red}
                setRed={setRed}
                nombre={form.name ?? ""}
                revision={revision}
                revisando={revisando || (Boolean(red.casaId) && !revision)}
              />
            )}
            {step === 3 && <StepModulos plan={plan} data={data} planPending={planPending} />}
            {step === 4 && <StepMarca form={form} set={set} data={data} monogram={monogram} theme={theme} accent={accent} has={has} msg={msg} planPending={planPending} />}
            {step === 5 && <StepRevisar form={form} plan={plan} isSecondTenant={data.isSecondTenant} red={casaElegida ? { casa: casaElegida.name, revision } : null} />}

            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                Atrás
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
                  Siguiente
                </Button>
              ) : (
                <Button onClick={onCommit} disabled={!canCommit}>
                  {committing ? "Dando de alta…" : "Dar de alta el negocio"}
                </Button>
              )}
            </div>
            {!canCommit && step === STEPS.length - 1 && !result && !step1Ok && (
              <p className="text-xs text-danger" role="alert">
                Falta elegir el <b>rubro</b> (paso 2). Sin rubro el negocio nace como uno de servicios.
              </p>
            )}
            {!canCommit && step === STEPS.length - 1 && !result && step1Ok && plan && !plan.ok && (
              <p className="text-xs text-danger" role="alert">
                Hay validaciones sin resolver — revisá los pasos marcados antes de crear.
              </p>
            )}
            {!canCommit && step === STEPS.length - 1 && !result && step1Ok && !redOk && !revisando && revision !== null && (
              <p className="text-xs text-danger" role="alert">
                El paso «¿De qué red?» no está resuelto: {revision && !revision.ok ? revision.motivo : "elegí la casa o volvé a «Negocio suelto»."}
              </p>
            )}
          </>
        )}
      </div>

      {/* Panel de preview en vivo (persistente) — el corazón del rediseño (P2/P5/P9). */}
      <PreviewPanel form={form} plan={plan} planPending={planPending} data={data} monogram={monogram} theme={theme} accent={accent} casa={casaElegida?.name ?? null} />
    </div>
  );
}

/** El chequeo del paso "¿De qué red?" contra el servidor, sin escribir. Nunca tira. */
async function revisarRed(red: DatosRed): Promise<RevisionAltaEnRed> {
  try {
    const fd = new FormData();
    fd.set("casaId", red.casaId);
    fd.set("cuit", red.cuit);
    fd.set("puntoVenta", red.puntoVenta);
    return await revisarAltaEnRedAction(fd);
  } catch {
    return { ok: false, motivo: "No se pudo revisar ahora. Probá de nuevo en un rato." };
  }
}

// --- Barra de progreso -------------------------------------------------------

function Stepper({ step, valid, rubroOk, redOk, hostOk, plan }: { step: number; valid: boolean; rubroOk: boolean; redOk: boolean; hostOk: boolean; plan: ProvisionPlan | null }) {
  return (
    <nav aria-label="Progreso del alta" className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const done = i === 0 ? valid : i === 1 ? rubroOk : i === 2 ? redOk && i < step : i === 4 ? hostOk : i < step;
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
        <Field label="Nombre corto (único)" required htmlFor="w-slug" hint="Minúsculas, números y guiones. Identifica al negocio en la consola.">
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
        <Field label="Nombre del dueño" htmlFor="w-owner">
          <Input id="w-owner" value={form.ownerName ?? ""} onChange={(e) => set({ ownerName: e.target.value })} placeholder="Ana Ruiz" />
        </Field>
        <Field label="Email del dueño (con el que entra)" required htmlFor="w-email">
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
        Define con qué nace el local: su catálogo de ejemplo, las palabras de su vidriera y sus pantallas. <b>Es obligatorio.</b>
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Rubro, en palabras" htmlFor="w-rubro" hint="Se busca el rubro que corresponde; si no hay, el genérico.">
          <Input id="w-rubro" value={form.rubro ?? ""} onChange={(e) => set({ rubro: e.target.value })} placeholder="p. ej. ferretería, spa, carnicería…" />
        </Field>
        <Field label="…o elegilo de la lista" htmlFor="w-bp" hint="Si lo elegís, manda sobre lo escrito.">
          <Select id="w-bp" value={form.blueprint ?? ""} onChange={(e) => set({ blueprint: e.target.value })}>
            <option value="">Según lo escrito</option>
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
          Nace como: <b>{plan.blueprint.label}</b> <span className="opacity-80">· {plan.blueprint.note}</span>
        </div>
      )}

      {/* POR QUÉ ES OBLIGATORIO: sin rubro el alta caía al blueprint de SERVICIOS. Un local de
          carne llamado "MAGRA Lomas" nacía con agenda de turnos, lista de espera y catálogo de
          servicios, y "Crear tenant" quedaba habilitado igual. Con 5 locales abriendo juntos eso
          son 5 altas mal nacidas que se arreglan a mano, tenant por tenant. El rubro NO se puede
          cambiar cómodamente después: manda el catálogo semilla y el wording de la vidriera. */}
      {!elegido && (
        <div className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2" role="alert">
          <b>Elegí el rubro para seguir.</b> Si se pasa de largo, el negocio nace como uno de <b>servicios</b>{" "}
          (agenda de turnos, lista de espera, catálogo de servicios), aunque sea una carnicería. Corregirlo después es
          rehacer el alta.
        </div>
      )}

    </Card>
  );
}

// --- Paso 3 · ¿De qué red? ---------------------------------------------------

/** "20-30405060-7" para mostrar; el operador lo puede escribir con o sin guiones. */
function cuitLegible(c: string | null): string {
  const d = (c ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : d || "sin CUIT";
}

function StepRed({
  casas, disponible, red, setRed, nombre, revision, revisando,
}: {
  casas: WizardData["casas"]; disponible: boolean; red: DatosRed; setRed: (p: Partial<DatosRed>) => void; nombre: string;
  revision: RevisionAltaEnRed | null; revisando: boolean;
}) {
  const casa = casas.find((c) => c.id === red.casaId) ?? null;
  const enRed = red.casaId !== "";
  const sePuede = disponible && casas.length > 0;
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-medium">¿De qué red?</h2>
      <p className="text-sm text-muted">
        Si el local es de una marca con varios locales, elegí su casa: al crearlo queda vinculado a ella, con su
        CUIT y punto de venta, y con la lista de precios de la casa, en la misma corrida. Si es un negocio suelto,
        seguí de largo.
      </p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="¿De qué red?">
        <label className={"flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm " + (!enRed ? "border-accent" : "border-line")}>
          <input type="radio" name="w-red" checked={!enRed} onChange={() => setRed({ casaId: "" })} className="size-4" />
          Negocio suelto (como hasta hoy)
        </label>
        <label
          className={
            "flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm " +
            (enRed ? "border-accent" : "border-line") +
            (!sePuede ? " opacity-60" : "")
          }
        >
          <input
            type="radio"
            name="w-red"
            checked={enRed}
            disabled={!sePuede}
            onChange={() => setRed({ casaId: casas[0]?.id ?? "" })}
            className="size-4"
          />
          Local de una red
        </label>
      </div>
      {!disponible && (
        <p className="text-xs text-muted" role="note">
          Todavía no: la fábrica de negocios siembra el catálogo de ejemplo del rubro (productos y stock que no
          existen), y un local de una red tiene que nacer vacío para recibir la lista de la casa. Se habilita sola
          cuando la fábrica dé de alta sin catálogo. Mientras tanto, este alta crea un negocio suelto.
        </p>
      )}
      {disponible && casas.length === 0 && (
        <p className="text-xs text-muted">
          No hay ninguna casa armada. Para abrir un local dentro de una red, primero activá «Mis locales» en la ficha
          del negocio que va a ser la casa.
        </p>
      )}

      {enRed && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Casa de la red" htmlFor="w-casa" required>
            <Select id="w-casa" value={red.casaId} onChange={(e) => setRed({ casaId: e.target.value })}>
              {casas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cómo lo llama la casa" htmlFor="w-alias" hint="Vacío = el nombre del negocio.">
            <Input id="w-alias" value={red.alias} maxLength={60} onChange={(e) => setRed({ alias: e.target.value })} placeholder={nombre || "Canning"} />
          </Field>
          <Field label="CUIT" htmlFor="w-red-cuit" hint={`Vacío = el de la casa (${cuitLegible(casa?.cuit ?? null)}).`}>
            <Input id="w-red-cuit" value={red.cuit} inputMode="numeric" autoComplete="off" onChange={(e) => setRed({ cuit: e.target.value })} placeholder={cuitLegible(casa?.cuit ?? null)} />
          </Field>
          <Field label="Punto de venta de ARCA" htmlFor="w-pv" hint="El que ARCA habilitó para este local. Si todavía no lo tiene, dejalo vacío y cargalo después en su ficha.">
            <Input id="w-pv" value={red.puntoVenta} inputMode="numeric" autoComplete="off" onChange={(e) => setRed({ puntoVenta: e.target.value })} placeholder="Ej: 4" />
          </Field>
        </div>
      )}

      {enRed && (
        <div aria-live="polite">
          {revisando ? (
            <p className="text-xs text-muted">revisando…</p>
          ) : revision && !revision.ok ? (
            <p className="text-sm text-danger" role="alert">✗ {revision.motivo}</p>
          ) : revision?.ok ? (
            <p className="text-sm text-success">
              ✓ Va a la red de {revision.casa} · CUIT {cuitLegible(revision.cuit)} ·{" "}
              {revision.puntoVenta ? `punto de venta ${revision.puntoVenta} (libre)` : "sin punto de venta todavía"}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/**
 * Lo que pasó con la red después de crear el negocio. Si falló, se corrige el CUIT o el punto de
 * venta y se reintenta desde acá, o se sigue desde las fichas del local y de la casa: el negocio
 * ya está creado, así que ningún final deja al operador sin camino.
 */
function PanelDeLaRed({
  casa, resultado, sumando, sembrado, casaId, localId, fiscal, cuitDeLaCasa, onReintentar,
}: {
  casa: string;
  resultado: ResultadoAltaEnRed | null;
  sumando: boolean;
  sembrado: boolean;
  casaId: string;
  localId: string;
  fiscal: { cuit: string; puntoVenta: string };
  cuitDeLaCasa: string | null;
  onReintentar: (fiscal: { cuit: string; puntoVenta: string }) => void;
}) {
  const [corregido, setCorregido] = useState(fiscal);
  const catalogo = resultado?.ok ? resultado.catalogo : null;
  const fichas = (
    <div className="flex flex-wrap gap-2">
      <Link href={`/operador/tenants/${encodeURIComponent(localId)}`} className={buttonClasses("outline", "md")}>
        Abrir la ficha del local
      </Link>
      <Link href={`/operador/tenants/${encodeURIComponent(casaId)}?pestana=plan#red`} className={buttonClasses("outline", "md")}>
        Abrir la red de {casa}
      </Link>
    </div>
  );
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-medium">Red de {casa}</h2>
      {sumando || !resultado ? (
        <p className="text-sm text-muted" aria-live="polite">Sumando el local a la red…</p>
      ) : resultado.ok ? (
        <ul className="space-y-1 text-sm" aria-live="polite">
          <li className="text-success">✓ Vinculado a {resultado.casa} como «{resultado.alias}». Quedó en la auditoría de los dos negocios.</li>
          <li className={resultado.puntoVenta ? "text-success" : "text-warning"}>
            {resultado.puntoVenta ? "✓" : "!"} CUIT {cuitLegible(resultado.cuit)} ·{" "}
            {resultado.puntoVenta ? `punto de venta ${resultado.puntoVenta}` : "sin punto de venta: cargalo en su ficha para que pueda facturar"}
          </li>
          {catalogo?.estado === "aplicado" ? (
            <li className="text-success">
              ✓ La lista de precios de {casa} quedó cargada ({catalogo.nuevos} productos nuevos
              {catalogo.cambios > 0 ? `, ${catalogo.cambios} precios` : ""}).
            </li>
          ) : catalogo?.estado === "al-dia" ? (
            <li className="text-success">✓ Ya tenía la lista de precios de {casa}.</li>
          ) : catalogo ? (
            <li className="text-warning" role="status">
              ! La lista de precios quedó pendiente: {catalogo.motivo}
            </li>
          ) : null}
          {resultado.aviso && <li className="text-warning">{resultado.aviso}</li>}
        </ul>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-danger" role="alert">
            ✗ El negocio se creó, pero no se sumó a la red (no quedó nada a medias): {resultado.motivo}
          </p>
          <p className="text-sm text-muted">
            Si el problema es el CUIT o el punto de venta, corregilo acá y reintentá. Si es otra cosa, seguí desde las
            fichas: el vínculo se arma en la tarjeta Red de la casa y el punto de venta, en la ficha del local.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CUIT" htmlFor="w-red-cuit-2" hint={`Vacío = el de la casa (${cuitLegible(cuitDeLaCasa)}).`}>
              <Input
                id="w-red-cuit-2"
                value={corregido.cuit}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => setCorregido((c) => ({ ...c, cuit: e.target.value }))}
              />
            </Field>
            <Field label="Punto de venta de ARCA" htmlFor="w-pv-2" hint="Vacío = se carga después en su ficha.">
              <Input
                id="w-pv-2"
                value={corregido.puntoVenta}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => setCorregido((c) => ({ ...c, puntoVenta: e.target.value }))}
              />
            </Field>
          </div>
          <Button variant="outline" onClick={() => onReintentar(corregido)} disabled={sumando}>
            Reintentar sumarlo a la red
          </Button>
        </div>
      )}
      {resultado && !sumando && (!resultado.ok || catalogo?.estado === "no-aplicable" || !resultado.puntoVenta) && fichas}
      {sembrado && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning" role="status">
          Ojo: el local nació con el catálogo de ejemplo del rubro, con su stock de ejemplo. Hay que sacar esos
          productos del catálogo del local antes de abrir; si la lista de la casa quedó pendiente, se le manda
          después desde la casa, en «Catálogo y precios de la marca», con vista previa.
        </p>
      )}
    </Card>
  );
}

// --- Paso 4 · Módulos (preview derivado del motor) ---------------------------

function StepModulos({ plan, data, planPending }: { plan: ProvisionPlan | null; data: WizardData; planPending: boolean }) {
  const label = (id: string) => data.moduleCatalog.find((m) => m.id === id)?.label ?? id;
  const desc = (id: string) => data.moduleCatalog.find((m) => m.id === id)?.description ?? "";
  const modules = plan?.modules ?? [];
  const baseMods = modules;
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-medium">Módulos que trae</h2>
      <p className="text-sm text-muted">
        Salen del <b>rubro</b>. Quedan guardados en el negocio: mientras no trabaje por apps, sus pantallas las
        decide el rubro, así que esta lista es lo que contrata el local, no un interruptor de pantallas.
      </p>
      {planPending && modules.length === 0 ? (
        <p className="text-sm text-muted">Calculando…</p>
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

// --- Paso 5 · Marca + link + datos de empresa --------------------------------

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

      <Field label="Color de la marca" htmlFor="w-accent">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color de la marca">
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
        <span className="text-sm text-muted">Así se ve el color sobre el tema elegido.</span>
      </div>

      <Field label="Link propio (subdominio)" htmlFor="w-sub" hint="Su dirección en internet. Única. Opcional.">
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

// --- Paso 6 · Revisar --------------------------------------------------------

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-line last:border-0">
      <span className="text-sm text-muted">{k}</span>
      <span className="text-sm text-strong text-right">{v}</span>
    </div>
  );
}

function StepRevisar({
  form, plan, isSecondTenant, red,
}: {
  form: RawWizardForm; plan: ProvisionPlan | null; isSecondTenant: boolean;
  red: { casa: string; revision: RevisionAltaEnRed | null } | null;
}) {
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-medium">Revisar y dar de alta</h2>

      {isSecondTenant && (
        <div className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2" role="alert">
          Con más de un negocio en la base, el alta exige el aislamiento entre negocios prendido. Si no lo está, el
          alta se frena con un error que lo dice, y no se escribe nada.
        </div>
      )}

      <div className="rounded-md border border-line p-4">
        <Row k="Negocio" v={form.name || "—"} />
        <Row k="Nombre corto" v={form.slug || "—"} />
        <Row k="Dueño" v={form.ownerEmail || "—"} />
        <Row k="Rubro" v={plan ? `${plan.blueprint.label}` : "—"} />
        <Row k="Módulos" v={`${plan?.modules.length ?? 0} activos`} />
        <Row k="Color y tema" v={`${form.accentPreset || "el del rubro"} · ${form.frontTheme === "dark" ? "oscuro" : "claro"}`} />
        <Row k="Link" v={form.subdomain ? form.subdomain : "sin link propio"} />
        <Row
          k="Red"
          v={
            red
              ? `Local de ${red.casa}` +
                (red.revision?.ok
                  ? ` · CUIT ${red.revision.cuit ?? "sin cargar"} · ${red.revision.puntoVenta ? `punto de venta ${red.revision.puntoVenta}` : "sin punto de venta"}`
                  : "")
              : "Negocio suelto"
          }
        />
      </div>
      {red && (
        <p className="text-xs text-muted">
          Al crear, en la misma corrida: queda vinculado a {red.casa} (con auditoría en los dos), con su CUIT y punto de venta,
          y con la lista de precios de la casa. El stock no se copia: entra por recuento o por un traslado.
        </p>
      )}

      {plan && plan.objects.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-2">Se va a crear</p>
          <ul className="text-sm space-y-1">
            {plan.objects.map((o, i) => (
              <li key={i} className="flex gap-2"><span className="text-success" aria-hidden>+</span><span>{o.label}<span className="text-muted"> · {o.detail}</span></span></li>
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
        <h2 className="font-medium text-danger">No se pudo dar de alta el negocio</h2>
        <p className="text-sm text-danger whitespace-pre-wrap" role="alert">{result.error}</p>
        <p className="text-sm text-muted">No se escribió nada. Corregí lo indicado y volvé a intentar.</p>
      </Card>
    );
  }

  const state = outcome?.state ?? "PENDING";
  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-medium">{result.ok ? "Negocio dado de alta" : "El alta se deshizo a medias"}</h2>
      <SagaStepper state={state} />

      {state === "FAILED_COMPENSATED" && outcome?.failure && (
        <div className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2" role="alert">
          Falló en <b>{outcome.failure.atState}</b>: {outcome.failure.reason}.
          {outcome.failure.compensated.length > 0 && <> Se compensó: {outcome.failure.compensated.join(", ")}.</>}
          <span className="block mt-1">Lo que se alcanzó a crear no se borró y reintentar no lo duplica: es seguro volver a probar.</span>
        </div>
      )}

      {/* La contraseña del dueño: fuera de la URL, se copia, se muestra una sola vez. */}
      {result.generatedPassword && <RevelarClave clave={result.generatedPassword} para="el dueño" />}

      {/* Lo que la saga NO hizo. Va acá, pegado al resultado, porque es el único momento en que el
          operador tiene el alta fresca: después se olvida y el local abre sin link y sin aviso. */}
      {result.ok && (
        <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
          <p className="font-medium">Falta hacer a mano (el alta no lo hace):</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            <li>
              • <b>Ligar el link:</b> el subdominio queda guardado en el negocio, pero apuntar el
              dominio es manual.
            </li>
            <li>
              • <b>Avisarle al dueño:</b> no se envía ningún mail. Pasale por canal seguro la
              contraseña de acá arriba (o generá una nueva en su ficha, pestaña Personas).
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
          <Button variant="outline" size="sm">Ir a la ficha del negocio</Button>
        </Link>
      )}
    </Card>
  );
}

// --- Panel de preview en vivo ------------------------------------------------

function PreviewPanel({
  form, plan, planPending, data, monogram, theme, accent, casa,
}: {
  form: RawWizardForm; plan: ProvisionPlan | null; planPending: boolean; data: WizardData;
  monogram: string; theme: "light" | "dark"; accent?: WizardData["accents"][number]; casa: string | null;
}) {
  const bg = accent ? (theme === "dark" ? accent.dark : accent.light) : "var(--surface-sunken)";
  const fg = accent ? (theme === "dark" ? accent.onDark : accent.onLight) : "var(--text-muted)";
  const isEmpresa = (id: string) => data.empresaModuleIds.includes(id);
  const label = (id: string) => data.moduleCatalog.find((m) => m.id === id)?.label ?? id;
  return (
    <aside className="lg:sticky lg:top-6">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Así va a quedar</p>
          {planPending && <span className="text-xs text-muted">actualizando…</span>}
        </div>

        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg font-semibold shrink-0" style={{ background: bg, color: fg }}>{monogram}</span>
          <div className="min-w-0">
            <p className="font-medium truncate">{form.name || "Nombre del negocio"}</p>
            <p className="text-xs text-muted truncate">{form.slug || "nombre-corto"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {plan && <Badge tone="info">{plan.blueprint.label}</Badge>}
          {casa && <Badge tone="accent">Red de {casa}</Badge>}
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

        {form.subdomain && <p className="text-xs text-muted">Link: {form.subdomain}</p>}

        {plan && plan.collisions.length > 0 && (
          <div className="text-xs text-danger space-y-0.5" role="alert">
            {plan.collisions.map((c, i) => <p key={i}>✗ {c.message}</p>)}
          </div>
        )}
      </Card>
    </aside>
  );
}
