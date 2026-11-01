"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { guardarProveedor } from "@/lib/proyectos/acciones-gestion";
import { MONEDAS, RUBROS } from "@/lib/proyectos/gestion-core";
import { campo, etiqueta } from "../_vista";

export interface ValoresProveedor {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  fichaDeProyecto: { rubro: string | null; ciudad: string | null; condiciones: string; anticipoPct: number; evaluacion: number; moneda: string; notas: string } | null;
}

export function FormProveedor({ valores }: { valores?: ValoresProveedor }) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const f = valores?.fichaDeProyecto;

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      action={(fd) =>
        iniciar(async () => {
          setError(null);
          try {
            const r = await guardarProveedor(fd);
            if (!r.ok) return setError(r.error);
            router.push(`/admin/proyectos/proveedores/${r.id}`);
          } catch {
            setError("No se pudo guardar. Probá de nuevo.");
          }
        })
      }
    >
      {valores && <input type="hidden" name="id" value={valores.id} />}
      <label className={etiqueta}>Nombre o razón social<input name="name" required maxLength={120} defaultValue={valores?.name} className={campo} /></label>
      <label className={etiqueta}>
        Rubro
        <select name="rubro" defaultValue={f?.rubro ?? ""} className={campo}>
          <option value="">Sin rubro</option>
          {RUBROS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label className={etiqueta}>Ciudad<input name="ciudad" maxLength={80} defaultValue={f?.ciudad ?? ""} className={campo} /></label>
      <label className={etiqueta}>CUIT (opcional)<input name="taxId" inputMode="numeric" defaultValue={valores?.taxId ?? ""} className={campo} /></label>
      <label className={etiqueta}>Teléfono<input name="phone" type="tel" defaultValue={valores?.phone ?? ""} className={campo} /></label>
      <label className={etiqueta}>Mail<input name="email" type="email" defaultValue={valores?.email ?? ""} className={campo} /></label>
      <label className={cn(etiqueta, "sm:col-span-2")}>Condiciones<input name="condiciones" maxLength={300} defaultValue={f?.condiciones ?? "50% anticipo / 50% contra entrega"} className={campo} /></label>
      <label className={etiqueta}>
        % de anticipo
        <input name="anticipoPct" type="number" min={0} max={100} step={1} required defaultValue={f?.anticipoPct ?? 50} className={campo} />
        <span className="text-xs font-normal text-muted">Las cuotas de un proyecto confirmado no cambian hasta que se vuelve a guardar su ficha.</span>
      </label>
      <label className={etiqueta}>
        Evaluación (1 a 5)
        <input name="evaluacion" type="number" min={1} max={5} step={0.5} required defaultValue={f?.evaluacion ?? 4} className={campo} />
      </label>
      <label className={etiqueta}>
        Moneda habitual
        <select name="moneda" defaultValue={f?.moneda ?? "ARS"} className={campo}>
          {MONEDAS.map((m) => <option key={m} value={m}>{m === "ARS" ? "Pesos" : "Dólares"}</option>)}
        </select>
      </label>
      <label className={cn(etiqueta, "sm:col-span-2")}>Notas<textarea name="notas" rows={3} maxLength={2000} defaultValue={f?.notas ?? ""} className={cn(campo, "py-2")} /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={ocupado} className={buttonClasses("solid", "md")}>{ocupado ? "Guardando…" : "Guardar"}</button>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}
