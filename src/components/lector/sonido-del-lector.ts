"use client";

// EL BIP DEL CAMPO ÚNICO — prendido o apagado, por navegador.
//
// Un bip corto (el `sonar` de terminal/senal.ts: oscilador de WebAudio, 70 ms, sin archivos) cuando
// entra una etiqueta o un código, y dos tonos graves cuando no se pudo leer. Se apaga desde el
// propio campo (y, cuando exista, desde el chip de la cabecera: `guardarSonidoDelLector`). La
// preferencia es una comodidad de este navegador (localStorage, con try/catch): si el
// almacenamiento no anda, vale en memoria para esta pantalla. Mismo patrón que
// pedidos/AvisoDePedidosNuevos.tsx.

import { useSyncExternalStore } from "react";
import { sonar, type Senal } from "@/lib/terminal/senal";

const PREF_SONIDO = "lector:sonido";

let enMemoria: boolean | null = null;
const oyentes = new Set<() => void>();

function leer(): boolean {
  if (enMemoria !== null) return enMemoria;
  try {
    return window.localStorage.getItem(PREF_SONIDO) !== "0";
  } catch {
    return true;
  }
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => {
    oyentes.delete(o);
  };
}

/** Prende o apaga el bip del lector en este navegador. */
export function guardarSonidoDelLector(prendido: boolean): void {
  enMemoria = prendido;
  try {
    window.localStorage.setItem(PREF_SONIDO, prendido ? "1" : "0");
  } catch {
    // vale para esta pantalla
  }
  for (const o of oyentes) o();
}

/** ¿Está prendido el bip? (el servidor dice que sí; el navegador, lo guardado). */
export function useSonidoDelLector(): boolean {
  return useSyncExternalStore(suscribir, leer, () => true);
}

/** Suena si está prendido. En silencio si el navegador no deja (el aviso nunca rompe la venta). */
export function bipDelLector(senal: Senal, prendido: boolean): void {
  if (prendido) sonar(senal);
}
