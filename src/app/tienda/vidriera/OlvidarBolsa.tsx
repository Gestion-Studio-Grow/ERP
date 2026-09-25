"use client";

// Después de «Enviar pedido» el servidor lleva a la página de seguimiento: la bolsa guardada en el
// navegador ya es un pedido y no tiene que volver a aparecer. Se borra SÓLO si esta sesión la acaba de
// enviar (la marca que deja `marcarEnvio`) y sigue siendo la misma: abrir el enlace de seguimiento
// desde otro lado no le borra a nadie lo que tiene armado.

import { useEffect } from "react";
import { CLAVE_BOLSA, CLAVE_ENVIO } from "./useVidriera";

export function OlvidarBolsa({ tenantKey }: { tenantKey: string }) {
  useEffect(() => {
    try {
      const enviada = window.sessionStorage.getItem(CLAVE_ENVIO(tenantKey));
      if (enviada === null) return;
      if (window.localStorage.getItem(CLAVE_BOLSA(tenantKey)) === enviada) window.localStorage.removeItem(CLAVE_BOLSA(tenantKey));
      window.sessionStorage.removeItem(CLAVE_ENVIO(tenantKey));
    } catch {
      /* sin almacenamiento no hay nada que olvidar */
    }
  }, [tenantKey]);
  return null;
}
