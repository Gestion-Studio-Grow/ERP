"use client";

// CRM COMERCIAL · correr una acción del servidor desde un botón (GSG-CRM-011).
//
// Una acción = una llamada. Si el servidor rechaza, se muestra su motivo TAL CUAL y la pantalla vuelve a
// pedir los datos al servidor (`router.refresh`): nunca queda pintado algo que no pasó.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Res = { ok: true } | { ok: false; motivo: string };

export function useAccion() {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  function correr<R extends Res>(fn: () => Promise<R>, opts: { listo?: string; alTerminar?: (r: Extract<R, { ok: true }>) => void; alFallar?: () => void } = {}) {
    setMotivo(null);
    setHecho(null);
    empezar(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          setMotivo((r as { motivo: string }).motivo);
          opts.alFallar?.();
          router.refresh();
          return;
        }
        setHecho(opts.listo ?? null);
        opts.alTerminar?.(r as Extract<R, { ok: true }>);
        router.refresh();
      } catch {
        setMotivo("No se pudo hacer. Revisá la conexión y probá de nuevo.");
        opts.alFallar?.();
        router.refresh();
      }
    });
  }

  return { correr, pendiente, motivo, hecho, limpiar: () => (setMotivo(null), setHecho(null)) };
}
