"use client";
// FACTOQUE · Formulario del Botón de arrepentimiento y del Botón de baja (src/lib/factoque-tramites.ts).
// Email + CUIT + motivo opcional. Al terminar muestra el número de trámite y el enlace para avisarle
// a GSG por su canal (WhatsApp o mail). Lo usan la página pública (sin cuenta) y Mi cuenta (con sesión).

import { useActionState, useId } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import type { ResultadoTramite } from "@/lib/factoque-tramites-actions";
import type { TipoTramite } from "@/lib/factoque-tramites";

export default function FormularioTramite({
  tipo,
  accion,
  emailInicial = "",
  cuitInicial = "",
  boton,
}: {
  tipo: TipoTramite;
  accion: (prev: ResultadoTramite | null, fd: FormData) => Promise<ResultadoTramite>;
  emailInicial?: string;
  cuitInicial?: string;
  boton: string;
}) {
  const [r, enviar, enviando] = useActionState(accion, null);
  const id = useId();

  if (r?.ok) {
    return (
      <div role="status" data-testid="tramite-hecho" className="flex flex-col gap-3 rounded-xl border border-line bg-surface-raised px-4 py-4 text-sm text-body">
        <p className="m-0 text-base font-semibold text-strong" data-testid="tramite-numero">
          Trámite N.º {r.numero}
        </p>
        <p className="m-0">{r.mensaje}</p>
        <p className="m-0">Guardá este número. Para que lo veamos ya, avisanos:</p>
        <a
          href={r.avisoHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center self-start rounded-lg border border-line px-4 font-medium text-strong underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {r.canal === "whatsapp" ? "Avisar a Gestión Studio Grow por WhatsApp" : "Avisar a Gestión Studio Grow por mail"}
        </a>
      </div>
    );
  }

  const error = r && !r.ok ? r : null;
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="tipo" value={tipo} />
      {error && !error.campo && (
        <p role="alert" className="m-0 rounded-lg border border-danger px-3 py-2 text-sm text-strong">
          {error.error}
        </p>
      )}
      <Field label="Tu email" htmlFor={`${id}-email`} required hint="Ahí te mandamos la constancia." error={error?.campo === "email" ? error.error : undefined}>
        <Input id={`${id}-email`} name="email" type="email" autoComplete="email" defaultValue={emailInicial} required />
      </Field>
      <Field label="Tu CUIT" htmlFor={`${id}-cuit`} required hint="El de tu cuenta de Factoque, 11 números." error={error?.campo === "cuit" ? error.error : undefined}>
        <Input id={`${id}-cuit`} name="cuit" inputMode="numeric" autoComplete="off" defaultValue={cuitInicial} required />
      </Field>
      <Field label="¿Por qué? (opcional)" htmlFor={`${id}-motivo`} hint="No hace falta que lo digas.">
        <Textarea id={`${id}-motivo`} name="motivo" rows={3} maxLength={300} />
      </Field>
      <Button type="submit" variant="danger" className="min-h-11 self-start" disabled={enviando}>
        {enviando ? "Enviando…" : boton}
      </Button>
    </form>
  );
}
