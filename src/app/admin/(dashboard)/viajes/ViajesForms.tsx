"use client";

// Formularios del armador de presupuestos de viaje, sobre el design system.
// Client components finos (mismo molde que caja/CajaForms.tsx): el estado de error
// va inline con `useActionState` (las actions DEVUELVEN el error) y el envío con
// `SubmitButton`. La carga de datos vive en el server component (page.tsx).

import { useActionState, useEffect, useRef } from "react";
import {
  buscarOfertasAction,
  crearPresupuestoAction,
  guardarOpcionAction,
  type BusquedaActionState,
  type ViajesActionState,
} from "@/lib/viajes-actions";
import { Field, Input, Select, Textarea, buttonClasses, fmtNumberAR } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { BASE_OCUPACION_LABEL, type BaseOcupacion } from "@/plugins/ofertas-viaje/port";

function Mensaje({ state }: { state: ViajesActionState }) {
  if (!state) return null;
  if (state.ok) {
    return state.mensaje ? (
      <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
        {state.mensaje}
      </p>
    ) : null;
  }
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {state.error}
    </p>
  );
}

function fmtMonto(moneda: string, n: number): string {
  return `${moneda} ${fmtNumberAR(n, 2)}`;
}

function fmtInstante(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// --- Nuevo presupuesto ---
export function NuevoPresupuestoForm() {
  const [state, formAction] = useActionState<ViajesActionState, FormData>(crearPresupuestoAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título" htmlFor="p-titulo" required hint="Ej.: Familia Pérez · Madrid en octubre.">
          <Input id="p-titulo" name="titulo" required maxLength={120} />
        </Field>
        <Field label="Destino" htmlFor="p-destino" required>
          <Input id="p-destino" name="destino" required maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-5">
        <Field label="Salida" htmlFor="p-salida">
          <Input id="p-salida" name="fechaSalida" type="date" />
        </Field>
        <Field label="Regreso" htmlFor="p-regreso">
          <Input id="p-regreso" name="fechaRegreso" type="date" />
        </Field>
        <Field label="Adultos" htmlFor="p-adultos" required>
          <Input id="p-adultos" name="adultos" type="number" min={1} max={20} defaultValue={2} required inputMode="numeric" className="tabular-nums" />
        </Field>
        <Field label="Menores" htmlFor="p-ninos">
          <Input id="p-ninos" name="ninos" type="number" min={0} max={20} defaultValue={0} inputMode="numeric" className="tabular-nums" />
        </Field>
        <Field label="Habitaciones" htmlFor="p-hab" required>
          <Input id="p-hab" name="habitaciones" type="number" min={1} max={10} defaultValue={1} required inputMode="numeric" className="tabular-nums" />
        </Field>
      </div>
      <Field label="Notas" htmlFor="p-notas" hint="Lo que el cliente pidió: preferencias, fechas flexibles, presupuesto tope.">
        <Textarea id="p-notas" name="notas" maxLength={2000} />
      </Field>
      <Mensaje state={state} />
      <div>
        <SubmitButton className={buttonClasses("solid", "md")} pendingText="Creando…">
          Crear presupuesto
        </SubmitButton>
      </div>
    </form>
  );
}

// --- Buscador de ofertas + guardar opción ---
export function BuscadorOfertas({ presupuestos }: { presupuestos: Array<{ id: string; titulo: string; destino: string }> }) {
  const [state, formAction] = useActionState<BusquedaActionState, FormData>(buscarOfertasAction, null);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr_1fr]">
          <Field label="Qué buscar" htmlFor="b-tipo" required>
            <Select id="b-tipo" name="tipo" defaultValue="VUELO">
              <option value="VUELO">Vuelos</option>
              <option value="HOTEL">Hoteles</option>
            </Select>
          </Field>
          <Field label="Origen (vuelos) / Ciudad (hoteles)" htmlFor="b-origen" required hint="Código de 3 letras: AEP, EZE, MAD, BUE.">
            <Input id="b-origen" name="origen" required maxLength={3} className="uppercase" autoCapitalize="characters" />
          </Field>
          <Field label="Destino (vuelos)" htmlFor="b-destino" hint="Solo para vuelos.">
            <Input id="b-destino" name="destino" maxLength={3} className="uppercase" autoCapitalize="characters" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Ida / Check-in" htmlFor="b-ida" required>
            <Input id="b-ida" name="fechaIda" type="date" required />
          </Field>
          <Field label="Vuelta / Check-out" htmlFor="b-vuelta">
            <Input id="b-vuelta" name="fechaVuelta" type="date" />
          </Field>
          <Field label="Adultos" htmlFor="b-adultos" required>
            <Input id="b-adultos" name="adultos" type="number" min={1} max={9} defaultValue={2} required inputMode="numeric" className="tabular-nums" />
          </Field>
          <Field label="Menores" htmlFor="b-ninos">
            <Input id="b-ninos" name="ninos" type="number" min={0} max={9} defaultValue={0} inputMode="numeric" className="tabular-nums" />
          </Field>
          <Field label="Habitaciones" htmlFor="b-hab" hint="Solo hoteles.">
            <Input id="b-hab" name="habitaciones" type="number" min={1} max={9} defaultValue={1} inputMode="numeric" className="tabular-nums" />
          </Field>
          <Field label="Moneda" htmlFor="b-moneda">
            <Select id="b-moneda" name="moneda" defaultValue="USD">
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
              <option value="EUR">EUR</option>
            </Select>
          </Field>
        </div>
        <input type="hidden" name="maxResultados" value="5" />
        {state && !state.ok ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <div>
          <SubmitButton className={buttonClasses("solid", "md")} pendingText="Buscando…">
            Buscar
          </SubmitButton>
        </div>
      </form>

      {state?.ok ? <Resultados state={state} presupuestos={presupuestos} /> : null}
    </div>
  );
}

function Resultados({
  state,
  presupuestos,
}: {
  state: Extract<NonNullable<BusquedaActionState>, { ok: true }>;
  presupuestos: Array<{ id: string; titulo: string; destino: string }>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {state.ofertas.length} {state.ofertas.length === 1 ? "resultado" : "resultados"} de <span className="text-strong">{state.proveedor}</span> · capturado el{" "}
        <span className="tabular-nums">{fmtInstante(state.capturadoEn)}</span>
        {state.desdeCache ? " (de una búsqueda reciente, sin volver a consultar al proveedor)" : ""}
      </p>
      {state.avisos.length > 0 ? (
        <ul role="status" className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-body">
          {state.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}
      {state.ofertas.length === 0 ? (
        <p className="text-sm text-muted">No hubo ofertas para esa búsqueda. Probá con otras fechas.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {state.ofertas.map((o) => (
            <li key={o.referenciaProveedor} className="rounded-lg border border-line p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-strong">{o.descripcion}</p>
                  <p className="text-xs text-muted">{o.extra}</p>
                </div>
                <div className="text-right">
                  <p className="tabular-nums text-base font-semibold text-strong">{fmtMonto(o.moneda, o.precio)}</p>
                  <p className="text-xs text-muted">
                    {BASE_OCUPACION_LABEL[o.baseOcupacion as BaseOcupacion] ?? o.baseOcupacion}
                    {o.vigenteHasta ? ` · vigente hasta ${fmtInstante(o.vigenteHasta)}` : ""}
                  </p>
                </div>
              </div>
              <GuardarOpcionForm
                presupuestos={presupuestos}
                tipo={state.tipo}
                proveedor={state.proveedor}
                busquedaClave={state.busquedaClave}
                referencia={o.referenciaProveedor}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GuardarOpcionForm({
  presupuestos,
  tipo,
  proveedor,
  busquedaClave,
  referencia,
}: {
  presupuestos: Array<{ id: string; titulo: string; destino: string }>;
  tipo: "VUELO" | "HOTEL";
  proveedor: string;
  busquedaClave: string;
  referencia: string;
}) {
  const [state, formAction] = useActionState<ViajesActionState, FormData>(guardarOpcionAction, null);
  const selectId = `g-${referencia}`;
  if (presupuestos.length === 0) {
    return <p className="mt-2 text-xs text-muted">Creá un presupuesto arriba para poder guardar esta opción.</p>;
  }
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="proveedor" value={proveedor} />
      <input type="hidden" name="busquedaClave" value={busquedaClave} />
      <input type="hidden" name="referenciaProveedor" value={referencia} />
      <Field label="Guardar en" htmlFor={selectId} className="sm:w-80">
        <Select id={selectId} name="presupuestoId" defaultValue={presupuestos[0].id}>
          {presupuestos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titulo} · {p.destino}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton className={buttonClasses("outline", "md")} pendingText="Guardando…">
        Guardar como opción
      </SubmitButton>
      <div className="sm:ml-3 sm:flex-1">
        <Mensaje state={state} />
      </div>
    </form>
  );
}
