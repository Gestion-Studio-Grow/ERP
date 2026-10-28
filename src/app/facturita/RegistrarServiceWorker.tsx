"use client";

// Registra el service worker MÍNIMO de Facturita (public/facturita/sw.js, alcance /facturita/).
// Se registra por URL de texto, no con `new URL(…, import.meta.url)`: el archivo es estático de
// public/ y no tiene que pasar por el empaquetador. Sin UI y sin estado: si el navegador no
// soporta service workers, o falla el registro, la app anda igual (sólo no muestra la página
// «sin conexión»).

import { useEffect } from "react";
import { SCOPE_FACTURITA, SW_FACTURITA_URL } from "@/lib/facturita-pwa";

export default function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // En desarrollo no: un SW vivo en localhost confunde los recargos en caliente.
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register(SW_FACTURITA_URL, { scope: SCOPE_FACTURITA, updateViaCache: "none" })
      .catch(() => {
        /* sin SW la app funciona igual; no hay nada que avisarle a la persona */
      });
  }, []);
  return null;
}
