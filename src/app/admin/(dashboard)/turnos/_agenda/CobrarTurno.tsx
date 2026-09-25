"use client";

// ============================================================================
// COBRAR UN TURNO — la seña, el saldo o un parcial («Renglón»).
// ============================================================================
//
// La recepcionista cobra con la clienta enfrente: el monto viene puesto (la seña si no entró nada,
// si no el saldo: `cobroSugerido`), el medio NO viene puesto (la fila de siempre traía «Efectivo» por
// defecto y el error típico era cobrar por el medio equivocado: la caja cerraba con faltante en una
// columna y sobrante en la otra). La tecla se enciende al elegir el medio y dice cuánto cobra.
//
// Usa `registrarCobroTurno` con los mismos campos que la fila de siempre (campos.ts, con prueba).
// La clave de idempotencia es una por intento: un doble toque no cobra dos veces.

import { useId, useState, useTransition } from "react";
import { registrarCobroTurno } from "@/lib/actions";
import { Button, Input, Plata, Segmented } from "@/components/ui";
import { METODOS_DE_PAGO, METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import { useToast } from "../../ToastProvider";
import { pesos } from "../agenda-core";
import { aFormData, camposDeCobro, claveNueva, leerMontoDelCobro, metodoElegido } from "./campos";

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
}: {
  turnoId: string;
  clienta: string;
  /** Lo que se propone cobrar ahora (la seña o el saldo). */
  sugerido: { tipo: "senia" | "saldo"; monto: number };
  saldo: number;
  onListo?: () => void;
}) {
  const id = useId();
  const { showError, showSuccess } = useToast();
  const [texto, setTexto] = useState(montoParaEditar(sugerido.monto));
  const [metodo, setMetodo] = useState<MetodoDePago | null>(null);
  const [clave, setClave] = useState(claveNueva);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();

  const lectura = leerMontoDelCobro(texto, saldo);
  const listo = lectura.ok && metodo !== null;

  const cobrar = () => {
    if (!lectura.ok || !metodo) return;
    const monto = lectura.monto;
    setError("");
    empezar(async () => {
      try {
        const r = await registrarCobroTurno(aFormData(camposDeCobro({ turnoId, clave, monto, metodo })));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setClave(claveNueva());
        showSuccess(`Cobrado: ${clienta}, ${METODO_LABEL[metodo].toLowerCase()}.`);
        onListo?.();
      } catch {
        showError("No se pudo registrar el cobro. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  return (
    <div data-ui="cobrar-turno" className="space-y-4">
      <p className="flex items-baseline justify-between gap-3 text-sm text-muted">
        <span>{sugerido.tipo === "senia" ? "Seña del servicio" : "Falta cobrar"}</span>
        <Plata valor={sugerido.tipo === "senia" ? sugerido.monto : saldo} />
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
      <Button type="button" size="lg" className="w-full" disabled={!listo || pendiente} estado={pendiente ? "cargando" : undefined} onClick={cobrar}>
        {pendiente ? (
          "Cobrando…"
        ) : lectura.ok ? (
          `Cobrar ${pesos(lectura.monto)}`
        ) : (
          "Cobrar"
        )}
      </Button>
      {!metodo && lectura.ok && <p className="text-center text-xs text-muted">Elegí cómo paga para cobrar.</p>}
    </div>
  );
}
