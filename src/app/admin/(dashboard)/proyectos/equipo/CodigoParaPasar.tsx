"use client";

// El código de ingreso de alguien del equipo, para pasárselo por WhatsApp. Se muestra UNA vez: no queda guardado (sólo su
// hash) y al recargar la página desaparece. Si se pierde, se genera otro.

import { useActionState } from "react";
import { buttonClasses } from "@/components/ui";
import { generarCodigoParaPasar, type EstadoCodigoParaPasar } from "@/lib/rendiciones/acciones-pin";

export function CodigoParaPasar({ personaId, nombre }: { personaId: string; nombre: string }) {
  const [estado, accion, ocupado] = useActionState<EstadoCodigoParaPasar, FormData>(generarCodigoParaPasar, null);

  if (estado?.ok) {
    return (
      <div role="status" className="mt-1 grid gap-2 rounded-lg border border-line p-3">
        <p className="text-sm text-muted">Código de ingreso de {estado.nombre}. Vence en 5 minutos y sirve una sola vez. No se vuelve a mostrar.</p>
        <p className="font-mono text-2xl font-semibold tracking-widest text-strong" aria-label={`Código ${estado.codigo.split("").join(" ")}`}>{estado.codigo}</p>
        <a href={estado.enlace} target="_blank" rel="noopener noreferrer" className={buttonClasses("solid", "md")}>
          Pasarlo por WhatsApp
        </a>
      </div>
    );
  }
  return (
    <form action={accion} className="grid gap-1">
      <input type="hidden" name="id" value={personaId} />
      <button type="submit" disabled={ocupado} className={buttonClasses("ghost", "md")} aria-label={`Generar código de ingreso para ${nombre}`}>
        {ocupado ? "Generando…" : "Código de ingreso por WhatsApp"}
      </button>
      {estado && !estado.ok && <p role="alert" className="text-sm text-danger">{estado.error}</p>}
    </form>
  );
}
