"use client";

// T5 · PAQUETES en la ficha del alumno (dentro de «Plata»):
// - «Vender paquete»: cuántas clases, cuánto te pagó y cómo (efectivo, transferencia o Mercado Pago).
//   La clave del formulario evita que un doble toque cree dos paquetes (venderPaquete).
// - «Anular»: un paquete cargado por error, mientras no se haya usado ninguna clase.
// Lo que queda se ve arriba («Quedan 3 clases»); cada clase se descuenta desde la hoja «Cobré».

import { useId, useState } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { anularPaquete, venderPaquete } from "@/lib/padel/acciones-paquetes";
import { MEDIOS_COBRO, MEDIO_LABEL, type MedioCobro } from "@/lib/padel/core";
import { textoQuedan } from "@/lib/padel/paquetes-core";
import { plataTexto } from "../../_plata";
import { ErrorEnLinea, useAccion } from "../_usar-accion";

const boton = (v: "solid" | "outline" = "outline") => cn(buttonClasses(v, "lg"), "h-12 w-full justify-center px-3");
const campo =
  "h-12 w-full rounded-xl border border-line-strong bg-surface-raised px-3 text-base text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const nuevaClave = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2)}`);

export function VenderPaquete({ alumnoId, nombre }: { alumnoId: string; nombre: string }) {
  const { pendiente, error, setError, correr } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [medio, setMedio] = useState<MedioCobro | null>(null);
  const [clave, setClave] = useState(nuevaClave);
  const id = useId();

  if (!abierto) {
    return (
      <button type="button" className={boton()} onClick={() => setAbierto(true)} aria-expanded={false} data-qa="paquete-vender-abrir">
        Vender paquete
      </button>
    );
  }
  return (
    <form
      className="grid gap-3 rounded-xl border border-line p-3"
      aria-labelledby={`${id}-t`}
      aria-busy={pendiente}
      action={(fd) => {
        if (!medio) return setError("Elegí cómo te pagó.");
        correr(
          () => venderPaquete(alumnoId, { clases: fd.get("clases"), precio: fd.get("precio"), medio, clave }),
          (r) => `Paquete cargado · ${textoQuedan(r.quedan).toLowerCase()}`,
          nombre,
          () => {
            setAbierto(false);
            setMedio(null);
            setClave(nuevaClave());
          },
        );
      }}
    >
      <p id={`${id}-t`} className="text-sm font-bold text-strong">Vender paquete</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-n`} className="mb-1 block text-sm font-semibold text-strong">Clases</label>
          <input id={`${id}-n`} name="clases" inputMode="numeric" pattern="[0-9]*" required className={campo} placeholder="8" autoComplete="off" data-qa="paquete-clases" />
        </div>
        <div>
          <label htmlFor={`${id}-p`} className="mb-1 block text-sm font-semibold text-strong">Te pagó ($)</label>
          <input id={`${id}-p`} name="precio" inputMode="decimal" required className={campo} placeholder="160.000" autoComplete="off" data-qa="paquete-precio" />
        </div>
      </div>
      <div role="group" aria-label="¿Cómo te pagó?" className="grid grid-cols-3 gap-2">
        {MEDIOS_COBRO.map((m) => (
          <button key={m} type="button" aria-pressed={medio === m} onClick={() => setMedio(m)} className={cn(boton(medio === m ? "solid" : "outline"), "text-sm")} data-qa={`paquete-medio-${m.toLowerCase()}`}>
            {MEDIO_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={boton()} onClick={() => setAbierto(false)} disabled={pendiente}>
          Cancelar
        </button>
        <button type="submit" className={boton("solid")} disabled={pendiente} data-qa="paquete-vender">
          {pendiente ? "Guardando…" : "Cargar paquete"}
        </button>
      </div>
      <ErrorEnLinea texto={error} />
    </form>
  );
}

export function AnularPaquete({ paqueteId, nombre, clases, precio }: { paqueteId: string; nombre: string; clases: number; precio: number }) {
  const { pendiente, error, correr } = useAccion();
  const [seguro, setSeguro] = useState(false);
  if (!seguro) {
    return (
      <button type="button" className="min-h-12 px-2 text-sm font-semibold text-muted underline underline-offset-2" onClick={() => setSeguro(true)} data-qa="paquete-anular-abrir">
        Anular
      </button>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm text-strong">¿Anular el paquete de {clases} clases ({plataTexto(precio)})? Deja de contar en lo cobrado.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={boton()} onClick={() => setSeguro(false)} disabled={pendiente}>
          No
        </button>
        <button type="button" className={boton("solid")} disabled={pendiente} onClick={() => correr(() => anularPaquete(paqueteId), "Paquete anulado", nombre)} data-qa="paquete-anular">
          Sí, anular
        </button>
      </div>
      <ErrorEnLinea texto={error} />
    </div>
  );
}
