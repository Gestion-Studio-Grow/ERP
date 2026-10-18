"use client";

// ============================================================================
// «BLOQUEAR» — el botón (y el hook) para bloquear el club ya, desde donde lo monte la recepción (la cinta).
// ============================================================================
//
// Es liviano a propósito: no trae la pantalla de bloqueo (esa es la pieza global `bloqueo`, en su chunk), sólo
// `bloquearElClub` (bloqueo-core.ts), que deja sin operador y anota por qué. La pieza lo ve y tapa todo con el PIN.
// En la demo no aparece: ahí no se bloquea (opera el usuario de ejemplo). También anda con la tecla L (la pieza).

import { useCallback } from "react";
import { Button } from "@/components/ui/Button";
import type { Almacen } from "./almacen";
import { bloquearElClub } from "./bloqueo-core";
import { useOperador } from "./usar-almacen";

/** `bloquear()` bloquea ya (motivo «a mano»); `puedeBloquear`: jornada real con alguien operando. */
export function useBloqueo(almacen: Almacen): { bloquear: () => void; puedeBloquear: boolean } {
  const operador = useOperador(almacen);
  const bloquear = useCallback(() => {
    bloquearElClub(almacen, "manual");
  }, [almacen]);
  return { bloquear, puedeBloquear: almacen.modo() === "real" && operador !== null };
}

/** «Bloquear» (L): para la cinta, a la derecha de la hora. Sin operador o en la demo no se pinta. */
export function BotonBloquearAhora({ almacen }: { almacen: Almacen }) {
  const { bloquear, puedeBloquear } = useBloqueo(almacen);
  if (!puedeBloquear) return null;
  return (
    <Button variant="outline" size="md" atajo="L" onClick={bloquear} aria-keyshortcuts="L">
      Bloquear
    </Button>
  );
}
