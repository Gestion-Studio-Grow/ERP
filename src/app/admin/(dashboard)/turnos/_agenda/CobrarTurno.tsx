"use client";

// ============================================================================
// COBRAR UN TURNO — la seña, el saldo o un parcial («Renglón»).
// ============================================================================
//
// La recepcionista cobra con la clienta enfrente: el monto viene puesto (la seña si no entró nada,
// si no el saldo: `cobroSugerido`) y se puede cambiar para un parcial; el medio NO viene puesto (la
// fila de siempre traía «Efectivo» por defecto y el error típico era cobrar por el medio
// equivocado: la caja cerraba con faltante en una columna y sobrante en la otra).
//
// Un toque en el medio YA cobra (§2.6): no hay segundo botón de «Cobrar». El botón grande queda
// sólo para «Queda debiendo», cuando el turno ya terminó y la clienta paga otro día.
//
// Usa `registrarCobroTurno` con los mismos campos que la fila de siempre (campos.ts, con prueba).
// La clave de idempotencia es una por intento: un doble toque no cobra dos veces.

import { useId, useState, useTransition } from "react";
import { registrarCobroTurno } from "@/lib/actions";
import { Button, Input, Plata } from "@/components/ui";
import { METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import { useToast } from "../../ToastProvider";
import { pesos } from "../agenda-core";
import TeclasDeMedio from "../cerrar/TeclasDeMedio";
import { aFormData, camposDeCobro, claveNueva, leerMontoDelCobro } from "./campos";
import { useMediosDePago } from "./medios";

export function montoParaEditar(n: number): string {
  // «22000» y no «22.000»: lo que se muestra es lo que se relee igual (leerImporte).
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

export default function CobrarTurno({
  turnoId,
  clienta,
  sugerido,
  saldo,
  onListo,
  onQuedaDebiendo,
}: {
  turnoId: string;
  clienta: string;
  /** Lo que se propone cobrar ahora (la seña o el saldo). */
  sugerido: { tipo: "senia" | "saldo"; monto: number };
  saldo: number;
  onListo?: () => void;
  /** Turno terminado con saldo: «Queda debiendo» cierra la hoja sin cobrar (la deuda ya figura). */
  onQuedaDebiendo?: () => void;
}) {
  const id = useId();
  const { showError, showSuccess } = useToast();
  const [texto, setTexto] = useState(montoParaEditar(sugerido.monto));
  const [clave, setClave] = useState(claveNueva);
  const [error, setError] = useState("");
  const [enCurso, setEnCurso] = useState<MetodoDePago | null>(null);
  const [pendiente, empezar] = useTransition();
  const { medios, aviso } = useMediosDePago();

  const lectura = leerMontoDelCobro(texto, saldo);

  const cobrar = (metodo: MetodoDePago) => {
    if (!lectura.ok || pendiente) return;
    const monto = lectura.monto;
    setError("");
    setEnCurso(metodo);
    empezar(async () => {
      try {
        const r = await registrarCobroTurno(aFormData(camposDeCobro({ turnoId, clave, monto, metodo })));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setClave(claveNueva());
        showSuccess(`Cobrado: ${clienta}, ${pesos(monto)} en ${METODO_LABEL[metodo].toLowerCase()}.`);
        onListo?.();
      } catch {
        showError("No se pudo registrar el cobro. Probá de nuevo; si sigue, avisá.");
      } finally {
        setEnCurso(null);
      }
    });
  };

  return (
    <div data-ui="cobrar-turno" className="space-y-4">
      <p className="flex items-baseline justify-between gap-3 text-sm text-muted">
        <span>{sugerido.tipo === "senia" ? "Seña del servicio" : "Falta cobrar"}</span>
        <Plata valor={sugerido.tipo === "senia" ? sugerido.monto : saldo} sinCentavos={Number.isInteger(sugerido.tipo === "senia" ? sugerido.monto : saldo)} />
      </p>
      <div>
        <label htmlFor={`${id}-monto`} data-ui="rotulo" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
          Cuánto cobrás
        </label>
        <Input
          id={`${id}-monto`}
          importe
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          aria-invalid={!lectura.ok && texto !== "" ? true : undefined}
          aria-describedby={!lectura.ok ? `${id}-error-monto` : undefined}
          onChange={(e) => setTexto(e.target.value)}
          className="text-right tabular-nums"
        />
        {!lectura.ok && texto !== "" && (
          <p id={`${id}-error-monto`} className="mt-1 text-xs text-danger">
            {lectura.error}
          </p>
        )}
      </div>
      <TeclasDeMedio
        tamano="grande"
        etiqueta={lectura.ok ? `Cobrar ${pesos(lectura.monto)} con` : "Cobrar con"}
        onElegir={cobrar}
        disabled={!lectura.ok || pendiente}
        enCurso={enCurso}
        medios={medios}
      />
      <p className="text-center text-xs text-muted">
        {lectura.ok ? "Un toque en el medio cobra." : "Escribí cuánto cobrás para elegir el medio."}
        {aviso ? ` ${aviso}` : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {onQuedaDebiendo && (
        <Button type="button" variant="outline" size="lg" className="w-full" disabled={pendiente} onClick={onQuedaDebiendo}>
          Queda debiendo
        </Button>
      )}
    </div>
  );
}
