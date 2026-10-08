"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const claveCarrito = (albumId: string) => `btf:carrito:${albumId}`;

function leer(albumId: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(claveCarrito(albumId)) ?? "[]");
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
  } catch {
    return [];
  }
}

function escribir(albumId: string, ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(claveCarrito(albumId), JSON.stringify(ids));
    else localStorage.removeItem(claveCarrito(albumId));
  } catch {
    // Navegación privada o almacenamiento bloqueado: el carrito vive sólo en memoria.
  }
}

/**
 * Selección del comprador por álbum, persistida en localStorage. Se monta sólo en el navegador (después de
 * cargar el álbum), así que leer localStorage en el estado inicial no rompe la hidratación.
 * `validos` filtra ids de fotos que el fotógrafo borró.
 */
export function useCarrito(albumId: string, validos: ReadonlySet<string>) {
  const [ids, setIds] = useState<string[]>(() => leer(albumId));

  useEffect(() => {
    escribir(albumId, ids);
  }, [albumId, ids]);

  const seleccion = useMemo(() => ids.filter((id) => validos.has(id)), [ids, validos]);
  const elegidos = useMemo(() => new Set(seleccion), [seleccion]);

  const alternar = useCallback((id: string) => {
    setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }, []);
  const quitar = useCallback((id: string) => setIds((l) => l.filter((x) => x !== id)), []);
  const vaciar = useCallback(() => {
    escribir(albumId, []);
    setIds([]);
  }, [albumId]);

  return { seleccion, elegidos, alternar, quitar, vaciar };
}
