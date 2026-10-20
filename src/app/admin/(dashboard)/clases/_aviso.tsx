"use client";

// La barra de abajo con el resultado de la última acción y el botón verde de WhatsApp.
//
// Vive en el layout de Clases, no en la tarjeta: al confirmar un pedido o validar un
// comprobante la acción refresca la pantalla y esa tarjeta sale de la lista. Si el botón
// estuviera adentro, se iría con ella antes de que el profe lo toque. Acá queda hasta que lo
// toca (abre WhatsApp con el texto listo) o toca "Listo".

import { createContext, useContext, useState } from "react";
import { buttonClasses, cn } from "@/components/ui";

export type AvisoAccion = { texto: string; wa?: string | null; enviado?: boolean; nombre: string };

const Ctx = createContext<(a: AvisoAccion | null) => void>(() => {});

export const useAvisoAccion = () => useContext(Ctx);

export function AvisoProvider({ children }: { children: React.ReactNode }) {
  const [aviso, setAviso] = useState<AvisoAccion | null>(null);
  return (
    <Ctx.Provider value={setAviso}>
      {children}
      {aviso && <div aria-hidden className="h-40" />}
      {aviso && (
        <div
          role="status"
          data-qa="aviso-ok"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface-raised px-4 pt-3 shadow-overlay"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto grid max-w-3xl gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-sm font-semibold text-strong">
                ✓ {aviso.texto}
                {aviso.enviado && " · le llegó el WhatsApp"}
              </p>
              <button type="button" onClick={() => setAviso(null)} className={cn(buttonClasses("outline", "sm"), "shrink-0")} data-qa="listo">
                Listo
              </button>
            </div>
            {aviso.wa && (
              <a
                href={aviso.wa}
                target="_blank"
                rel="noopener noreferrer"
                data-qa="avisar-alumno"
                onClick={() => setTimeout(() => setAviso(null), 400)}
                className="flex h-12 items-center justify-center rounded-xl px-3 text-base font-bold"
                style={{ background: "var(--success)", color: "var(--surface-raised)" }}
              >
                Avisarle a {aviso.nombre.split(" ")[0]} por WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
