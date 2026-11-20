"use client";

// T10 (GSG-MIA-171): los tres pasos de la liquidación del proyecto. Un envío a la vez; el error vuelve en criollo y lo
// tipeado no se pierde. El permiso, el centavo y el código se vuelven a comprobar en el servidor.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { aprobarAjusteTardio, aprobarLiquidacionProyecto, declararCostosCompletos, revisarLiquidacionProyecto, type ResultadoLiq } from "@/lib/proyectos/acciones-liquidacion-proyecto";
import { campo, etiqueta } from "../_vista";

function usePaso(accion: (fd: FormData) => Promise<ResultadoLiq>) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const correr = (fd: FormData) =>
    iniciar(async () => {
      setError(null);
      const r = await accion(fd);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  return { error, ocupado, correr };
}

const Fallo = ({ texto }: { texto: string | null }) => (texto ? <p role="alert" className="text-sm text-danger">{texto}</p> : null);

export function DeclararCostos({ proyectoId }: { proyectoId: string }) {
  const { error, ocupado, correr } = usePaso(declararCostosCompletos);
  return (
    <form action={(fd) => { fd.set("proyectoId", proyectoId); correr(fd); }} className="mt-2 grid gap-2">
      <p className="text-sm text-muted">Cuando terminó el evento y no quedan rendiciones abiertas, declarás que ya están todos los costos. El costo se congela y se arma el borrador.</p>
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11 justify-self-start")}>{ocupado ? "Declarando…" : "Declarar costos completos"}</button>
      <Fallo texto={error} />
    </form>
  );
}

export function RevisarLiquidacion({ proyectoId, conDiferencia }: { proyectoId: string; conDiferencia: boolean }) {
  const { error, ocupado, correr } = usePaso(revisarLiquidacionProyecto);
  return (
    <form action={(fd) => { fd.set("proyectoId", proyectoId); correr(fd); }} className="mt-2 grid gap-2">
      <label className={etiqueta}>
        {conDiferencia ? "Nota que explica la diferencia (obligatoria)" : "Nota (opcional)"}
        <textarea name="nota" rows={3} maxLength={500} required={conDiferencia} minLength={conDiferencia ? 3 : undefined} className={cn(campo, "py-2")} />
      </label>
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11 justify-self-start")}>{ocupado ? "Guardando…" : "Marcar revisada"}</button>
      <Fallo texto={error} />
    </form>
  );
}

export function AprobarLiquidacion({ proyectoId }: { proyectoId: string }) {
  const { error, ocupado, correr } = usePaso(aprobarLiquidacionProyecto);
  return (
    <form action={(fd) => { fd.set("proyectoId", proyectoId); correr(fd); }} className="mt-2 grid gap-2">
      <p className="text-sm text-muted">Al aprobarla queda congelada y entra a la liquidación del mes cuando se cumpla «cuándo se paga».</p>
      <label className={etiqueta}>
        Código de tu app de autenticación
        <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9A-Za-z-]{6,20}" maxLength={20} required className={cn(campo, "tracking-widest tabular-nums")} />
      </label>
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11 justify-self-start")}>{ocupado ? "Aprobando…" : "Aprobar con el código"}</button>
      <Fallo texto={error} />
    </form>
  );
}

/**
 * T12 (O24): Dirección aprueba el ajuste por los costos que cambiaron después, con el código de su app. MIA-186 (O26): si
 * alguien con un renglón a favor tiene saldo abierto con la empresa, Dirección elige si se compensa; por defecto, no.
 */
export function AprobarAjuste({ proyectoId, compensable }: { proyectoId: string; compensable: boolean }) {
  const { error, ocupado, correr } = usePaso(aprobarAjusteTardio);
  return (
    <form action={(fd) => { fd.set("proyectoId", proyectoId); correr(fd); }} className="mt-3 grid gap-2">
      {compensable && (
        <label className="flex min-h-11 items-start gap-3 text-sm text-strong">
          <input type="checkbox" name="compensar" value="si" className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            Compensar con el saldo a favor de la empresa
            <span className="block text-muted">Lo que se compensa no va a la liquidación del mes. Si no lo marcás, se paga entero y el saldo queda abierto.</span>
          </span>
        </label>
      )}
      <label className={etiqueta}>
        Código de tu app de autenticación
        <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9A-Za-z-]{6,20}" maxLength={20} required className={cn(campo, "tracking-widest tabular-nums")} />
      </label>
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "min-h-11 justify-self-start")}>{ocupado ? "Aprobando…" : "Aprobar el ajuste con el código"}</button>
      <Fallo texto={error} />
    </form>
  );
}
