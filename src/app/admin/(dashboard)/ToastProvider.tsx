"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { Aviso } from "@/components/ui/Aviso";

type Toast = { id: number; message: string; kind: "error" | "success" };
type ToastContextValue = {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // Diseño nuevo: cada aviso es la pieza `Aviso` (la misma de «Deshacer»), que cuenta su propio
  // tiempo y lo pausa con el puntero o el foco encima. Apagado (CH hoy): igual que siempre, 4 s fijos.
  const nuevo = useDiseno();

  const sacar = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message: string, kind: Toast["kind"]) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, kind }]);
    if (!nuevo) setTimeout(() => sacar(id), 4000);
  }, [nuevo, sacar]);

  const showError = useCallback((message: string) => push(message, "error"), [push]);
  const showSuccess = useCallback((message: string) => push(message, "success"), [push]);

  return (
    <ToastContext.Provider value={{ showError, showSuccess }}>
      {children}
      {/* Se apoya ENCIMA de la barra de espacios del celular (piloto): `--alto-barra-inferior` la
          define layout.tsx y vale 0 sin barra (PC, CH), así que ahí queda en bottom-4 como siempre.
          El contenedor no captura toques: sólo cada aviso, así no bloquea lo que queda debajo. */}
      <div className="pointer-events-none fixed bottom-[calc(1rem_+_var(--alto-barra-inferior,0px))] right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) =>
          nuevo ? (
            <Aviso key={t.id} mensaje={t.message} tono={t.kind === "error" ? "error" : "exito"} onTermina={() => sacar(t.id)} />
          ) : (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto rounded-md px-4 py-3 text-sm shadow-lg toast-enter ${
              t.kind === "error"
                ? "bg-red-600 text-white"
                : "bg-neutral-900 text-white"
            }`}
          >
            {t.message}
          </div>
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}
