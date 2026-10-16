"use client";

// ============================================================================
// useLectorDeRafaga — escucha el teclado y avisa cuando pasó el lector (no una persona).
// ============================================================================
//
// La máquina es `detectorDeRafaga` (lector-core.ts); acá sólo se engancha al teclado del
// navegador. Quien la usa dice QUÉ teclas mira (`acepta`): Vender, sólo las que caen FUERA de un
// campo; la Caja con lector, las del campo del lector. Cuando una ráfaga termina, se frena la
// tecla final (el Enter o el Tab son del lector: no tienen que tocar un botón ni mover el foco) y
// se llama `alLeer` con el código limpio. Con sufijo «ninguno», la lectura la cierra el tiempo.
//
// `lector: null` (sin el módulo `terminal`, o el perfil todavía no se leyó) = no escucha nada.
// Se suscribe UNA vez por configuración del lector: los re-render de la pantalla (cada tecla
// cambia su estado) no cortan una ráfaga a la mitad.

import { useEffect, useEffectEvent, useMemo } from "react";
import { detectorDeRafaga, UMBRAL_RAFAGA_MS, type LectorDelEquipo } from "./lector-core";

export function useLectorDeRafaga({
  lector,
  acepta,
  alLeer,
}: {
  lector: LectorDelEquipo | null;
  /** ¿Esta tecla se mira? Si no, la ráfaga en curso se olvida. */
  acepta: (e: KeyboardEvent) => boolean;
  alLeer: (codigo: string) => void;
}): void {
  const prefijo = lector?.prefijo;
  const sufijo = lector?.sufijo;
  const detector = useMemo(
    () => (prefijo !== undefined && sufijo !== undefined ? detectorDeRafaga({ lector: { prefijo, sufijo } }) : null),
    [prefijo, sufijo],
  );
  const mirar = useEffectEvent(acepta);
  const leer = useEffectEvent(alLeer);

  useEffect(() => {
    if (!detector) return;
    let reloj: ReturnType<typeof setTimeout> | null = null;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !mirar(e)) {
        detector.reiniciar();
        return;
      }
      const lectura = detector.tecla(e.key, performance.now(), e.repeat);
      if (lectura) {
        e.preventDefault();
        leer(lectura.valor);
        return;
      }
      if (sufijo === "ninguno") {
        if (reloj) clearTimeout(reloj);
        reloj = setTimeout(() => {
          const vencida = detector.vencer(performance.now());
          if (vencida) leer(vencida.valor);
        }, UMBRAL_RAFAGA_MS + 15);
      }
    };
    // En captura: la tecla final se frena ANTES de que la vea un botón o un formulario.
    window.addEventListener("keydown", alTeclear, true);
    return () => {
      window.removeEventListener("keydown", alTeclear, true);
      if (reloj) clearTimeout(reloj);
      detector.reiniciar();
    };
  }, [detector, sufijo]);
}
