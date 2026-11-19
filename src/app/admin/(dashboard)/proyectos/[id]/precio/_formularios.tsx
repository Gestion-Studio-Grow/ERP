"use client";

// Los formularios del precio por total (MIA T07): el resultado de la acción se muestra al lado del botón.
import { useActionState, type ReactNode } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { aprobarPrecio, guardarPrecio, guardarReparto, type ResultadoPrecio } from "@/lib/proyectos/acciones-precio";

const ACCIONES = { precio: guardarPrecio, aprobar: aprobarPrecio, reparto: guardarReparto } as const;

export function FormularioPrecio({ cual, proyectoId, boton, children, className }: { cual: keyof typeof ACCIONES; proyectoId: string; boton: string; children?: ReactNode; className?: string }) {
  const [r, enviar, ocupado] = useActionState(async (_: ResultadoPrecio | null, fd: FormData) => ACCIONES[cual](fd), null);
  return (
    <form action={enviar} className={cn("grid gap-3", className)}>
      <input type="hidden" name="proyectoId" value={proyectoId} />
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={ocupado} className={buttonClasses("solid", "md")}>{ocupado ? "Guardando…" : boton}</button>
        <p aria-live="polite" className={cn("text-sm", r?.ok ? "text-success" : "text-danger")}>{r ? (r.ok ? r.listo : r.error) : null}</p>
      </div>
    </form>
  );
}
