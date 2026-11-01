"use client";

import { useActionState } from "react";
import { Field, Input, buttonClasses } from "@/components/ui";
import { confirmarSegundoPaso, type EstadoDelPaso } from "./acciones";

const INICIAL: EstadoDelPaso = {};

export function FormularioSegundoPaso({ next, activando, destinoListo }: { next: string; activando: boolean; destinoListo: string | null }) {
  const [estado, accion, enviando] = useActionState(confirmarSegundoPaso, INICIAL);

  if (estado.codigos) {
    return (
      <div className="grid gap-3">
        <h2 className="font-semibold text-strong">Guardá tus códigos de respaldo</h2>
        <p className="text-sm text-muted">Sirven si perdés el teléfono. Cada uno se usa una sola vez y no se vuelven a mostrar.</p>
        <ul className="grid grid-cols-1 gap-1 rounded-md border border-line p-3 font-mono text-sm text-strong sm:grid-cols-2">
          {estado.codigos.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <a href={estado.destino ?? "/admin"} className={buttonClasses("solid", "lg", "w-full")}>Ya los guardé, entrar</a>
      </div>
    );
  }

  if (destinoListo) return <a href={destinoListo} className={buttonClasses("solid", "lg", "w-full")}>Entrar</a>;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {estado.error && <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">{estado.error}</p>}
      <Field label={activando ? "Código de 6 dígitos" : "Código de 6 dígitos o de respaldo"} htmlFor="codigo">
        <Input id="codigo" name="codigo" required autoFocus autoComplete="one-time-code" inputMode={activando ? "numeric" : "text"} maxLength={40} />
      </Field>
      <button type="submit" disabled={enviando} className={buttonClasses("solid", "lg", "w-full mt-1")}>{activando ? "Activar y entrar" : "Entrar"}</button>
    </form>
  );
}
