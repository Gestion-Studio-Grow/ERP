"use client";

// La carga de un gasto del proyecto. Es de cliente para decir qué faltó sin perder lo tipeado, y para pedir el medio
// de pago sólo si ya se pagó.

import { useRef, useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { registrarGasto } from "@/lib/proyectos/acciones";
import { MEDIOS, MEDIO_LABEL } from "@/lib/proyectos/core";
import { campo } from "../_vista";

export function FormGasto({ proyectoId, proveedores, rubros, hoy }: { proyectoId: string; proveedores: readonly string[]; rubros: readonly string[]; hoy: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pagado, setPagado] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className="grid gap-2 sm:grid-cols-4"
      action={(fd) =>
        iniciar(async () => {
          setError(null);
          const r = await registrarGasto(fd);
          if (!r.ok) return setError(r.error);
          form.current?.reset();
          setPagado(false);
        })
      }
    >
      <input type="hidden" name="proyectoId" value={proyectoId} />
      <input name="proveedor" aria-label="Proveedor" placeholder="Proveedor" list="proveedores-gasto" maxLength={120} className={campo} />
      <datalist id="proveedores-gasto">{proveedores.map((p) => <option key={p} value={p} />)}</datalist>
      <input name="rubro" aria-label="Rubro" placeholder="Rubro" list="rubros-gasto" maxLength={60} className={campo} />
      <datalist id="rubros-gasto">{rubros.map((r) => <option key={r} value={r} />)}</datalist>
      <input name="descripcion" required aria-label="Detalle del gasto" placeholder="Detalle" maxLength={200} className={cn(campo, "sm:col-span-2")} />
      <input name="neto" required aria-label="Neto, sin IVA" placeholder="Neto, sin IVA" inputMode="decimal" className={campo} />
      <input name="iva" aria-label="IVA del comprobante" placeholder="IVA (si tiene)" inputMode="decimal" className={campo} />
      <input name="fecha" type="date" aria-label="Fecha del comprobante" defaultValue={hoy} className={campo} />
      <input name="comprobante" aria-label="Número de comprobante" placeholder="Comprobante (opcional)" maxLength={60} className={campo} />
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-strong">
        <input name="pagado" type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} className="size-5" />
        Ya está pagado
      </label>
      {pagado ? (
        <select name="medio" aria-label="Medio de pago" defaultValue="TRANSFERENCIA" className={campo}>
          {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
        </select>
      ) : (
        <span className="flex items-center text-sm text-muted">Queda por pagar</span>
      )}
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "sm:col-span-2")}>{ocupado ? "Guardando…" : "Registrar gasto"}</button>
      {error && <p role="alert" className="text-sm text-danger sm:col-span-4">{error}</p>}
    </form>
  );
}
