"use client";

// El nombre del lugar de atención en la agenda («box» o, en peluquería y barbería, «sillón»).
// Sin proveedor arriba vale «box»: cualquier pantalla que no lo envuelva se lee como siempre.

import { createContext, useContext, type ReactNode } from "react";
import { lugarDeAtencion, type LugarDeAtencion } from "@/lib/palabras-del-negocio";

const Contexto = createContext<LugarDeAtencion>(lugarDeAtencion(null));

export function LugarDeAtencionProvider({ valor, children }: { valor: LugarDeAtencion; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useLugarDeAtencion(): LugarDeAtencion {
  return useContext(Contexto);
}
