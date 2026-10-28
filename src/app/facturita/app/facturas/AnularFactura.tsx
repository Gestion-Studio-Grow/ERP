"use client";

// «Anular» una factura autorizada: pide el motivo (va escrito en la nota de crédito) y confirma.
// Una factura emitida no se borra: se anula con una nota de crédito que también va a ARCA.
//
// Accesibilidad (mismo patrón que la consola, src/app/contador/cliente/[clienteId]/comprobantes/
// AnularFactura.tsx): al abrir, el foco va al motivo; al cancelar, vuelve a «Anular». El resultado
// se anuncia en dos regiones vivas FIJAS (`Avisos`), montadas siempre: también después de anular,
// cuando la factura ya no tiene saldo (`anulable: false`) y el botón desaparece.

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { anularFacturitaAction, type ResultadoAnularFacturita } from "@/lib/facturita-actions";
import Avisos from "../../../contador/Avisos";

export default function AnularFactura({
  facturaId,
  numero,
  anulable,
}: {
  facturaId: string;
  numero: string;
  /** ¿Le queda saldo? Sin saldo no se ofrece, pero las regiones vivas quedan. */
  anulable: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [resultado, setResultado] = useState<ResultadoAnularFacturita | null>(null);
  const [enviando, startTransition] = useTransition();
  const id = useId();
  const disparador = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLDivElement>(null);
  const yaAbrio = useRef(false);

  useEffect(() => {
    if (abierto) {
      yaAbrio.current = true;
      campo.current?.querySelector("input")?.focus();
    } else if (yaAbrio.current) {
      disparador.current?.focus();
    }
  }, [abierto]);

  const avisos = (
    <Avisos
      className="max-w-xs whitespace-normal text-left"
      ok={resultado?.ok ? resultado.mensaje : undefined}
      error={resultado && !resultado.ok ? resultado.error : undefined}
    />
  );

  // Un solo árbol: el botón o el formulario arriba, y las regiones vivas SIEMPRE en el mismo lugar
  // (si se remontaran al cerrar el formulario, el lector de pantalla podría no anunciar el resultado).
  return (
    <div className="flex flex-col items-end gap-1">
      {anulable && !abierto && (
        <button
          ref={disparador}
          type="button"
          onClick={() => {
            setResultado(null);
            setAbierto(true);
          }}
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted underline-offset-2 hover:text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`Anular la factura ${numero} con nota de crédito`}
        >
          Anular
        </button>
      )}
      {anulable && abierto && (
        <form
          className="flex w-64 flex-col items-stretch gap-2 whitespace-normal text-left"
          aria-label={`Anular la factura ${numero}`}
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await anularFacturitaAction(facturaId, motivo);
              setResultado(r);
              if (r.ok) setAbierto(false);
            });
          }}
        >
          <p className="text-xs text-muted">
            Se emite una nota de crédito por el total y va a ARCA. No se puede deshacer. La nota cuenta como uno de
            tus comprobantes del mes.
          </p>
          <div ref={campo}>
            <Field label="¿Por qué la anulás?" htmlFor={`${id}-motivo`} required hint="Queda escrito en la nota de crédito.">
              <Input
                id={`${id}-motivo`}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={200}
                autoComplete="off"
                placeholder="Ej.: me equivoqué en el total"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" className="min-h-11" disabled={enviando || motivo.trim().length < 3}>
              {enviando ? "Anulando…" : "Anular con nota de crédito"}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setAbierto(false)} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {avisos}
    </div>
  );
}
