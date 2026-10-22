"use client";

// «Tenés cambios sin guardar» (M-078): mientras la grilla de Horarios tiene cambios sin guardar,
// - cerrar la pestaña o recargar pide confirmación del navegador (`beforeunload`), y
// - tocar un link del panel (la barra de abajo, la campana, «‹ Ajustes») pregunta antes de irse.
// El aviso del link se escucha en la fase de captura del documento: corre antes que el <Link> de
// Next y, si el profe dice que no, el link no navega.

import { useEffect } from "react";

export const TEXTO_SALIDA = "Tenés cambios sin guardar. ¿Salís igual?";

export function useAvisoSalida(sucio: boolean) {
  useEffect(() => {
    if (!sucio) return;
    const antesDeCerrar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const alTocar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const destino = new URL(a.href, window.location.href);
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return;
      if (!window.confirm(TEXTO_SALIDA)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", antesDeCerrar);
    document.addEventListener("click", alTocar, true);
    return () => {
      window.removeEventListener("beforeunload", antesDeCerrar);
      document.removeEventListener("click", alTocar, true);
    };
  }, [sucio]);
}
