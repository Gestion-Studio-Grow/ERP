"use client";

// ============================================================================
// TERMINAR UN TURNO — y cobrar lo que falta, o dejarlo a cobrar («Renglón»).
// ============================================================================
//
// `completeAppointment` con los mismos campos que la fila de siempre (campos.ts): sin saldo, sólo
// el turno; con saldo, el medio (un cobro por el saldo) o `saldo=a-cobrar` (queda como cuenta a
// cobrar). Un Reservado pasado viaja con `vino=on` (la clienta vino aunque nadie confirmó).
//
// Cobro en 2 toques (§2.6 del diseño): el primero abre esta hoja («Cobrar $9.000»), el segundo es
// el MEDIO, que ya cobra y termina: no hay un segundo botón de «Cobrar» que confirmar. Ningún medio
// viene elegido. El botón grande queda sólo para «Queda debiendo». Si quien mira no puede cobrar
// ESTE turno (la profesional que cobra aparte), se dice por qué ARRIBA, con la frase del servidor,
// y la única salida es terminarlo dejando el saldo.

import { useState, useTransition } from "react";
import { completeAppointment } from "@/lib/actions";
import { Button, Plata } from "@/components/ui";
import { METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import { useToast } from "../../ToastProvider";
import { pesos, type EstadoDelTurno } from "../agenda-core";
import TeclasDeMedio from "../cerrar/TeclasDeMedio";
import { aFormData, camposDeTerminar } from "./campos";

type Cobro = { metodo: MetodoDePago } | "dejar-a-cobrar" | null;

export default function TerminarTurno({
  turnoId,
  clienta,
  estado,
  saldo,
  puedeCobrar,
  motivoSinCobro,
  onListo,
}: {
  turnoId: string;
  clienta: string;
  /** El estado al dibujar: un Reservado (PENDING) se cierra como «vino». */
  estado: EstadoDelTurno;
  saldo: number;
  /** ¿Quien mira puede cobrar este turno? (capacidad + veredicto del servidor). */
  puedeCobrar: boolean;
  /** Por qué no (la frase de `puedeCobrarEsteTurno`). */
  motivoSinCobro?: string;
  onListo?: () => void;
}) {
  const { showError, showSuccess } = useToast();
  const [error, setError] = useState("");
  const [enCurso, setEnCurso] = useState<Cobro | undefined>(undefined);
  const [pendiente, empezar] = useTransition();
  const vino = estado === "PENDING";

  const terminar = (cobro: Cobro) => {
    if (pendiente) return; // un doble toque no manda dos veces
    setError("");
    setEnCurso(cobro);
    empezar(async () => {
      try {
        const r = await completeAppointment(aFormData(camposDeTerminar({ turnoId, saldo, cobro, estado })));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const hecho = vino ? "Vino" : "Terminado";
        showSuccess(
          cobro === "dejar-a-cobrar"
            ? `${hecho}: ${clienta}. Queda debiendo ${pesos(saldo)}.`
            : cobro
              ? `${hecho} y cobrado: ${clienta}, ${pesos(saldo)} en ${METODO_LABEL[cobro.metodo].toLowerCase()}.`
              : `${hecho}: ${clienta}.`,
        );
        // La factura del turno no salió (ARCA la rechazó): se dice, el turno igual quedó terminado.
        if (r.aviso) showError(r.aviso);
        onListo?.();
      } catch {
        showError("No se pudo terminar el turno. Probá de nuevo; si sigue, avisá.");
      } finally {
        setEnCurso(undefined);
      }
    });
  };

  const elError = error && (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  );

  if (saldo <= 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">No falta cobrar nada: {vino ? "queda como que vino y terminado." : "queda terminado."}</p>
        {elError}
        <Button type="button" size="lg" className="w-full" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={() => terminar(null)}>
          {pendiente ? "Guardando…" : vino ? "Vino ✓" : "Terminar el turno"}
        </Button>
      </div>
    );
  }

  if (!puedeCobrar) {
    return (
      <div data-ui="terminar-turno" className="space-y-4">
        <p className="text-sm text-body">{motivoSinCobro ?? "No podés cobrar este turno."}</p>
        <p className="flex items-baseline justify-between gap-3 text-sm text-muted">
          <span>Queda a cobrar</span>
          <Plata valor={saldo} />
        </p>
        {elError}
        <Button type="button" size="lg" className="w-full" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={() => terminar("dejar-a-cobrar")}>
          {pendiente ? "Guardando…" : "Terminar y dejar el saldo"}
        </Button>
      </div>
    );
  }

  return (
    <div data-ui="terminar-turno" className="space-y-4">
      <div className="text-center">
        <p className="text-sm text-muted">Falta cobrar</p>
        <Plata valor={saldo} tamano="grande" />
      </div>
      <TeclasDeMedio
        tamano="grande"
        etiqueta={`Cobrar ${pesos(saldo)} y ${vino ? "cerrar como que vino" : "terminar"}, con`}
        onElegir={(metodo) => terminar({ metodo })}
        disabled={pendiente}
        enCurso={enCurso && typeof enCurso === "object" ? enCurso.metodo : null}
      />
      <p className="text-center text-xs text-muted">Un toque en el medio cobra y {vino ? "la marca como que vino" : "termina el turno"}.</p>
      {elError}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={pendiente}
        estado={enCurso === "dejar-a-cobrar" ? "cargando" : undefined}
        onClick={() => terminar("dejar-a-cobrar")}
      >
        Queda debiendo
      </Button>
    </div>
  );
}
