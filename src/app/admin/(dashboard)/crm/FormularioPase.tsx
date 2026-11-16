"use client";

// CRM COMERCIAL · mover una oportunidad de etapa (aplicar o proponer). El formulario pide sólo lo que el
// servidor no puede mirar en la base (motivo, fecha para despertar, comercial, nota, próximo paso); el resto de
// la evidencia (fuente verificada, contacto, borrador enviado, respuesta, brief, puntaje) la valida el motor y,
// si falta, el servidor dice QUÉ falta y se muestra tal cual. Una sola acción, con la versión leída.

import { useState } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { aplicarPase, proponerPase } from "@/lib/crm-comercial/acciones";
import type { OpcionPase } from "./crm-core";
import { Resultado, ROTULO } from "./Avisos";
import { useAccion } from "./useAccion";

export interface Comercial {
  userId: string;
  nombre: string;
}

const ABIERTA = (d: string) => !["DORMIDA", "PERDIDA", "DESCARTADA", "DERIVADA_AL_TALLER", "GANADA"].includes(d);

export function FormularioPase({
  opcion,
  oportunidadId,
  version,
  comerciales,
  alTerminar,
  alCancelar,
  alFallar,
}: {
  opcion: OpcionPase;
  oportunidadId: string;
  version: number;
  comerciales: readonly Comercial[];
  alTerminar?: () => void;
  alCancelar?: () => void;
  alFallar?: () => void;
}) {
  const { correr, pendiente, motivo, hecho } = useAccion();
  const [f, setF] = useState({ motivo: "", despertarEl: "", comercialUserId: "", nota: "", proximoPaso: "", proximoPasoEl: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const id = (k: string) => `pase-${oportunidadId}-${opcion.destino}-${k}`;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const ev = {
      version,
      ...(f.motivo ? { motivo: f.motivo } : {}),
      ...(f.despertarEl ? { despertarEl: f.despertarEl } : {}),
      ...(f.comercialUserId ? { comercialUserId: f.comercialUserId } : {}),
      ...(f.nota.trim() ? { nota: f.nota.trim() } : {}),
      ...(f.proximoPaso.trim() ? { proximoPaso: f.proximoPaso.trim() } : {}),
      ...(f.proximoPasoEl ? { proximoPasoEl: f.proximoPasoEl } : {}),
    };
    const fn = opcion.modo === "aplicar" ? () => aplicarPase(oportunidadId, opcion.destino, ev) : () => proponerPase(oportunidadId, opcion.destino, ev);
    correr(fn, {
      listo: opcion.modo === "aplicar" ? `Listo: pasó a «${opcion.etiqueta}».` : `Propuesto: lo decide Dirección desde «Hoy».`,
      alTerminar,
      alFallar,
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-3 rounded-md border border-line bg-surface-raised p-3">
      <p className="text-sm font-medium text-strong">
        {opcion.modo === "aplicar" ? "Pasar a" : "Proponer pasar a"} «{opcion.etiqueta}»
      </p>
      {opcion.modo === "proponer" && <p className="text-sm text-muted">Este pase lo aprueba Dirección. Queda en su bandeja de «Hoy».</p>}
      {opcion.pide.includes("motivo") && (
        <div>
          <label htmlFor={id("motivo")} className={ROTULO}>Motivo</label>
          <Select id={id("motivo")} value={f.motivo} onChange={set("motivo")} required>
            <option value="">Elegí un motivo</option>
            {opcion.motivos.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
          </Select>
        </div>
      )}
      {opcion.pide.includes("despertarEl") && (
        <div>
          <label htmlFor={id("despertar")} className={ROTULO}>Cuándo vuelve a «Hoy»</label>
          <Input id={id("despertar")} type="date" value={f.despertarEl} onChange={set("despertarEl")} required />
        </div>
      )}
      {opcion.pide.includes("comercial") && (
        <div>
          <label htmlFor={id("comercial")} className={ROTULO}>Comercial que la atiende</label>
          <Select id={id("comercial")} value={f.comercialUserId} onChange={set("comercialUserId")} required>
            <option value="">Elegí a quién</option>
            {comerciales.map((c) => <option key={c.userId} value={c.userId}>{c.nombre}</option>)}
          </Select>
        </div>
      )}
      {ABIERTA(opcion.destino) && opcion.modo === "aplicar" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={id("paso")} className={ROTULO}>Próximo paso (si cambia)</label>
            <Input id={id("paso")} value={f.proximoPaso} onChange={set("proximoPaso")} maxLength={500} />
          </div>
          <div>
            <label htmlFor={id("pasoel")} className={ROTULO}>Para cuándo</label>
            <Input id={id("pasoel")} type="date" value={f.proximoPasoEl} onChange={set("proximoPasoEl")} />
          </div>
        </div>
      )}
      <div>
        <label htmlFor={id("nota")} className={ROTULO}>Nota (opcional)</label>
        <Textarea id={id("nota")} rows={2} value={f.nota} onChange={set("nota")} maxLength={2000} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pendiente}>{pendiente ? "Guardando…" : opcion.modo === "aplicar" ? "Pasar" : "Proponer"}</Button>
        {alCancelar && <Button type="button" size="sm" variant="ghost" onClick={alCancelar}>Cancelar</Button>}
      </div>
      <Resultado motivo={motivo} hecho={hecho} />
    </form>
  );
}
