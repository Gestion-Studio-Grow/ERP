"use client";

// EL NEGOCIO DEL CLUB a mano para las piezas hondas (el aviso al dueño en la cuenta del turno, en Buffet y en la ficha
// del cliente) sin pasarlo de mano en mano por cada componente. Lo pone ClubDemo con el `negocio` que le da la página
// (el slug del tenant de la sesión). Sin ClubDemo arriba (un test que monta una pieza suelta) vale null: el aviso usa
// el aprobador del ERP, como siempre.

import { createContext, useContext } from "react";

export const NegocioDelClub = createContext<string | null>(null);

export function useNegocioDelClub(): string | null {
  return useContext(NegocioDelClub);
}
