"use client";

// El vocabulario del negocio (src/lib/vocabulario-negocio.ts), repartido por contexto a las pantallas
// del panel: el layout lo arma en el servidor con el rubro que ya lee y las pantallas cliente lo toman
// con `useVocabulario()` sin pasar props por cada capa (el alta manual de pedidos vive tres niveles
// abajo, en Pedidos y en Vender). Sin proveedor —un test, una pantalla fuera del layout— rige el de
// siempre: "Retira en el local".

import { createContext, useContext, type ReactNode } from "react";
import { VOCABULARIO_POR_DEFECTO, type VocabularioDelNegocio as Vocabulario } from "@/lib/vocabulario-negocio";

const Contexto = createContext<Vocabulario>(VOCABULARIO_POR_DEFECTO);

export function VocabularioDelNegocio({ valor, children }: { valor: Vocabulario; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useVocabulario(): Vocabulario {
  return useContext(Contexto);
}
