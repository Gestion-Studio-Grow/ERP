"use client";

// El formulario corto que completa quien rinde después de la foto: tipo de gasto, centro de
// costo, jurisdicciones, patente si corresponde y medio de pago.
//
// Qué campos aparecen lo dice el DICCIONARIO (`TipoGasto.exige`), que es un dato del contador:
// combustible pide patente, taxi pide origen y destino, representación pide con quién. Si
// falta algo, no lo decide el formulario: el motor devuelve el bloqueo con su mensaje y la vista
// previa lo muestra en vivo.

import { Field, Input, Select, cn } from "@/components/ui";
import {
  formatearPesos,
  nombreJurisdiccion,
  type CodigoJurisdiccion,
  type Comprobante,
  type FechaISO,
  type Imputacion,
  type MedioPago,
  type Persona,
  type Rendicion,
  type TipoGasto,
} from "@/lib/rendiciones";
import { escenarioDemo as E } from "./escenario";
import { CODIGOS_JURISDICCION, VEHICULO, fechaCorta, tipoGastoDe } from "./derivados";
import { Campo } from "./piezas";

export interface BorradorImputacion {
  tipoGastoId: string;
  centroCosto: string;
  jurisdiccionActividad: CodigoJurisdiccion | "";
  jurisdiccionComprobante: CodigoJurisdiccion | "";
  origen: CodigoJurisdiccion | "";
  destino: CodigoJurisdiccion | "";
  /** Patente elegida entre los vehículos de la persona. */
  dominio: string;
  asistentes: string;
  viajeId: string;
  /** Clave de la opción de medio de pago (ver `opcionesDeMedio`). */
  medio: string;
}

export interface OpcionMedio {
  clave: string;
  texto: string;
  detalle?: string;
  medio: MedioPago;
}

/** Con qué pudo pagar esta persona en esta rendición: sus anticipos, sus tarjetas o su plata. */
export function opcionesDeMedio(r: Rendicion, legajo: string): OpcionMedio[] {
  const opciones: OpcionMedio[] = [];
  for (const a of E.anticipos.filter((x) => r.anticipoIds.includes(x.id))) {
    const recargable = E.tarjetas.find((t) => t.tipo === "recargable" && t.titularLegajo === legajo);
    if (a.medio === "recargable" && recargable) {
      opciones.push({
        clave: `rc-${recargable.id}`,
        texto: `Tarjeta recargable …${recargable.ultimos4}`,
        detalle: `Cargada con el anticipo de ${formatearPesos(a.importe)}`,
        medio: { tipo: "recargable", tarjetaId: recargable.id },
      });
    } else {
      opciones.push({
        clave: `ef-${a.id}`,
        texto: "Efectivo del anticipo",
        detalle: `${formatearPesos(a.importe)} · ${a.origen}`,
        medio: { tipo: "efectivo_anticipo", anticipoId: a.id },
      });
    }
  }
  for (const t of E.tarjetas.filter((x) => x.tipo === "corporativa" && x.titularLegajo === legajo)) {
    opciones.push({ clave: `tc-${t.id}`, texto: `Tarjeta corporativa …${t.ultimos4}`, medio: { tipo: "tarjeta_corporativa", tarjetaId: t.id } });
  }
  opciones.push({ clave: "propio", texto: "Plata mía", detalle: "Me la reintegran con la rendición", medio: { tipo: "propio_a_reintegrar" } });
  return opciones.filter((o, i) => opciones.findIndex((x) => x.clave === o.clave) === i);
}

/** El viaje de la persona en el que cae una fecha (para mostrarlo y vincularlo). */
export function viajeDeFecha(legajo: string, fecha: FechaISO) {
  return E.viajes.find((v) => v.legajo === legajo && v.desde <= fecha && fecha <= v.hasta);
}

export function borradorInicial(
  persona: Persona,
  fecha: FechaISO,
  opciones: OpcionMedio[],
  sugerencia: { jurisdiccion?: CodigoJurisdiccion; origen?: CodigoJurisdiccion; destino?: CodigoJurisdiccion },
): BorradorImputacion {
  return {
    tipoGastoId: "", // no se elige solo: la herramienta no adivina el tratamiento del IVA
    centroCosto: persona.centroCosto,
    jurisdiccionActividad: sugerencia.jurisdiccion ?? "",
    jurisdiccionComprobante: sugerencia.jurisdiccion ?? "",
    origen: sugerencia.origen ?? "",
    destino: sugerencia.destino ?? "",
    dominio: persona.vehiculos.length === 1 ? persona.vehiculos[0].dominio : "",
    asistentes: "",
    viajeId: viajeDeFecha(persona.legajo, fecha)?.id ?? "",
    medio: opciones[0]?.clave ?? "propio",
  };
}

/** Del borrador a la `Imputacion` del contrato: sólo viajan los campos que el tipo pide. */
export function aImputacion(b: BorradorImputacion, persona: Persona, opciones: OpcionMedio[]): Imputacion {
  const exige = tipoGastoDe(b.tipoGastoId)?.exige ?? [];
  const conVehiculo = exige.includes("dominio") || exige.includes("tipoVehiculo");
  const vehiculo = persona.vehiculos.find((v) => v.dominio === b.dominio);
  const conRecorrido = exige.includes("origenDestino");
  return {
    tipoGastoId: b.tipoGastoId,
    centroCosto: b.centroCosto,
    jurisdiccionActividad: b.jurisdiccionActividad || undefined,
    jurisdiccionComprobante: b.jurisdiccionComprobante || undefined,
    origen: conRecorrido ? b.origen || undefined : undefined,
    destino: conRecorrido ? b.destino || undefined : undefined,
    dominio: conVehiculo ? vehiculo?.dominio : undefined,
    tipoVehiculo: conVehiculo ? vehiculo?.tipo : undefined,
    asistentes: exige.includes("asistentes") || tipoGastoDe(b.tipoGastoId)?.esRepresentacion ? b.asistentes.trim() || undefined : undefined,
    viajeId: b.viajeId || undefined,
    medioPago: (opciones.find((o) => o.clave === b.medio) ?? opciones[0]).medio,
  };
}

/** Los tipos que más usa esta persona van primero (plan §6.2: "los más usados primero"). */
function tiposOrdenados(comprobantes: Comprobante[], legajo: string): { frecuentes: TipoGasto[]; resto: TipoGasto[] } {
  const usos = new Map<string, number>();
  for (const c of comprobantes) {
    if (c.legajo === legajo) usos.set(c.imputacion.tipoGastoId, (usos.get(c.imputacion.tipoGastoId) ?? 0) + 1);
  }
  const frecuentes = E.diccionario
    .filter((t) => usos.has(t.id))
    .sort((a, b) => (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0))
    .slice(0, 4);
  return { frecuentes, resto: E.diccionario.filter((t) => !frecuentes.includes(t)) };
}

const CENTROS_DE_COSTO = [...new Set([...E.personas.map((p) => p.centroCosto), ...E.anticipos.map((a) => a.centroCosto)])];

export default function FormImputacion({
  idBase,
  valor,
  alCambiar,
  persona,
  opcionesMedio,
  fecha,
  comprobantes,
  sugerido,
}: {
  idBase: string;
  valor: BorradorImputacion;
  alCambiar: (cambios: Partial<BorradorImputacion>) => void;
  persona: Persona;
  opcionesMedio: OpcionMedio[];
  fecha: FechaISO;
  /** Todos los comprobantes cargados (para ordenar los tipos por uso). */
  comprobantes: Comprobante[];
  /** Tipo de gasto que sugiere la IA (se muestra; no se elige solo). */
  sugerido?: TipoGasto;
}) {
  const tipo = tipoGastoDe(valor.tipoGastoId);
  const exige = tipo?.exige ?? [];
  const { frecuentes, resto } = tiposOrdenados(comprobantes, persona.legajo);
  const viaje = viajeDeFecha(persona.legajo, fecha);
  const id = (campo: string) => `${idBase}-${campo}`;

  return (
    <div className="space-y-4">
      <Campo id={id("tipo")} etiqueta="Tipo de gasto" obligatorio ayuda={tipo ? undefined : "Elegilo vos: de esto depende si recupera IVA."}>
        {(control) => (
          <Select {...control} value={valor.tipoGastoId} onChange={(e) => alCambiar({ tipoGastoId: e.target.value })}>
            <option value="">Elegí el tipo de gasto</option>
            {frecuentes.length ? (
              <optgroup label="Los que más usás">
                {frecuentes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.etiqueta}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label={frecuentes.length ? "Todos los demás" : "Tipos de gasto"}>
              {resto.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.etiqueta}
                </option>
              ))}
            </optgroup>
          </Select>
        )}
      </Campo>
      {sugerido && valor.tipoGastoId !== sugerido.id ? (
        <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          La IA sugiere: <span className="font-medium text-strong">{sugerido.etiqueta}</span>
          <button
            type="button"
            onClick={() => alCambiar({ tipoGastoId: sugerido.id })}
            className="chip-btn min-h-8 px-2.5 text-xs"
          >
            Usar la sugerencia
          </button>
        </p>
      ) : null}

      {exige.includes("dominio") || exige.includes("tipoVehiculo") ? (
        <Campo id={id("vehiculo")} etiqueta="Vehículo" obligatorio ayuda="Sin patente, después no se puede reconstruir.">
          {(control) => (
            <Select {...control} value={valor.dominio} onChange={(e) => alCambiar({ dominio: e.target.value })}>
              <option value="">Elegí la patente</option>
              {persona.vehiculos.map((v) => (
                <option key={v.dominio} value={v.dominio}>
                  {v.dominio} · {VEHICULO[v.tipo]}
                </option>
              ))}
            </Select>
          )}
        </Campo>
      ) : null}

      {exige.includes("origenDestino") ? (
        <div className="grid grid-cols-2 gap-3">
          <SelectorJurisdiccion id={id("origen")} etiqueta="Desde" valor={valor.origen} alCambiar={(j) => alCambiar({ origen: j })} />
          <SelectorJurisdiccion id={id("destino")} etiqueta="Hasta" valor={valor.destino} alCambiar={(j) => alCambiar({ destino: j })} />
        </div>
      ) : null}

      {exige.includes("asistentes") || tipo?.esRepresentacion ? (
        <Campo id={id("asistentes")} etiqueta="Con quién" obligatorio ayuda="Cliente y asistentes (lo pide Ganancias para representación).">
          {(control) => (
            <Input
              {...control}
              value={valor.asistentes}
              onChange={(e) => alCambiar({ asistentes: e.target.value })}
              placeholder="Ej.: Juan Pérez (Agro del Sur) y 2 más"
            />
          )}
        </Campo>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <SelectorJurisdiccion
          id={id("actividad")}
          etiqueta="Dónde fue el trabajo"
          valor={valor.jurisdiccionActividad}
          alCambiar={(j) => alCambiar({ jurisdiccionActividad: j })}
        />
        <SelectorJurisdiccion
          id={id("comercio")}
          etiqueta="Dónde está el comercio"
          valor={valor.jurisdiccionComprobante}
          alCambiar={(j) => alCambiar({ jurisdiccionComprobante: j })}
        />
      </div>

      <Field label="Centro de costo" htmlFor={id("cc")}>
        <Select id={id("cc")} value={valor.centroCosto} onChange={(e) => alCambiar({ centroCosto: e.target.value })}>
          {CENTROS_DE_COSTO.map((cc) => (
            <option key={cc} value={cc}>
              {cc}
            </option>
          ))}
        </Select>
      </Field>

      {viaje ? (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-muted">
          Cae en tu viaje {nombreJurisdiccion(viaje.origen)} → {nombreJurisdiccion(viaje.destino)} ({fechaCorta(viaje.desde)} al {fechaCorta(viaje.hasta)}): queda vinculado.
        </p>
      ) : null}

      <fieldset className="min-w-0">
        <legend className="text-sm font-medium text-strong">¿Cómo lo pagaste?</legend>
        <div className="mt-2 space-y-2">
          {opcionesMedio.map((o) => (
            <label
              key={o.clave}
              className={cn(
                "flex min-h-[var(--tap-min)] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                valor.medio === o.clave ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-raised hover:border-muted",
              )}
            >
              <input
                type="radio"
                name={id("medio")}
                value={o.clave}
                checked={valor.medio === o.clave}
                onChange={() => alCambiar({ medio: o.clave })}
                className="size-4 shrink-0 accent-accent"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-strong">{o.texto}</span>
                {o.detalle ? <span className="block text-xs text-muted">{o.detalle}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function SelectorJurisdiccion({
  id,
  etiqueta,
  valor,
  alCambiar,
}: {
  id: string;
  etiqueta: string;
  valor: CodigoJurisdiccion | "";
  alCambiar: (j: CodigoJurisdiccion | "") => void;
}) {
  return (
    <Campo id={id} etiqueta={etiqueta} obligatorio>
      {(control) => (
        <Select {...control} value={valor} onChange={(e) => alCambiar(e.target.value as CodigoJurisdiccion | "")}>
          <option value="">Elegí la provincia</option>
          {CODIGOS_JURISDICCION.map((j) => (
            <option key={j} value={j}>
              {nombreJurisdiccion(j)}
            </option>
          ))}
        </Select>
      )}
    </Campo>
  );
}
