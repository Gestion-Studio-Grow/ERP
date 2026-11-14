"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, Input, buttonClasses } from "@/components/ui";
import { definirPin, type EstadoDelPinNuevo } from "./acciones";

const INICIAL: EstadoDelPinNuevo = {};

const propsDelPin = {
  type: "password",
  required: true,
  autoComplete: "off",
  inputMode: "numeric",
  pattern: "[0-9]{4}",
  maxLength: 4,
} as const;

export function FormularioPinNuevo({ next }: { next: string }) {
  const [estado, accion, enviando] = useActionState(definirPin, INICIAL);
  return (
    <div className="grid gap-3">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        {estado.error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {estado.error}
          </p>
        )}
        <Field label="PIN de 4 números" htmlFor="pin">
          <Input id="pin" name="pin" autoFocus {...propsDelPin} />
        </Field>
        <Field label="Repetilo" htmlFor="confirmacion">
          <Input id="confirmacion" name="confirmacion" {...propsDelPin} />
        </Field>
        <button type="submit" disabled={enviando} className={buttonClasses("solid", "lg", "w-full mt-1")}>
          Guardar el PIN
        </button>
      </form>
      <Link href={next} className="flex min-h-11 items-center justify-center text-sm text-muted underline">
        Ahora no
      </Link>
    </div>
  );
}
