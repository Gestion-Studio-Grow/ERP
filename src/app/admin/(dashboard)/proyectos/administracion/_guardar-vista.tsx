"use client";

// Guardar una vista (O46): no vacía lo elegido si falla, y al guardar abre la lista con la vista nueva y dice dónde quedó.

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import type { Resultado } from "@/lib/proyectos/acciones-vistas";

export function GuardarVista({ accion, tab, aviso, children }: { accion: (fd: FormData) => Promise<Resultado>; tab: string; aviso: string | null; children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      setError(null);
      const r = await accion(fd).catch(() => ({ ok: false as const, error: "No se pudo guardar. Probá de nuevo." }));
      if (!r.ok) return setError(r.error);
      router.push(`/admin/proyectos/administracion?tab=${tab}${r.id ? `&vista=${encodeURIComponent(r.id)}` : ""}&guardada=1`);
    });
  };
  return (
    <form onSubmit={enviar} className="grid gap-2 sm:grid-cols-2">
      {children}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11")}>{ocupado ? "Guardando…" : "Guardar vista"}</button>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {!error && aviso && <p role="status" className="text-sm text-strong">{aviso}</p>}
      </div>
    </form>
  );
}
