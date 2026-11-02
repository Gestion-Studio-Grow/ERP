"use client";

import { useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";

const campo = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-strong";

export function FormularioConsulta({ negocio }: { negocio: string }) {
  const [enviando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  if (listo) {
    return (
      <div role="status" className="grid gap-2 rounded-2xl border border-line p-6 text-strong">
        <h2 className="text-xl font-semibold">¡Gracias por escribirnos!</h2>
        <p>{listo}</p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        iniciar(async () => {
          try {
            const r = await fetch("/api/consultas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(f.entries())) });
            const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; mensaje?: string } | null;
            if (j?.ok) setListo(j.mensaje ?? "Recibimos tu consulta.");
            else setError(j?.error ?? "No pudimos enviar tu consulta. Probá de nuevo.");
          } catch {
            setError("No pudimos enviar tu consulta. Revisá tu conexión y probá de nuevo.");
          }
        });
      }}
    >
      <p className="text-muted">Contanos qué necesitás y una persona de {negocio} te contacta.</p>
      <label className="grid gap-1 text-sm font-medium text-strong">
        Tu nombre
        <input name="nombre" autoComplete="name" maxLength={120} className={campo} />
      </label>
      <label className="grid gap-1 text-sm font-medium text-strong">
        Empresa o marca
        <input name="empresa" autoComplete="organization" maxLength={120} className={campo} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-strong">
          Mail
          <input name="email" type="email" autoComplete="email" maxLength={254} className={campo} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-strong">
          WhatsApp o teléfono
          <input name="telefono" type="tel" autoComplete="tel" maxLength={40} placeholder="11 2345 6789" className={campo} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">Dejanos al menos uno de los dos para poder responderte.</p>
      <label className="grid gap-1 text-sm font-medium text-strong">
        ¿Qué necesitás?
        <textarea name="mensaje" required minLength={5} maxLength={4000} rows={6} placeholder="Tipo de evento o activación, fecha, lugar, medidas del espacio…" className={cn(campo, "py-2")} />
      </label>
      {/* Campo trampa para bots: una persona no lo ve ni llega con el teclado. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar
          <input name="sitio" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {error && <p role="alert" className="font-medium text-danger">{error}</p>}
      <button type="submit" disabled={enviando} className={cn(buttonClasses("solid", "lg"), "justify-center")}>
        {enviando ? "Enviando…" : "Enviar consulta"}
      </button>
    </form>
  );
}
