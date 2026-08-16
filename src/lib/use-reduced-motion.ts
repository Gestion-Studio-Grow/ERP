"use client";

// ¿El visitante pidió MENOS movimiento? (`prefers-reduced-motion: reduce`)
//
// Lo consultaban por su cuenta el Reveal de CH y el useReveal de la vidriera de
// Shine, y los dos lo hacían igual: un `useEffect` que leía `matchMedia` y
// llamaba `setState` en el acto. Eso fuerza un segundo render apenas monta el
// componente — el mismo patrón que React 19 marca como "cascading render", y en
// una página con veinte bloques revelables son veinte renders extra.
//
// `useSyncExternalStore` es la herramienta exacta para esto: el navegador ES un
// store externo. El valor llega YA en el primer render del cliente (sin efecto,
// sin render extra), el server recibe `false` (sin `window`, y "puede animar" es
// el default seguro: si el visitante pidió menos movimiento, en el cliente se
// corrige en el primer render, antes de pintar), y si cambia la preferencia del
// sistema con la página abierta, el componente se entera solo.

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  // `matchMedia` puede no existir (entornos de test, navegadores viejos): sin él
  // no hay nada a qué suscribirse y el snapshot devuelve false.
  const mql = typeof window !== "undefined" ? window.matchMedia?.(QUERY) : undefined;
  if (!mql) return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(QUERY).matches === true;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
