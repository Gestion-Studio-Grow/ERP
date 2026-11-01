"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { crearProyecto } from "@/lib/proyectos/acciones";
import { SERVICIOS, SERVICIO_LABEL } from "@/lib/proyectos/core";

const campo = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-strong";
const etiqueta = "grid gap-1 text-sm font-medium text-strong";

export default function FormNuevo({ clientes }: { clientes: { id: string; name: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();

  return (
    <form
      className="grid gap-4"
      action={(fd) =>
        iniciar(async () => {
          setError(null);
          const r = await crearProyecto(fd);
          if (r.ok) router.push(`/admin/proyectos/${r.id}`);
          else setError(r.error);
        })
      }
    >
      <label className={etiqueta}>Nombre del proyecto<input name="nombre" required maxLength={120} placeholder="Ej.: Stand en Expo Rural" className={campo} /></label>
      <label className={etiqueta}>
        Servicio
        <select name="servicio" required defaultValue="ARQUITECTURA" className={campo}>
          {SERVICIOS.map((s) => <option key={s} value={s}>{SERVICIO_LABEL[s]}</option>)}
        </select>
      </label>
      <label className={etiqueta}>
        Cliente
        <select name="clienteId" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={campo}>
          <option value="">Cliente nuevo…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {!clienteId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={etiqueta}>Nombre del cliente nuevo<input name="clienteNuevo" maxLength={120} className={campo} /></label>
          <label className={etiqueta}>WhatsApp o teléfono<input name="telefono" inputMode="tel" maxLength={30} className={campo} /></label>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={etiqueta}>Evento o feria<input name="evento" maxLength={120} className={campo} /></label>
        <label className={etiqueta}>Lugar<input name="lugar" maxLength={120} className={campo} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={etiqueta}>Armado<input type="date" name="fechaArmado" className={campo} /></label>
        <label className={etiqueta}>Evento<input type="date" name="fechaEvento" className={campo} /></label>
        <label className={etiqueta}>Desarme<input type="date" name="fechaDesarme" className={campo} /></label>
      </div>
      <label className={etiqueta}>Responsable<input name="responsable" maxLength={80} className={campo} /></label>
      <label className={etiqueta}>Qué pidió el cliente<textarea name="brief" rows={5} className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong" /></label>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "lg"), "justify-center")}>{ocupado ? "Creando…" : "Crear proyecto"}</button>
    </form>
  );
}
