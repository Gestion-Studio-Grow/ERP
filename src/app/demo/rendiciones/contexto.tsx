"use client";

// Contexto de la demo: el estado del reducer, las evaluaciones del motor ya calculadas y el
// resumen por rendición. Se calculan UNA vez por cambio de estado (en DemoRendi) y cada rol las
// lee de acá, así ninguna pantalla vuelve a evaluar por su cuenta ni puede quedar desfasada.

import { createContext, useContext, type Dispatch, type ReactNode } from "react";
import type { Evaluacion } from "@/lib/rendiciones";
import type { AccionDemo, DatosDemo, Vista } from "./estado";
import type { ResumenRendicion } from "./derivados";

export interface ValorDemo {
  datos: DatosDemo;
  vista: Vista;
  evaluaciones: Map<string, Evaluacion>;
  resumenes: Map<string, ResumenRendicion>;
  despachar: Dispatch<AccionDemo>;
  /** Qué elemento resalta el recorrido guiado en el paso actual (null = ninguno). */
  destacado: string | null;
}

const DemoContexto = createContext<ValorDemo | null>(null);

export function ProveedorDemo({ valor, children }: { valor: ValorDemo; children: ReactNode }) {
  return <DemoContexto.Provider value={valor}>{children}</DemoContexto.Provider>;
}

export function useDemo(): ValorDemo {
  const valor = useContext(DemoContexto);
  if (!valor) throw new Error("useDemo se usa sólo dentro de la demo de Rendí");
  return valor;
}

/**
 * ¿El recorrido guiado está señalando este elemento? El elemento lleva además
 * `data-recorrido={marca}` para que el recorrido lo pueda traer a la vista.
 */
export function useDestacado(marca: string): boolean {
  return useDemo().destacado === marca;
}
