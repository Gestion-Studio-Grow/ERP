"use client";

import { useActionState } from "react";
import { Field, Input, buttonClasses } from "@/components/ui";
import { confirmarIngresoConPin, reenviarPin, type EstadoDelPin } from "./acciones";

const INICIAL: EstadoDelPin = {};

export function FormularioPin({ next }: { next: string }) {
  const [estado, accion, enviando] = useActionState(confirmarIngresoConPin, INICIAL);
  const [reenvio, reenviar, reenviando] = useActionState(reenviarPin, INICIAL);

  return (
    <div className="grid gap-4">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        {estado.error && <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">{estado.error}</p>}
        <Field label="Código de 6 dígitos" htmlFor="codigo">
          <Input id="codigo" name="codigo" required autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]*" maxLength={7} />
        </Field>
        <button type="submit" disabled={enviando} className={buttonClasses("solid", "lg", "w-full mt-1")}>Entrar</button>
      </form>
      <form action={reenviar} className="grid gap-2">
        <p aria-live="polite" className="text-sm text-muted">{reenvio.aviso ?? ""}</p>
        <button type="submit" disabled={reenviando} className={buttonClasses("outline", "lg", "w-full")}>Mandame otro código</button>
      </form>
    </div>
  );
}
