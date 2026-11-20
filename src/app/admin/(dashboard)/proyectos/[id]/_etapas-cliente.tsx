"use client";

// MIA-50 T09 · O04: cancelar después de aprobado. Dos pasos: el motivo y un «sí» explícito, sin confirm nativo.

import { useState } from "react";
import { buttonClasses } from "@/components/ui";
import { cancelarProyecto } from "@/lib/proyectos/acciones-etapas";
import { campo, etiqueta } from "../_vista";
import { FormAccion } from "./_cliente";

export function CancelarProyecto({ id }: { id: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <button type="button" className={buttonClasses("outline", "md")} onClick={() => setAbierto(true)}>Cancelar el proyecto</button>;
  return (
    <FormAccion accion={cancelarProyecto} className="grid gap-3" alGuardar={() => setAbierto(false)}>
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-strong">
        Sale del tablero como cancelado. Las cuotas que faltan se anulan solas; los cobros y pagos ya hechos quedan como están y no se liquida nada solo: te queda la lista de lo que hay que resolver.
      </p>
      <label className={etiqueta}>
        Por qué se cancela
        <textarea name="motivo" required rows={3} maxLength={300} className={`${campo} py-2`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClasses("danger", "md")}>Sí, cancelar el proyecto</button>
        <button type="button" className={buttonClasses("ghost", "md")} onClick={() => setAbierto(false)}>No</button>
      </div>
    </FormAccion>
  );
}
