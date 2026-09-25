"use client";

// ============================================================================
// DISEÑO NUEVO en el cliente: el provider y `useDiseno()`.
// ============================================================================
//
// Lo monta `ConDiseno` SÓLO con el diseño nuevo prendido. Un negocio apagado (CH) no lo monta:
// su HTML y lo que viaja al navegador quedan como siempre, y `useDiseno()` da `false` por el valor
// por defecto del contexto. Para cambios de ESTRUCTURA en un componente cliente:
//
//     const nuevo = useDiseno();
//     return nuevo ? <Nuevo /> : <DeSiempre />;
//
// Devuelve un booleano (no un objeto) para que `if (useDiseno())` no pueda dar prendido por error.
// Lo que es sólo piel (colores, radios, sombras, movimiento) no pregunta nada: lo hace la hoja
// bajo `[data-diseno="renglon"]`.

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { vibrar } from "@/components/ui/tactil";

const DisenoNuevoContext = createContext(false);

/** Las teclas que responden con una vibración corta al apretarlas (Android). */
const TECLAS_QUE_VIBRAN = '[data-ui="button"][data-variant="solid"], [data-ui="icon-button"][data-variant="solid"]';

export function DisenoProvider({ nuevo, children }: { nuevo: boolean; children: ReactNode }) {
  // «Todo responde»: la tecla principal vibra 10 ms al bajar (si el teléfono puede y la persona no
  // pidió menos movimiento). Un solo oyente para toda la pantalla, en vez de uno por botón: los
  // botones siguen siendo de servidor. Sólo con el diseño nuevo (este provider no se monta si no).
  useEffect(() => {
    if (!nuevo) return;
    const alBajar = (e: PointerEvent) => {
      const t = e.target instanceof Element ? e.target.closest(TECLAS_QUE_VIBRAN) : null;
      if (t && !(t as HTMLButtonElement).disabled && e.pointerType !== "mouse") vibrar(10);
    };
    document.addEventListener("pointerdown", alBajar, { passive: true });
    return () => document.removeEventListener("pointerdown", alBajar);
  }, [nuevo]);
  return <DisenoNuevoContext value={nuevo}>{children}</DisenoNuevoContext>;
}

/** ¿Este negocio tiene el diseño nuevo? `false` fuera del provider (el diseño de siempre). */
export function useDiseno(): boolean {
  return useContext(DisenoNuevoContext);
}
