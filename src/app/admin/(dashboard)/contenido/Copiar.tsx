"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/** «Copiar» con su confirmación hablada (aria-live). */
export function Copiar({ texto, que }: { texto: string; que: string }) {
  const [estado, setEstado] = useState<"" | "ok" | "error">("");
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setEstado("ok");
          } catch {
            setEstado("error");
          }
        }}
      >
        Copiar {que}
      </Button>
      <span aria-live="polite" className="text-xs text-muted">
        {estado === "ok" ? "Copiado ✔" : estado === "error" ? "No se pudo copiar: seleccioná el texto" : ""}
      </span>
    </span>
  );
}
