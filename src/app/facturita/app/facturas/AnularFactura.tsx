"use client";

// «Anular» una factura autorizada: pide el motivo (va escrito en la nota de crédito) y confirma.
// Una factura emitida no se borra: se anula con una nota de crédito que también va a ARCA.

import { useId, useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { anularFacturitaAction, type ResultadoAnularFacturita } from "@/lib/facturita-actions";

export default function AnularFactura({ facturaId, numero }: { facturaId: string; numero: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [resultado, setResultado] = useState<ResultadoAnularFacturita | null>(null);
  const [enviando, startTransition] = useTransition();
  const id = useId();

  if (resultado?.ok) {
    return (
      <p role="status" className="max-w-xs whitespace-normal text-xs font-medium text-success">
        {resultado.mensaje}
      </p>
    );
  }
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted underline-offset-2 hover:text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={`Anular la factura ${numero}`}
      >
        Anular
      </button>
    );
  }
  return (
    <form
      className="flex w-64 flex-col items-stretch gap-2 whitespace-normal text-left"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => setResultado(await anularFacturitaAction(facturaId, motivo)));
      }}
    >
      <p className="text-xs text-muted">
        Se emite una nota de crédito por el total y va a ARCA. No se puede deshacer.
      </p>
      <Field label="¿Por qué la anulás?" htmlFor={`${id}-motivo`} required>
        <Input
          id={`${id}-motivo`}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={200}
          placeholder="Ej.: me equivoqué en el total"
        />
      </Field>
      {resultado && !resultado.ok && (
        <p role="alert" className="text-xs font-medium text-danger">
          {resultado.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={enviando || motivo.trim().length < 3}>
          {enviando ? "Anulando…" : "Anular con nota de crédito"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
