"use client";

import { usePathname } from "next/navigation";

/**
 * Segmentos de la URL REAL del navegador. El sitio se publica como exportación estática: cada ruta dinámica
 * (/a/[album], /f/[usuario]…) se genera una sola vez con el comodín "_" y el servidor la entrega para
 * cualquier valor. Por eso el valor se lee de la dirección, no de `params`.
 */
export function useSegmentos(): string[] {
  const p = usePathname() ?? "";
  return p
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

/** Valor que se usa al generar la página comodín (no es un álbum, perfil ni pedido real). */
export const COMODIN = "_";
