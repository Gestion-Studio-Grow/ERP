"use client";

// «Anular» un cobro de la orden: en dos pasos y con motivo, como los cobros de turno. Recepción escribe
// además el código que la dueña saca en ESTE cobro; la dueña anula directo y es quien lo saca. La regla
// la decide el servidor (`anularPago`, taller/acciones.ts): su rechazo se muestra acá, con su texto.

import { useId, useState, useTransition } from "react";
import { anularPago, autorizarAnulacionPago } from "@/lib/taller/acciones";
import { MOTIVO_MAX } from "@/lib/turnos/anulacion";
import { Input } from "@/components/ui";
import CodigoDeAutorizacion from "../../../_anulacion/CodigoDeAutorizacion";

function datos(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

export default function AnularCobroTaller({ pagoId, conCodigo }: { pagoId: string; conCodigo: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const uid = useId();

  function enviar() {
    empezar(async () => {
      setError("");
      try {
        const r = await anularPago(datos({ id: pagoId, motivo, codigo }));
        if (r.ok) setAbierto(false);
        else setError(r.error);
      } catch {
        setError("No se pudo anular. Revisá la conexión y volvé a intentar: si ya se había anulado, no se anula dos veces.");
      }
    });
  }

  return (
    <div className="flex basis-full flex-col items-end gap-2" data-taller="anular-cobro">
      {!abierto && (
        <button type="button" className="h-11 px-2 text-xs underline" aria-label="Anular este cobro" onClick={() => setAbierto(true)}>
          Anular
        </button>
      )}
      {abierto && (
        <form
          noValidate
          aria-label="Anular este cobro"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pendiente) enviar();
          }}
          className="flex w-full flex-col gap-2 rounded-md border border-line bg-surface-sunken p-3"
        >
          <label htmlFor={`${uid}-motivo`} className="text-xs font-medium text-strong">
            Motivo (queda en la auditoría)
          </label>
          <Input id={`${uid}-motivo`} value={motivo} maxLength={MOTIVO_MAX} placeholder="Ej.: se cobró de más, medio equivocado" onChange={(e) => setMotivo(e.target.value)} className="h-11" />
          {conCodigo && (
            <>
              <label htmlFor={`${uid}-codigo`} className="text-xs font-medium text-strong">
                Código de la dueña
              </label>
              <Input
                id={`${uid}-codigo`}
                value={codigo}
                maxLength={12}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(e) => setCodigo(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted">La dueña lo saca en esta orden, en este cobro, con «Autorizar anulación». Vale unos minutos y sólo para este cobro.</p>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pendiente} className="h-11 text-sm font-semibold text-danger underline disabled:opacity-50">
              {pendiente ? "Anulando…" : "Sí, anular el cobro"}
            </button>
            <button
              type="button"
              className="h-11 px-2 text-xs text-muted hover:underline"
              onClick={() => {
                setAbierto(false);
                setError("");
              }}
            >
              No
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      )}
      {!conCodigo && <CodigoDeAutorizacion vale="este cobro" pedir={() => autorizarAnulacionPago(datos({ id: pagoId }))} />}
    </div>
  );
}
