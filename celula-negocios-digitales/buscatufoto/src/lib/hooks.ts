"use client";

import { useCallback, useEffect, useState } from "react";
import { escucharCambios } from "./repo";

const urls = new WeakMap<Blob, { url: string; usos: number }>();

function entradaUrl(blob: Blob) {
  let e = urls.get(blob);
  if (!e) {
    e = { url: URL.createObjectURL(blob), usos: 0 };
    urls.set(blob, e);
  }
  return e;
}

/**
 * URL de objeto para un Blob. Compartida entre componentes que muestran el mismo Blob y revocada cuando
 * nadie la usa (con un respiro, para sobrevivir al doble montaje de StrictMode).
 */
export function useUrlBlob(blob: Blob | null | undefined): string | null {
  const url = blob && typeof window !== "undefined" ? entradaUrl(blob).url : null;
  useEffect(() => {
    if (!blob) return;
    const e = entradaUrl(blob);
    e.usos++;
    return () => {
      e.usos--;
      setTimeout(() => {
        if (e.usos <= 0 && urls.get(blob) === e) {
          URL.revokeObjectURL(e.url);
          urls.delete(blob);
        }
      }, 1500);
    };
  }, [blob]);
  return url;
}

export type EstadoCarga<T> =
  | { estado: "cargando"; datos: undefined; error: null }
  | { estado: "listo"; datos: T; error: null }
  | { estado: "error"; datos: undefined; error: string };

/**
 * Carga asíncrona desde el repositorio que se refresca sola cuando cambia alguno de los almacenes
 * indicados (en esta pestaña o en otra). `deps` vacío = no recarga por props.
 */
export function useDatos<T>(cargar: () => Promise<T>, deps: unknown[], almacenes: string[] = []): EstadoCarga<T> & { recargar: () => void } {
  const [st, setSt] = useState<EstadoCarga<T>>({ estado: "cargando", datos: undefined, error: null });
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  const clave = almacenes.join(",");

  useEffect(() => {
    let vivo = true;
    cargar().then(
      (datos) => vivo && setSt({ estado: "listo", datos, error: null }),
      (e: unknown) => vivo && setSt({ estado: "error", datos: undefined, error: e instanceof Error ? e.message : "No se pudo cargar." }),
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, vuelta]);

  useEffect(() => {
    if (!clave) return;
    const lista = clave.split(",");
    return escucharCambios((store) => {
      if (lista.includes(store)) setVuelta((v) => v + 1);
    });
  }, [clave]);

  return { ...st, recargar };
}
