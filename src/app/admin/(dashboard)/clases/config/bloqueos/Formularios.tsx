"use client";

// Días bloqueados (lluvia, viaje, torneo): el turnero deja de ofrecerlos. Lo que ya existía en
// Ajustes, movido a su tarjeta. Cuando Semana tenga «Bloquear días» con el aviso de las clases
// afectadas (Tanda 3A, suspenderDia/bloquearRango), esta pantalla puede retirarse.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { agregarBloqueo, quitarBloqueo } from "@/lib/padel/acciones";
import { useToast } from "../../../ToastProvider";
import { campo, rotulo } from "../_estilos";

export function FormBloqueo() {
  const router = useRouter();
  const { showSuccess } = useToast();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          const r = await agregarBloqueo(fd);
          if (!r.ok) return setError(r.error);
          showSuccess("Día bloqueado");
          router.refresh();
        })
      }
      className="grid gap-3"
    >
      <div>
        <label htmlFor="bl-fecha" className={rotulo}>Día</label>
        <input id="bl-fecha" name="fecha" type="date" className={campo} required data-qa="bloqueo-fecha" aria-describedby={error ? "bl-error" : undefined} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="bl-desde" className={rotulo}>Desde (si no es todo el día)</label>
          <input id="bl-desde" name="desde" type="time" step={1800} className={campo} />
        </div>
        <div>
          <label htmlFor="bl-hasta" className={rotulo}>Hasta</label>
          <input id="bl-hasta" name="hasta" type="time" step={1800} className={campo} />
        </div>
      </div>
      {error && <p id="bl-error" role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      <button type="submit" disabled={pendiente} className={cn(buttonClasses("solid", "lg"), "h-12 w-full justify-center")} data-qa="bloquear">
        {pendiente ? "Bloqueando…" : "Bloquear"}
      </button>
    </form>
  );
}

export function QuitarBloqueo({ id, etiqueta }: { id: string; etiqueta: string }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={`Quitar el bloqueo del ${etiqueta}`}
      className="min-h-12 px-2 text-sm font-semibold text-accent-ink underline underline-offset-2"
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("id", id);
          await quitarBloqueo(fd);
          router.refresh();
        })
      }
    >
      {pendiente ? "Quitando…" : "Quitar"}
    </button>
  );
}
