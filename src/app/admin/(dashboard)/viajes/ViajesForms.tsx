"use client";

// Formularios del armador de presupuestos de viaje, sobre el design system.
// Client components finos (mismo molde que caja/CajaForms.tsx): el estado de error
// va inline con `useActionState` (las actions DEVUELVEN el error) y el envío con
// `SubmitButton`. La carga de datos vive en el server component (page.tsx).

import { useActionState, useEffect, useRef, useState } from "react";
import {
  buscarOfertasAction,
  capturarDesdeBusquedaAction,
  capturarManualAction,
  crearPedidoAction,
  type BusquedaActionState,
  type ViajesActionState,
} from "@/lib/viajes-actions";
import { Field, Input, Select, Textarea, buttonClasses, fmtNumberAR } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { BASE_OCUPACION_LABEL, UNIDAD_PRECIO_LABEL, type BaseOcupacion, type UnidadPrecio } from "@/plugins/ofertas-viaje/port";

export type OpcionDestino = { id: string; label: string; tramoId: string | null };

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

/** Selector "asignar a la opción…" compartido por captura desde buscador y manual. */
function SelectorOpcion({ id, opciones }: { id: string; opciones: OpcionDestino[] }) {
  const [sel, setSel] = useState<string>("");
  const tramoId = opciones.find((o) => o.id === sel)?.tramoId ?? "";
  return (
    <Field label="Asignar a la opción" htmlFor={id} hint="Dejalo vacío para guardarla solo en la biblioteca." className="sm:w-96">
      <Select id={id} name="opcionId" value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">Solo a la biblioteca</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
      <input type="hidden" name="tramoId" value={tramoId} />
    </Field>
  );
}

// --- Nuevo pedido ---
export function NuevoPedidoForm() {
  const [state, formAction] = useActionState<ViajesActionState, FormData>(crearPedidoAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Contacto" htmlFor="p-contacto" required hint="Nombre de quien pide el viaje.">
          <Input id="p-contacto" name="contactoNombre" required maxLength={120} />
        </Field>
        <Field label="WhatsApp" htmlFor="p-wa">
          <Input id="p-wa" name="contactoWhatsapp" inputMode="tel" maxLength={40} />
        </Field>
        <Field label="Mail" htmlFor="p-mail">
          <Input id="p-mail" name="contactoEmail" type="email" maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-5">
        <Field label="Pasajeros" htmlFor="p-pax" required>
          <Input id="p-pax" name="cantidadPasajeros" type="number" min={1} max={50} defaultValue={2} required inputMode="numeric" className="tabular-nums" />
        </Field>
        <Field label="Destino" htmlFor="p-destino" required className="sm:col-span-2">
          <Input id="p-destino" name="destino" required maxLength={120} />
        </Field>
        <Field label="Desde" htmlFor="p-desde" required>
          <Input id="p-desde" name="desde" type="date" required />
        </Field>
        <Field label="Hasta" htmlFor="p-hasta" required>
          <Input id="p-hasta" name="hasta" type="date" required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
        <Field label="Moneda" htmlFor="p-moneda" hint="En la que le hablás al cliente.">
          <Select id="p-moneda" name="monedaReferencia" defaultValue="USD">
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
            <option value="EUR">EUR</option>
          </Select>
        </Field>
        <Field label="Motivo" htmlFor="p-motivo" hint="Ej.: Feria de Cantón, luna de miel.">
          <Input id="p-motivo" name="motivo" maxLength={120} />
        </Field>
        <Field label="Título del presupuesto" htmlFor="p-titulo" hint="Si lo dejás vacío: destino — contacto.">
          <Input id="p-titulo" name="titulo" maxLength={120} />
        </Field>
      </div>
      <Field label="Lo que pidió el cliente" htmlFor="p-req" hint="Preferencias, fechas flexibles, presupuesto tope.">
        <Textarea id="p-req" name="requisitos" maxLength={2000} />
      </Field>
      <Mensaje state={state} />
      <div>
        <SubmitButton className={buttonClasses("solid", "md")} pendingText="Creando…">
          Crear pedido
        </SubmitButton>
      </div>
    </form>
  );
}

// --- Buscador de ofertas + capturar ---
export function BuscadorOfertas({ opciones }: { opciones: OpcionDestino[] }) {
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

      {state?.ok ? <Resultados state={state} opciones={opciones} /> : null}
    </div>
  );
}

function Resultados({ state, opciones }: { state: Extract<NonNullable<BusquedaActionState>, { ok: true }>; opciones: OpcionDestino[] }) {
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
                    {UNIDAD_PRECIO_LABEL[o.unidad as UnidadPrecio] ?? o.unidad}
                    {o.baseOcupacion ? ` · base ${BASE_OCUPACION_LABEL[o.baseOcupacion as BaseOcupacion] ?? o.baseOcupacion}` : ""}
                    {o.vigenteHasta ? ` · vigente hasta ${fmtInstante(o.vigenteHasta)}` : " · vigencia no informada (se asume la del negocio)"}
                  </p>
                </div>
              </div>
              <CapturarForm opciones={opciones} tipo={state.tipo} proveedor={state.proveedor} busquedaClave={state.busquedaClave} referencia={o.referenciaProveedor} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CapturarForm({
  opciones,
  tipo,
  proveedor,
  busquedaClave,
  referencia,
}: {
  opciones: OpcionDestino[];
  tipo: "VUELO" | "HOTEL";
  proveedor: string;
  busquedaClave: string;
  referencia: string;
}) {
  const [state, formAction] = useActionState<ViajesActionState, FormData>(capturarDesdeBusquedaAction, null);
  const id = `c-${referencia}`;
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="proveedor" value={proveedor} />
      <input type="hidden" name="busquedaClave" value={busquedaClave} />
      <input type="hidden" name="referenciaProveedor" value={referencia} />
      <SelectorOpcion id={`${id}-op`} opciones={opciones} />
      <Field label="Certeza" htmlFor={`${id}-cert`} className="sm:w-40">
        <Select id={`${id}-cert`} name="certeza" defaultValue="VERIFICADA">
          <option value="VERIFICADA">Verificada</option>
          <option value="ESTIMADA">Estimada</option>
        </Select>
      </Field>
      <SubmitButton className={buttonClasses("outline", "md")} pendingText="Capturando…">
        Capturar oferta
      </SubmitButton>
      <div className="sm:basis-full">
        <Mensaje state={state} />
      </div>
    </form>
  );
}

// --- Captura manual (portal del mayorista, mail, llamada) ---
export function CapturaManualForm({ opciones }: { opciones: OpcionDestino[] }) {
  const [state, formAction] = useActionState<ViajesActionState, FormData>(capturarManualAction, null);
  const [tipo, setTipo] = useState<string>("ALOJAMIENTO");
  const [unidad, setUnidad] = useState<string>("POR_HABITACION_TOTAL");
  const [base, setBase] = useState<string>("DOBLE");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  const esAlojamiento = tipo === "ALOJAMIENTO";

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr_1fr]">
        <Field label="Qué es" htmlFor="m-tipo" required>
          <Select id="m-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="VUELO">Vuelo</option>
            <option value="ALOJAMIENTO">Alojamiento</option>
            <option value="OTRO">Otro (traslado, seguro, excursión)</option>
          </Select>
        </Field>
        <Field label="Título" htmlFor="m-titulo" required hint='Ej.: "Hotel Canton Fair Complex, doble con desayuno".'>
          <Input id="m-titulo" name="titulo" required maxLength={200} />
        </Field>
        <Field label="Proveedor" htmlFor="m-prov" required hint="Aerolínea, cadena, mayorista u OTA.">
          <Input id="m-prov" name="proveedor" required maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Precio" htmlFor="m-precio" required>
          <Input id="m-precio" name="precio" type="number" min="0" step="0.01" required inputMode="decimal" className="text-right tabular-nums" />
        </Field>
        <Field label="Moneda" htmlFor="m-moneda" required>
          <Select id="m-moneda" name="moneda" defaultValue="USD">
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
            <option value="EUR">EUR</option>
          </Select>
        </Field>
        <Field label="Unidad del precio" htmlFor="m-unidad" required className="sm:col-span-2">
          <Select id="m-unidad" name="unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            {(Object.keys(UNIDAD_PRECIO_LABEL) as UnidadPrecio[]).map((u) => (
              <option key={u} value={u}>
                {UNIDAD_PRECIO_LABEL[u]}
              </option>
            ))}
          </Select>
        </Field>
        {esAlojamiento ? (
          <Field label="Base de ocupación" htmlFor="m-base" required hint="Sin default: elegila.">
            <Select id="m-base" name="baseOcupacion" value={base} onChange={(e) => setBase(e.target.value)}>
              {(Object.keys(BASE_OCUPACION_LABEL) as BaseOcupacion[]).map((b) => (
                <option key={b} value={b}>
                  {BASE_OCUPACION_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {esAlojamiento && base === "OTRA" ? (
          <Field label="Personas por habitación" htmlFor="m-ocup" required>
            <Input id="m-ocup" name="ocupacion" type="number" min={1} max={20} required inputMode="numeric" className="tabular-nums" />
          </Field>
        ) : null}
        {unidad === "POR_HABITACION_NOCHE" ? (
          <Field label="Noches" htmlFor="m-noches" required>
            <Input id="m-noches" name="noches" type="number" min={1} max={90} required inputMode="numeric" className="tabular-nums" />
          </Field>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Certeza" htmlFor="m-cert" required hint="Verificada = la viste hoy en el sitio o mail.">
          <Select id="m-cert" name="certeza" defaultValue="">
            <option value="">Elegí…</option>
            <option value="VERIFICADA">Verificada</option>
            <option value="ESTIMADA">Estimada</option>
          </Select>
        </Field>
        <Field label="Vigente hasta" htmlFor="m-vig" hint="Si no la da el proveedor, se asume la del negocio y se marca.">
          <Input id="m-vig" name="vigenteHasta" type="date" />
        </Field>
        <Field label="Impuestos" htmlFor="m-imp">
          <Select id="m-imp" name="incluyeImpuestos" defaultValue="">
            <option value="">No informa</option>
            <option value="SI">Incluidos</option>
            <option value="NO">No incluidos</option>
            <option value="PARCIAL">Parcial</option>
          </Select>
        </Field>
        <Field label="Fuente" htmlFor="m-fuente" required hint='Link, mail o "llamada al mayorista X".'>
          <Input id="m-fuente" name="fuente" required maxLength={300} />
        </Field>
      </div>
      <Field label="Condiciones" htmlFor="m-cond" hint="Equipaje, penalidad, régimen, cancelación.">
        <Textarea id="m-cond" name="condiciones" maxLength={2000} />
      </Field>
      <SelectorOpcion id="m-op" opciones={opciones} />
      <Mensaje state={state} />
      <div>
        <SubmitButton className={buttonClasses("solid", "md")} pendingText="Guardando…">
          Cargar oferta
        </SubmitButton>
      </div>
    </form>
  );
}
