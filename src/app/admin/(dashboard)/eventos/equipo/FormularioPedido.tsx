"use client";

import { useActionState } from "react";
import { AvisoError, Input, Select, Textarea, buttonClasses } from "@/components/ui";
import { pedirAlEquipo, type EstadoPedido } from "@/lib/eventos-sponsors/acciones";
import { ETIQUETA_PUESTO, MAX_PEDIDO, MAX_REGION_PEDIDO, PUESTOS_PEDIBLES, REGION_POR_DEFECTO } from "@/lib/eventos-sponsors/core";

const ROTULO = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

/** El pedido entra en cola; lo toma una sesión de GSG. Nada se ejecuta al enviarlo. */
export function FormularioPedido() {
  const [estado, accion, enviando] = useActionState<EstadoPedido, FormData>(pedirAlEquipo, { estado: "inicial" });
  return (
    <form action={accion} className="grid gap-4 rounded-lg border border-line bg-surface p-4">
      <div>
        <label htmlFor="puesto" className={ROTULO}>Para</label>
        <Select id="puesto" name="puesto" defaultValue="descubridor">
          {PUESTOS_PEDIBLES.map((p) => (
            <option key={p} value={p}>{ETIQUETA_PUESTO[p]}</option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor="pedido" className={ROTULO}>Qué tiene que hacer</label>
        <Textarea id="pedido" name="pedido" rows={3} maxLength={MAX_PEDIDO} required placeholder="Buscá ferias y congresos en Córdoba de marzo a mayo de 2027" />
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className={`${ROTULO} sm:col-span-3`}>Dónde y cuándo buscar</legend>
        <div>
          <label htmlFor="region" className="mb-1 block text-sm text-muted">Región</label>
          <Input id="region" name="region" maxLength={MAX_REGION_PEDIDO} defaultValue={REGION_POR_DEFECTO} />
        </div>
        <div>
          <label htmlFor="desde" className="mb-1 block text-sm text-muted">Desde</label>
          <Input id="desde" name="desde" type="date" />
        </div>
        <div>
          <label htmlFor="hasta" className="mb-1 block text-sm text-muted">Hasta</label>
          <Input id="hasta" name="hasta" type="date" />
        </div>
        <p className="text-sm text-muted sm:col-span-3">Cada encargo elige su región y sus fechas. Sin fechas, el equipo busca lo próximo.</p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={enviando} className={buttonClasses("solid", "md")}>
          {enviando ? "Enviando…" : "Pedir al equipo"}
        </button>
        <p className="text-sm text-muted" aria-live="polite">
          {estado.estado === "ok" ? "Pedido en cola. El equipo lo toma en su próxima corrida." : "Entra en cola; el equipo lo toma en su próxima corrida."}
        </p>
      </div>
      {estado.estado === "error" && <AvisoError titulo="No se guardó el pedido" comoSeguir={estado.mensaje} />}
    </form>
  );
}
