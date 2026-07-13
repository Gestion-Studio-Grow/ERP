"use client";

// REVELADO ÚNICO de una contraseña (P10 de RFC-003) — FUENTE ÚNICA reusada por el wizard de alta
// (bootstrap del OWNER) y por el reset de contraseña de la consola de operador.
//
// El valor vive SOLO en estado de cliente, entregado por el retorno de un Server Action (nunca en
// la URL, nunca persistido, nunca logueado). Al recargar o navegar se pierde: si se perdió, se
// vuelve a resetear. Copia al portapapeles; si no hay portapapeles, el <code> es `select-all`.

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";

export function BootstrapReveal({
  password,
  label = "Contraseña temporal (se muestra una sola vez, copiala y guardala):",
}: {
  password: string;
  label?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-line p-3 space-y-2">
      <p className="text-sm">
        🔑 {label}
      </p>
      <div className="flex items-center gap-2">
        <code className="font-mono text-sm bg-surface-sunken rounded px-2 py-1 select-all break-all">
          {password}
        </code>
        <Button
          variant="subtle"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* sin portapapeles: el código es select-all */
            }
          }}
        >
          {copied ? "Copiado ✓" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}
