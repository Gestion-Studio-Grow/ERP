"use client";

/** Aviso de cambios entre componentes y entre pestañas (BroadcastChannel). */
type Oyente = (store: string) => void;
const oyentes = new Set<Oyente>();
let canal: BroadcastChannel | null = null;

function obtenerCanal(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!canal) {
    canal = new BroadcastChannel("buscatufoto");
    canal.onmessage = (e) => oyentes.forEach((o) => o(String(e.data)));
  }
  return canal;
}

export function avisarCambio(store: string) {
  oyentes.forEach((o) => o(store));
  obtenerCanal()?.postMessage(store);
}

export function escucharCambios(o: Oyente): () => void {
  obtenerCanal();
  oyentes.add(o);
  return () => oyentes.delete(o);
}
