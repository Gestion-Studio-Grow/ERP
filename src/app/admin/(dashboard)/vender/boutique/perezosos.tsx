"use client";

// LA RAMA BOUTIQUE DE VENDER, MÁS LIVIANA AL TOQUE (Magra · tanda perf, P-2 y P-3).
//
//   · `ClienteDeLaVentaDiferido`: el bloque Cliente (584 líneas: buscador de fichas, CUIT, factura)
//     se trae con `next/dynamic` cuando se abre («+ Cliente» o un pedido), no con la pantalla; con el
//     primer toque en la pantalla se adelanta (`usePrecargaDelCliente`, tanda practicidad: antes era
//     con el navegador libre y bajaba igual al entrar) para que el toque no espere la red.
//   · `TeclasMemorizadas`: las teclas por góndola (`TeclasPorGondola`) con `memo`. Tocar una tecla
//     cambia el ticket, no las teclas: con las props estables (`useLlamadaEstable` para el toque y
//     las listas memorizadas en VenderForm) la grilla no se vuelve a dibujar en cada toque.
//
// Sólo los usa la rama boutique de VenderForm: el mostrador de siempre (CH) no cambia.

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import TeclasPorGondola from "../TeclasPorGondola";

const traerCliente = () => import("../ClienteDeLaVenta");

export const ClienteDeLaVentaDiferido = dynamic(traerCliente, {
  loading: () => (
    <p role="status" aria-busy="true" className="min-h-11 text-sm text-muted">
      Abriendo el cliente…
    </p>
  ),
});

/**
 * Baja el código de `traer` con el PRIMER toque o tecla en la pantalla (no al entrar): lo que está
 * cerrado no suma al JS de la entrada (V-6) y, cuando se lo abre, ya está bajado. Sólo si `activo`.
 */
export function usePrecargaAlPrimerToque(traer: () => unknown, activo = true): void {
  useEffect(() => {
    if (!activo) return;
    const quitar = () => {
      window.removeEventListener("pointerdown", una, true);
      window.removeEventListener("keydown", una, true);
    };
    function una() {
      quitar();
      void traer();
    }
    window.addEventListener("pointerdown", una, true);
    window.addEventListener("keydown", una, true);
    return quitar;
  }, [activo, traer]);
}

/** El bloque Cliente, bajado con el primer toque (sólo si `activo`: el boutique). */
export function usePrecargaDelCliente(activo: boolean): void {
  usePrecargaAlPrimerToque(traerCliente, activo);
}

type PropsDeTeclas = Parameters<typeof TeclasPorGondola>[0];

/**
 * ¿Las teclas se ven igual? Compara los datos (catálogo, stock, pestañas, fijadas) y NO la identidad
 * de las funciones: VenderForm pasa `onTocar` y `onGuardar` hechas con `useLlamadaEstable`, que
 * llaman siempre a la versión del último render. PURA.
 */
export function mismasTeclas(a: PropsDeTeclas, b: PropsDeTeclas): boolean {
  return (
    a.productos === b.productos &&
    a.stockById === b.stockById &&
    a.principal === b.principal &&
    a.gondolas === b.gondolas &&
    Boolean(a.fijar) === Boolean(b.fijar) &&
    (a.fijar?.fijadas ?? null) === (b.fijar?.fijadas ?? null)
  );
}

/** Las teclas, memorizadas: se vuelven a dibujar sólo si cambian sus datos. */
export const TeclasMemorizadas = memo(TeclasPorGondola, mismasTeclas);

/**
 * Una función con identidad FIJA que llama siempre a la última versión de `fn` (la que ve el
 * estado de este render). Para pasarle a un hijo memorizado sin que cada render lo invalide.
 */
export function useLlamadaEstable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ultima = useRef(fn);
  useLayoutEffect(() => {
    ultima.current = fn;
  });
  return useCallback((...args: A) => ultima.current(...args), []);
}
