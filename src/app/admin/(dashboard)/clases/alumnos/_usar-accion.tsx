"use client";

// Correr una acción del profe desde Alumnos, la Ficha, Plata o la Bandeja (Tanda 3B). Lo mismo que
// hacen las de una clase (_acciones.tsx), con dos salidas según lo que devuelva la acción:
// - Con WhatsApp para mandar (`wa`): a la cola de avisos del layout (_aviso.tsx), que sobrevive al
//   refresco de la lista y no se cierra sola.
// - Sin nada que mandar (cobrar todo, le devolví, guardar): un aviso corto «Cobraste…» (toast).
// El error queda al lado del botón (no cambió nada), con role="alert".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../../ToastProvider";
import { useAvisoAccion } from "../_aviso";

export type ResultadoAccion =
  | { ok: true; wa?: string | null; enviado?: boolean; avisoId?: string | null }
  | { ok: false; error: string };

export function useAccion() {
  const router = useRouter();
  const mostrar = useAvisoAccion();
  const { showSuccess } = useToast();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** `texto`: lo que pasó, en criollo. `nombre`: a quién se le avisa (el botón verde). */
  const correr = <R extends ResultadoAccion>(fn: () => Promise<R>, texto: string | ((r: Extract<R, { ok: true }>) => string), nombre: string, despues?: (r: Extract<R, { ok: true }>) => void) =>
    start(async () => {
      setError(null);
      let r: R;
      try {
        r = await fn();
      } catch {
        setError("No pudimos guardar. Revisá la conexión y probá de nuevo.");
        return;
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const ok = r as Extract<R, { ok: true }>;
      const t = typeof texto === "function" ? texto(ok) : texto;
      if (ok.wa || ok.enviado) mostrar({ texto: t, nombre, wa: ok.wa ?? null, enviado: ok.enviado, avisoId: ok.avisoId ?? null });
      else showSuccess(t);
      despues?.(ok);
      router.refresh();
    });

  return { pendiente, error, setError, correr };
}

export function ErrorEnLinea({ texto, id }: { texto: string | null; id?: string }) {
  if (!texto) return null;
  return (
    <p id={id} role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
      {texto}
    </p>
  );
}
