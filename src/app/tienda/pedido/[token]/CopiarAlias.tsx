"use client";

// «Copiar alias»: al portapapeles, con la confirmación leída por el lector de pantalla.
import { useState } from "react";

export default function CopiarAlias({ alias }: { alias: string }) {
  const [estado, setEstado] = useState<"" | "ok" | "no">("");
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-line-strong bg-surface-raised px-4 text-sm font-medium text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={() => {
          navigator.clipboard?.writeText(alias).then(
            () => setEstado("ok"),
            () => setEstado("no"),
          ) ?? setEstado("no");
        }}
      >
        Copiar alias
      </button>
      <span role="status" className="text-sm text-muted">
        {estado === "ok" ? "Copiado" : estado === "no" ? "No se pudo copiar: anotalo a mano" : ""}
      </span>
    </div>
  );
}
