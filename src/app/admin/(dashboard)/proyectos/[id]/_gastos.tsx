"use client";

// La carga de un gasto del proyecto. Es de cliente para decir qué faltó sin perder lo tipeado, y para pedir el medio
// de pago sólo si ya se pagó.

import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { useRef, useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { registrarGasto } from "@/lib/proyectos/acciones";
import { MEDIOS, MEDIO_LABEL, pesos } from "@/lib/proyectos/core";
import { campo } from "../_vista";
import { nuevaClave } from "./_cliente";

export function FormGasto({ proyectoId, proveedores, rubros, hoy }: { proyectoId: string; proveedores: readonly string[]; rubros: readonly string[]; hoy: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pagado, setPagado] = useState(false);
  // El servidor no grabó y pide un sí explícito (la deuda ya está en el calendario de pagos): el texto de la casilla.
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  // La misma clave hasta que el servidor contesta: un doble clic o un reintento no carga el gasto dos veces (MIA-089 · V7).
  const clave = useRef<string | null>(null);

  return (
    <form
      ref={form}
      className="grid gap-2 sm:grid-cols-4"
      action={(fd) =>
        iniciar(async () => {
          setError(null);
          fd.set("claveEnvio", (clave.current ??= nuevaClave()));
          const r = await registrarGasto(fd);
          clave.current = null;
          setConfirmar(r.ok ? null : (r.confirmar ?? null));
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
      {confirmar && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-strong sm:col-span-4">
          <input type="checkbox" name="confirmaOtraDeuda" value="1" className="size-5" />
          {confirmar}
        </label>
      )}
    </form>
  );
}

/**
 * O13 (MIA-50 T05) · los costos de la ficha en cuatro columnas: lo presupuestado original, el adicional (lo que el
 * cliente aprueba aparte; arranca en cero), lo previsto (cuotas a proveedor sin comprobante) y el real (comprobantes
 * imputados + gastos). El real sale de la cuenta única `resultadoReal`: el mismo número que Dirección y Rentabilidad.
 */
export function CostosEnColumnas({
  original,
  adicional = 0,
  real,
}: {
  original: number | null;
  adicional?: number;
  real: { conGastos: boolean; costoReal: number; costoParaElPremio: number; imputado: number; gastos: number; previsto: number };
}) {
  const ejecutado = redondearAlCentavo(real.imputado + real.gastos);
  const columnas = [
    { titulo: "Original", valor: original === null ? "—" : pesos(original), nota: "presupuesto aprobado" },
    { titulo: "Adicional", valor: adicional > 0 ? pesos(adicional) : "—", nota: "aprobado aparte" },
    { titulo: "Previsto", valor: pesos(real.previsto), nota: "cuotas sin comprobante" },
    { titulo: "Real", valor: real.conGastos ? pesos(real.costoReal) : "—", nota: `${pesos(ejecutado)} cargado + previsto` },
  ];
  const sinAprobar = redondearAlCentavo(real.costoReal - real.costoParaElPremio);
  return (
    <div className="mb-3">
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="Costos en cuatro columnas">
        {columnas.map((c) => (
          <div key={c.titulo} className="rounded-md border border-line px-3 py-2">
            <dt className="text-xs text-muted">{c.titulo}</dt>
            <dd className="font-semibold tabular-nums text-strong">{c.valor}</dd>
            <dd className="text-xs text-muted">{c.nota}</dd>
          </div>
        ))}
      </dl>
      {real.conGastos && (
        <p className="mt-1 text-xs text-muted">
          Del real: {pesos(real.imputado)} de comprobantes imputados y {pesos(real.gastos)} de gastos.
          {sinAprobar > 0 && ` Para el premio cuenta ${pesos(real.costoParaElPremio)}: faltan aprobar rendiciones por ${pesos(sinAprobar)}.`}
        </p>
      )}
    </div>
  );
}
