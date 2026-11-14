"use client";

/**
 * #T7 · Notas de crédito que ARCA rechazó y siguen sin resolver: la factura sigue vigente y el
 * cobro ya figura devuelto. Por cada una, dos caminos: volver a emitirla (una nota NUEVA; la
 * rechazada queda como historia) o dejar constancia de que se resolvió fuera del sistema.
 * La lista la arma nc-rechazadas.server.ts; las acciones vuelven a validar todo en la base.
 */
import { useState, useTransition } from "react";
import { Button, Input, fmtMoneyARS } from "@/components/ui";
import {
  darPorResueltoElRechazoAction,
  reemitirNotaDeCreditoAction,
  type ResultadoAccionNC,
} from "@/lib/facturacion/nc-rechazadas-actions";

export interface NotaRechazadaVista {
  notaId: string;
  factura: string;
  importe: number;
  saldoDeLaFactura: number;
  motivoArca: string;
}

export default function NotasRechazadas({ notas }: { notas: NotaRechazadaVista[] }) {
  if (notas.length === 0) return null;
  const titulo =
    notas.length === 1
      ? "ARCA rechazó una nota de crédito"
      : `ARCA rechazó ${notas.length} notas de crédito`;
  return (
    <section
      aria-labelledby="nc-rechazadas-titulo"
      className="mb-4 rounded-lg border border-danger/25 bg-danger-soft p-4"
    >
      <h2 id="nc-rechazadas-titulo" className="text-base font-semibold text-strong">
        {titulo}
      </h2>
      <p className="mt-1 text-sm text-muted">
        El cobro figura devuelto pero la factura sigue vigente ante ARCA. Volvé a emitir la nota (sale
        una nueva; la rechazada queda en el historial) o, si ya la hiciste a mano en ARCA, dejalo anotado.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {notas.map((n) => (
          <Fila key={n.notaId} nota={n} />
        ))}
      </ul>
    </section>
  );
}

function Fila({ nota }: { nota: NotaRechazadaVista }) {
  const [resultado, setResultado] = useState<ResultadoAccionNC | null>(null);
  const [anotando, setAnotando] = useState(false);
  const [porque, setPorque] = useState("la hice en ARCA");
  const [pendiente, startTransition] = useTransition();
  const importe = Math.min(nota.importe, nota.saldoDeLaFactura);
  const idPorque = `nc-porque-${nota.notaId}`;

  const correr = (accion: () => Promise<ResultadoAccionNC>) => {
    setResultado(null);
    startTransition(async () => setResultado(await accion()));
  };

  return (
    <li className="rounded-md border border-line bg-surface p-3">
      <p className="text-sm text-strong">
        Factura <span className="font-medium tabular-nums">{nota.factura}</span> · nota por{" "}
        <span className="font-medium tabular-nums">{fmtMoneyARS(nota.importe)}</span>
      </p>
      <p className="mt-1 text-sm text-muted">Motivo de ARCA: {nota.motivoArca}</p>
      {resultado?.ok ? (
        <p role="status" className="mt-2 text-sm font-medium text-success">
          {resultado.mensaje}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Button size="sm" disabled={pendiente} onClick={() => correr(() => reemitirNotaDeCreditoAction(nota.notaId))}>
            {pendiente && !anotando ? "Emitiendo…" : `Volver a emitir por ${fmtMoneyARS(importe)}`}
          </Button>
          {anotando ? (
            <>
              <label htmlFor={idPorque} className="sr-only">
                Cómo lo resolviste
              </label>
              <Input
                id={idPorque}
                value={porque}
                maxLength={200}
                onChange={(e) => setPorque(e.target.value)}
                className="w-56"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={pendiente}
                onClick={() => correr(() => darPorResueltoElRechazoAction(nota.notaId, porque))}
              >
                {pendiente ? "Guardando…" : "Guardar"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => setAnotando(true)}>
              Ya la hice en ARCA
            </Button>
          )}
        </div>
      )}
      <div aria-live="polite">
        {resultado && !resultado.ok && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {resultado.error}
          </p>
        )}
      </div>
    </li>
  );
}
