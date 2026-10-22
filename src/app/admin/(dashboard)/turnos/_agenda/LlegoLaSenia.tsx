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
// Se toca cuando la plata SE VE en el banco o en Mercado Pago, no por la captura que manda la clienta:
// lo dice la ayuda debajo del botón y el cobro queda «verificada por recepción» (nota y auditoría).
//
// Listo para montar donde haya un Reservado con seña pendiente: el renglón/cajón de la agenda, el
// buscador global («/» → «laura» → [Llegó la seña]) y la bandeja del Inicio. `onListo` se llama
// cuando termina el aviso (o al deshacer), para que quien la monta cierre o recargue.
//
// `confirma={false}` (la profesional, que cobra sus turnos pero no confirma: `agenda:manage` es de la
// recepción): la misma tecla registra la seña y el turno sigue Reservado; el texto de abajo y el
// aviso lo dicen (cert CH T2, F-1). Nunca termina en una redirección: el servidor acepta
// `agenda:collect` con el veredicto de ESE turno.

import { useId, useState, useTransition } from "react";
import { Aviso, Button, Segmented } from "@/components/ui";
import { METODO_LABEL, esMetodoDePago, type MetodoDePago } from "@/lib/turnos/cobros";
import { useMediosDePago } from "./medios";
import { AYUDA_LLEGO_LA_SENIA, MEDIO_DE_LA_SENIA, camposDeDeshacer, pesosDelCobro } from "@/lib/turnos/cobro-dividido";
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
  confirma = true,
  onListo,
  className,
}: {
  turnoId: string;
  clienta: string;
  /** La seña que falta (`seniaQueFalta`; en la agenda, `turno.senia - turno.cobrado`). */
  monto: number;
  medioInicial?: MetodoDePago;
  /** ¿Quien toca confirma el turno? (`agenda:manage`). Sin eso, sólo registra la seña. */
  confirma?: boolean;
  onListo?: () => void;
  className?: string;
}) {
  const id = useId();
  const { showError, showSuccess } = useToast();
  const [medio, setMedio] = useState<MetodoDePago>(medioInicial);
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState<{ cobroId: string; monto: number; medio: MetodoDePago; confirmo: boolean } | null>(null);
  const [pendiente, empezar] = useTransition();
  const { medios } = useMediosDePago();

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
          setHecho({ cobroId: r.cobroId, monto: r.monto, medio, confirmo: r.confirmo });
          return;
        }
        showSuccess(r.aviso ?? `Confirmado: ${clienta}.`);
        onListo?.();
      } catch {
        showError("No se pudo registrar la seña. Probá de nuevo; si sigue, avisá.");
      }
    });
  };

  const deshacer = (cobroId: string, confirmo: boolean) => {
    empezar(async () => {
      try {
        const r = await deshacerCierre(aFormData(camposDeDeshacer({ turnoId, que: "senia", cobroId })));
        if (!r.ok) showError(r.error);
        else showSuccess(confirmo ? `Listo: la seña de ${clienta} quedó anulada y el turno volvió a Reservado.` : `Listo: la seña de ${clienta} quedó anulada.`);
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
        mensaje={
          hecho.confirmo
            ? `Seña de ${pesosDelCobro(hecho.monto)} por ${METODO_LABEL[hecho.medio].toLowerCase()}: ${clienta} quedó confirmada.`
            : `Seña de ${pesosDelCobro(hecho.monto)} por ${METODO_LABEL[hecho.medio].toLowerCase()} registrada. El turno de ${clienta} lo confirma la recepción.`
        }
        duracion={DURACION_DESHACER_MS}
        onDeshacer={pendiente ? undefined : () => deshacer(hecho.cobroId, hecho.confirmo)}
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
        <Button type="button" size="lg" className="flex-1" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={cobrar} aria-describedby={`${id}-ayuda`}>
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
        Por {METODO_LABEL[medio].toLowerCase()} · {confirma ? "cobra y confirma el turno." : "la registra; el turno lo confirma la recepción."}
      </p>
      {/* Comprobante informado ≠ cobrado: el cobro es firme, se toca con la plata a la vista. */}
      <p id={`${id}-ayuda`} className="mt-0.5 text-xs text-muted">
        {AYUDA_LLEGO_LA_SENIA}
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
              if (esMetodoDePago(v, medios)) setMedio(v);
            }}
            opciones={medios.map((m) => ({ valor: m, etiqueta: METODO_LABEL[m] }))}
            className={medios.length > 3 ? "flex-wrap" : undefined}
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
