"use client";

// "Sumar a la bandeja de hoy": la clienta pasa primera en "Para contactar hoy". No escribe
// nada solo: el mensaje lo manda la recepción desde la bandeja, 1 a 1.

import { useState, useTransition } from "react";
import Link from "next/link";
import { pasarABandeja } from "@/lib/crm-actions";
import { buttonClasses } from "@/components/ui";

export default function PasarABandeja({
  clientId,
  yaEsta,
  corto = false,
}: {
  clientId: string;
  yaEsta: boolean;
  /** «Diseño nuevo»: la tecla del renglón, con el texto corto (el nombre completo va al lector). */
  corto?: boolean;
}) {
  const [listo, setListo] = useState(yaEsta);
  const [error, setError] = useState("");
  const [pendiente, start] = useTransition();

  if (listo) {
    return (
      <Link
        href="/admin/clientes/hoy"
        className={buttonClasses(
          "ghost",
          corto ? "sm" : "md",
          "whitespace-nowrap",
        )}
      >
        {corto ? "En la bandeja →" : "En la bandeja de hoy →"}
      </Link>
    );
  }
  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          start(async () => {
            setError("");
            try {
              const r = await pasarABandeja(clientId);
              if (r.ok) setListo(true);
              else setError(r.error);
            } catch {
              setError("No se pudo sumar. Probá de nuevo.");
            }
          })
        }
        aria-label={corto ? "Sumar a la bandeja de hoy" : undefined}
        className={buttonClasses(
          "outline",
          corto ? "sm" : "md",
          "whitespace-nowrap",
        )}
      >
        {pendiente
          ? "Sumando…"
          : corto
            ? "A la bandeja"
            : "Sumar a la bandeja de hoy"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
