"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, Input, buttonClasses } from "@/components/ui";
import { desbloquear, type EstadoDelDesbloqueo } from "./acciones";

const INICIAL: EstadoDelDesbloqueo = {};

export function FormularioDesbloqueo({ next }: { next: string }) {
  const [estado, accion, enviando] = useActionState(desbloquear, INICIAL);
  return (
    <div className="grid gap-3">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        {estado.error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {estado.error}
          </p>
        )}
        <Field label="Tu PIN de 4 números" htmlFor="pin">
          <Input
            id="pin"
            name="pin"
            type="password"
            required
            autoFocus
            autoComplete="off"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            aria-invalid={estado.error ? true : undefined}
          />
        </Field>
        <button type="submit" disabled={enviando} className={buttonClasses("solid", "lg", "w-full mt-1")}>
          Seguir
        </button>
      </form>
      <Link href={`/admin/login?next=${encodeURIComponent(next)}`} className="flex min-h-11 items-center justify-center text-sm text-muted underline">
        Entrar con la contraseña
      </Link>
    </div>
  );
}
