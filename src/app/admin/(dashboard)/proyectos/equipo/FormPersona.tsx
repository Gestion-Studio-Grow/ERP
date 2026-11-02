"use client";

import { useRef, useState, useTransition } from "react";
import { buttonClasses } from "@/components/ui";
import { guardarPersona } from "@/lib/proyectos/acciones-gestion";
import { ROL_LABEL, ROLES_GESTION, type RolGestion } from "@/lib/proyectos/gestion-core";
import { campo, etiqueta } from "../_vista";

export interface ValoresPersona {
  id: string;
  nombre: string;
  email: string | null;
  rol: string;
  puesto: string;
  sueldoBase: number | null;
  facturaA: string;
  userId: string | null;
}

/** `sueldo`: «oculto» no lo muestra; «ver», sólo lectura; «editar», se puede cambiar. */
export function FormPersona({ valores, sueldo, soloDireccionDa }: { valores?: ValoresPersona; sueldo: "oculto" | "ver" | "editar"; soloDireccionDa: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const roles = ROLES_GESTION.filter((r: RolGestion) => r !== "DIRECCION" || !soloDireccionDa);

  return (
    <form
      ref={form}
      className="grid gap-3 sm:grid-cols-2"
      action={(fd) =>
        iniciar(async () => {
          setError(null);
          setHecho(false);
          try {
            const r = await guardarPersona(fd);
            if (!r.ok) return setError(r.error);
            if (!valores) form.current?.reset();
            setHecho(true);
          } catch {
            setError("No se pudo guardar. Probá de nuevo.");
          }
        })
      }
    >
      {valores && <input type="hidden" name="id" value={valores.id} />}
      <label className={etiqueta}>Nombre<input name="nombre" required maxLength={120} defaultValue={valores?.nombre} className={campo} /></label>
      <label className={etiqueta}>Mail<input name="email" type="email" maxLength={160} defaultValue={valores?.email ?? ""} className={campo} /></label>
      <label className={etiqueta}>
        Rol
        <select name="rol" defaultValue={valores?.rol ?? "PRODUCCION"} className={campo}>
          {roles.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
        </select>
      </label>
      <label className={etiqueta}>Puesto<input name="puesto" maxLength={120} defaultValue={valores?.puesto} className={campo} /></label>
      {sueldo !== "oculto" && (
        <label className={etiqueta}>
          Sueldo
          <input name="sueldoBase" type="number" min={0} step="any" readOnly={sueldo === "ver"} defaultValue={valores?.sueldoBase ?? 0} className={campo} />
        </label>
      )}
      <label className={etiqueta}>Factura a<input name="facturaA" maxLength={160} defaultValue={valores?.facturaA} className={campo} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-strong sm:col-span-2">
        <input type="checkbox" name="vincular" defaultChecked={!!valores?.userId} className="h-5 w-5 shrink-0" />
        Vincular con la cuenta del ERP que tenga este mail
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={ocupado} className={buttonClasses("solid", "md")}>{ocupado ? "Guardando…" : "Guardar"}</button>
        {hecho && <p role="status" className="text-sm text-strong">Guardado.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}
