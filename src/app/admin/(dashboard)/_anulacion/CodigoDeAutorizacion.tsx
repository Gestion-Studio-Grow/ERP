"use client";

// «Autorizar anulación»: la tecla de la dueña. Saca el código que recepción escribe para anular ESE
// cobro o ESA venta. El código no se guarda en ningún lado: vive en esta pantalla mientras esté
// abierta, y vence solo. Tocarla no mueve plata. Cada pantalla le pasa cómo pedirlo (`pedir`).

import { useState, useTransition } from "react";
import type { ResultadoAutorizacion } from "@/lib/anulacion-autorizada";
import { Button } from "@/components/ui";

export default function CodigoDeAutorizacion({
  pedir,
  vale,
}: {
  pedir: () => Promise<ResultadoAutorizacion>;
  /** «este cobro», «esta venta»: se dice para qué sirve el código. */
  vale: string;
}) {
  const [autorizado, setAutorizado] = useState<{ codigo: string; venceA: string } | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();

  const sacar = () =>
    empezar(async () => {
      setError("");
      try {
        const r = await pedir();
        if (r.ok) setAutorizado({ codigo: r.codigo, venceA: r.venceA });
        else setError(r.error);
      } catch {
        setError("No se pudo sacar el código. Probá de nuevo; si sigue, avisá.");
      }
    });

  return (
    <div className="flex flex-col items-start gap-1.5" data-ui="autorizar-anulacion">
      {!autorizado && (
        <Button type="button" variant="outline" size="sm" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={sacar}>
          Autorizar anulación
        </Button>
      )}
      {autorizado && (
        <div aria-live="polite" className="space-y-1">
          <p className="text-sm text-body">
            Código para recepción:{" "}
            <strong data-ui="codigo-anulacion" className="font-mono text-base tracking-widest text-strong">
              {autorizado.codigo}
            </strong>
          </p>
          <p className="text-xs text-muted">
            Vale sólo para {vale}, hasta las {autorizado.venceA}.
          </p>
          <button type="button" className="min-h-11 text-xs text-muted underline hover:text-strong" onClick={() => setAutorizado(null)}>
            Ocultar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
