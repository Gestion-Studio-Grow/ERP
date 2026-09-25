// Dónde guarda la demo lo que hizo cada visitante: localStorage, sólo en su navegador.
//
// Vive en un módulo sin dependencias a propósito: el límite de error (error.tsx) tiene que poder
// borrar lo guardado aunque lo que falló sea justamente el escenario, el motor o el estado.

export const CLAVE_GUARDADO = "rendi-demo-v1";

/** Borra lo guardado. Con el almacenamiento bloqueado no hay nada que borrar: sigue igual. */
export function borrarGuardado(): void {
  try {
    window.localStorage.removeItem(CLAVE_GUARDADO);
  } catch {
    /* almacenamiento bloqueado (modo privado, política del navegador) */
  }
}
