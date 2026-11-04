"use client";

import { useSyncExternalStore } from "react";
import { RepositorioIDB } from "./idb";
import { RepositorioRemoto } from "./remoto";
import type { Repositorio } from "./tipos";

export type { Repositorio } from "./tipos";
export { ErrorRepo } from "./tipos";
export { escucharCambios } from "./cambios";

export type ModoRepo = "servidor" | "demo";

let modo: ModoRepo | undefined;
let mp = false;
let resolviendo: Promise<ModoRepo> | null = null;
let real: Repositorio | null = null;
const oyentesModo = new Set<() => void>();

/**
 * Una sola vez por pestaña: `GET /api/btf/estado`. Si el servidor está configurado, los datos van al servidor;
 * si no responde (sitio estático sin API, 503, sin red) queda la demo en IndexedDB.
 */
export function resolverModo(): Promise<ModoRepo> {
  if (modo) return Promise.resolve(modo);
  if (!resolviendo) {
    resolviendo = (async (): Promise<ModoRepo> => {
      try {
        const r = await fetch("/api/btf/estado", { credentials: "include", cache: "no-store" });
        if (!r.ok) return "demo";
        const cuerpo = (await r.json()) as { configurado?: unknown; mp?: unknown };
        mp = cuerpo.mp === true;
        return cuerpo.configurado === true ? "servidor" : "demo";
      } catch {
        return "demo";
      }
    })().then((m) => {
      modo = m;
      oyentesModo.forEach((o) => o());
      return m;
    });
  }
  return resolviendo;
}

async function repoReal(): Promise<Repositorio> {
  if (real) return real;
  const m = await resolverModo();
  if (!real) real = m === "servidor" ? new RepositorioRemoto() : new RepositorioIDB();
  return real;
}

/** Modo servidor: `/estado` dijo que el cobro con Mercado Pago está disponible. En la demo, siempre (simulado). */
export function mpDisponible(): boolean {
  return modo === "demo" || (modo === "servidor" && mp);
}

/** Modo ya resuelto; mientras se consulta el servidor responde "demo". Para la UI usar `useModoRepo`. */
export function modoRepo(): ModoRepo {
  return modo ?? "demo";
}

function suscribirModo(o: () => void) {
  oyentesModo.add(o);
  void resolverModo();
  return () => {
    oyentesModo.delete(o);
  };
}

/** Modo del repositorio para la UI; `undefined` mientras se averigua (y en el servidor de Next). */
export function useModoRepo(): ModoRepo | undefined {
  return useSyncExternalStore(
    suscribirModo,
    () => modo,
    () => undefined,
  );
}

let repo: Repositorio | null = null;

/**
 * Único punto de acceso a los datos. Devuelve al toque un repositorio que espera a saber el modo (una sola
 * consulta a `/api/btf/estado`) y delega en el remoto o en IndexedDB.
 */
export function obtenerRepo(): Repositorio {
  if (typeof window === "undefined") throw new Error("El repositorio sólo existe en el navegador.");
  if (!repo) {
    repo = new Proxy({} as Repositorio, {
      get(_, clave) {
        if (typeof clave !== "string" || clave === "then") return undefined;
        return async (...args: unknown[]) => {
          const r = (await repoReal()) as unknown as Record<string, (...a: unknown[]) => unknown>;
          const f = r[clave];
          if (typeof f !== "function") throw new Error(`El repositorio no tiene «${clave}».`);
          return f.apply(r, args);
        };
      },
    });
  }
  return repo;
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Algo salió mal. Probá de nuevo.";
}
