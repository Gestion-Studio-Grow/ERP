"use client";

import { RepositorioIDB } from "./idb";
import type { Repositorio } from "./tipos";

export type { Repositorio } from "./tipos";
export { ErrorRepo } from "./tipos";
export { escucharCambios } from "./cambios";

let repo: Repositorio | null = null;

/** Único punto de acceso a los datos. Para enchufar un backend, cambiar esta línea. */
export function obtenerRepo(): Repositorio {
  if (typeof window === "undefined") throw new Error("El repositorio sólo existe en el navegador.");
  if (!repo) repo = new RepositorioIDB();
  return repo;
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Algo salió mal. Probá de nuevo.";
}
