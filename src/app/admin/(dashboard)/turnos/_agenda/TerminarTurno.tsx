"use client";

// ============================================================================
// TERMINAR UN TURNO — y cobrar lo que falta, o dejarlo a cobrar («Renglón»).
// ============================================================================
//
// `completeAppointment` con los mismos campos que la fila de siempre (campos.ts): sin saldo, sólo
// el turno; con saldo, el medio (un cobro por el saldo) o `saldo=a-cobrar` (queda como cuenta a
// cobrar). Si quien mira no puede cobrar ESTE turno (la profesional que cobra aparte), se dice por
// qué con la frase del servidor y la única salida es terminarlo dejando el saldo.

import { useId, useState, useTransition } from "react";
import { completeAppointment } from "@/lib/actions";
import { Button, Plata, Segmented } from "@/components/ui";
import { METODOS_DE_PAGO, METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import { useToast } from "../../ToastProvider";
import { pesos } from "../agenda-core";
import { aFormData, camposDeTerminar, metodoElegido } from "./campos";

export default function TerminarTurno({
  turnoId,
  clienta,
  saldo,
  puedeCobrar,
  motivoSinCobro,
  onListo,
}: {
  turnoId: string;
  clienta: string;
  saldo: number;
  /** ¿Quien mira puede cobrar este turno? (capacidad + veredicto del servidor). */
  puedeCobrar: boolean;
  /** Por qué no (la frase de `puedeCobrarEsteTurno`). */
  motivoSinCobro?: string;
  onListo?: () => void;
}) {
  const id = useId();
  const { showError, showSuccess } = useToast();
  const [metodo, setMetodo] = useState<MetodoDePago | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();

  const terminar = (cobro: { metodo: MetodoDePago } | "dejar-a-cobrar" | null) => {
    setError("");
    empezar(async () => {
      try {
        const r = await completeAppointment(aFormData(camposDeTerminar({ turnoId, saldo, cobro })));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        showSuccess(
          cobro === "dejar-a-cobrar"
            ? `Terminado: ${clienta}. Quedó debiendo el saldo.`
            : cobro
              ? `Terminado y cobrado: ${clienta}.`
              : `Terminado: ${clienta}.`,
        );
        onListo?.();
      } catch {
        showError("No se pudo terminar el turno. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  if (saldo <= 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">No falta cobrar nada: queda terminado.</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="button" size="lg" className="w-full" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={() => terminar(null)}>
          {pendiente ? "Terminando…" : "Terminar el turno"}
        </Button>
      </div>
    );
  }

  return (
    <div data-ui="terminar-turno" className="space-y-4">
      <p className="flex items-baseline justify-between gap-3 text-sm text-muted">
        <span>Falta cobrar</span>
        <Plata valor={saldo} tamano="grande" />
      </p>
      {puedeCobrar ? (
        <>
          <Segmented
            name={`${id}-medio`}
            leyenda="Cómo paga"
            leyendaVisible
            tono="acento"
            lleno
            value={metodo ?? ""}
            onChange={(e) => setMetodo(metodoElegido((e.nativeEvent.target as HTMLInputElement | null)?.value))}
            opciones={METODOS_DE_PAGO.map((m) => ({ valor: m, etiqueta: METODO_LABEL[m] }))}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!metodo || pendiente}
            estado={pendiente ? "cargando" : undefined}
            onClick={() => metodo && terminar({ metodo })}
          >
            {pendiente ? (
              "Terminando…"
            ) : (
              `Terminar y cobrar ${pesos(saldo)}`
            )}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={pendiente} onClick={() => terminar("dejar-a-cobrar")}>
            Terminar sin cobrar: queda debiendo
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-body">{motivoSinCobro ?? "No podés cobrar este turno."}</p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="button" size="lg" className="w-full" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={() => terminar("dejar-a-cobrar")}>
            {pendiente ? "Terminando…" : "Terminar y dejar el saldo a cobrar"}
          </Button>
        </>
      )}
    </div>
  );
}
