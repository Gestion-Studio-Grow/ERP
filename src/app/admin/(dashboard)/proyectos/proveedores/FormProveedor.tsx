"use client";

import { useRef, useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { crearProveedor } from "@/lib/proyectos/acciones";
import { campo } from "../_vista";

export function FormProveedor() {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className="grid gap-2 sm:grid-cols-5"
      action={(fd) =>
        iniciar(async () => {
          setError(null);
          const r = await crearProveedor(fd);
          if (!r.ok) return setError(r.error);
          form.current?.reset();
        })
      }
    >
      <input name="name" required aria-label="Nombre o razón social" placeholder="Nombre o razón social" maxLength={120} className={cn(campo, "sm:col-span-2")} />
      <input name="taxId" aria-label="CUIT" placeholder="CUIT (opcional)" inputMode="numeric" className={campo} />
      <input name="phone" aria-label="Teléfono" placeholder="Teléfono" className={campo} />
      <input name="email" type="email" aria-label="Correo" placeholder="Correo" className={campo} />
      <button type="submit" disabled={ocupado} className={cn(buttonClasses("solid", "md"), "sm:col-span-5 sm:justify-self-start")}>{ocupado ? "Guardando…" : "Sumar proveedor"}</button>
      {error && <p role="alert" className="text-sm text-danger sm:col-span-5">{error}</p>}
    </form>
  );
}
