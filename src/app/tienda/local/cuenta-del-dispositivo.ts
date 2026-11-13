// «Mi cuenta» de Pedí Local en el navegador: leer y escribir localStorage, siempre con try/catch
// (modo privado de Safari, almacenamiento lleno o bloqueado: la vidriera sigue andando sin cuenta).
// La lógica es pura y vive en src/lib/delivery-local/mi-cuenta.ts; acá sólo la entrada y salida.
//
// `useCuentaDelDispositivo` lee con useSyncExternalStore: en el servidor (y en la hidratación) la
// cuenta es vacía, sin desajuste; después aparece lo guardado. Se entera de lo que escribe otra
// pestaña (evento `storage`) y de lo que escribe esta (evento propio).

import { useMemo, useSyncExternalStore } from "react";
import { CUENTA_VACIA, claveDeLaCuenta, leerCuenta, type CuentaLocal } from "@/lib/delivery-local/mi-cuenta";

const EVENTO = "pedi-local:cuenta";

function leerCrudo(slug: string): string | null {
  try {
    return window.localStorage.getItem(claveDeLaCuenta(slug));
  } catch {
    return null;
  }
}

/** Lo guardado ahora mismo (para un efecto que corre una vez, fuera del render). */
export function leerCuentaGuardada(slug: string): CuentaLocal {
  return leerCuenta(leerCrudo(slug));
}

/** Aplica un cambio a la cuenta guardada. Si el navegador no deja guardar, no pasa nada. */
export function cambiarCuenta(slug: string, cambio: (c: CuentaLocal) => CuentaLocal): void {
  try {
    const antes = leerCuenta(leerCrudo(slug));
    const despues = cambio(antes);
    if (despues === antes) return;
    window.localStorage.setItem(claveDeLaCuenta(slug), JSON.stringify(despues));
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    // Sin almacenamiento: la cuenta del dispositivo es opcional.
  }
}

/** Borra todo lo guardado de este negocio en este dispositivo. */
export function borrarCuenta(slug: string): void {
  try {
    window.localStorage.removeItem(claveDeLaCuenta(slug));
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    // idem
  }
}

function suscribir(avisar: () => void): () => void {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO, avisar);
  };
}

/** La cuenta de este dispositivo para el negocio `slug` (vacía en el servidor y sin slug). */
export function useCuentaDelDispositivo(slug: string | null): CuentaLocal {
  const crudo = useSyncExternalStore(
    suscribir,
    () => (slug ? leerCrudo(slug) : null),
    () => null,
  );
  return useMemo(() => (crudo ? leerCuenta(crudo) : CUENTA_VACIA), [crudo]);
}
