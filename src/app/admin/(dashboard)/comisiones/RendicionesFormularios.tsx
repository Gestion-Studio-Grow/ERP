"use client";

// Los dos formularios de la pestaña «Rendiciones» (NAIL-ARTIST.md §5): registrar lo que la profesional
// rindió (profesional, mes, medio y nota; el monto lo calcula el servidor) y cargar su alquiler / %.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarConfigDeRendicion, registrarRendicion, type ResultadoRendicion } from "@/lib/rendicion-actions";
import { Input, Select, buttonClasses } from "@/components/ui";

function useEnvio(accion: (fd: FormData) => Promise<ResultadoRendicion>) {
  const router = useRouter();
  const [estado, setEstado] = useState<ResultadoRendicion | null>(null);
  const [pendiente, empezar] = useTransition();
  const enviar = (fd: FormData) =>
    empezar(async () => {
      const r = await accion(fd);
      setEstado(r);
      if (r.ok) router.refresh();
    });
  return { estado, pendiente, enviar };
}

function Aviso({ estado }: { estado: ResultadoRendicion | null }) {
  if (!estado) return null;
  return estado.ok ? (
    <p role="status" className="text-sm text-success">
      {estado.mensaje}
    </p>
  ) : (
    <p role="alert" className="text-sm text-danger">
      {estado.error}
    </p>
  );
}

export function RegistrarRendicion({ professionalId, mes, nombre }: { professionalId: string; mes: string; nombre: string }) {
  const { estado, pendiente, enviar } = useEnvio(registrarRendicion);
  return (
    <form action={enviar} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="professionalId" value={professionalId} />
      <input type="hidden" name="mes" value={mes} />
      <label className="text-sm">
        <span className="block text-muted">Cómo te la rindió</span>
        <Select name="method" defaultValue="TRANSFERENCIA" aria-label={`Medio de la rendición de ${nombre}`}>
          <option value="TRANSFERENCIA">Transferencia</option>
          <option value="EFECTIVO">Efectivo</option>
          <option value="MP">Mercado Pago</option>
        </Select>
      </label>
      <label className="text-sm">
        <span className="block text-muted">Nota (opcional)</span>
        <Input name="note" maxLength={200} autoComplete="off" />
      </label>
      <button type="submit" disabled={pendiente} aria-busy={pendiente || undefined} className={buttonClasses("solid", "md", "min-h-11")}>
        {pendiente ? "Registrando…" : "Registrar rendición"}
      </button>
      <div className="basis-full">
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function ConfigDeRendicion({
  professionalId,
  nombre,
  boxRentAmount,
  rentPercent,
}: {
  professionalId: string;
  nombre: string;
  boxRentAmount: number | null;
  rentPercent: number | null;
}) {
  const { estado, pendiente, enviar } = useEnvio(guardarConfigDeRendicion);
  return (
    <form action={enviar} className="flex flex-wrap items-end gap-2 border-b border-line py-3">
      <input type="hidden" name="professionalId" value={professionalId} />
      <p className="basis-full text-sm font-medium text-strong sm:basis-auto sm:min-w-32">{nombre}</p>
      <label className="text-sm">
        <span className="block text-muted">Alquiler del box por mes ($)</span>
        <Input name="boxRentAmount" inputMode="decimal" defaultValue={boxRentAmount ?? ""} autoComplete="off" />
      </label>
      <label className="text-sm">
        <span className="block text-muted">% de lo que cobra</span>
        <Input name="rentPercent" inputMode="decimal" defaultValue={rentPercent ?? ""} autoComplete="off" />
      </label>
      <button type="submit" disabled={pendiente} aria-busy={pendiente || undefined} className={buttonClasses("outline", "md", "min-h-11")}>
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
      <div className="basis-full">
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
