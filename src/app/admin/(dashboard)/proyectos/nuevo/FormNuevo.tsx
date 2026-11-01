"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { crearLead } from "@/lib/proyectos/acciones-ficha";
import { MONEDAS, TIPOS_EVENTO } from "@/lib/proyectos/gestion-core";

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
          const r = await crearLead(fd);
          if (r.ok) router.push(`/admin/proyectos/${r.id}`);
          else setError(r.error);
        })
      }
    >
      <label className={etiqueta}>Nombre del evento<input name="nombre" required maxLength={120} placeholder="Ej.: Convención anual de ventas" className={campo} /></label>
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
        <label className={etiqueta}>
          Tipo de evento
          <select name="tipoEvento" required defaultValue={TIPOS_EVENTO[0]} className={campo}>
            {TIPOS_EVENTO.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className={etiqueta}>Ciudad<input name="ciudad" maxLength={80} className={campo} /></label>
        <label className={etiqueta}>Fecha de inicio<input type="date" name="fechaEvento" className={campo} /></label>
        <label className={etiqueta}>Fecha de fin<input type="date" name="fechaFin" className={campo} /></label>
        <label className={etiqueta}>Invitados<input name="invitados" inputMode="numeric" className={campo} /></label>
        <label className={etiqueta}>
          Moneda de venta
          <select name="moneda" defaultValue="ARS" className={campo}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <label className={etiqueta}>Presupuesto estimado<input name="presupuestoEstimado" inputMode="decimal" className={campo} /></label>
      <label className={etiqueta}>Brief<textarea name="brief" rows={5} className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-strong" /></label>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "lg"), "justify-center")}>{ocupado ? "Creando…" : "Crear lead"}</button>
    </form>
  );
}
