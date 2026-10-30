"use client";

// LA BOLSA QUE NO SE PIERDE (ronda 2, P0-3). Shine, A Dos Manos y Magra guardaban la bolsa en un `useState`: recargar,
// volver de WhatsApp o tocar «atrás» la vaciaba. Ahora se guarda en el navegador, por negocio, con la MISMA clave que
// usa Qué Bien Olés (`useVidriera`) y la misma limpieza en la página de gracias (`OlvidarBolsa`, vía `marcarEnvio`).
// Al leerla no se le cree nada: sólo productos que la vidriera tiene hoy y cantidades sanas (`limpiarBolsaGuardada`).

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { limpiarBolsaGuardada } from "./bolsa";
import { CLAVE_BOLSA, CLAVE_ENVIO } from "./claves";

export function useBolsaGuardada(
  tenantKey: string,
  ids: readonly string[],
): {
  bolsa: Record<string, number>;
  setBolsa: Dispatch<SetStateAction<Record<string, number>>>;
  /** Antes de mandar por «Enviar pedido» (el alta redirige a gracias y acá no vuelve nada): anota qué bolsa salió. */
  marcarEnvio: (via: string | null) => void;
} {
  const [bolsa, setBolsa] = useState<Record<string, number>>({});
  const leida = useRef(false);
  // La lista de ids cambia de identidad en cada render del padre; la clave estable es su contenido.
  const firma = ids.join("|");
  const validos = useMemo(() => new Set(firma ? firma.split("|") : []), [firma]);

  // Recuperar la bolsa guardada, una vez por negocio, después de hidratar (el HTML del servidor va vacío).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLAVE_BOLSA(tenantKey));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la bolsa guardada sólo existe en el navegador: se lee después de hidratar
      if (raw) setBolsa(limpiarBolsaGuardada(JSON.parse(raw), validos));
    } catch {
      // Sin almacenamiento (modo privado, cuota llena) o JSON roto: la bolsa arranca vacía. No es un error.
    }
    leida.current = true;
  }, [tenantKey, validos]);

  useEffect(() => {
    if (!leida.current) return;
    try {
      const k = CLAVE_BOLSA(tenantKey);
      if (Object.keys(bolsa).length === 0) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, JSON.stringify(bolsa));
    } catch {
      /* sin almacenamiento no se guarda, y nada más */
    }
  }, [bolsa, tenantKey]);

  const marcarEnvio = useCallback(
    (via: string | null) => {
      if (via !== "tienda") return;
      try {
        window.sessionStorage.setItem(CLAVE_ENVIO(tenantKey), JSON.stringify(bolsa));
      } catch {
        /* sin almacenamiento, no hay bolsa guardada que olvidar */
      }
    },
    [bolsa, tenantKey],
  );

  return { bolsa, setBolsa, marcarEnvio };
}
