"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

type GlobalLoadingContextValue = {
  isLoading: boolean;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

export function useGlobalLoading() {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) throw new Error("useGlobalLoading debe usarse dentro de GlobalLoadingProvider");
  return ctx;
}

// Espera antes de mostrar el overlay, para no parpadear en acciones que
// resuelven casi instantáneo (estilo busy indicator de SAP).
const SHOW_DELAY_MS = 150;

// Marca en window: evita parchear fetch dos veces si React Strict Mode (dev)
// monta este provider, lo desmonta y lo vuelve a montar en la misma pasada.
const PATCH_FLAG = "__erpGlobalLoadingFetchPatched";

function hasNextActionHeader(init: RequestInit | undefined): boolean {
  const headers = init?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("next-action");
  if (Array.isArray(headers)) return headers.some(([key]) => key.toLowerCase() === "next-action");
  return Object.keys(headers).some((key) => key.toLowerCase() === "next-action");
}

// Detecta toda invocación de Server Action (form action={fn} o llamada
// imperativa a una función "use server") interceptando window.fetch: en esta
// versión de Next, ambos caminos convergen en un único fetch() con el header
// `next-action` seteado (ver node_modules/next/dist/client/components/
// router-reducer/reducers/server-action-reducer.js). Es el único punto común
// a todas las mutaciones/lecturas del backoffice — no requiere tocar cada
// formulario.
export default function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const pendingCount = useRef(0);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function start() {
      pendingCount.current += 1;
      if (pendingCount.current === 1 && showTimer.current === null) {
        showTimer.current = setTimeout(() => {
          showTimer.current = null;
          setVisible(true);
        }, SHOW_DELAY_MS);
      }
    }

    function stop() {
      pendingCount.current = Math.max(0, pendingCount.current - 1);
      if (pendingCount.current === 0) {
        if (showTimer.current !== null) {
          clearTimeout(showTimer.current);
          showTimer.current = null;
        }
        setVisible(false);
      }
    }

    const win = window as typeof window & { [PATCH_FLAG]?: boolean };
    if (win[PATCH_FLAG]) return;

    const originalFetch = window.fetch.bind(window);
    win[PATCH_FLAG] = true;

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const isServerAction =
        hasNextActionHeader(init) || (input instanceof Request && hasNextActionHeader(input));

      if (!isServerAction) return originalFetch(input, init);

      start();
      try {
        return await originalFetch(input, init);
      } finally {
        stop();
      }
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
      delete win[PATCH_FLAG];
      if (showTimer.current !== null) clearTimeout(showTimer.current);
    };
  }, []);

  useEffect(() => {
    if (visible) overlayRef.current?.focus();
  }, [visible]);

  return (
    <GlobalLoadingContext.Provider value={{ isLoading: visible }}>
      <div inert={visible || undefined}>{children}</div>
      {visible && (
        <div
          ref={overlayRef}
          role="status"
          aria-live="polite"
          aria-busy="true"
          tabIndex={-1}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 outline-none"
        >
          <span className="global-loading-spinner" aria-hidden="true" />
          <span className="sr-only">Cargando…</span>
        </div>
      )}
    </GlobalLoadingContext.Provider>
  );
}
