"use client";

// ============================================================================
// LLEGÓ LA SEÑA — una tecla que cobra la seña y confirma el turno (§3.1, CH-022, CH Tanda 2).
// ============================================================================
//
// [Llegó la seña $5.000] cobra la seña que falta y pasa el Reservado a Confirmado en UNA operación
// (`cobrarSeniaYConfirmar`). El medio viene en transferencia, que es como llegan las señas a CH
// (D6, *provisional a confirmar*), y se cambia en el mismo lugar con [▾] antes de tocar. Después,
// un aviso con [Deshacer] durante 10 s: anula esa seña con motivo «deshacer» y el turno vuelve a
// Reservado (CH-049). Si la caja del día ya cerró, el servidor no deja deshacer y lo dice.
//
// Listo para montar donde haya un Reservado con seña pendiente: el renglón/cajón de la agenda, el
// buscador global («/» → «laura» → [Llegó la seña]) y la bandeja del Inicio. `onListo` se llama
// cuando termina el aviso (o al deshacer), para que quien la monta cierre o recargue.

import { useId, useState, useTransition } from "react";
import { Aviso, Button, Segmented } from "@/components/ui";
import { METODOS_DE_PAGO, METODO_LABEL, esMetodoDePago, type MetodoDePago } from "@/lib/turnos/cobros";
import { MEDIO_DE_LA_SENIA, camposDeDeshacer, pesosDelCobro } from "@/lib/turnos/cobro-dividido";
import { cobrarSeniaYConfirmar, deshacerCierre } from "@/lib/turnos/cobro-actions";
import { useToast } from "../../ToastProvider";
import { aFormData, camposDeSenia } from "./campos";

/** Cuánto dura el «Deshacer» en pantalla (el servidor acepta hasta 10 minutos). */
const DURACION_DESHACER_MS = 10_000;

export default function LlegoLaSenia({
  turnoId,
  clienta,
  monto,
  medioInicial = MEDIO_DE_LA_SENIA,
  onListo,
  className,
}: {
  turnoId: string;
  clienta: string;
  /** La seña que falta (`seniaQueFalta`; en la agenda, `turno.senia - turno.cobrado`). */
  monto: number;
  medioInicial?: MetodoDePago;
  onListo?: () => void;
  className?: string;
}) {
  const id = useId();
  const { showError, showSuccess } = useToast();
  const [medio, setMedio] = useState<MetodoDePago>(medioInicial);
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState<{ cobroId: string; monto: number; medio: MetodoDePago } | null>(null);
  const [pendiente, empezar] = useTransition();

  if (!(monto > 0) && !hecho) return null;

  const cobrar = () => {
    if (pendiente) return; // un doble toque no manda dos veces (y el servidor tampoco cobraría dos)
    setError("");
    empezar(async () => {
      try {
        const r = await cobrarSeniaYConfirmar(aFormData(camposDeSenia({ turnoId, monto, metodo: medio })));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setCambiando(false);
        if (r.cobroId) {
          setHecho({ cobroId: r.cobroId, monto: r.monto, medio });
          return;
        }
        showSuccess(r.aviso ?? `Confirmado: ${clienta}.`);
        onListo?.();
      } catch {
        showError("No se pudo registrar la seña. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  const deshacer = (cobroId: string) => {
    empezar(async () => {
      try {
        const r = await deshacerCierre(aFormData(camposDeDeshacer({ turnoId, que: "senia", cobroId })));
        if (!r.ok) showError(r.error);
        else showSuccess(`Listo: la seña de ${clienta} quedó anulada y el turno volvió a Reservado.`);
      } catch {
        showError("No se pudo deshacer. Fijate cómo quedó el turno en la agenda.");
      } finally {
        setHecho(null);
        onListo?.();
      }
    });
  };

  if (hecho) {
    return (
      <Aviso
        className={className}
        mensaje={`Seña de ${pesosDelCobro(hecho.monto)} por ${METODO_LABEL[hecho.medio].toLowerCase()}: ${clienta} quedó confirmada.`}
        duracion={DURACION_DESHACER_MS}
        onDeshacer={pendiente ? undefined : () => deshacer(hecho.cobroId)}
        onTermina={() => {
          setHecho(null);
          onListo?.();
        }}
      />
    );
  }

  return (
    <div data-ui="llego-la-senia" className={className}>
      <div className="flex items-stretch gap-1.5">
        <Button type="button" size="lg" className="flex-1" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={cobrar}>
          {pendiente ? "Guardando…" : `Llegó la seña ${pesosDelCobro(monto)}`}
          <span className="sr-only"> por {METODO_LABEL[medio].toLowerCase()}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-expanded={cambiando}
          aria-controls={`${id}-medio`}
          aria-label={`Cambiar el medio de la seña (ahora: ${METODO_LABEL[medio]})`}
          disabled={pendiente}
          onClick={() => setCambiando((c) => !c)}
        >
          ▾
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Por {METODO_LABEL[medio].toLowerCase()} · cobra y confirma el turno.
      </p>
      {cambiando && (
        <div id={`${id}-medio`} className="mt-2">
          <Segmented
            name={`${id}-medio`}
            leyenda="¿Por dónde llegó la seña?"
            leyendaVisible
            lleno
            value={medio}
            onChange={(e) => {
              const v = (e.nativeEvent.target as HTMLInputElement | null)?.value;
              if (esMetodoDePago(v)) setMedio(v);
            }}
            opciones={METODOS_DE_PAGO.map((m) => ({ valor: m, etiqueta: METODO_LABEL[m] }))}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
