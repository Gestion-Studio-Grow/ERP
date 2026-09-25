"use client";

// Revelado único de una contraseña temporal en la consola (el alta de un negocio y el reseteo de
// la contraseña del dueño). El valor llega por el retorno de la action y vive sólo en el estado de
// esta pantalla: nunca va por la URL, no se guarda ni se registra. Al recargar se pierde (y se
// resetea de nuevo). Copia al portapapeles; si no hay portapapeles, el código se selecciona entero.
//
// Reemplaza en la consola a src/components/BootstrapReveal.tsx (que lleva un emoji como ícono).

import { useState } from "react";
import { Button } from "@/components/ui";

export function RevelarClave({ clave, para }: { clave: string; para: React.ReactNode }) {
  const [copiada, setCopiada] = useState(false);
  return (
    <div role="status" className="space-y-2 border-y border-line-strong bg-surface-raised px-3 py-3">
      <p className="text-sm text-strong">
        Contraseña temporal de {para}. Se muestra <b>una sola vez</b>: copiala y pasásela por un canal seguro.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="select-all break-all rounded bg-surface-sunken px-2 py-1.5 font-mono text-base text-strong">{clave}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(clave);
              setCopiada(true);
              setTimeout(() => setCopiada(false), 2000);
            } catch {
              /* sin portapapeles: el código se selecciona con un toque */
            }
          }}
        >
          {copiada ? "Copiada" : "Copiar"}
        </Button>
      </div>
      <p className="text-[13px] text-muted">Si cerrás o recargás esta pantalla, no vuelve a aparecer: se resetea de nuevo.</p>
    </div>
  );
}
